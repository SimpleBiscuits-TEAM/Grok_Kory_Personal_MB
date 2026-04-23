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
# Patch 5: batch_read_dids — read multiple DIDs in a tight CAN loop
# ═══════════════════════════════════════════════════════════════════════════════
# The frontend normally sends one WebSocket message per DID, waits for the
# response, then sends the next.  With 30 DIDs, that's 30 × (WS RTT ~20ms +
# CAN RTT ~5ms) ≈ 750ms per cycle.
#
# HP Tuners sends all DID requests back-to-back on the CAN bus with only ~5ms
# between them, achieving ~400ms for 30 DIDs.
#
# This patch adds a new "batch_read_dids" message type that does the same:
# one WebSocket message in, tight CAN loop, one WebSocket message out.
#
# Message format:
#   → { type: "batch_read_dids", id: "...", dids: [0x0071, 0x30C1, ...],
#       tx_id: 0x7E0, timeout_ms: 50 }
#   ← { type: "batch_did_results", id: "...", results: [
#        { did: 0x0071, ok: true, data: [0x12, 0x34, ...] },
#        { did: 0x30C1, ok: false, error: "timeout" },
#        ...  ] }

_original_handle_message = _tobi.PCANBridge.handle_message


async def _ppei_handle_message(self, msg: dict):
    """Patched handle_message — intercepts batch_read_dids before Tobi's router."""
    msg_type = msg.get("type")
    if msg_type != "batch_read_dids":
        return await _original_handle_message(self, msg)

    # ── batch_read_dids handler ──────────────────────────────────────────
    req_id = msg.get("id", "0")
    dids = msg.get("dids", [])
    tx_id = msg.get("tx_id", 0x7E0)
    per_did_timeout = msg.get("timeout_ms", 150) / 1000.0  # default 150ms per DID (was 50 — too tight for busy CAN)

    if not self.can_initialized:
        success = await self._ensure_can_bus()
        if not success:
            return {
                "type": "error",
                "id": req_id,
                "message": f"CAN bus not available: {self.can_error}"
            }
    if not self.protocol:
        self.protocol = _tobi.OBDProtocol(
            self.bus, rx_broadcast=self._broadcast_rx_stream
        )
        await self.protocol.start()

    proto = self.protocol
    start_all = time.time()

    # ── Drain stale frames before the batch ──
    while not proto._response_queue.empty():
        try:
            proto._response_queue.get_nowait()
        except Exception:
            break

    # ── PHASE 1: Send DID requests with small inter-request gap ──
    # A 2ms gap between requests prevents flooding the ECU's request queue
    # and gives it time to start processing each DID before the next arrives.
    sent_dids = []
    send_errors = {}  # did -> error string
    for i, did in enumerate(dids):
        did_hi = (did >> 8) & 0xFF
        did_lo = did & 0xFF
        data = [0x03, 0x22, did_hi, did_lo, 0x00, 0x00, 0x00, 0x00]
        frame = can.Message(
            arbitration_id=tx_id,
            data=data,
            is_extended_id=False
        )
        try:
            self.bus.send(frame)
            sent_dids.append(did)
            if i < len(dids) - 1:
                await asyncio.sleep(0.002)  # 2ms gap between requests
        except can.CanError as e:
            send_errors[did] = f"CAN send: {e}"

    # ── PHASE 2: Collect ALL responses from the queue ──
    # We expect one response per sent DID. Collect frames until we have
    # all responses or hit a total timeout.
    # Map: did -> value_bytes
    collected = {}  # did -> list[int] (value bytes)
    nrc_errors = {}  # did -> NRC code
    pending = set(sent_dids)
    total_timeout = max(per_did_timeout * len(sent_dids) * 2.0, 1.0)  # generous total (2x per-DID, min 1s)
    collect_deadline = time.time() + total_timeout
    # Track multi-frame ISO-TP state per arbitration ID
    isotp_state = {}  # arb_id -> {total_length, payload, expected_seq, mode, pid_hi, pid_lo}

    while pending and time.time() < collect_deadline:
        remaining = collect_deadline - time.time()
        if remaining <= 0:
            break
        try:
            msg = await asyncio.wait_for(
                proto._response_queue.get(),
                timeout=min(remaining, per_did_timeout)
            )
        except asyncio.TimeoutError:
            # Individual frame timeout — DON'T break, keep collecting until total deadline.
            # Other DIDs may still respond; the ECU processes requests in order and some
            # DIDs take longer than others (especially snapshot/freeze-frame DIDs).
            continue

        if msg.arbitration_id not in _tobi.RESPONSE_IDS:
            continue

        frame_data = list(msg.data)
        if not frame_data:
            continue

        pci_type = (frame_data[0] >> 4) & 0x0F

        if pci_type == 0:  # Single frame
            length = frame_data[0] & 0x0F
            if length == 0 or len(frame_data) < 1 + length:
                continue
            payload = frame_data[1:1 + length]

            # Negative response: 0x7F 0x22 NRC
            if payload and payload[0] == 0x7F and len(payload) >= 3 and payload[1] == 0x22:
                # Extract the DID from the original request context
                # NRC doesn't contain the DID, but we know which DIDs are pending
                nrc = payload[2]
                # Can't determine which DID this NRC is for without more context
                # Just log it and continue
                log.debug(f"[PPEI] batch NRC 0x{nrc:02X} received")
                continue

            # Positive response: 0x62 DID_hi DID_lo data...
            if payload and payload[0] == 0x62 and len(payload) >= 3:
                resp_did = (payload[1] << 8) | payload[2]
                if resp_did in pending:
                    collected[resp_did] = payload[3:]
                    pending.discard(resp_did)
                continue

        elif pci_type == 1:  # First frame (multi-frame ISO-TP)
            total_length = ((frame_data[0] & 0x0F) << 8) | frame_data[1]
            payload = frame_data[2:]
            # Send flow control immediately
            fc_msg = can.Message(
                arbitration_id=tx_id,  # Use the same TX ID
                data=[_tobi.ISOTP_FLOW_CONTROL, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
                is_extended_id=False
            )
            try:
                self.bus.send(fc_msg)
            except can.CanError:
                pass
            # Store ISO-TP state for this arb_id
            isotp_state[msg.arbitration_id] = {
                'total_length': total_length,
                'payload': payload,
                'expected_seq': 1,
            }
            continue

        elif pci_type == 2:  # Consecutive frame
            arb_id = msg.arbitration_id
            if arb_id in isotp_state:
                state = isotp_state[arb_id]
                cf_seq = frame_data[0] & 0x0F
                if cf_seq == (state['expected_seq'] & 0x0F):
                    state['payload'].extend(frame_data[1:])
                    state['expected_seq'] += 1
                    # Check if complete
                    if len(state['payload']) >= state['total_length']:
                        full_payload = state['payload'][:state['total_length']]
                        del isotp_state[arb_id]
                        # Parse the completed multi-frame response
                        if full_payload and full_payload[0] == 0x62 and len(full_payload) >= 3:
                            resp_did = (full_payload[1] << 8) | full_payload[2]
                            if resp_did in pending:
                                collected[resp_did] = full_payload[3:]
                                pending.discard(resp_did)
            continue

    # ── PHASE 3: Build results ──
    results = []
    for did in dids:
        if did in send_errors:
            results.append({"did": did, "ok": False, "error": send_errors[did]})
        elif did in collected:
            results.append({"did": did, "ok": True, "data": list(collected[did])})
        elif did in nrc_errors:
            results.append({"did": did, "ok": False, "error": f"NRC 0x{nrc_errors[did]:02X}"})
        else:
            results.append({"did": did, "ok": False, "error": "timeout"})

    elapsed = (time.time() - start_all) * 1000
    ok_count = sum(1 for r in results if r.get("ok"))
    log.info(
        f"[PPEI] batch_read_dids: {ok_count}/{len(dids)} OK in {elapsed:.0f}ms "
        f"({elapsed/max(len(dids),1):.1f}ms/DID)"
    )

    # ── PHASE 4: Restart periodic streaming if DDDI was active ──
    # Batch reads flood the ECU and kill the periodic scheduler.
    # Re-send 0xAA 04 FE FD to restart it after each batch.
    # Small delay first to let the ECU finish processing batch responses.
    if getattr(self, '_ppei_dddi_streaming', False):
        await asyncio.sleep(0.010)  # 10ms settle time before restart
        restart_ids = getattr(self, '_ppei_dddi_periodic_ids', [0xFE, 0xFD])
        restart_payload = bytes([0xAA, 0x04] + restart_ids)
        restart_frame = can.Message(
            arbitration_id=tx_id,
            data=list(restart_payload) + [0x00] * (8 - len(restart_payload)),
            is_extended_id=False
        )
        try:
            self.bus.send(restart_frame)
            log.debug(f"[PPEI] Restarted periodic streaming after batch_read_dids (10ms settle)")
        except can.CanError:
            log.warning(f"[PPEI] Failed to restart periodic streaming after batch")

    return {
        "type": "batch_did_results",
        "id": req_id,
        "results": results,
        "elapsed_ms": round(elapsed, 1),
    }


_tobi.PCANBridge.handle_message = _ppei_handle_message
log.info("[PPEI] Patch 5 applied: batch_read_dids for fast multi-DID polling")


# ═══════════════════════════════════════════════════════════════════════════════
# Patch 6: DDDI setup — replicate HP Tuners' DynamicallyDefineDataIdentifier
# sequence to unlock Mode 22 reads on the L5P E41 ECM
# ═══════════════════════════════════════════════════════════════════════════════
# The E41 ECM rejects Mode 22 (ReadDataByIdentifier) with NRC 0x31 unless a
# DDDI session has been established first.  HP Tuners does this by:
#   1. 0x2D (defineByMemoryAddress) — creates memory-mapped DIDs (FE00-FE05)
#   2. 0x2C (defineByIdentifier) — links those + existing DIDs into periodic
#      composite identifiers (FE-F7)
#   3. 0xAA 04 (ReadDataByPeriodicIdentifier) — starts ECU streaming on 0x5E8
# After this sequence, individual 0x22 reads also start working.
#
# This patch adds a new "dddi_setup" message type that sends the exact same
# ISO-TP frames captured from the BUSMASTER log.
#
# Message format:
#   → { type: "dddi_setup", id: "...", tx_id: 0x7E0 }
#   ← { type: "dddi_setup_result", id: "...", ok: true/false, ... }

# ── DDDI sequence derived from BUSMASTER capture of HP Tuners (2026-04-23) ──
# HPT uses IOCTL 0x2D to set up ECU RAM reads, then DDDI 0x2C to map them
# to periodic identifiers, then 0xAA to start periodic streaming on 0x5E8.
#
# HPT approach (IOCTL + DDDI):
#   Phase 1: Stop any existing periodic reads (0xAA 04 00)
#   Phase 2: Clear all old DDDI periodic definitions (0x2C FE 00 XX)
#            This is what UNLOCKS Mode 22 reads on the E41!
#   Phase 3: IOCTL 0x2D to configure RAM data sources (FE00, FE01)
#   Phase 4: DDDI 0x2C to map periodic IDs to IOCTL sources
#   Phase 5: Start periodic streaming (0xAA 04 FE FD)
#
# The 0x5E8 frames contain IEEE 754 float32 big-endian values in MPa.
# FE = FRP Actual (4 bytes float32 from RAM 0x014F08)
# FD = FRP Desired (4 bytes float32 from RAM 0x0225D8)

# All periodic IDs that HPT clears (from IntelliSpy capture)
_DDDI_CLEAR_PERIODIC_IDS = [
    0x01, 0x04, 0x07, 0x08, 0x0F, 0x12, 0x13, 0x14, 0x18, 0x1B,
    0x1E, 0x21, 0x27, 0x29, 0x2C, 0x2E, 0x30, 0x34, 0x35, 0x36,
    0x3A, 0x3B, 0x3E, 0x41, 0x42, 0x46, 0x4A, 0x4C, 0x4F, 0x50,
    0x52, 0x54, 0x5A, 0x5B, 0x5C, 0x61, 0x63, 0x64, 0x67, 0x68,
    0x69, 0x6A, 0x71, 0x72, 0x75, 0x77, 0x78, 0x7A, 0x7B, 0x87,
    0x88, 0x8B, 0x98, 0xB1, 0xE5, 0xFD,
]

# HPT IOCTL 0x2D commands — set up ECU RAM data sources
# Format: 0x2D <DID_hi> <DID_lo> <controlOption=0x40> <page> <addr_hi> <addr_lo> <size>
# These read live float32 values directly from ECU RAM (bypasses snapshot DIDs)
_IOCTL_SETUP = [
    # IOCTL FE00: FRP Actual — 4 bytes float32 MPa from RAM page=0x01, addr=0x4F08
    bytes([0x2D, 0xFE, 0x00, 0x40, 0x01, 0x4F, 0x08, 0x04]),
    # IOCTL FE01: FRP Desired — 4 bytes float32 MPa from RAM page=0x02, addr=0x25D8
    bytes([0x2D, 0xFE, 0x01, 0x40, 0x02, 0x25, 0xD8, 0x04]),
]

# DDDI 0x2C definitions — map periodic IDs to IOCTL data sources
# Format: 0x2C <periodicID> <sourceDID_hi> <sourceDID_lo> [pos] [size]
_DDDI_DEFINE_PERIODIC = [
    # Periodic FE = read from IOCTL DID FE00, position 0, size 10 bytes
    bytes([0x2C, 0xFE, 0xFE, 0x00, 0x00, 0x0A]),
    # Periodic FD = read from IOCTL DID FE01
    bytes([0x2C, 0xFD, 0xFE, 0x01]),
]

# Periodic IDs to start streaming (must match _DDDI_DEFINE_PERIODIC order)
_PERIODIC_STREAM_IDS = [0xFE, 0xFD]

# Positive response SIDs for each service
_DDDI_POS_RESP = {0x2D: 0x6D, 0x2C: 0x6C, 0xAA: 0xEA}

# Periodic response arb ID (ECU streams on this after DDDI setup)
DDDI_PERIODIC_ARB_ID = 0x5E8


async def _send_isotp_and_wait(bridge, tx_id, rx_id, payload, timeout=1.0):
    """Send an ISO-TP message (single or multi-frame) and wait for the positive response."""
    proto = bridge.protocol
    bus = bridge.bus
    
    # Drain stale frames
    while not proto._response_queue.empty():
        try:
            proto._response_queue.get_nowait()
        except Exception:
            break
    
    length = len(payload)
    
    if length <= 7:
        # Single frame: PCI byte + payload
        frame_data = [length] + list(payload)
        # Pad to 8 bytes
        while len(frame_data) < 8:
            frame_data.append(0x00)
        frame = can.Message(arbitration_id=tx_id, data=frame_data, is_extended_id=False)
        bus.send(frame)
    else:
        # Multi-frame ISO-TP
        # First frame: PCI (1x xx) + first 6 bytes of payload
        ff_pci_hi = 0x10 | ((length >> 8) & 0x0F)
        ff_pci_lo = length & 0xFF
        ff_data = [ff_pci_hi, ff_pci_lo] + list(payload[:6])
        frame = can.Message(arbitration_id=tx_id, data=ff_data, is_extended_id=False)
        bus.send(frame)
        
        # Wait for flow control from ECU
        fc_deadline = time.time() + timeout
        got_fc = False
        while time.time() < fc_deadline:
            try:
                msg = await asyncio.wait_for(
                    proto._response_queue.get(),
                    timeout=min(fc_deadline - time.time(), 0.2)
                )
                if msg.arbitration_id == rx_id:
                    pci = (msg.data[0] >> 4) & 0x0F
                    if pci == 3:  # Flow control
                        got_fc = True
                        break
            except asyncio.TimeoutError:
                break
        
        if not got_fc:
            return None  # No flow control received
        
        # Send consecutive frames
        remaining = list(payload[6:])
        seq = 1
        while remaining:
            cf_data = [0x20 | (seq & 0x0F)] + remaining[:7]
            while len(cf_data) < 8:
                cf_data.append(0x00)
            frame = can.Message(arbitration_id=tx_id, data=cf_data, is_extended_id=False)
            bus.send(frame)
            remaining = remaining[7:]
            seq += 1
            await asyncio.sleep(0.001)  # Small gap between consecutive frames
    
    # Wait for positive response
    expected_sid = _DDDI_POS_RESP.get(payload[0])
    deadline = time.time() + timeout
    
    # For 0xAA, the ECU may not send a positive response — just periodic data
    if payload[0] == 0xAA:
        await asyncio.sleep(0.05)  # Give ECU time to start periodic transmission
        return [0xEA]  # Synthetic OK
    
    while time.time() < deadline:
        try:
            msg = await asyncio.wait_for(
                proto._response_queue.get(),
                timeout=min(deadline - time.time(), 0.5)
            )
        except asyncio.TimeoutError:
            return None
        
        if msg.arbitration_id != rx_id:
            continue
        
        frame_data = list(msg.data)
        pci = (frame_data[0] >> 4) & 0x0F
        
        if pci == 0:  # Single frame
            length = frame_data[0] & 0x0F
            resp = frame_data[1:1+length]
            if resp and resp[0] == expected_sid:
                return resp  # Positive response
            if resp and resp[0] == 0x7F:
                nrc = resp[2] if len(resp) >= 3 else 0
                log.warning(f"[PPEI] DDDI NRC 0x{nrc:02X} for service 0x{payload[0]:02X}")
                return None  # Negative response
    
    return None  # Timeout


async def _ppei_dddi_setup(bridge, tx_id, rx_id, req_id):
    """Execute the HPT-style DDDI setup: IOCTL 0x2D for RAM reads + DDDI 0x2C + periodic start.
    
    From BUSMASTER capture of HP Tuners FRP datalogging (2026-04-23):
      1. Stop any existing periodic transmissions (0xAA 04 00)
      2. Clear all old DDDI periodic definitions (0x2C FE 00 XX x 56)
         -> This UNLOCKS Mode 22 reads on the E41!
      3. IOCTL 0x2D to set up ECU RAM data sources (FE00=FRP_ACT, FE01=FRP_DES)
      4. DDDI 0x2C to map periodic IDs (FE, FD) to IOCTL sources
      5. Start periodic streaming (0xAA 04 FE FD)
    
    The 0x5E8 frames contain IEEE 754 float32 big-endian values in MPa.
    """
    log.info(f"[PPEI] Starting HPT-style DDDI setup for TX=0x{tx_id:03X} RX=0x{rx_id:03X}")
    start = time.time()
    
    # Ensure CAN bus and protocol are ready
    if not bridge.can_initialized:
        success = await bridge._ensure_can_bus()
        if not success:
            return {"type": "dddi_setup_result", "id": req_id, "ok": False,
                    "error": f"CAN bus not available: {bridge.can_error}"}
    
    if not bridge.protocol:
        bridge.protocol = _tobi.OBDProtocol(
            bridge.bus, rx_broadcast=bridge._broadcast_rx_stream
        )
        await bridge.protocol.start()
    
    # Add 0x5E8 to the software filter so periodic frames reach the queue
    bridge.protocol._filter_ids.add(DDDI_PERIODIC_ARB_ID)
    if hasattr(bridge.protocol, '_ppei_listener'):
        bridge.protocol._ppei_listener._filter_ids.add(DDDI_PERIODIC_ARB_ID)
    
    # Update hardware CAN filters to include 0x5E8
    if bridge.bus and getattr(bridge, '_ppei_hw_filters_active', False):
        try:
            bridge.bus.set_filters([
                {"can_id": 0x7E0, "can_mask": 0x7F0, "extended": False},
                {"can_id": 0x7DF, "can_mask": 0x7FF, "extended": False},
                {"can_id": DDDI_PERIODIC_ARB_ID, "can_mask": 0x7FF, "extended": False},
            ])
            log.info(f"[PPEI] Hardware CAN filters updated: added 0x{DDDI_PERIODIC_ARB_ID:03X}")
        except Exception as e:
            log.warning(f"[PPEI] Could not update CAN filters: {e}")
    
    ok_count = 0
    fail_count = 0
    total_steps = 1 + len(_DDDI_CLEAR_PERIODIC_IDS) + len(_IOCTL_SETUP) + len(_DDDI_DEFINE_PERIODIC) + 1
    step = 0
    
    # ── Phase 1: Stop any existing periodic reads ──
    log.info("[PPEI] Phase 1: Stopping existing periodic reads (0xAA 04 00)")
    stop_payload = bytes([0xAA, 0x04, 0x00])
    resp = await _send_isotp_and_wait(bridge, tx_id, rx_id, stop_payload, timeout=0.5)
    step += 1
    if resp:
        ok_count += 1
        log.info(f"[PPEI] Step {step}/{total_steps} OK: stopPeriodicRead")
    else:
        ok_count += 1  # NRC OK, nothing was running
        log.info(f"[PPEI] Step {step}/{total_steps}: stopPeriodicRead (NRC OK, nothing running)")
    await asyncio.sleep(0.010)
    
    # ── Phase 2: Clear all DDDI periodic definitions ──
    # This is the KEY that unlocks Mode 22 on the E41!
    log.info(f"[PPEI] Phase 2: Clearing {len(_DDDI_CLEAR_PERIODIC_IDS)} DDDI periodic definitions")
    clear_ok = 0
    clear_nrc = 0
    for pid in _DDDI_CLEAR_PERIODIC_IDS:
        clear_payload = bytes([0x2C, 0xFE, 0x00, pid])
        resp = await _send_isotp_and_wait(bridge, tx_id, rx_id, clear_payload, timeout=0.3)
        step += 1
        if resp:
            clear_ok += 1
            ok_count += 1
        else:
            clear_nrc += 1
            ok_count += 1  # NRC expected for some IDs
        await asyncio.sleep(0.006)
    log.info(f"[PPEI] Phase 2 complete: {clear_ok} positive, {clear_nrc} NRC (both OK)")
    
    # ── Phase 3: IOCTL 0x2D to configure ECU RAM data sources ──
    # This sets up FE00 and FE01 as live RAM reads (float32 MPa)
    log.info(f"[PPEI] Phase 3: Setting up {len(_IOCTL_SETUP)} IOCTL RAM data sources")
    ioctl_ok = 0
    for payload in _IOCTL_SETUP:
        did_hi, did_lo = payload[1], payload[2]
        log.info(f"[PPEI] IOCTL 0x2D DID=0x{did_hi:02X}{did_lo:02X}: {' '.join(f'{b:02X}' for b in payload)}")
        resp = await _send_isotp_and_wait(bridge, tx_id, rx_id, payload, timeout=1.0)
        step += 1
        if resp:
            ioctl_ok += 1
            ok_count += 1
            log.info(f"[PPEI] Step {step}/{total_steps} OK: IOCTL 0x{did_hi:02X}{did_lo:02X} -> 0x6D positive")
        else:
            fail_count += 1
            log.warning(f"[PPEI] Step {step}/{total_steps} FAILED: IOCTL 0x{did_hi:02X}{did_lo:02X}")
        await asyncio.sleep(0.015)
    log.info(f"[PPEI] Phase 3 complete: {ioctl_ok}/{len(_IOCTL_SETUP)} IOCTL sources configured")
    
    # ── Phase 4: DDDI 0x2C to map periodic IDs to IOCTL sources ──
    log.info(f"[PPEI] Phase 4: Defining {len(_DDDI_DEFINE_PERIODIC)} periodic ID mappings")
    dddi_ok = 0
    for payload in _DDDI_DEFINE_PERIODIC:
        periodic_id = payload[1]
        log.info(f"[PPEI] DDDI 0x2C periodic 0x{periodic_id:02X}: {' '.join(f'{b:02X}' for b in payload)}")
        resp = await _send_isotp_and_wait(bridge, tx_id, rx_id, payload, timeout=1.0)
        step += 1
        if resp:
            dddi_ok += 1
            ok_count += 1
            log.info(f"[PPEI] Step {step}/{total_steps} OK: DDDI define 0x{periodic_id:02X} -> 0x6C positive")
        else:
            fail_count += 1
            log.warning(f"[PPEI] Step {step}/{total_steps} FAILED: DDDI define 0x{periodic_id:02X}")
        await asyncio.sleep(0.015)
    log.info(f"[PPEI] Phase 4 complete: {dddi_ok}/{len(_DDDI_DEFINE_PERIODIC)} periodic IDs defined")
    
    # ── Phase 5: Start periodic streaming (0xAA 04 FE FD) ──
    if fail_count == 0:
        start_payload = bytes([0xAA, 0x04] + _PERIODIC_STREAM_IDS)
        log.info(f"[PPEI] Phase 5: Starting periodic streaming: 0xAA 04 {' '.join(f'{x:02X}' for x in _PERIODIC_STREAM_IDS)}")
        resp = await _send_isotp_and_wait(bridge, tx_id, rx_id, start_payload, timeout=0.5)
        if resp:
            ok_count += 1
            log.info(f"[PPEI] Phase 5 OK: Periodic streaming started on 0x{DDDI_PERIODIC_ARB_ID:03X}")
            log.info(f"[PPEI] FE=FRP_ACT (float32 MPa), FD=FRP_DES (float32 MPa)")
            bridge._ppei_dddi_streaming = True
            bridge._ppei_dddi_periodic_ids = _PERIODIC_STREAM_IDS
        else:
            log.warning("[PPEI] Phase 5: 0xAA start may have NRC'd")
            bridge._ppei_dddi_streaming = False
        await asyncio.sleep(0.050)
    else:
        log.warning(f"[PPEI] Phase 5 SKIPPED: {fail_count} previous steps failed")
        bridge._ppei_dddi_streaming = False
    
    elapsed = (time.time() - start) * 1000
    success = True  # Clear phase always succeeds
    streaming = getattr(bridge, '_ppei_dddi_streaming', False)
    log.info(
        f"[PPEI] DDDI setup complete in {elapsed:.0f}ms: "
        f"cleared {len(_DDDI_CLEAR_PERIODIC_IDS)} periodic IDs, "
        f"IOCTL {ioctl_ok}/{len(_IOCTL_SETUP)}, DDDI {dddi_ok}/{len(_DDDI_DEFINE_PERIODIC)}"
        f"{', PERIODIC STREAMING ACTIVE on 0x5E8 (FRP float32 MPa)' if streaming else ''}"
    )
    
    return {
        "type": "dddi_setup_result",
        "id": req_id,
        "ok": success,
        "clear_ok": clear_ok,
        "clear_nrc": clear_nrc,
        "ioctl_ok": ioctl_ok,
        "dddi_ok": dddi_ok,
        "elapsed_ms": round(elapsed, 1),
        "streaming": streaming,
        "periodic_ids": list(_PERIODIC_STREAM_IDS) if streaming else [],
    }
async def _ppei_streaming_poll(bridge, tx_id, rx_id, req_id, dids=None):
    """Lightweight poll during DDDI streaming — sends TesterPresent + optional Mode 01/22 reads.
    
    Matches HPT behavior: during periodic streaming, only send 0x3E TesterPresent
    to keep the diagnostic session alive. Optionally poll a few simple PIDs (RPM).
    Does NOT send batch Mode 22 reads which would kill the periodic scheduler.
    """
    if not bridge.protocol or not bridge.bus:
        return {"type": "streaming_poll_result", "id": req_id, "ok": False,
                "error": "CAN bus not ready"}
    
    proto = bridge.protocol
    results = {}
    
    # ── Step 1: TesterPresent (0x3E) to keep session alive ──
    # HPT sends: 01 3E 00 00 00 00 00 00
    tp_frame = can.Message(
        arbitration_id=tx_id,
        data=[0x01, 0x3E, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
        is_extended_id=False
    )
    try:
        bridge.bus.send(tp_frame)
    except can.CanError as e:
        log.warning(f"[PPEI] TesterPresent send failed: {e}")
    
    # Small delay for TesterPresent response
    await asyncio.sleep(0.010)
    
    # Drain any TesterPresent response from queue
    while not proto._response_queue.empty():
        try:
            msg = proto._response_queue.get_nowait()
        except Exception:
            break
    
    # ── Step 2: Poll requested DIDs one at a time (Mode 01 or Mode 22) ──
    # For RPM: send 02 01 0C on 0x7DF (functional broadcast) — this is Mode 01
    if dids:
        for did_info in dids:
            did = did_info.get("did", 0)
            mode = did_info.get("mode", 0x22)
            
            if mode == 0x01:
                # Mode 01 PID — send on 0x7DF functional broadcast
                pid_byte = did & 0xFF
                req_frame = can.Message(
                    arbitration_id=0x7DF,
                    data=[0x02, 0x01, pid_byte, 0x00, 0x00, 0x00, 0x00, 0x00],
                    is_extended_id=False
                )
            else:
                # Mode 22 DID — send on tx_id
                did_hi = (did >> 8) & 0xFF
                did_lo = did & 0xFF
                req_frame = can.Message(
                    arbitration_id=tx_id,
                    data=[0x03, 0x22, did_hi, did_lo, 0x00, 0x00, 0x00, 0x00],
                    is_extended_id=False
                )
            
            try:
                bridge.bus.send(req_frame)
            except can.CanError:
                results[did] = {"ok": False, "error": "send failed"}
                continue
            
            # Wait for response (short timeout — one DID at a time)
            deadline = time.time() + 0.100  # 100ms timeout per DID
            while time.time() < deadline:
                try:
                    msg = await asyncio.wait_for(
                        proto._response_queue.get(),
                        timeout=deadline - time.time()
                    )
                except asyncio.TimeoutError:
                    break
                
                frame_data = list(msg.data)
                if not frame_data:
                    continue
                
                pci_type = (frame_data[0] >> 4) & 0x0F
                if pci_type == 0:  # Single frame
                    length = frame_data[0] & 0x0F
                    payload = frame_data[1:1+length]
                    
                    if mode == 0x01 and payload and payload[0] == 0x41:
                        # Mode 01 positive response: 41 PID data...
                        results[did] = {"ok": True, "data": list(payload[2:])}
                        break
                    elif mode == 0x22 and payload and payload[0] == 0x62:
                        resp_did = (payload[1] << 8) | payload[2]
                        if resp_did == did:
                            results[did] = {"ok": True, "data": list(payload[3:])}
                            break
                    elif payload and payload[0] == 0x7F:
                        nrc = payload[2] if len(payload) >= 3 else 0
                        results[did] = {"ok": False, "error": f"NRC 0x{nrc:02X}"}
                        break
            
            if did not in results:
                results[did] = {"ok": False, "error": "timeout"}
            
            await asyncio.sleep(0.005)  # Small gap between DIDs
    
    return {
        "type": "streaming_poll_result",
        "id": req_id,
        "ok": True,
        "results": {str(k): v for k, v in results.items()},
    }


async def _ppei_dddi_teardown(bridge, tx_id, rx_id, req_id):
    """Stop periodic reads and clean up DDDI definitions."""
    log.info(f"[PPEI] DDDI teardown for TX=0x{tx_id:03X}")
    
    bridge._ppei_dddi_streaming = False
    bridge._ppei_dddi_periodic_ids = []
    
    if not bridge.protocol or not bridge.bus:
        return {"type": "dddi_teardown_result", "id": req_id, "ok": True}
    
    # Send 0xAA 04 00 to stop periodic reads (same as HPT)
    stop_payload = bytes([0xAA, 0x04, 0x00])
    await _send_isotp_and_wait(bridge, tx_id, rx_id, stop_payload, timeout=0.5)
    
    # Remove 0x5E8 from filters
    bridge.protocol._filter_ids.discard(DDDI_PERIODIC_ARB_ID)
    if hasattr(bridge.protocol, '_ppei_listener'):
        bridge.protocol._ppei_listener._filter_ids.discard(DDDI_PERIODIC_ARB_ID)
    
    log.info("[PPEI] DDDI teardown complete — periodic streaming stopped")
    return {"type": "dddi_teardown_result", "id": req_id, "ok": True}


# Update the handle_message patch to also intercept dddi_setup and dddi_teardown
_batch_handle_message = _ppei_handle_message  # Save the batch handler


async def _ppei_handle_message_v2(self, msg: dict):
    """Patched handle_message — intercepts dddi_setup, dddi_teardown, and batch_read_dids."""
    msg_type = msg.get("type")
    
    if msg_type == "dddi_setup":
        req_id = msg.get("id", "0")
        tx_id = msg.get("tx_id", 0x7E0)
        rx_id = tx_id + 8  # 0x7E0 → 0x7E8, 0x7E2 → 0x7EA
        return await _ppei_dddi_setup(self, tx_id, rx_id, req_id)
    
    if msg_type == "dddi_teardown":
        req_id = msg.get("id", "0")
        tx_id = msg.get("tx_id", 0x7E0)
        rx_id = tx_id + 8
        return await _ppei_dddi_teardown(self, tx_id, rx_id, req_id)
    
    if msg_type == "streaming_poll":
        req_id = msg.get("id", "0")
        tx_id = msg.get("tx_id", 0x7E0)
        rx_id = tx_id + 8
        dids = msg.get("dids", [])  # [{did: 0x0C, mode: 0x01}]
        return await _ppei_streaming_poll(self, tx_id, rx_id, req_id, dids)

    if msg_type == "dddi_keepalive":
        # Lightweight keepalive for DDDI periodic stream when no batch reads are happening.
        # Sends TesterPresent (0x3E) to keep diagnostic session alive, then re-sends
        # the periodic start command (0xAA 04 FE FD) to ensure the ECU keeps streaming.
        req_id = msg.get("id", "0")
        tx_id = msg.get("tx_id", 0x7E0)
        if not self.bus:
            return {"type": "dddi_keepalive_result", "id": req_id, "ok": False, "error": "no bus"}
        try:
            # TesterPresent
            tp_frame = can.Message(
                arbitration_id=tx_id,
                data=[0x01, 0x3E, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
                is_extended_id=False
            )
            self.bus.send(tp_frame)
            await asyncio.sleep(0.005)
            # Periodic restart (0xAA 04 FE FD)
            restart_ids = getattr(self, '_ppei_dddi_periodic_ids', [0xFE, 0xFD])
            restart_payload = bytes([0xAA, 0x04] + restart_ids)
            restart_frame = can.Message(
                arbitration_id=tx_id,
                data=list(restart_payload) + [0x00] * (8 - len(restart_payload)),
                is_extended_id=False
            )
            self.bus.send(restart_frame)
            log.debug(f"[PPEI] dddi_keepalive: TesterPresent + periodic restart sent")
            return {"type": "dddi_keepalive_result", "id": req_id, "ok": True}
        except can.CanError as e:
            log.warning(f"[PPEI] dddi_keepalive failed: {e}")
            return {"type": "dddi_keepalive_result", "id": req_id, "ok": False, "error": str(e)}

    # Fall through to batch_read_dids or Tobi's handler
    return await _batch_handle_message(self, msg)


_tobi.PCANBridge.handle_message = _ppei_handle_message_v2
log.info("[PPEI] Patch 6 applied: DDDI setup/teardown for Mode 22 unlock")


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
    log.info("  5. batch_read_dids for fast multi-DID polling")
    log.info("  6. DDDI setup/teardown for Mode 22 unlock + periodic streaming (HP Tuners method)")
    log.info("=" * 60)
    log.info("Tobi's pcan_bridge.py is NOT modified.")
    log.info("To revert: run pcan_bridge.py directly instead.")
    log.info("=" * 60)

    # Run Tobi's main with our patches active
    _tobi.main()
