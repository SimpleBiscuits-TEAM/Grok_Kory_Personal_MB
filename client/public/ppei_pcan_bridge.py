#!/usr/bin/env python3
"""
PPEI PCAN Bridge — Universal CAN Bus Layer
═══════════════════════════════════════════

This file is now the universal layer. GM-specific code lives in _gm_* functions only.
Ford-specific code lives in _ford_* functions. GM Global B code lives in _globalb_* functions.

Wraps Tobi's pcan_bridge.py with:
  - Configurable hardware CAN filters (obd / universal / j1939)
  - Manufacturer dispatch table for session setup (GM Global A / Ford / GM Global B)
  - Explicit rx_id support (no more tx_id + 8 assumption)
  - Notifier-based frame reader for high-traffic CAN buses
  - Batch DID reads, Mode 01 multi-PID, DDDI periodic streaming

Root Cause (original fix):
  Tobi's OBDProtocol._listen() uses bus.recv(timeout=0.1) in a polling loop.
  On a busy 2019 truck CAN bus (hundreds of frames/sec from BCM, TCM, ABS, etc.),
  the PCAN-USB internal hardware buffer fills up faster than bus.recv() can drain it.
  Result: ECU responses (0x7E8) are lost → VIN read fails → PID scan returns zero.

Fix:
  1. Replace polling bus.recv() with python-can Notifier (background thread reader)
  2. Use a single Notifier that feeds both OBD listener and IntelliSpy monitor
  3. Add configurable hardware CAN filters (obd/universal/j1939)
  4. Remove filters when IntelliSpy needs all frames

Usage:
  python ppei_pcan_bridge.py [same args as pcan_bridge.py] [--filter-mode obd|universal|j1939] [--manufacturer gm|ford|globalb|auto]

Tobi's pcan_bridge.py is NEVER modified. This file imports and patches at runtime.
"""

import sys
import os
import asyncio
import json
import time
import logging
import threading
import struct
from collections import deque
from typing import Optional, Set, Callable, Awaitable, Any, Dict, List, Tuple

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
# Universal Constants & Configuration
# ═══════════════════════════════════════════════════════════════════════════════

# ── Filter Modes ──────────────────────────────────────────────────────────────
FILTER_MODE_OBD = "obd"           # 11-bit OBD only: 0x7E0-0x7EF + 0x7DF (original GM behavior)
FILTER_MODE_UNIVERSAL = "universal"  # Accept all frames, filter in software
FILTER_MODE_J1939 = "j1939"       # 29-bit extended frames (heavy-duty / future)

VALID_FILTER_MODES = {FILTER_MODE_OBD, FILTER_MODE_UNIVERSAL, FILTER_MODE_J1939}

# ── Manufacturer Profiles ────────────────────────────────────────────────────
MANUFACTURER_GM = "gm"
MANUFACTURER_FORD = "ford"
MANUFACTURER_GLOBALB = "globalb"  # GM Global B — newer 29-bit UDS (T87, T93, Opel)
MANUFACTURER_AUTO = "auto"

VALID_MANUFACTURERS = {MANUFACTURER_GM, MANUFACTURER_FORD, MANUFACTURER_GLOBALB, MANUFACTURER_AUTO}

# ── Default ECU Addressing by Manufacturer ────────────────────────────────────
# Standard 11-bit OBD addressing: request on tx_id, response on rx_id
# GM Global A:  tx=0x7E0 (ECM), rx=0x7E8 — standard tx_id + 8
# Ford:         tx=0x7E0 (PCM), rx=0x7E8 — standard tx_id + 8
#               tx=0x7E2 (some modules), rx=0x7EA — standard tx_id + 8
# GM Global B (29-bit UDS, T87/T93/Opel): tx=0x14DA11F1, rx=0x14DAF111 — NOT tx+8!
#   29-bit format: 0x14DA + [Target SA] + [Source SA], response swaps TA/SA
# J1939:        29-bit PGN-based, no tx/rx pair concept

MANUFACTURER_DEFAULTS = {
    MANUFACTURER_GM: {
        "tx_id": 0x7E0,
        "rx_id": 0x7E8,
        "addressing": "11bit",
        "filter_mode": FILTER_MODE_OBD,
        "session_type": "extended",  # GM E41 needs extended diagnostic session
        "description": "GM Global A (L5P, E41, E88, E90, etc.)",
    },
    MANUFACTURER_FORD: {
        "tx_id": 0x7E0,
        "rx_id": 0x7E8,
        "addressing": "11bit",
        "filter_mode": FILTER_MODE_OBD,
        "session_type": "default",  # Ford PCM typically works in default session
        "description": "Ford (6.7L Power Stroke, 6R140, etc.)",
    },
    MANUFACTURER_GLOBALB: {
        "tx_id": 0x14DA11F1,
        "rx_id": 0x14DAF111,
        "addressing": "29bit",  # GM Global B uses 29-bit extended CAN IDs
        "filter_mode": FILTER_MODE_UNIVERSAL,  # Need universal filter for 29-bit
        "session_type": "extended",
        "description": "GM Global B (T87, T93, Opel — 29-bit UDS)",
    },
}


def get_rx_id(tx_id: int, manufacturer: str = MANUFACTURER_GM, rx_id_override: int = None) -> int:
    """Derive the response arbitration ID from the request ID.

    Args:
        tx_id: The request (TX) arbitration ID.
        manufacturer: Manufacturer key for addressing rules.
        rx_id_override: If provided, use this directly (highest priority).

    Returns:
        The expected response arbitration ID.

    For standard 11-bit OBD (GM Global A, Ford): rx = tx + 8.
    For GM Global B 29-bit: swap source/target bytes in the extended ID.
    For J1939: not applicable (PGN-based), returns 0.
    """
    if rx_id_override is not None:
        return rx_id_override

    # Standard 11-bit OBD: tx_id + 8
    if tx_id <= 0x7FF:
        return tx_id + 8

    # GM Global B 29-bit addressing: 0x14DAxxFF → 0x14DAFFxx
    # Source and target bytes are swapped in the response
    if manufacturer == MANUFACTURER_GLOBALB and tx_id > 0x7FF:
        # Extract: 0x14DA <target> <source> → response: 0x14DA <source> <target>
        target = (tx_id >> 8) & 0xFF
        source = tx_id & 0xFF
        return (tx_id & 0xFFFF0000) | (source << 8) | target

    # J1939 29-bit: no simple rx derivation
    if tx_id > 0x7FF:
        return 0  # Caller must provide explicit rx_id for J1939

    return tx_id + 8


def set_filter_mode(bridge, mode: str) -> dict:
    """Change the hardware CAN filter mode at runtime.

    Args:
        bridge: The PCANBridge instance.
        mode: One of 'obd', 'universal', 'j1939'.

    Returns:
        Status dict with result.
    """
    if mode not in VALID_FILTER_MODES:
        return {"ok": False, "error": f"Invalid filter mode: {mode}. Valid: {VALID_FILTER_MODES}"}

    old_mode = getattr(bridge, '_ppei_filter_mode', FILTER_MODE_OBD)
    bridge._ppei_filter_mode = mode

    if not bridge.bus:
        return {"ok": True, "mode": mode, "note": "Filter mode set; will apply when CAN bus opens"}

    try:
        if mode == FILTER_MODE_OBD:
            filters = [
                {"can_id": 0x7E0, "can_mask": 0x7F0, "extended": False},
                {"can_id": 0x7DF, "can_mask": 0x7FF, "extended": False},
            ]
            # Also include DDDI periodic ID if streaming is active
            if getattr(bridge, '_ppei_dddi_streaming', False):
                filters.append({"can_id": DDDI_PERIODIC_ARB_ID, "can_mask": 0x7FF, "extended": False})
            bridge.bus.set_filters(filters)
            bridge._ppei_hw_filters_active = True
            log.info(f"[PPEI] Filter mode → OBD: 0x7E0-0x7EF + 0x7DF only")

        elif mode == FILTER_MODE_UNIVERSAL:
            bridge.bus.set_filters(None)  # Accept ALL frames
            bridge._ppei_hw_filters_active = False
            log.info(f"[PPEI] Filter mode → UNIVERSAL: all frames accepted")

        elif mode == FILTER_MODE_J1939:
            # Accept only 29-bit extended frames
            bridge.bus.set_filters([
                {"can_id": 0x00000000, "can_mask": 0x00000000, "extended": True},
            ])
            bridge._ppei_hw_filters_active = True
            log.info(f"[PPEI] Filter mode → J1939: 29-bit extended frames only")

        return {"ok": True, "mode": mode, "previous": old_mode}

    except Exception as e:
        log.warning(f"[PPEI] Could not apply filter mode '{mode}': {e}")
        return {"ok": False, "mode": mode, "error": str(e)}


# ═══════════════════════════════════════════════════════════════════════════════
# Manufacturer Session Setup Dispatch Table
# ═══════════════════════════════════════════════════════════════════════════════
# Each manufacturer's session setup is isolated in its own function.
# The GM function contains the exact same DDDI/IOCTL logic that was previously
# inline — zero behavioral changes.

# ── GM-specific constants (moved from inline, unchanged) ─────────────────────

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
_IOCTL_SETUP = [
    bytes([0x2D, 0xFE, 0x00, 0x40, 0x01, 0x4F, 0x08, 0x04]),  # FRP Actual
    bytes([0x2D, 0xFE, 0x01, 0x40, 0x02, 0x25, 0xD8, 0x04]),  # FRP Desired
]

# DDDI 0x2C definitions — map periodic IDs to IOCTL data sources
_DDDI_DEFINE_PERIODIC = [
    bytes([0x2C, 0xFE, 0xFE, 0x00, 0x00, 0x0A]),  # Periodic FE = IOCTL FE00
    bytes([0x2C, 0xFD, 0xFE, 0x01]),                # Periodic FD = IOCTL FE01
]

# Periodic IDs to start streaming
_PERIODIC_STREAM_IDS = [0xFE, 0xFD]

# Positive response SIDs for each service
_DDDI_POS_RESP = {0x2D: 0x6D, 0x2C: 0x6C, 0xAA: 0xEA}

# Periodic response arb ID (ECU streams on this after DDDI setup)
DDDI_PERIODIC_ARB_ID = 0x5E8


async def _gm_session_setup(bridge, tx_id: int, rx_id: int, req_id: str) -> dict:
    """GM-specific DDDI session setup — exact same logic as original, now in its own function.

    Execute the HPT-style DDDI setup: IOCTL 0x2D for RAM reads + DDDI 0x2C + periodic start.
    From BUSMASTER capture of HP Tuners FRP datalogging (2026-04-23):
      1. Stop any existing periodic transmissions (0xAA 00 = stopSending per GMW3110)
      2. Clear all old DDDI periodic definitions (0x2C FE 00 XX x 56) → UNLOCKS Mode 22
      3. IOCTL 0x2D to set up ECU RAM data sources (FE00=FRP_ACT, FE01=FRP_DES)
      4. DDDI 0x2C to map periodic IDs (FE, FD) to IOCTL sources
      5. Start periodic streaming (0xAA 04 FE FD)

    The 0x5E8 frames contain IEEE 754 float32 big-endian values in MPa.
    """
    log.info(f"[PPEI] GM session setup: HPT-style DDDI for TX=0x{tx_id:03X} RX=0x{rx_id:03X}")
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
    log.info("[PPEI] GM Phase 1: Stopping existing periodic reads (0xAA 00 = stopSending per GMW3110)")
    stop_payload = bytes([0xAA, 0x00])  # GMW3110 Table 190: sub-function $00 = stopSending
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
    log.info(f"[PPEI] GM Phase 2: Clearing {len(_DDDI_CLEAR_PERIODIC_IDS)} DDDI periodic definitions")
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
    log.info(f"[PPEI] GM Phase 2 complete: {clear_ok} positive, {clear_nrc} NRC (both OK)")

    # ── Phase 3: IOCTL 0x2D to configure ECU RAM data sources ──
    log.info(f"[PPEI] GM Phase 3: Setting up {len(_IOCTL_SETUP)} IOCTL RAM data sources")
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
    log.info(f"[PPEI] GM Phase 3 complete: {ioctl_ok}/{len(_IOCTL_SETUP)} IOCTL sources configured")

    # ── Phase 4: DDDI 0x2C to map periodic IDs to IOCTL sources ──
    log.info(f"[PPEI] GM Phase 4: Defining {len(_DDDI_DEFINE_PERIODIC)} periodic ID mappings")
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
    log.info(f"[PPEI] GM Phase 4 complete: {dddi_ok}/{len(_DDDI_DEFINE_PERIODIC)} periodic IDs defined")

    # ── Phase 5: Start periodic streaming (0xAA 04 FE FD) ──
    if fail_count == 0:
        start_payload = bytes([0xAA, 0x04] + _PERIODIC_STREAM_IDS)
        log.info(f"[PPEI] GM Phase 5: Starting periodic streaming: 0xAA 04 {' '.join(f'{x:02X}' for x in _PERIODIC_STREAM_IDS)}")
        resp = await _send_isotp_and_wait(bridge, tx_id, rx_id, start_payload, timeout=0.5)
        if resp:
            ok_count += 1
            log.info(f"[PPEI] GM Phase 5 OK: Periodic streaming started on 0x{DDDI_PERIODIC_ARB_ID:03X}")
            log.info(f"[PPEI] FE=FRP_ACT (float32 MPa), FD=FRP_DES (float32 MPa)")
            bridge._ppei_dddi_streaming = True
            bridge._ppei_dddi_periodic_ids = _PERIODIC_STREAM_IDS
        else:
            log.warning("[PPEI] GM Phase 5: 0xAA start may have NRC'd")
            bridge._ppei_dddi_streaming = False
        await asyncio.sleep(0.050)
    else:
        log.warning(f"[PPEI] GM Phase 5 SKIPPED: {fail_count} previous steps failed")
        bridge._ppei_dddi_streaming = False

    elapsed = (time.time() - start) * 1000
    success = True
    streaming = getattr(bridge, '_ppei_dddi_streaming', False)
    log.info(
        f"[PPEI] GM DDDI setup complete in {elapsed:.0f}ms: "
        f"cleared {len(_DDDI_CLEAR_PERIODIC_IDS)} periodic IDs, "
        f"IOCTL {ioctl_ok}/{len(_IOCTL_SETUP)}, DDDI {dddi_ok}/{len(_DDDI_DEFINE_PERIODIC)}"
        f"{', PERIODIC STREAMING ACTIVE on 0x5E8 (FRP float32 MPa)' if streaming else ''}"
    )

    return {
        "type": "dddi_setup_result",
        "id": req_id,
        "ok": success,
        "manufacturer": MANUFACTURER_GM,
        "clear_ok": clear_ok,
        "clear_nrc": clear_nrc,
        "ioctl_ok": ioctl_ok,
        "dddi_ok": dddi_ok,
        "elapsed_ms": round(elapsed, 1),
        "streaming": streaming,
        "periodic_ids": list(_PERIODIC_STREAM_IDS) if streaming else [],
    }


async def _ford_session_setup(bridge, tx_id: int, rx_id: int, req_id: str) -> dict:
    """Ford-specific session setup — placeholder for future implementation.

    Ford 6.7L Power Stroke PCM (tx=0x7E0, rx=0x7E8):
      - Typically works in default diagnostic session for Mode 01/22 reads
      - Extended session (0x10 03) may be needed for some advanced DIDs
      - No DDDI/IOCTL equivalent — Ford uses standard ReadDataByIdentifier (0x22)
      - Some Ford modules use tx=0x7E2 (e.g., TCM, ABS)

    TODO: Implement Ford-specific session initialization when hardware is available.
    """
    log.info(f"[PPEI] Ford session setup: TX=0x{tx_id:03X} RX=0x{rx_id:03X}")

    # Ensure CAN bus and protocol are ready
    if not bridge.can_initialized:
        success = await bridge._ensure_can_bus()
        if not success:
            return {"type": "dddi_setup_result", "id": req_id, "ok": False,
                    "manufacturer": MANUFACTURER_FORD,
                    "error": f"CAN bus not available: {bridge.can_error}"}

    if not bridge.protocol:
        bridge.protocol = _tobi.OBDProtocol(
            bridge.bus, rx_broadcast=bridge._broadcast_rx_stream
        )
        await bridge.protocol.start()

    # Ford typically doesn't need DDDI — Mode 22 works in default session
    # Just send a TesterPresent to verify ECU is responsive
    log.info("[PPEI] Ford: Sending TesterPresent to verify ECU connectivity")
    tp_payload = bytes([0x3E, 0x00])
    resp = await _send_isotp_and_wait(bridge, tx_id, rx_id, tp_payload, timeout=1.0)

    if resp:
        log.info("[PPEI] Ford session setup OK: ECU responsive, Mode 22 should work in default session")
        return {
            "type": "dddi_setup_result",
            "id": req_id,
            "ok": True,
            "manufacturer": MANUFACTURER_FORD,
            "note": "Ford PCM ready — Mode 22 works in default session (no DDDI needed)",
            "streaming": False,
            "periodic_ids": [],
        }
    else:
        # Try extended diagnostic session
        log.info("[PPEI] Ford: TesterPresent failed, trying extended session (0x10 03)")
        ext_payload = bytes([0x10, 0x03])
        resp = await _send_isotp_and_wait(bridge, tx_id, rx_id, ext_payload, timeout=1.0)
        if resp:
            log.info("[PPEI] Ford session setup OK: Extended session established")
            return {
                "type": "dddi_setup_result",
                "id": req_id,
                "ok": True,
                "manufacturer": MANUFACTURER_FORD,
                "note": "Ford PCM in extended diagnostic session",
                "streaming": False,
                "periodic_ids": [],
            }
        else:
            log.warning("[PPEI] Ford session setup: ECU not responding")
            return {
                "type": "dddi_setup_result",
                "id": req_id,
                "ok": False,
                "manufacturer": MANUFACTURER_FORD,
                "error": "Ford ECU not responding to TesterPresent or extended session",
                "streaming": False,
                "periodic_ids": [],
            }


async def _globalb_session_setup(bridge, tx_id: int, rx_id: int, req_id: str) -> dict:
    """GM Global B session setup — for newer GM vehicles with 29-bit UDS.

    GM Global B (29-bit UDS, T87/T93/Opel platforms):
      - tx=0x14DA11F1 (target=0x11 ECM, source=0xF1 tester)
      - rx=0x14DAF111 (source/target swapped)
      - Requires filter_mode='universal' to see 29-bit frames
      - Uses ISO 14229 UDS services (same as GM Global A but 29-bit addressing)
      - GMW-3110 PIDs renamed to DIDs in ISO-14229

    NOTE: Global B is a GM protocol, NOT BMW. The 0x14DA prefix is the
    ISO 15765 normal fixed addressing format for UDS on CAN.
    """
    log.info(f"[PPEI] GM Global B session setup: TX=0x{tx_id:08X} RX=0x{rx_id:08X}")

    # Ensure CAN bus and protocol are ready
    if not bridge.can_initialized:
        success = await bridge._ensure_can_bus()
        if not success:
            return {"type": "dddi_setup_result", "id": req_id, "ok": False,
                    "manufacturer": MANUFACTURER_GLOBALB,
                    "error": f"CAN bus not available: {bridge.can_error}"}

    if not bridge.protocol:
        bridge.protocol = _tobi.OBDProtocol(
            bridge.bus, rx_broadcast=bridge._broadcast_rx_stream
        )
        await bridge.protocol.start()

    # Try extended diagnostic session (Global B uses UDS, needs extended session for Mode 22)
    log.info("[PPEI] Global B: Requesting extended diagnostic session (0x10 03)")
    ext_payload = bytes([0x10, 0x03])
    resp = await _send_isotp_and_wait(bridge, tx_id, rx_id, ext_payload, timeout=1.0)

    if resp:
        log.info("[PPEI] Global B session setup OK: Extended session established")
        return {
            "type": "dddi_setup_result",
            "id": req_id,
            "ok": True,
            "manufacturer": MANUFACTURER_GLOBALB,
            "note": "GM Global B ECU in extended diagnostic session",
            "streaming": False,
            "periodic_ids": [],
        }
    else:
        log.warning("[PPEI] Global B session setup: ECU not responding to extended session request")
        return {
            "type": "dddi_setup_result",
            "id": req_id,
            "ok": False,
            "manufacturer": MANUFACTURER_GLOBALB,
            "error": "GM Global B ECU not responding to extended session request",
            "streaming": False,
            "periodic_ids": [],
        }


# ── Session Setup Dispatch Table ─────────────────────────────────────────────
SESSION_SETUP = {
    MANUFACTURER_GM: _gm_session_setup,
    MANUFACTURER_FORD: _ford_session_setup,
    MANUFACTURER_GLOBALB: _globalb_session_setup,
}


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
    loop = asyncio.get_event_loop()
    self._ppei_listener = _OBDFrameListener(self, loop)
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
# Patch 2: Configurable hardware CAN filters on bus init
# ═══════════════════════════════════════════════════════════════════════════════

_original_init_can_bus = _tobi.PCANBridge._init_can_bus


def _ppei_init_can_bus(self, bitrate: int = None, fd: bool = False) -> bool:
    """Patched _init_can_bus — applies hardware CAN filters based on filter_mode."""
    result = _original_init_can_bus(self, bitrate, fd)
    if result and self.bus:
        mode = getattr(self, '_ppei_filter_mode', FILTER_MODE_OBD)
        try:
            if mode == FILTER_MODE_OBD:
                self.bus.set_filters([
                    {"can_id": 0x7E0, "can_mask": 0x7F0, "extended": False},
                    {"can_id": 0x7DF, "can_mask": 0x7FF, "extended": False},
                ])
                self._ppei_hw_filters_active = True
                log.info(f"[PPEI] Hardware CAN filters applied (mode=obd): 0x7E0-0x7EF + 0x7DF")
            elif mode == FILTER_MODE_UNIVERSAL:
                self.bus.set_filters(None)
                self._ppei_hw_filters_active = False
                log.info(f"[PPEI] Hardware CAN filters disabled (mode=universal): all frames accepted")
            elif mode == FILTER_MODE_J1939:
                self.bus.set_filters([
                    {"can_id": 0x00000000, "can_mask": 0x00000000, "extended": True},
                ])
                self._ppei_hw_filters_active = True
                log.info(f"[PPEI] Hardware CAN filters applied (mode=j1939): 29-bit extended frames")
            else:
                # Unknown mode — fall back to OBD
                self.bus.set_filters([
                    {"can_id": 0x7E0, "can_mask": 0x7F0, "extended": False},
                    {"can_id": 0x7DF, "can_mask": 0x7FF, "extended": False},
                ])
                self._ppei_hw_filters_active = True
                log.warning(f"[PPEI] Unknown filter mode '{mode}', falling back to OBD filters")
        except Exception as e:
            self._ppei_hw_filters_active = False
            log.warning(f"[PPEI] Could not set hardware CAN filters: {e}")
            log.warning("[PPEI] Falling back to software filtering (may overflow on busy buses)")
    return result


_tobi.PCANBridge._init_can_bus = _ppei_init_can_bus
log.info("[PPEI] Patch 2 applied: Configurable hardware CAN filters on bus init")


# ═══════════════════════════════════════════════════════════════════════════════
# Patch 3: Remove hardware filters when IntelliSpy monitor starts,
#           restore them when monitor stops
# ═══════════════════════════════════════════════════════════════════════════════

_original_handle_client = _tobi.PCANBridge.handle_client
_original_bus_monitor_loop = _tobi.PCANBridge._bus_monitor_loop


async def _ppei_bus_monitor_loop(self, websocket, filter_set=None):
    """Patched _bus_monitor_loop — removes HW filters so IntelliSpy sees all frames,
    then restores them when the monitor stops."""
    if self.bus and getattr(self, '_ppei_hw_filters_active', False):
        try:
            self.bus.set_filters(None)
            log.info("[PPEI] Hardware CAN filters REMOVED for IntelliSpy monitor")
        except Exception as e:
            log.warning(f"[PPEI] Could not remove CAN filters: {e}")

    obd_notifier = None
    if self.protocol and hasattr(self.protocol, '_ppei_notifier'):
        obd_notifier = self.protocol._ppei_notifier
        if obd_notifier:
            obd_notifier.stop()
            log.info("[PPEI] Paused OBD Notifier during bus monitor")

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
            if filter_set is None or msg.arbitration_id in filter_set:
                asyncio.run_coroutine_threadsafe(
                    _send_monitor_frame(websocket, msg, frame_count),
                    loop
                )
            if self.protocol and msg.arbitration_id in self_inner.obd_filter_ids:
                asyncio.run_coroutine_threadsafe(
                    _dispatch_to_obd(self.protocol, msg),
                    loop
                )

    combined_listener = _CombinedListener()
    combined_notifier = Notifier(self.bus, [combined_listener], timeout=0.02)

    try:
        while monitor_running:
            try:
                await asyncio.sleep(0.1)
                if websocket not in self._monitor_clients:
                    break
            except Exception:
                break
    finally:
        combined_notifier.stop()
        log.info(f"[PPEI] Bus monitor stopped. {frame_count} frames in {time.time() - start_time:.1f}s")

        if self.protocol and hasattr(self.protocol, '_ppei_listener'):
            self.protocol._ppei_notifier = Notifier(
                self.bus, [self.protocol._ppei_listener], timeout=0.05
            )
            log.info("[PPEI] Resumed OBD Notifier after bus monitor")

        # Restore hardware filters based on current filter_mode
        mode = getattr(self, '_ppei_filter_mode', FILTER_MODE_OBD)
        if self.bus and mode == FILTER_MODE_OBD:
            try:
                filters = [
                    {"can_id": 0x7E0, "can_mask": 0x7F0, "extended": False},
                    {"can_id": 0x7DF, "can_mask": 0x7FF, "extended": False},
                ]
                if getattr(self, '_ppei_dddi_streaming', False):
                    filters.append({"can_id": DDDI_PERIODIC_ARB_ID, "can_mask": 0x7FF, "extended": False})
                self.bus.set_filters(filters)
                self._ppei_hw_filters_active = True
                log.info("[PPEI] Hardware CAN filters RESTORED after monitor")
            except Exception as e:
                log.warning(f"[PPEI] Could not restore CAN filters: {e}")
        elif self.bus and mode == FILTER_MODE_UNIVERSAL:
            self._ppei_hw_filters_active = False
            log.info("[PPEI] Filter mode is universal — no filters to restore")
        elif self.bus and mode == FILTER_MODE_J1939:
            try:
                self.bus.set_filters([
                    {"can_id": 0x00000000, "can_mask": 0x00000000, "extended": True},
                ])
                self._ppei_hw_filters_active = True
                log.info("[PPEI] Hardware CAN filters RESTORED (j1939 mode) after monitor")
            except Exception as e:
                log.warning(f"[PPEI] Could not restore J1939 CAN filters: {e}")


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

_original_send_raw_frame = _tobi.OBDProtocol.send_raw_frame


async def _ppei_send_raw_frame(self, arb_id, data, req_id, extended=False):
    """Patched send_raw_frame — skip _drain_queue to preserve Notifier-delivered frames."""
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
# ISO-TP Helper (shared by all manufacturers)
# ═══════════════════════════════════════════════════════════════════════════════

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
    is_extended = tx_id > 0x7FF  # 29-bit addressing

    if length <= 7:
        frame_data = [length] + list(payload)
        while len(frame_data) < 8:
            frame_data.append(0x00)
        frame = can.Message(arbitration_id=tx_id, data=frame_data, is_extended_id=is_extended)
        bus.send(frame)
    else:
        ff_pci_hi = 0x10 | ((length >> 8) & 0x0F)
        ff_pci_lo = length & 0xFF
        ff_data = [ff_pci_hi, ff_pci_lo] + list(payload[:6])
        frame = can.Message(arbitration_id=tx_id, data=ff_data, is_extended_id=is_extended)
        bus.send(frame)

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
                    if pci == 3:
                        got_fc = True
                        break
            except asyncio.TimeoutError:
                break

        if not got_fc:
            return None

        remaining = list(payload[6:])
        seq = 1
        while remaining:
            cf_data = [0x20 | (seq & 0x0F)] + remaining[:7]
            while len(cf_data) < 8:
                cf_data.append(0x00)
            frame = can.Message(arbitration_id=tx_id, data=cf_data, is_extended_id=is_extended)
            bus.send(frame)
            remaining = remaining[7:]
            seq += 1
            await asyncio.sleep(0.001)

    # Wait for positive response
    expected_sid = _DDDI_POS_RESP.get(payload[0])
    deadline = time.time() + timeout

    # For 0xAA, the ECU may not send a positive response
    if payload[0] == 0xAA:
        await asyncio.sleep(0.05)
        return [0xEA]

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

        if pci == 0:
            length = frame_data[0] & 0x0F
            resp = frame_data[1:1+length]
            if resp and resp[0] == expected_sid:
                return resp
            if resp and resp[0] == 0x7F:
                nrc = resp[2] if len(resp) >= 3 else 0
                log.warning(f"[PPEI] NRC 0x{nrc:02X} for service 0x{payload[0]:02X}")
                return None

    return None


# ═══════════════════════════════════════════════════════════════════════════════
# Patch 5: batch_read_dids — read multiple DIDs in a tight CAN loop
# ═══════════════════════════════════════════════════════════════════════════════

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
    rx_id_param = msg.get("rx_id", None)  # Explicit rx_id support
    manufacturer = msg.get("manufacturer", getattr(self, '_ppei_manufacturer', MANUFACTURER_GM))
    rx_id = get_rx_id(tx_id, manufacturer, rx_id_param)
    per_did_timeout = msg.get("timeout_ms", 150) / 1000.0

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

    # ── PHASE 0: TesterPresent + Periodic restart BEFORE the batch ──
    if getattr(self, '_ppei_dddi_streaming', False):
        try:
            tp_frame = can.Message(
                arbitration_id=tx_id,
                data=[0x01, 0x3E, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
                is_extended_id=tx_id > 0x7FF
            )
            self.bus.send(tp_frame)
            await asyncio.sleep(0.003)
            restart_ids = getattr(self, '_ppei_dddi_periodic_ids', [0xFE, 0xFD])
            restart_payload = bytes([0xAA, 0x04] + restart_ids)
            restart_frame = can.Message(
                arbitration_id=tx_id,
                data=list(restart_payload) + [0x00] * (8 - len(restart_payload)),
                is_extended_id=tx_id > 0x7FF
            )
            self.bus.send(restart_frame)
            await asyncio.sleep(0.003)
            log.debug(f"[PPEI] Pre-batch: TesterPresent + periodic restart sent")
        except can.CanError as e:
            log.warning(f"[PPEI] Pre-batch keepalive failed: {e}")

    # ── Drain stale frames before the batch ──
    while not proto._response_queue.empty():
        try:
            proto._response_queue.get_nowait()
        except Exception:
            break

    # ── PHASE 1: Send DID requests with small inter-request gap ──
    sent_dids = []
    send_errors = {}
    is_extended = tx_id > 0x7FF
    for i, did in enumerate(dids):
        did_hi = (did >> 8) & 0xFF
        did_lo = did & 0xFF
        data = [0x03, 0x22, did_hi, did_lo, 0x00, 0x00, 0x00, 0x00]
        frame = can.Message(
            arbitration_id=tx_id,
            data=data,
            is_extended_id=is_extended
        )
        try:
            self.bus.send(frame)
            sent_dids.append(did)
            if i < len(dids) - 1:
                await asyncio.sleep(0.002)
        except can.CanError as e:
            send_errors[did] = f"CAN send: {e}"

    # ── PHASE 2: Collect ALL responses from the queue ──
    collected = {}
    nrc_errors = {}
    pending = set(sent_dids)
    total_timeout = max(per_did_timeout * len(sent_dids) * 2.0, 0.4)
    collect_deadline = time.time() + total_timeout
    isotp_state = {}

    # Build set of acceptable response IDs
    response_ids = {rx_id}
    # Also accept standard OBD response IDs for backward compatibility
    response_ids.update(_tobi.RESPONSE_IDS)

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
            continue

        if msg.arbitration_id not in response_ids:
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

            if payload and payload[0] == 0x7F and len(payload) >= 3 and payload[1] == 0x22:
                nrc = payload[2]
                log.debug(f"[PPEI] batch NRC 0x{nrc:02X} received")
                continue

            if payload and payload[0] == 0x62 and len(payload) >= 3:
                resp_did = (payload[1] << 8) | payload[2]
                if resp_did in pending:
                    collected[resp_did] = payload[3:]
                    pending.discard(resp_did)
                continue

        elif pci_type == 1:  # First frame
            total_length = ((frame_data[0] & 0x0F) << 8) | frame_data[1]
            payload = frame_data[2:]
            fc_msg = can.Message(
                arbitration_id=tx_id,
                data=[_tobi.ISOTP_FLOW_CONTROL, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
                is_extended_id=is_extended
            )
            try:
                self.bus.send(fc_msg)
            except can.CanError:
                pass
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
                    if len(state['payload']) >= state['total_length']:
                        full_payload = state['payload'][:state['total_length']]
                        del isotp_state[arb_id]
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
    if getattr(self, '_ppei_dddi_streaming', False):
        await asyncio.sleep(0.010)
        restart_ids = getattr(self, '_ppei_dddi_periodic_ids', [0xFE, 0xFD])
        restart_payload = bytes([0xAA, 0x04] + restart_ids)
        restart_frame = can.Message(
            arbitration_id=tx_id,
            data=list(restart_payload) + [0x00] * (8 - len(restart_payload)),
            is_extended_id=is_extended
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
# Patch 5b: batch_read_mode01 — read multiple Mode 01 PIDs using multi-PID
# requests (up to 6 PIDs per CAN frame per SAE J1979 spec).
# ═══════════════════════════════════════════════════════════════════════════════

async def _ppei_batch_read_mode01(self, msg: dict):
    """Handle batch_read_mode01: read multiple Mode 01 PIDs in batched CAN frames."""
    req_id = msg.get("id", "0")
    pids = msg.get("pids", [])
    tx_id = msg.get("tx_id", 0x7E0)
    rx_id_param = msg.get("rx_id", None)
    manufacturer = msg.get("manufacturer", getattr(self, '_ppei_manufacturer', MANUFACTURER_GM))
    rx_id = get_rx_id(tx_id, manufacturer, rx_id_param)
    per_batch_timeout = msg.get("timeout_ms", 200) / 1000.0

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

    MAX_PIDS_PER_REQUEST = 6
    batches = []
    for i in range(0, len(pids), MAX_PIDS_PER_REQUEST):
        batches.append(pids[i:i + MAX_PIDS_PER_REQUEST])

    while not proto._response_queue.empty():
        try:
            proto._response_queue.get_nowait()
        except Exception:
            break

    collected = {}
    is_extended = tx_id > 0x7FF

    for batch_idx, batch in enumerate(batches):
        batch_pids = [p["pid"] for p in batch]
        batch_bytes = {p["pid"]: p.get("bytes", 1) for p in batch}
        n = len(batch_pids)

        pci = 1 + n
        frame_data = [pci, 0x01] + batch_pids
        while len(frame_data) < 8:
            frame_data.append(0x00)

        frame = can.Message(
            arbitration_id=tx_id,
            data=frame_data,
            is_extended_id=is_extended
        )
        try:
            self.bus.send(frame)
        except can.CanError as e:
            log.warning(f"[PPEI] batch_read_mode01 send error: {e}")
            continue

        deadline = time.time() + per_batch_timeout
        isotp_state = None
        response_payload = None

        while time.time() < deadline:
            remaining = deadline - time.time()
            if remaining <= 0:
                break
            try:
                msg_rx = await asyncio.wait_for(
                    proto._response_queue.get(),
                    timeout=min(remaining, 0.05)
                )
            except asyncio.TimeoutError:
                if response_payload is not None:
                    break
                continue

            if msg_rx.arbitration_id != rx_id:
                continue

            frame_data_rx = list(msg_rx.data)
            if not frame_data_rx:
                continue

            pci_type = (frame_data_rx[0] >> 4) & 0x0F

            if pci_type == 0:
                length = frame_data_rx[0] & 0x0F
                response_payload = frame_data_rx[1:1 + length]
                break

            elif pci_type == 1:
                total_length = ((frame_data_rx[0] & 0x0F) << 8) | frame_data_rx[1]
                isotp_state = {
                    'total_length': total_length,
                    'payload': list(frame_data_rx[2:]),
                    'expected_seq': 1,
                }
                fc_msg = can.Message(
                    arbitration_id=tx_id,
                    data=[_tobi.ISOTP_FLOW_CONTROL, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
                    is_extended_id=is_extended
                )
                try:
                    self.bus.send(fc_msg)
                except can.CanError:
                    pass
                continue

            elif pci_type == 2:
                if isotp_state is None:
                    continue
                cf_seq = frame_data_rx[0] & 0x0F
                if cf_seq == (isotp_state['expected_seq'] & 0x0F):
                    isotp_state['payload'].extend(frame_data_rx[1:])
                    isotp_state['expected_seq'] += 1
                    if len(isotp_state['payload']) >= isotp_state['total_length']:
                        response_payload = isotp_state['payload'][:isotp_state['total_length']]
                        isotp_state = None
                        break
                continue

        if response_payload and len(response_payload) >= 2 and response_payload[0] == 0x41:
            idx = 1
            while idx < len(response_payload):
                resp_pid = response_payload[idx]
                idx += 1
                if resp_pid in batch_bytes:
                    nb = batch_bytes[resp_pid]
                    if idx + nb <= len(response_payload):
                        collected[resp_pid] = response_payload[idx:idx + nb]
                        idx += nb
                    else:
                        break
                else:
                    idx += 1
        elif response_payload and len(response_payload) >= 1 and response_payload[0] == 0x7F:
            log.debug(f"[PPEI] batch_read_mode01 NRC for batch {batch_idx}")

        if batch_idx < len(batches) - 1:
            await asyncio.sleep(0.002)

    results = []
    for p in pids:
        pid = p["pid"]
        if pid in collected:
            results.append({"pid": pid, "ok": True, "data": list(collected[pid])})
        else:
            results.append({"pid": pid, "ok": False, "error": "timeout"})

    elapsed = (time.time() - start_all) * 1000
    ok_count = sum(1 for r in results if r.get("ok"))
    log.info(
        f"[PPEI] batch_read_mode01: {ok_count}/{len(pids)} OK in {elapsed:.0f}ms "
        f"({len(batches)} batches of up to {MAX_PIDS_PER_REQUEST})"
    )

    return {
        "type": "batch_mode01_results",
        "id": req_id,
        "results": results,
        "elapsed_ms": round(elapsed, 1),
    }

log.info("[PPEI] Patch 5b defined: batch_read_mode01 for multi-PID Mode 01 requests")


# ═══════════════════════════════════════════════════════════════════════════════
# Patch 6: DDDI setup/teardown + streaming poll + keepalive
# Now uses manufacturer dispatch table for session setup.
# ═══════════════════════════════════════════════════════════════════════════════

async def _ppei_streaming_poll(bridge, tx_id, rx_id, req_id, dids=None):
    """Lightweight poll during DDDI streaming — sends TesterPresent + optional Mode 01/22 reads."""
    if not bridge.protocol or not bridge.bus:
        return {"type": "streaming_poll_result", "id": req_id, "ok": False,
                "error": "CAN bus not ready"}

    proto = bridge.protocol
    results = {}
    is_extended = tx_id > 0x7FF

    # ── Step 1: TesterPresent (0x3E) to keep session alive ──
    tp_frame = can.Message(
        arbitration_id=tx_id,
        data=[0x01, 0x3E, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
        is_extended_id=is_extended
    )
    try:
        bridge.bus.send(tp_frame)
    except can.CanError as e:
        log.warning(f"[PPEI] TesterPresent send failed: {e}")

    await asyncio.sleep(0.010)

    while not proto._response_queue.empty():
        try:
            msg = proto._response_queue.get_nowait()
        except Exception:
            break

    # ── Step 2: Poll requested DIDs one at a time ──
    if dids:
        for did_info in dids:
            did = did_info.get("did", 0)
            mode = did_info.get("mode", 0x22)

            if mode == 0x01:
                pid_byte = did & 0xFF
                req_frame = can.Message(
                    arbitration_id=0x7DF,
                    data=[0x02, 0x01, pid_byte, 0x00, 0x00, 0x00, 0x00, 0x00],
                    is_extended_id=False
                )
            else:
                did_hi = (did >> 8) & 0xFF
                did_lo = did & 0xFF
                req_frame = can.Message(
                    arbitration_id=tx_id,
                    data=[0x03, 0x22, did_hi, did_lo, 0x00, 0x00, 0x00, 0x00],
                    is_extended_id=is_extended
                )

            try:
                bridge.bus.send(req_frame)
            except can.CanError:
                results[did] = {"ok": False, "error": "send failed"}
                continue

            deadline = time.time() + 0.100
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
                if pci_type == 0:
                    length = frame_data[0] & 0x0F
                    payload = frame_data[1:1+length]

                    if mode == 0x01 and payload and payload[0] == 0x41:
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

            await asyncio.sleep(0.005)

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

    stop_payload = bytes([0xAA, 0x00])  # GMW3110 Table 190: sub-function $00 = stopSending
    await _send_isotp_and_wait(bridge, tx_id, rx_id, stop_payload, timeout=0.5)

    bridge.protocol._filter_ids.discard(DDDI_PERIODIC_ARB_ID)
    if hasattr(bridge.protocol, '_ppei_listener'):
        bridge.protocol._ppei_listener._filter_ids.discard(DDDI_PERIODIC_ARB_ID)

    log.info("[PPEI] DDDI teardown complete — periodic streaming stopped")
    return {"type": "dddi_teardown_result", "id": req_id, "ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# Patch 7: Universal message router with manufacturer-aware dispatch
# ═══════════════════════════════════════════════════════════════════════════════

_batch_handle_message = _ppei_handle_message  # Save the batch handler


async def _ppei_handle_message_v2(self, msg: dict):
    """Universal message router — manufacturer-aware dispatch with full backward compatibility.

    Message routing chain:
      1. set_filter_mode     → Runtime filter mode switching
      2. set_manufacturer    → Runtime manufacturer switching
      3. dddi_setup          → Dispatches to SESSION_SETUP[manufacturer]
      4. dddi_teardown       → Universal teardown
      5. streaming_poll      → Universal streaming poll
      6. dddi_keepalive      → Universal keepalive
      7. batch_read_mode01   → Universal Mode 01 batch
      8. batch_read_dids     → Universal Mode 22 batch (via _batch_handle_message)
      9. Fallthrough         → Tobi's original handler
    """
    msg_type = msg.get("type")
    manufacturer = msg.get("manufacturer", getattr(self, '_ppei_manufacturer', MANUFACTURER_GM))
    filter_mode = getattr(self, '_ppei_filter_mode', FILTER_MODE_OBD)

    # ── set_filter_mode: runtime filter switching ──
    if msg_type == "set_filter_mode":
        req_id = msg.get("id", "0")
        mode = msg.get("mode", FILTER_MODE_OBD)
        result = set_filter_mode(self, mode)
        result["type"] = "set_filter_mode_result"
        result["id"] = req_id
        log.info(f"[PPEI] Universal Bridge — filter mode changed to: {mode}")
        return result

    # ── set_manufacturer: runtime manufacturer switching ──
    if msg_type == "set_manufacturer":
        req_id = msg.get("id", "0")
        mfr = msg.get("manufacturer", MANUFACTURER_GM)
        if mfr not in VALID_MANUFACTURERS:
            return {"type": "set_manufacturer_result", "id": req_id, "ok": False,
                    "error": f"Invalid manufacturer: {mfr}. Valid: {VALID_MANUFACTURERS}"}
        old_mfr = getattr(self, '_ppei_manufacturer', MANUFACTURER_GM)
        self._ppei_manufacturer = mfr
        # Auto-set filter mode based on manufacturer defaults
        if mfr in MANUFACTURER_DEFAULTS:
            default_filter = MANUFACTURER_DEFAULTS[mfr].get("filter_mode", FILTER_MODE_OBD)
            set_filter_mode(self, default_filter)
        log.info(f"[PPEI] Universal Bridge — manufacturer: {old_mfr} → {mfr}")
        return {
            "type": "set_manufacturer_result",
            "id": req_id,
            "ok": True,
            "manufacturer": mfr,
            "previous": old_mfr,
            "defaults": MANUFACTURER_DEFAULTS.get(mfr, {}),
        }

    # ── dddi_setup: manufacturer-dispatched session setup ──
    if msg_type == "dddi_setup":
        req_id = msg.get("id", "0")
        tx_id = msg.get("tx_id", MANUFACTURER_DEFAULTS.get(manufacturer, {}).get("tx_id", 0x7E0))
        rx_id_param = msg.get("rx_id", None)
        rx_id = get_rx_id(tx_id, manufacturer, rx_id_param)
        log.info(
            f"[PPEI] Universal Bridge — mode: {manufacturer} | filter: {filter_mode} | "
            f"session: dddi_setup | TX=0x{tx_id:03X} RX=0x{rx_id:03X}"
        )
        setup_fn = SESSION_SETUP.get(manufacturer, _gm_session_setup)
        return await setup_fn(self, tx_id, rx_id, req_id)

    # ── dddi_teardown ──
    if msg_type == "dddi_teardown":
        req_id = msg.get("id", "0")
        tx_id = msg.get("tx_id", 0x7E0)
        rx_id_param = msg.get("rx_id", None)
        rx_id = get_rx_id(tx_id, manufacturer, rx_id_param)
        return await _ppei_dddi_teardown(self, tx_id, rx_id, req_id)

    # ── streaming_poll ──
    if msg_type == "streaming_poll":
        req_id = msg.get("id", "0")
        tx_id = msg.get("tx_id", 0x7E0)
        rx_id_param = msg.get("rx_id", None)
        rx_id = get_rx_id(tx_id, manufacturer, rx_id_param)
        dids = msg.get("dids", [])
        return await _ppei_streaming_poll(self, tx_id, rx_id, req_id, dids)

    # ── dddi_keepalive ──
    if msg_type == "dddi_keepalive":
        req_id = msg.get("id", "0")
        tx_id = msg.get("tx_id", 0x7E0)
        is_extended = tx_id > 0x7FF
        if not self.bus:
            return {"type": "dddi_keepalive_result", "id": req_id, "ok": False, "error": "no bus"}
        try:
            tp_frame = can.Message(
                arbitration_id=tx_id,
                data=[0x01, 0x3E, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
                is_extended_id=is_extended
            )
            self.bus.send(tp_frame)
            await asyncio.sleep(0.005)
            restart_ids = getattr(self, '_ppei_dddi_periodic_ids', [0xFE, 0xFD])
            restart_payload = bytes([0xAA, 0x04] + restart_ids)
            restart_frame = can.Message(
                arbitration_id=tx_id,
                data=list(restart_payload) + [0x00] * (8 - len(restart_payload)),
                is_extended_id=is_extended
            )
            self.bus.send(restart_frame)
            log.debug(f"[PPEI] dddi_keepalive: TesterPresent + periodic restart sent")
            return {"type": "dddi_keepalive_result", "id": req_id, "ok": True}
        except can.CanError as e:
            log.warning(f"[PPEI] dddi_keepalive failed: {e}")
            return {"type": "dddi_keepalive_result", "id": req_id, "ok": False, "error": str(e)}

    # ── batch_read_mode01 ──
    if msg_type == "batch_read_mode01":
        return await _ppei_batch_read_mode01(self, msg)

    # ── Fallthrough to batch_read_dids or Tobi's handler ──
    return await _batch_handle_message(self, msg)


_tobi.PCANBridge.handle_message = _ppei_handle_message_v2
log.info("[PPEI] Patch 7 applied: Universal message router with manufacturer dispatch")


# ═══════════════════════════════════════════════════════════════════════════════
# Entry point — run Tobi's main() with all patches applied
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    import argparse

    # Parse our universal flags before passing to Tobi's main
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--filter-mode', choices=list(VALID_FILTER_MODES),
                        default=FILTER_MODE_OBD,
                        help='Hardware CAN filter mode (default: obd)')
    parser.add_argument('--manufacturer', choices=list(VALID_MANUFACTURERS),
                        default=MANUFACTURER_GM,
                        help='Manufacturer profile (default: gm)')
    known_args, remaining_args = parser.parse_known_args()

    # Store our args so the bridge instance can read them during init
    _ppei_cli_filter_mode = known_args.filter_mode
    _ppei_cli_manufacturer = known_args.manufacturer

    # Monkey-patch PCANBridge.__init__ to inject our settings
    _original_bridge_init = _tobi.PCANBridge.__init__

    def _ppei_bridge_init(self, *args, **kwargs):
        _original_bridge_init(self, *args, **kwargs)
        self._ppei_filter_mode = _ppei_cli_filter_mode
        self._ppei_manufacturer = _ppei_cli_manufacturer
        log.info(f"[PPEI] Bridge initialized: filter_mode={self._ppei_filter_mode}, manufacturer={self._ppei_manufacturer}")

    _tobi.PCANBridge.__init__ = _ppei_bridge_init

    # Restore sys.argv for Tobi's argparse
    sys.argv = [sys.argv[0]] + remaining_args

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(name)s] %(levelname)s: %(message)s'
    )
    log.info("=" * 70)
    log.info("PPEI PCAN Bridge — Universal CAN Bus Layer")
    log.info("=" * 70)
    log.info(f"  Filter mode:  {_ppei_cli_filter_mode}")
    log.info(f"  Manufacturer: {_ppei_cli_manufacturer}")
    log.info("=" * 70)
    log.info("Patches applied:")
    log.info("  1. OBDProtocol uses Notifier (no bus.recv polling)")
    log.info("  2. Configurable hardware CAN filters (obd/universal/j1939)")
    log.info("  3. IntelliSpy uses shared Notifier with OBD")
    log.info("  4. send_raw_frame skips queue drain")
    log.info("  5. batch_read_dids for fast multi-DID polling")
    log.info("  5b. batch_read_mode01 for multi-PID Mode 01 requests")
    log.info("  6. Manufacturer session dispatch (GM DDDI / Ford / GM Global B)")
    log.info("  7. Universal message router with set_filter_mode + set_manufacturer")
    log.info("=" * 70)
    log.info("GM-specific code lives in _gm_* functions only.")
    log.info("Tobi's pcan_bridge.py is NOT modified.")
    log.info("To revert: run pcan_bridge.py directly instead.")
    log.info("=" * 70)

    # Run Tobi's main with our patches active
    _tobi.main()
