#!/usr/bin/env python3
"""
PPEI PCAN Bridge — High-Traffic CAN Bus Patch
═══════════════════════════════════════════════

Wraps Tobi's pcan_bridge.py with fixes for busy CAN buses (e.g., 2019 L5P trucks)
where the PCAN-USB receive queue overflows ("The receive queue was read too late").

Root Cause:
  Tobi's OBDProtocol._listen() uses bus.recv(timeout=0.1) in a polling loop.
  On a busy 2019 truck CAN bus (hundreds of frames/sec from BCM, TCM, ABS, etc.),
  the PCAN-USB internal hardware buffer fills up faster than bus.recv() can drain it.
  Result: ECU responses (0x7E8) are lost → VIN read fails → PID scan returns zero.

Fix:
  1. Replace polling bus.recv() with python-can Notifier (background thread reader)
  2. Use a single Notifier that feeds both OBD listener and IntelliSpy monitor
  3. Add hardware CAN filters when only OBD is active (reduces driver buffer load)
  4. Remove filters when IntelliSpy needs all frames

Usage:
  python ppei_pcan_bridge.py [same args as pcan_bridge.py]

Tobi's pcan_bridge.py is NEVER modified. This file imports and patches at runtime.
"""

import sys
import os
import asyncio
import json
import time
import logging
import threading
from collections import deque
from typing import Optional, Set, Callable, Awaitable, Any

# ── Ensure Tobi's bridge is importable ──────────────────────────────────────
_bridge_dir = os.path.dirname(os.path.abspath(__file__))
if _bridge_dir not in sys.path:
    sys.path.insert(0, _bridge_dir)

import can
from can import Notifier, Listener

# Import Tobi's bridge module (without running main)
import pcan_bridge as _tobi

log = logging.getLogger("ppei_bridge")

# ═══════════════════════════════════════════════════════════════════════════════
# Patch 1: Replace OBDProtocol._listen with Notifier-based reader
# ═══════════════════════════════════════════════════════════════════════════════

_original_obd_start = _tobi.OBDProtocol.start
_original_obd_stop = _tobi.OBDProtocol.stop


class _OBDFrameListener(Listener):
    """python-can Listener that feeds frames to the OBD protocol's queue and broadcast."""

    def __init__(self, protocol: _tobi.OBDProtocol, loop: asyncio.AbstractEventLoop):
        self._protocol = protocol
        self._loop = loop
        self._filter_ids: set = protocol._filter_ids
        self.frame_count = 0
        self.filtered_count = 0

    def on_message_received(self, msg: can.Message):
        """Called by Notifier's background thread for EVERY frame on the bus."""
        self.frame_count += 1
        if msg.arbitration_id not in self._filter_ids:
            return
        self.filtered_count += 1
        # Schedule async work on the event loop (thread-safe)
        asyncio.run_coroutine_threadsafe(
            self._dispatch(msg), self._loop
        )

    async def _dispatch(self, msg: can.Message):
        """Push frame to broadcast and queue (runs on event loop)."""
        p = self._protocol
        if p._rx_broadcast:
            try:
                await p._rx_broadcast(msg)
            except Exception as ex:
                log.warning("RX broadcast failed: %s", ex)
        await p._response_queue.put(msg)


async def _ppei_obd_start(self):
    """Patched OBDProtocol.start — uses Notifier instead of polling bus.recv()."""
    self._running = True

    # Get the event loop for thread-safe coroutine scheduling
    loop = asyncio.get_event_loop()

    # Create our Listener
    self._ppei_listener = _OBDFrameListener(self, loop)

    # Create Notifier — reads from bus in a background thread, dispatches to listeners
    # timeout=0.05 means the background thread checks for new frames every 50ms max
    # but in practice it reads as fast as frames arrive
    self._ppei_notifier = Notifier(self.bus, [self._ppei_listener], timeout=0.05)

    log.info("[PPEI] OBD protocol started with Notifier (no bus.recv polling)")


async def _ppei_obd_stop(self):
    """Patched OBDProtocol.stop — stops the Notifier."""
    self._running = False
    if hasattr(self, '_ppei_notifier') and self._ppei_notifier:
        self._ppei_notifier.stop()
        self._ppei_notifier = None
    if hasattr(self, '_ppei_listener'):
        self._ppei_listener = None
    log.info("[PPEI] OBD protocol stopped")


# Apply Patch 1
_tobi.OBDProtocol.start = _ppei_obd_start
_tobi.OBDProtocol.stop = _ppei_obd_stop
log.info("[PPEI] Patch 1 applied: OBDProtocol uses Notifier instead of bus.recv() polling")


# ═══════════════════════════════════════════════════════════════════════════════
# Patch 2: Add hardware CAN filters on bus init for OBD mode
# ═══════════════════════════════════════════════════════════════════════════════

_original_init_can_bus = _tobi.PCANBridge._init_can_bus


def _ppei_init_can_bus(self, bitrate: int = None, fd: bool = False) -> bool:
    """Patched _init_can_bus — adds hardware CAN filters after opening the bus."""
    result = _original_init_can_bus(self, bitrate, fd)
    if result and self.bus:
        # Apply hardware filters: only accept OBD response IDs (0x7E8-0x7EF)
        # This dramatically reduces the number of frames hitting the receive buffer
        # on busy CAN buses (2019 trucks with BCM, TCM, ABS, etc.)
        #
        # Filter: accept 0x7E8-0x7EF (mask 0x7F8 matches the upper bits)
        # Also accept 0x7E0-0x7E7 (request echo, useful for debugging)
        # And 0x7DF (functional broadcast)
        try:
            self.bus.set_filters([
                # Accept 0x7E0-0x7EF (covers both request and response IDs)
                {"can_id": 0x7E0, "can_mask": 0x7F0, "extended": False},
                # Accept 0x7DF (functional broadcast)
                {"can_id": 0x7DF, "can_mask": 0x7FF, "extended": False},
            ])
            self._ppei_hw_filters_active = True
            log.info("[PPEI] Hardware CAN filters applied: 0x7E0-0x7EF + 0x7DF only")
        except Exception as e:
            self._ppei_hw_filters_active = False
            log.warning(f"[PPEI] Could not set hardware CAN filters: {e}")
            log.warning("[PPEI] Falling back to software filtering (may overflow on busy buses)")
    return result


_tobi.PCANBridge._init_can_bus = _ppei_init_can_bus
log.info("[PPEI] Patch 2 applied: Hardware CAN filters on bus init")


# ═══════════════════════════════════════════════════════════════════════════════
# Patch 3: Remove hardware filters when IntelliSpy monitor starts,
#           restore them when monitor stops
# ═══════════════════════════════════════════════════════════════════════════════

_original_handle_client = _tobi.PCANBridge.handle_client


async def _ppei_handle_client(self, websocket, path=None):
    """Patched handle_client — intercepts start_monitor/stop_monitor to manage HW filters."""
    # We wrap the original handler but intercept the WebSocket messages
    # to add/remove hardware filters around IntelliSpy monitor sessions.
    #
    # The approach: wrap the websocket with a filter-aware proxy.
    # Actually, it's simpler to patch the _bus_monitor_loop start/stop points.
    await _original_handle_client(self, websocket, path)


# Instead of patching handle_client (complex), patch the monitor start/stop directly
_original_bus_monitor_loop = _tobi.PCANBridge._bus_monitor_loop


async def _ppei_bus_monitor_loop(self, websocket, filter_set=None):
    """Patched _bus_monitor_loop — removes HW filters so IntelliSpy sees all frames,
    then restores them when the monitor stops."""
    # Remove hardware filters so IntelliSpy can see ALL frames
    if self.bus and getattr(self, '_ppei_hw_filters_active', False):
        try:
            self.bus.set_filters(None)  # Accept all frames
            log.info("[PPEI] Hardware CAN filters REMOVED for IntelliSpy monitor")
        except Exception as e:
            log.warning(f"[PPEI] Could not remove CAN filters: {e}")

    # Also need to stop the Notifier temporarily if OBD protocol is running,
    # because the Notifier and the monitor loop would race on bus.recv()
    obd_notifier = None
    if self.protocol and hasattr(self.protocol, '_ppei_notifier'):
        obd_notifier = self.protocol._ppei_notifier
        if obd_notifier:
            obd_notifier.stop()
            log.info("[PPEI] Paused OBD Notifier during bus monitor")

    # Create a new Notifier that feeds BOTH IntelliSpy and OBD
    loop = asyncio.get_event_loop()
    monitor_running = True
    frame_count = 0
    start_time = time.time()

    class _CombinedListener(Listener):
        """Feeds frames to both IntelliSpy WebSocket and OBD protocol."""
        def __init__(self):
            self.obd_filter_ids = _tobi.RESPONSE_IDS.copy()

        def on_message_received(self_inner, msg):
            nonlocal frame_count
            frame_count += 1

            # Feed to IntelliSpy (all frames or filtered)
            if filter_set is None or msg.arbitration_id in filter_set:
                asyncio.run_coroutine_threadsafe(
                    _send_monitor_frame(websocket, msg, frame_count),
                    loop
                )

            # Also feed to OBD protocol if it's running (for concurrent PID reads)
            if self.protocol and msg.arbitration_id in self_inner.obd_filter_ids:
                asyncio.run_coroutine_threadsafe(
                    _dispatch_to_obd(self.protocol, msg),
                    loop
                )

    combined_listener = _CombinedListener()
    combined_notifier = Notifier(self.bus, [combined_listener], timeout=0.02)

    try:
        # Wait until the WebSocket closes or monitor is stopped
        while monitor_running:
            try:
                # Check if websocket is still alive by waiting for a message
                # (stop_monitor message will be handled by the main handler)
                await asyncio.sleep(0.1)
                # Check if this client's monitor was stopped
                if websocket not in self._monitor_clients:
                    break
            except Exception:
                break
    finally:
        combined_notifier.stop()
        log.info(f"[PPEI] Bus monitor stopped. {frame_count} frames in {time.time() - start_time:.1f}s")

        # Restart OBD Notifier and restore hardware filters
        if self.protocol and hasattr(self.protocol, '_ppei_listener'):
            self.protocol._ppei_notifier = Notifier(
                self.bus, [self.protocol._ppei_listener], timeout=0.05
            )
            log.info("[PPEI] Resumed OBD Notifier after bus monitor")

        if self.bus and getattr(self, '_ppei_hw_filters_active', False):
            try:
                self.bus.set_filters([
                    {"can_id": 0x7E0, "can_mask": 0x7F0, "extended": False},
                    {"can_id": 0x7DF, "can_mask": 0x7FF, "extended": False},
                ])
                log.info("[PPEI] Hardware CAN filters RESTORED after monitor")
            except Exception as e:
                log.warning(f"[PPEI] Could not restore CAN filters: {e}")


async def _send_monitor_frame(websocket, msg, frame_count):
    """Send a bus_frame to IntelliSpy WebSocket client."""
    try:
        frame_msg = {
            "type": "bus_frame",
            "arb_id": msg.arbitration_id,
            "data": list(msg.data),
            "dlc": msg.dlc,
            "timestamp": msg.timestamp or time.time(),
            "is_extended": msg.is_extended_id,
            "is_remote": msg.is_remote_frame,
            "is_error": msg.is_error_frame,
            "is_fd": getattr(msg, 'is_fd', False),
            "bitrate_switch": getattr(msg, 'bitrate_switch', False),
            "frame_number": frame_count,
        }
        if msg.is_extended_id:
            pgn = _tobi.J1939Protocol._extract_pgn(msg.arbitration_id)
            source = _tobi.J1939Protocol._extract_source(msg.arbitration_id)
            priority = (msg.arbitration_id >> 26) & 0x07
            frame_msg["j1939"] = {"pgn": pgn, "source": source, "priority": priority}
        await websocket.send(json.dumps(frame_msg))
    except Exception:
        pass


async def _dispatch_to_obd(protocol, msg):
    """Feed a frame to the OBD protocol's queue and broadcast."""
    if protocol._rx_broadcast:
        try:
            await protocol._rx_broadcast(msg)
        except Exception:
            pass
    await protocol._response_queue.put(msg)


_tobi.PCANBridge._bus_monitor_loop = _ppei_bus_monitor_loop
log.info("[PPEI] Patch 3 applied: IntelliSpy monitor uses shared Notifier with OBD")


# ═══════════════════════════════════════════════════════════════════════════════
# Patch 4: Increase send_raw_frame reliability — don't drain queue before send
# ═══════════════════════════════════════════════════════════════════════════════
# The _drain_queue() call in send_raw_frame discards any frames that arrived
# between the previous read and this send. With the Notifier approach, frames
# go directly to the queue as they arrive, so draining is counterproductive.

_original_send_raw_frame = _tobi.OBDProtocol.send_raw_frame


async def _ppei_send_raw_frame(self, arb_id, data, req_id, extended=False):
    """Patched send_raw_frame — skip _drain_queue to preserve Notifier-delivered frames."""
    # Do NOT drain the queue — the Notifier delivers frames in real-time,
    # so any frame in the queue is a legitimate recent response.
    msg = can.Message(
        arbitration_id=arb_id,
        data=data,
        is_extended_id=extended
    )
    try:
        self.bus.send(msg)
        return {
            "type": "tx_ack",
            "id": req_id,
            "ok": True,
        }
    except can.CanError as e:
        return {
            "type": "error",
            "id": req_id,
            "message": f"CAN send error: {e}",
            "arb_id": arb_id
        }


_tobi.OBDProtocol.send_raw_frame = _ppei_send_raw_frame
log.info("[PPEI] Patch 4 applied: send_raw_frame skips queue drain for Notifier compatibility")


# ═══════════════════════════════════════════════════════════════════════════════
# Entry point — run Tobi's main() with all patches applied
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(name)s] %(levelname)s: %(message)s'
    )
    log.info("=" * 60)
    log.info("PPEI PCAN Bridge — High-Traffic CAN Bus Patch")
    log.info("=" * 60)
    log.info("Patches applied:")
    log.info("  1. OBDProtocol uses Notifier (no bus.recv polling)")
    log.info("  2. Hardware CAN filters on bus init (0x7E0-0x7EF + 0x7DF)")
    log.info("  3. IntelliSpy uses shared Notifier with OBD")
    log.info("  4. send_raw_frame skips queue drain")
    log.info("=" * 60)
    log.info("Tobi's pcan_bridge.py is NOT modified.")
    log.info("To revert: run pcan_bridge.py directly instead.")
    log.info("=" * 60)

    # Run Tobi's main with our patches active
    _tobi.main()
