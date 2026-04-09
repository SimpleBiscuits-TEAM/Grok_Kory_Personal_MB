#!/usr/bin/env python3
"""
PCAN-USB WebSocket Bridge for PPEI Performance Analyzer
========================================================

Multi-protocol CAN bridge supporting:
  - OBD-II over CAN (ISO 15765-4) — standard 11-bit, 500kbps
  - J1939 (SAE J1939) — 29-bit extended IDs, 250kbps, PGN-based
  - UDS (ISO 14229) — Unified Diagnostic Services over ISO-TP
  - CAN FD — Flexible Data Rate, up to 64-byte payloads
  - Raw CAN — direct frame send/receive
  - Bus Monitor — IntelliSpy real-time frame capture

Requirements:
    pip install python-can websockets

Optional (for TLS/wss support):
    pip install cryptography

Usage:
    python pcan_bridge.py                          # Auto-detect PCAN-USB
    python pcan_bridge.py --channel PCAN_USBBUS1   # Specific channel
    python pcan_bridge.py --bitrate 500000          # Custom bitrate
    python pcan_bridge.py --interface socketcan --channel can0  # Linux socketcan
    python pcan_bridge.py --no-tls                  # Disable TLS (ws:// only)

The bridge starts the WebSocket server(s) IMMEDIATELY, then connects to
the CAN bus when the browser sends its first request. This means you can
verify the browser-to-bridge connection works even without a vehicle.

A self-signed TLS certificate is auto-generated on first run.
You must accept it in your browser once: visit https://localhost:8766
and click "Advanced" -> "Proceed" to trust it.

Protocol:
    Browser -> Bridge:
        # OBD-II
        {"type": "obd_request", "id": <req_id>, "mode": 1, "pid": 12}
        {"type": "obd_request", "id": <req_id>, "mode": 9, "pid": 2}   # VIN
        {"type": "obd_request", "id": <req_id>, "mode": 34, "pid": 4912}  # GM Mode 22

        # Protocol switching
        {"type": "set_protocol", "id": <req_id>, "protocol": "obd2|j1939|uds|canfd", "bitrate": 500000}

        # J1939
        {"type": "j1939_request", "id": <req_id>, "pgn": 65262, "dest": 0, "priority": 6}

        # UDS (ISO 14229)
        {"type": "uds_request", "id": <req_id>, "service": 34, "sub": null, "data": [19, 48], "target": 1760}

        # Raw CAN
        {"type": "can_send", "id": <req_id>, "arb_id": 2016, "data": [3, 34, 19, 48, 0, 0, 0, 0], "extended": false}

        # Filters & Monitor
        {"type": "set_filter", "arb_ids": [2024]}
        {"type": "clear_filter"}
        {"type": "start_monitor"}                    # IntelliSpy: sniff ALL frames
        {"type": "start_monitor", "arb_ids": [0x7E8]} # IntelliSpy: sniff filtered
        {"type": "stop_monitor"}

        {"type": "ping"}

    Bridge -> Browser:
        {"type": "obd_response", "id": <req_id>, "mode": 1, "pid": 12, "data": [18, 52]}
        {"type": "j1939_response", "id": <req_id>, "pgn": 65262, "source": 0, "data": [...]}
        {"type": "uds_response", "id": <req_id>, "service": 98, "data": [...]}
        {"type": "can_frame", "arb_id": 2024, "data": [...], "timestamp": 1234567.89}
        {"type": "bus_frame", "arb_id": 1824, "data": [...], "dlc": 8, "timestamp": ..., "frame_number": 42}
        {"type": "protocol_changed", "id": <req_id>, "protocol": "j1939", "bitrate": 250000}
        {"type": "monitor_started", "id": <req_id>, "filter": "all" | [0x7E8]}
        {"type": "monitor_stopped", "id": <req_id>}
        {"type": "error", "id": <req_id>, "message": "..."}
        {"type": "pong", "adapter": "pcan", "channel": "PCAN_USBBUS1", "status": "ready|bus_active|bus_error", "protocol": "obd2"}
        {"type": "connected", "adapter": "pcan", "channel": "PCAN_USBBUS1", "bitrate": 500000, "protocols": [...]}
"""

import argparse
import asyncio
import json
import logging
import os
import ssl
import struct
import subprocess
import sys
import time
from pathlib import Path
from typing import List, Optional

# ─── Immediate startup banner ────────────────────────────────────────────────
print(flush=True)
print("=" * 60, flush=True)
print("  PPEI PCAN-USB Bridge v2.1", flush=True)
print("  Multi-Protocol (OBD-II / J1939 / UDS / CAN FD)", flush=True)
print("  Starting up...", flush=True)
print("=" * 60, flush=True)
print(flush=True)

try:
    import can
    print(f"  [OK] python-can {can.__version__}", flush=True)
except ImportError:
    print("  [ERROR] python-can is required. Install with:", flush=True)
    print("    pip install python-can", flush=True)
    sys.exit(1)

try:
    import websockets
    from websockets.asyncio.server import serve
    print(f"  [OK] websockets {websockets.__version__}", flush=True)
except ImportError:
    print("  [ERROR] websockets is required. Install with:", flush=True)
    print("    pip install websockets", flush=True)
    sys.exit(1)

has_cryptography = False
try:
    import cryptography
    has_cryptography = True
    print(f"  [OK] cryptography {cryptography.__version__}", flush=True)
except ImportError:
    print("  [--] cryptography not installed (TLS may use openssl instead)", flush=True)

print(flush=True)

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(message)s',
    datefmt='%H:%M:%S'
)
log = logging.getLogger('pcan_bridge')

# ─── Protocol Constants ──────────────────────────────────────────────────────

# OBD-II CAN IDs (11-bit, 500kbps)
OBD_REQUEST_ID = 0x7DF       # Broadcast OBD-II request
ECM_REQUEST_ID = 0x7E0       # Direct ECM request (for GM Mode 22)
ECM_RESPONSE_ID = 0x7E8      # ECM response
TCM_RESPONSE_ID = 0x7E9      # TCM response (transmission)
RESPONSE_IDS = {0x7E8, 0x7E9, 0x7EA, 0x7EB, 0x7EC, 0x7ED, 0x7EE, 0x7EF}

# ISO-TP frame types
ISOTP_SINGLE = 0x00
ISOTP_FIRST = 0x10
ISOTP_CONSECUTIVE = 0x20
ISOTP_FLOW_CONTROL = 0x30

# J1939 Constants (29-bit extended IDs, 250kbps)
J1939_PRIORITY_DEFAULT = 6
J1939_REQUEST_PGN = 0xEA00   # Request PGN (59904)
J1939_TP_CM = 0xEC00         # Transport Protocol - Connection Management
J1939_TP_DT = 0xEB00         # Transport Protocol - Data Transfer
J1939_BAM = 32               # Broadcast Announce Message control byte
J1939_RTS = 16               # Request to Send control byte
J1939_CTS = 17               # Clear to Send control byte
J1939_EOMA = 19              # End of Message Acknowledge control byte
J1939_GLOBAL_ADDR = 0xFF     # Global address

# UDS Service IDs (ISO 14229)
UDS_DIAG_SESSION = 0x10
UDS_ECU_RESET = 0x11
UDS_SECURITY_ACCESS = 0x27
UDS_READ_DID = 0x22
UDS_WRITE_DID = 0x2E
UDS_ROUTINE_CONTROL = 0x31
UDS_REQUEST_DOWNLOAD = 0x34
UDS_REQUEST_UPLOAD = 0x35
UDS_TRANSFER_DATA = 0x36
UDS_TRANSFER_EXIT = 0x37
UDS_TESTER_PRESENT = 0x3E
UDS_POSITIVE_RESPONSE_OFFSET = 0x40
UDS_NEGATIVE_RESPONSE = 0x7F

# Protocol bitrate defaults
PROTOCOL_BITRATES = {
    'obd2': 500000,
    'j1939': 250000,
    'uds': 500000,
    'canfd': 500000,
    'raw': 500000,
}

# Supported protocols list
SUPPORTED_PROTOCOLS = ['obd2', 'j1939', 'uds', 'canfd', 'raw']

# Timeouts
OBD_RESPONSE_TIMEOUT = 2.0   # seconds (GM Mode 22 / single-shot requests)
# ISO 15765: try ECM physical (0x7E0) then functional (0x7DF). EU gateways often ignore 7DF.
OBD_STANDARD_TRY_TIMEOUT = 1.35  # seconds per attempt (two attempts ≈ 2.7s)
ISOTP_FRAME_TIMEOUT = 1.0    # seconds
J1939_RESPONSE_TIMEOUT = 3.0 # seconds (J1939 can be slower)
UDS_RESPONSE_TIMEOUT = 5.0   # seconds (UDS services can take longer)
J1939_TP_TIMEOUT = 5.0       # seconds (transport protocol reassembly)

# TLS certificate paths (stored alongside this script)
CERT_DIR = Path(__file__).parent / '.certs'
CERT_FILE = CERT_DIR / 'bridge.crt'
KEY_FILE = CERT_DIR / 'bridge.key'


def generate_self_signed_cert():
    """Generate a self-signed TLS certificate for localhost."""
    CERT_DIR.mkdir(parents=True, exist_ok=True)

    if CERT_FILE.exists() and KEY_FILE.exists():
        log.info("Using existing TLS certificate")
        return True

    log.info("Generating self-signed TLS certificate for localhost...")

    try:
        # Try using openssl command
        subprocess.run([
            'openssl', 'req', '-x509', '-newkey', 'rsa:2048',
            '-keyout', str(KEY_FILE), '-out', str(CERT_FILE),
            '-days', '365', '-nodes',
            '-subj', '/CN=localhost',
            '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'
        ], check=True, capture_output=True)
        log.info(f"TLS certificate generated: {CERT_FILE}")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        try:
            from cryptography import x509
            from cryptography.x509.oid import NameOID
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import rsa
            import datetime
            import ipaddress

            key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            subject = issuer = x509.Name([
                x509.NameAttribute(NameOID.COMMON_NAME, 'localhost'),
            ])
            cert = (
                x509.CertificateBuilder()
                .subject_name(subject)
                .issuer_name(issuer)
                .public_key(key.public_key())
                .serial_number(x509.random_serial_number())
                .not_valid_before(datetime.datetime.utcnow())
                .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=365))
                .add_extension(
                    x509.SubjectAlternativeName([
                        x509.DNSName('localhost'),
                        x509.IPAddress(ipaddress.IPv4Address('127.0.0.1')),
                    ]),
                    critical=False,
                )
                .sign(key, hashes.SHA256())
            )

            with open(KEY_FILE, 'wb') as f:
                f.write(key.private_bytes(
                    serialization.Encoding.PEM,
                    serialization.PrivateFormat.TraditionalOpenSSL,
                    serialization.NoEncryption()
                ))
            with open(CERT_FILE, 'wb') as f:
                f.write(cert.public_bytes(serialization.Encoding.PEM))

            log.info(f"TLS certificate generated (Python): {CERT_FILE}")
            return True
        except ImportError:
            log.warning("Cannot generate TLS certificate (install 'cryptography' package or 'openssl')")
            log.warning("  pip install cryptography")
            return False


# ═══════════════════════════════════════════════════════════════════════════
# OBD-II Protocol (ISO 15765-4)
# ═══════════════════════════════════════════════════════════════════════════

class OBDProtocol:
    """Handles OBD-II over CAN (ISO 15765-4) with ISO-TP for multi-frame."""

    def __init__(self, bus: can.Bus):
        self.bus = bus
        self._response_queue: asyncio.Queue = asyncio.Queue()
        self._listener_task: Optional[asyncio.Task] = None
        self._running = False
        self._filter_ids: set = RESPONSE_IDS.copy()

    async def start(self):
        """Start the CAN listener."""
        self._running = True
        self._listener_task = asyncio.create_task(self._listen())
        log.info("OBD protocol listener started")

    async def stop(self):
        """Stop the CAN listener."""
        self._running = False
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
        log.info("OBD protocol listener stopped")

    async def _listen(self):
        """Background task to read CAN frames from the bus."""
        loop = asyncio.get_event_loop()
        while self._running:
            try:
                msg = await loop.run_in_executor(
                    None, lambda: self.bus.recv(timeout=0.1)
                )
                if msg and msg.arbitration_id in self._filter_ids:
                    await self._response_queue.put(msg)
            except can.CanError as e:
                log.warning(f"CAN read error: {e}")
                await asyncio.sleep(0.01)
            except Exception as e:
                if self._running:
                    log.error(f"Listener error: {e}")
                    await asyncio.sleep(0.1)

    def _drain_queue(self):
        """Clear any stale responses from the queue."""
        while not self._response_queue.empty():
            try:
                self._response_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

    def _extract_obd_positive_payload(self, mode: int, pid: int, payload: List[int]) -> Optional[List[int]]:
        """Return application data for a positive OBD response, or None if this frame is not our answer."""
        if not payload:
            return None
        if payload[0] != (mode + 0x40):
            return None
        if mode == 0x22:  # GM Mode 22 — 62 DID_hi DID_lo data...
            if len(payload) < 3:
                return None
            if payload[1] != ((pid >> 8) & 0xFF) or payload[2] != (pid & 0xFF):
                return None
            return payload[3:]
        if mode in (0x01, 0x02):
            if len(payload) < 2 or payload[1] != pid:
                return None
            return payload[2:]
        if mode == 0x09:
            if len(payload) < 2 or payload[1] != pid:
                return None
            rest = payload[2:] if len(payload) > 2 else []
            # J1979 PID 02 (VIN): [message_count][17 ASCII] — count is usually 0x01
            if pid == 0x02 and len(rest) >= 18 and rest[0] < 0x20:
                rest = rest[1:]
            return rest
        # Mode 03/07: 43/47 then DTC bytes (no PID field). Mode 04: 44 + optional data.
        if mode in (0x03, 0x04, 0x07):
            return payload[1:] if len(payload) > 1 else []
        return payload[1:] if len(payload) > 1 else []

    async def send_obd_request(self, mode: int, pid: int, req_id: str) -> dict:
        """Send an OBD-II request and wait for the response."""
        # Build the CAN payload once
        if mode == 0x22:  # GM Mode 22 (extended PID)
            pid_hi = (pid >> 8) & 0xFF
            pid_lo = pid & 0xFF
            data = [0x03, mode, pid_hi, pid_lo, 0x00, 0x00, 0x00, 0x00]
        elif mode == 0x09 and pid == 0x02:
            data = [0x02, mode, pid, 0x00, 0x00, 0x00, 0x00, 0x00]
        else:
            data = [0x02, mode, pid, 0x00, 0x00, 0x00, 0x00, 0x00]

        # GM Mode 22: physical ECM only, single long timeout
        if mode == 0x22:
            self._drain_queue()
            msg = can.Message(
                arbitration_id=ECM_REQUEST_ID,
                data=data,
                is_extended_id=False
            )
            try:
                self.bus.send(msg)
            except can.CanError as e:
                return {"type": "error", "id": req_id, "message": f"CAN send error: {e}"}
            try:
                response = await asyncio.wait_for(
                    self._wait_for_response(mode, pid),
                    timeout=OBD_RESPONSE_TIMEOUT
                )
                return {"type": "obd_response", "id": req_id, "mode": mode, "pid": pid, "data": response}
            except asyncio.TimeoutError:
                return {
                    "type": "error",
                    "id": req_id,
                    "message": f"Timeout waiting for response (Mode {mode:02X} PID {pid:04X})"
                }

        # Standard OBD: physical 0x7E0 first, then functional 0x7DF (EU / BMW gateways)
        arb_sequence = [ECM_REQUEST_ID, OBD_REQUEST_ID]
        last_err: Optional[str] = None
        for arb_id in arb_sequence:
            self._drain_queue()
            msg = can.Message(arbitration_id=arb_id, data=data, is_extended_id=False)
            try:
                self.bus.send(msg)
            except can.CanError as e:
                return {"type": "error", "id": req_id, "message": f"CAN send error: {e}"}
            try:
                response = await asyncio.wait_for(
                    self._wait_for_response(mode, pid),
                    timeout=OBD_STANDARD_TRY_TIMEOUT
                )
                return {
                    "type": "obd_response",
                    "id": req_id,
                    "mode": mode,
                    "pid": pid,
                    "data": response
                }
            except asyncio.TimeoutError:
                last_err = f"Timeout waiting for response (Mode {mode:02X} PID {pid:04X})"
                continue

        return {"type": "error", "id": req_id, "message": last_err or "No OBD response"}

    async def _wait_for_response(self, mode: int, pid: int) -> list:
        """Wait for and parse an OBD-II response, handling ISO-TP multi-frame."""
        while True:
            msg = await self._response_queue.get()
            if msg.arbitration_id not in RESPONSE_IDS:
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
                if payload and payload[0] == 0x7F:
                    return payload
                extracted = self._extract_obd_positive_payload(mode, pid, payload)
                if extracted is not None:
                    return extracted
                continue

            elif pci_type == 1:  # First frame (multi-frame)
                total_length = ((frame_data[0] & 0x0F) << 8) | frame_data[1]
                payload = frame_data[2:]

                # Send flow control
                fc_msg = can.Message(
                    arbitration_id=ECM_REQUEST_ID,
                    data=[ISOTP_FLOW_CONTROL, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
                    is_extended_id=False
                )
                self.bus.send(fc_msg)

                # Collect consecutive frames
                expected_seq = 1
                while len(payload) < total_length:
                    try:
                        cf_msg = await asyncio.wait_for(
                            self._response_queue.get(),
                            timeout=ISOTP_FRAME_TIMEOUT
                        )
                        cf_data = list(cf_msg.data)
                        cf_pci = (cf_data[0] >> 4) & 0x0F
                        cf_seq = cf_data[0] & 0x0F

                        if cf_pci == 2 and cf_seq == (expected_seq & 0x0F):
                            payload.extend(cf_data[1:])
                            expected_seq += 1
                    except asyncio.TimeoutError:
                        break

                payload = payload[:total_length]
                if not payload:
                    continue
                if payload[0] == 0x7F:
                    return payload
                extracted = self._extract_obd_positive_payload(mode, pid, payload)
                if extracted is not None:
                    return extracted
                continue

    async def send_raw_frame(self, arb_id: int, data: list, req_id: str, extended: bool = False) -> dict:
        """Send a raw CAN frame and return the next response."""
        self._drain_queue()
        msg = can.Message(
            arbitration_id=arb_id,
            data=data,
            is_extended_id=extended
        )
        try:
            self.bus.send(msg)
            try:
                response = await asyncio.wait_for(
                    self._response_queue.get(),
                    timeout=OBD_RESPONSE_TIMEOUT
                )
                return {
                    "type": "can_frame",
                    "id": req_id,
                    "arb_id": response.arbitration_id,
                    "data": list(response.data),
                    "timestamp": response.timestamp
                }
            except asyncio.TimeoutError:
                return {
                    "type": "error",
                    "id": req_id,
                    "message": "Timeout waiting for CAN response"
                }
        except can.CanError as e:
            return {
                "type": "error",
                "id": req_id,
                "message": f"CAN send error: {e}",
                "arb_id": arb_id
            }


# ═══════════════════════════════════════════════════════════════════════════
# J1939 Protocol (SAE J1939)
# ═══════════════════════════════════════════════════════════════════════════

class J1939Protocol:
    """Handles J1939 over CAN with 29-bit extended IDs.
    
    J1939 uses Parameter Group Numbers (PGNs) instead of PIDs.
    Arbitration IDs encode priority, PGN, source address, and destination.
    
    29-bit ID format:
      [28:26] Priority (3 bits, 0-7, lower = higher priority)
      [25:24] Reserved / Data Page (2 bits)
      [23:16] PDU Format (PF) — if >= 240, PDU2 (broadcast); else PDU1 (peer-to-peer)
      [15:8]  PDU Specific (PS) — destination address (PDU1) or group extension (PDU2)
      [7:0]   Source Address (SA)
    
    Common PGNs:
      65262 (0xFEEE) — Engine Temperature 1
      65263 (0xFEEF) — Engine Fluid Level/Pressure 1
      65265 (0xFEF1) — Cruise Control / Vehicle Speed 1
      65266 (0xFEF2) — Fuel Economy
      65270 (0xFEF6) — Inlet/Exhaust Conditions 1
      65271 (0xFEF7) — Vehicle Electrical Power 1
      65272 (0xFEF8) — Transmission Fluids 1
      61444 (0xF004) — Electronic Engine Controller 1 (RPM, torque)
      61443 (0xF003) — Electronic Engine Controller 2 (accel pedal, load)
      65247 (0xFEDF) — Electronic Engine Controller 3
      65269 (0xFEF5) — Ambient Conditions
      65257 (0xFEE9) — Fuel Consumption
      65226 (0xFED2) — Active Diagnostic Trouble Codes (DM1)
      65227 (0xFED3) — Previously Active DTCs (DM2)
      65228 (0xFED4) — Diagnostic Data Clear (DM3)
      65229 (0xFED5) — Freeze Frame (DM4)
      65230 (0xFED6) — Diagnostic Readiness (DM5)
      65235 (0xFEDB) — DM12 Emissions-Related Active DTCs
    """

    def __init__(self, bus: can.Bus):
        self.bus = bus
        self._response_queue: asyncio.Queue = asyncio.Queue()
        self._tp_queue: asyncio.Queue = asyncio.Queue()  # Transport protocol frames
        self._listener_task: Optional[asyncio.Task] = None
        self._running = False
        self.source_address = 0xFE  # Default source address (service tool)

    async def start(self):
        self._running = True
        self._listener_task = asyncio.create_task(self._listen())
        log.info("J1939 protocol listener started")

    async def stop(self):
        self._running = False
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
        log.info("J1939 protocol listener stopped")

    async def _listen(self):
        """Background task to read all CAN frames (29-bit extended IDs)."""
        loop = asyncio.get_event_loop()
        while self._running:
            try:
                msg = await loop.run_in_executor(
                    None, lambda: self.bus.recv(timeout=0.1)
                )
                if msg and msg.is_extended_id:
                    # Extract PGN from the 29-bit arbitration ID
                    pgn = self._extract_pgn(msg.arbitration_id)
                    # Route transport protocol frames separately
                    if pgn == (J1939_TP_CM & 0xFFFF) or pgn == (J1939_TP_DT & 0xFFFF):
                        await self._tp_queue.put(msg)
                    else:
                        await self._response_queue.put(msg)
            except can.CanError as e:
                log.warning(f"J1939 read error: {e}")
                await asyncio.sleep(0.01)
            except Exception as e:
                if self._running:
                    log.error(f"J1939 listener error: {e}")
                    await asyncio.sleep(0.1)

    @staticmethod
    def _extract_pgn(arb_id: int) -> int:
        """Extract PGN from a 29-bit J1939 arbitration ID."""
        pf = (arb_id >> 16) & 0xFF
        ps = (arb_id >> 8) & 0xFF
        dp = (arb_id >> 24) & 0x01
        if pf >= 240:
            # PDU2 format: PGN = DP + PF + PS (broadcast)
            return (dp << 16) | (pf << 8) | ps
        else:
            # PDU1 format: PGN = DP + PF + 0x00 (peer-to-peer, PS is destination)
            return (dp << 16) | (pf << 8)

    @staticmethod
    def _extract_source(arb_id: int) -> int:
        """Extract source address from a 29-bit J1939 arbitration ID."""
        return arb_id & 0xFF

    def _build_arb_id(self, priority: int, pgn: int, dest: int, source: int = None) -> int:
        """Build a 29-bit J1939 arbitration ID."""
        sa = source if source is not None else self.source_address
        dp = (pgn >> 16) & 0x01
        pf = (pgn >> 8) & 0xFF
        ps = pgn & 0xFF

        if pf < 240:
            # PDU1: PS field is destination address
            ps = dest & 0xFF

        return ((priority & 0x07) << 26) | (dp << 24) | (pf << 16) | (ps << 8) | (sa & 0xFF)

    def _drain_queue(self):
        while not self._response_queue.empty():
            try:
                self._response_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

    async def request_pgn(self, pgn: int, dest: int, priority: int, req_id: str) -> dict:
        """Send a J1939 PGN request and wait for the response.
        
        Uses PGN 59904 (0xEA00) — the Request PGN — to ask a specific
        ECU (or broadcast to 0xFF) for a particular PGN.
        """
        self._drain_queue()

        # Build the request: PGN 59904 with the requested PGN as 3-byte payload
        pgn_bytes = [pgn & 0xFF, (pgn >> 8) & 0xFF, (pgn >> 16) & 0xFF]
        request_arb_id = self._build_arb_id(priority, J1939_REQUEST_PGN, dest)

        msg = can.Message(
            arbitration_id=request_arb_id,
            data=pgn_bytes,
            is_extended_id=True
        )

        try:
            self.bus.send(msg)
        except can.CanError as e:
            return {
                "type": "error",
                "id": req_id,
                "message": f"J1939 send error: {e}"
            }

        # Wait for response — could be single frame or multi-frame (BAM/TP)
        try:
            response = await asyncio.wait_for(
                self._wait_for_pgn_response(pgn),
                timeout=J1939_RESPONSE_TIMEOUT
            )
            return {
                "type": "j1939_response",
                "id": req_id,
                "pgn": pgn,
                "source": response.get("source", 0),
                "data": response.get("data", []),
                "priority": response.get("priority", 6)
            }
        except asyncio.TimeoutError:
            return {
                "type": "error",
                "id": req_id,
                "message": f"Timeout waiting for J1939 PGN {pgn} (0x{pgn:04X})"
            }

    async def _wait_for_pgn_response(self, requested_pgn: int) -> dict:
        """Wait for a J1939 response matching the requested PGN.
        
        Handles both single-frame responses (<=8 bytes) and multi-frame
        responses via J1939 Transport Protocol (BAM or RTS/CTS).
        """
        while True:
            msg = await self._response_queue.get()
            pgn = self._extract_pgn(msg.arbitration_id)
            source = self._extract_source(msg.arbitration_id)
            priority = (msg.arbitration_id >> 26) & 0x07

            if pgn == requested_pgn:
                return {
                    "source": source,
                    "data": list(msg.data),
                    "priority": priority
                }

    async def receive_tp_message(self, req_id: str) -> dict:
        """Receive a J1939 Transport Protocol multi-frame message (BAM).
        
        BAM (Broadcast Announce Message) is used for messages > 8 bytes.
        The sender broadcasts a TP.CM_BAM frame followed by TP.DT frames.
        """
        try:
            # Wait for TP.CM (Connection Management) frame
            cm_msg = await asyncio.wait_for(
                self._tp_queue.get(),
                timeout=J1939_TP_TIMEOUT
            )
            cm_data = list(cm_msg.data)
            control_byte = cm_data[0]

            if control_byte == J1939_BAM:
                # BAM: total_size (2 bytes), num_packets, 0xFF, PGN (3 bytes)
                total_size = cm_data[1] | (cm_data[2] << 8)
                num_packets = cm_data[3]
                pgn = cm_data[5] | (cm_data[6] << 8) | (cm_data[7] << 16)

                # Collect data transfer frames
                payload = bytearray()
                for i in range(num_packets):
                    try:
                        dt_msg = await asyncio.wait_for(
                            self._tp_queue.get(),
                            timeout=ISOTP_FRAME_TIMEOUT
                        )
                        dt_data = list(dt_msg.data)
                        # First byte is sequence number, rest is data
                        payload.extend(dt_data[1:])
                    except asyncio.TimeoutError:
                        break

                return {
                    "type": "j1939_tp_response",
                    "id": req_id,
                    "pgn": pgn,
                    "source": self._extract_source(cm_msg.arbitration_id),
                    "data": list(payload[:total_size])
                }

            return {
                "type": "error",
                "id": req_id,
                "message": f"Unexpected TP.CM control byte: 0x{control_byte:02X}"
            }

        except asyncio.TimeoutError:
            return {
                "type": "error",
                "id": req_id,
                "message": "Timeout waiting for J1939 transport protocol message"
            }


# ═══════════════════════════════════════════════════════════════════════════
# UDS Protocol (ISO 14229)
# ═══════════════════════════════════════════════════════════════════════════

class UDSProtocol:
    """Handles UDS (Unified Diagnostic Services) over ISO-TP.
    
    UDS uses ISO-TP (ISO 15765-2) for transport, same as OBD-II but with
    a richer set of diagnostic services. The key difference is that UDS
    services can target specific ECUs with configurable request/response IDs.
    
    Common UDS Services:
      0x10 — DiagnosticSessionControl (default, programming, extended)
      0x11 — ECUReset (hard, key-off-on, soft)
      0x22 — ReadDataByIdentifier (read DID values)
      0x27 — SecurityAccess (seed/key authentication)
      0x2E — WriteDataByIdentifier (write DID values — used in flashing)
      0x31 — RoutineControl (start/stop/request results)
      0x34 — RequestDownload (initiate flash download)
      0x35 — RequestUpload (initiate flash upload/read)
      0x36 — TransferData (send/receive flash data blocks)
      0x37 — RequestTransferExit (finalize flash transfer)
      0x3E — TesterPresent (keep session alive)
    """

    def __init__(self, bus: can.Bus, request_id: int = 0x7E0, response_id: int = 0x7E8):
        self.bus = bus
        self.request_id = request_id
        self.response_id = response_id
        self._response_queue: asyncio.Queue = asyncio.Queue()
        self._listener_task: Optional[asyncio.Task] = None
        self._running = False
        # Track all response IDs we should listen for
        self._listen_ids: set = {response_id}

    async def start(self):
        self._running = True
        self._listener_task = asyncio.create_task(self._listen())
        log.info(f"UDS protocol listener started (req=0x{self.request_id:03X}, resp=0x{self.response_id:03X})")

    async def stop(self):
        self._running = False
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
        log.info("UDS protocol listener stopped")

    async def _listen(self):
        loop = asyncio.get_event_loop()
        while self._running:
            try:
                msg = await loop.run_in_executor(
                    None, lambda: self.bus.recv(timeout=0.1)
                )
                if msg and msg.arbitration_id in self._listen_ids:
                    await self._response_queue.put(msg)
            except can.CanError as e:
                log.warning(f"UDS read error: {e}")
                await asyncio.sleep(0.01)
            except Exception as e:
                if self._running:
                    log.error(f"UDS listener error: {e}")
                    await asyncio.sleep(0.1)

    def _drain_queue(self):
        while not self._response_queue.empty():
            try:
                self._response_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

    def set_target(self, request_id: int, response_id: int):
        """Change the target ECU for UDS requests."""
        self.request_id = request_id
        self.response_id = response_id
        self._listen_ids = {response_id}
        log.info(f"UDS target changed: req=0x{request_id:03X}, resp=0x{response_id:03X}")

    async def send_service(self, service_id: int, sub_function: Optional[int],
                           data: list, req_id: str, target: Optional[int] = None) -> dict:
        """Send a UDS service request and wait for the response.
        
        Args:
            service_id: UDS service ID (0x10, 0x22, 0x27, 0x2E, 0x31, etc.)
            sub_function: Sub-function byte (None if not applicable)
            data: Additional data bytes
            req_id: Request ID for tracking
            target: Optional target arbitration ID (overrides self.request_id)
        """
        self._drain_queue()

        # Build UDS payload
        payload = [service_id]
        if sub_function is not None:
            payload.append(sub_function & 0xFF)
        payload.extend(data)

        # Use target override if provided
        arb_id = target if target is not None else self.request_id

        # Send via ISO-TP
        if len(payload) <= 7:
            # Single frame
            frame_data = [len(payload)] + payload
            frame_data.extend([0x00] * (8 - len(frame_data)))
            msg = can.Message(
                arbitration_id=arb_id,
                data=frame_data,
                is_extended_id=False
            )
            try:
                self.bus.send(msg)
            except can.CanError as e:
                return {"type": "error", "id": req_id, "message": f"UDS send error: {e}"}
        else:
            # Multi-frame (ISO-TP first frame + consecutive frames)
            total_len = len(payload)
            # First frame: [0x1X, len_lo, ...6 data bytes]
            ff_data = [0x10 | ((total_len >> 8) & 0x0F), total_len & 0xFF] + payload[:6]
            msg = can.Message(arbitration_id=arb_id, data=ff_data, is_extended_id=False)
            try:
                self.bus.send(msg)
            except can.CanError as e:
                return {"type": "error", "id": req_id, "message": f"UDS send error: {e}"}

            # Wait for flow control
            try:
                fc_msg = await asyncio.wait_for(
                    self._response_queue.get(),
                    timeout=ISOTP_FRAME_TIMEOUT
                )
                fc_data = list(fc_msg.data)
                if (fc_data[0] >> 4) != 3:
                    return {"type": "error", "id": req_id, "message": "Expected flow control frame"}
            except asyncio.TimeoutError:
                return {"type": "error", "id": req_id, "message": "Timeout waiting for flow control"}

            # Send consecutive frames
            remaining = payload[6:]
            seq = 1
            while remaining:
                chunk = remaining[:7]
                remaining = remaining[7:]
                cf_data = [0x20 | (seq & 0x0F)] + list(chunk)
                cf_data.extend([0x00] * (8 - len(cf_data)))
                cf_msg = can.Message(arbitration_id=arb_id, data=cf_data, is_extended_id=False)
                self.bus.send(cf_msg)
                seq += 1
                await asyncio.sleep(0.001)  # STmin

        # Wait for UDS response
        try:
            response = await asyncio.wait_for(
                self._wait_for_uds_response(service_id),
                timeout=UDS_RESPONSE_TIMEOUT
            )
            return {
                "type": "uds_response",
                "id": req_id,
                "service": response.get("service", service_id),
                "data": response.get("data", []),
                "positive": response.get("positive", True),
                "nrc": response.get("nrc"),
                "nrc_name": response.get("nrc_name")
            }
        except asyncio.TimeoutError:
            return {
                "type": "error",
                "id": req_id,
                "message": f"Timeout waiting for UDS response (service 0x{service_id:02X})"
            }

    async def _wait_for_uds_response(self, service_id: int) -> dict:
        """Wait for a UDS response, handling ISO-TP multi-frame and NRC."""
        while True:
            msg = await self._response_queue.get()
            frame_data = list(msg.data)
            pci_type = (frame_data[0] >> 4) & 0x0F

            payload = []
            if pci_type == 0:  # Single frame
                length = frame_data[0] & 0x0F
                payload = frame_data[1:1 + length]
            elif pci_type == 1:  # First frame (multi-frame)
                total_length = ((frame_data[0] & 0x0F) << 8) | frame_data[1]
                payload = frame_data[2:]

                # Send flow control
                fc_msg = can.Message(
                    arbitration_id=self.request_id,
                    data=[ISOTP_FLOW_CONTROL, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
                    is_extended_id=False
                )
                self.bus.send(fc_msg)

                # Collect consecutive frames
                expected_seq = 1
                while len(payload) < total_length:
                    try:
                        cf_msg = await asyncio.wait_for(
                            self._response_queue.get(),
                            timeout=ISOTP_FRAME_TIMEOUT
                        )
                        cf_data = list(cf_msg.data)
                        cf_pci = (cf_data[0] >> 4) & 0x0F
                        cf_seq = cf_data[0] & 0x0F
                        if cf_pci == 2 and cf_seq == (expected_seq & 0x0F):
                            payload.extend(cf_data[1:])
                            expected_seq += 1
                    except asyncio.TimeoutError:
                        break
                payload = payload[:total_length]
            else:
                continue

            if not payload:
                continue

            response_sid = payload[0]

            # Positive response
            if response_sid == service_id + UDS_POSITIVE_RESPONSE_OFFSET:
                return {
                    "service": response_sid,
                    "data": payload[1:],
                    "positive": True
                }

            # Negative response
            if response_sid == UDS_NEGATIVE_RESPONSE:
                nrc = payload[2] if len(payload) > 2 else 0
                # NRC 0x78 = ResponsePending — keep waiting
                if nrc == 0x78:
                    continue
                return {
                    "service": service_id,
                    "data": payload,
                    "positive": False,
                    "nrc": nrc,
                    "nrc_name": self._nrc_name(nrc)
                }

    @staticmethod
    def _nrc_name(nrc: int) -> str:
        """Decode UDS Negative Response Code to human-readable name."""
        NRC_NAMES = {
            0x10: "generalReject",
            0x11: "serviceNotSupported",
            0x12: "subFunctionNotSupported",
            0x13: "incorrectMessageLengthOrInvalidFormat",
            0x14: "responseTooLong",
            0x21: "busyRepeatRequest",
            0x22: "conditionsNotCorrect",
            0x24: "requestSequenceError",
            0x25: "noResponseFromSubnetComponent",
            0x26: "failurePreventsExecutionOfRequestedAction",
            0x31: "requestOutOfRange",
            0x33: "securityAccessDenied",
            0x35: "invalidKey",
            0x36: "exceededNumberOfAttempts",
            0x37: "requiredTimeDelayNotExpired",
            0x70: "uploadDownloadNotAccepted",
            0x71: "transferDataSuspended",
            0x72: "generalProgrammingFailure",
            0x73: "wrongBlockSequenceCounter",
            0x78: "requestCorrectlyReceivedResponsePending",
            0x7E: "subFunctionNotSupportedInActiveSession",
            0x7F: "serviceNotSupportedInActiveSession",
        }
        return NRC_NAMES.get(nrc, f"unknown_0x{nrc:02X}")


# ═══════════════════════════════════════════════════════════════════════════
# PCAN Bridge (Multi-Protocol WebSocket Server)
# ═══════════════════════════════════════════════════════════════════════════

class PCANBridge:
    """WebSocket server that bridges browser to PCAN-USB.
    
    Supports multiple protocols:
      - obd2: OBD-II over CAN (ISO 15765-4), 500kbps, 11-bit IDs
      - j1939: SAE J1939, 250kbps, 29-bit extended IDs
      - uds: UDS (ISO 14229) over ISO-TP, configurable target ECU
      - canfd: CAN FD (flexible data rate), up to 64-byte payloads
      - raw: Raw CAN frame send/receive
    
    The WebSocket server starts IMMEDIATELY so the browser can connect
    and verify the bridge is running. The CAN bus is opened lazily
    when the first request arrives (or on explicit 'init_can' message).
    
    IntelliSpy Bus Monitor:
    When a client sends {"type": "start_monitor"}, the bridge enters
    bus monitor mode — ALL CAN frames on the bus are forwarded to the
    browser as {"type": "bus_frame", ...} messages in real-time.
    """

    def __init__(self, interface: str, channel: str, bitrate: int, port: int, tls_port: int, enable_tls: bool):
        self.interface = interface
        self.channel = channel
        self.bitrate = bitrate
        self.port = port
        self.tls_port = tls_port
        self.enable_tls = enable_tls
        self.bus: Optional[can.Bus] = None
        self.protocol: Optional[OBDProtocol] = None
        self.j1939_protocol: Optional[J1939Protocol] = None
        self.uds_protocol: Optional[UDSProtocol] = None
        self.active_protocol: str = 'obd2'  # Current active protocol
        self.clients: set = set()
        self.can_initialized = False
        self.can_error: Optional[str] = None
        self.can_fd_enabled = False
        # IntelliSpy bus monitor state
        self._monitor_clients: dict = {}
        self._monitor_running = False

    def _init_can_bus(self, bitrate: int = None, fd: bool = False) -> bool:
        """Try to open the CAN bus. Returns True on success."""
        if self.can_initialized:
            # If already initialized, close and reopen with new settings
            if self.bus:
                try:
                    self.bus.shutdown()
                except:
                    pass
            self.can_initialized = False

        br = bitrate or self.bitrate
        log.info(f"Opening CAN bus: {self.interface} / {self.channel} @ {br} bps (FD={fd})...")
        try:
            bus_kwargs = {
                'interface': self.interface,
                'channel': self.channel,
                'bitrate': br,
            }
            if fd:
                bus_kwargs['fd'] = True
                # CAN FD data bitrate (typically 2Mbps or 5Mbps)
                bus_kwargs['data_bitrate'] = 2000000
            self.bus = can.Bus(**bus_kwargs)
            self.can_initialized = True
            self.can_error = None
            self.bitrate = br
            self.can_fd_enabled = fd
            log.info(f"CAN bus opened successfully! (bitrate={br}, fd={fd})")
            return True
        except Exception as e:
            self.can_error = str(e)
            log.error(f"Failed to open CAN bus: {e}")
            if self.interface == 'pcan':
                log.error("  Check that:")
                log.error("    1. PCAN-USB is plugged in")
                log.error("    2. PCAN drivers are installed (PCAN-Basic)")
                log.error("       Download: https://www.peak-system.com/Downloads.76.0.html")
                log.error("    3. No other software is using the PCAN-USB (close PCAN-View, etc.)")
            return False

    async def _ensure_can_bus(self, bitrate: int = None, fd: bool = False) -> bool:
        """Ensure CAN bus is initialized. Called lazily on first request."""
        if self.can_initialized and (bitrate is None or bitrate == self.bitrate) and fd == self.can_fd_enabled:
            return True

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: self._init_can_bus(bitrate, fd))

    async def _stop_all_protocols(self):
        """Stop all active protocol listeners."""
        if self.protocol:
            await self.protocol.stop()
            self.protocol = None
        if self.j1939_protocol:
            await self.j1939_protocol.stop()
            self.j1939_protocol = None
        if self.uds_protocol:
            await self.uds_protocol.stop()
            self.uds_protocol = None

    async def _start_protocol(self, proto: str):
        """Start the specified protocol listener."""
        await self._stop_all_protocols()

        if proto == 'obd2' or proto == 'raw':
            self.protocol = OBDProtocol(self.bus)
            await self.protocol.start()
        elif proto == 'j1939':
            self.j1939_protocol = J1939Protocol(self.bus)
            await self.j1939_protocol.start()
        elif proto == 'uds':
            self.uds_protocol = UDSProtocol(self.bus)
            await self.uds_protocol.start()
        elif proto == 'canfd':
            # CAN FD uses OBD protocol handler but with FD frames
            self.protocol = OBDProtocol(self.bus)
            await self.protocol.start()

        self.active_protocol = proto
        log.info(f"Active protocol: {proto}")

    async def start(self):
        """Start WebSocket server(s) immediately. CAN bus is deferred."""
        servers = []

        # Start insecure ws:// server
        log.info(f"Starting WebSocket server on ws://localhost:{self.port}")
        ws_server = await serve(self.handle_client, "0.0.0.0", self.port,
                                  ping_interval=20, ping_timeout=10)
        servers.append(ws_server)

        # Start secure wss:// server if TLS is enabled
        tls_available = False
        if self.enable_tls:
            has_cert = generate_self_signed_cert()
            if has_cert:
                try:
                    ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                    ssl_context.load_cert_chain(str(CERT_FILE), str(KEY_FILE))
                    log.info(f"Starting secure WebSocket server on wss://localhost:{self.tls_port}")
                    wss_server = await serve(self.handle_client, "0.0.0.0", self.tls_port, ssl=ssl_context,
                                              ping_interval=20, ping_timeout=10)
                    servers.append(wss_server)
                    tls_available = True
                except Exception as e:
                    log.warning(f"Failed to start TLS server: {e}")
                    log.warning("Falling back to ws:// only")

        # Print the ready banner
        print(flush=True)
        print("=" * 60, flush=True)
        print("  PCAN-USB Bridge v2.1 is READY", flush=True)
        print(f"  Adapter: {self.interface} / {self.channel}", flush=True)
        print(f"  Bitrate: {self.bitrate} bps", flush=True)
        print(f"  Protocols: {', '.join(SUPPORTED_PROTOCOLS)}", flush=True)
        print(f"  Heartbeat: ping every 20s, timeout 10s", flush=True)
        print(flush=True)
        if tls_available:
            print(f"  Secure:   wss://localhost:{self.tls_port}  (recommended)", flush=True)
            print(f"  Insecure: ws://localhost:{self.port}   (fallback)", flush=True)
            print(flush=True)
            print("  FIRST TIME? Accept the self-signed certificate:", flush=True)
            print(f"  1. Open https://localhost:{self.tls_port} in Chrome", flush=True)
            print("  2. Click 'Advanced' -> 'Proceed to localhost'", flush=True)
            print("  3. You only need to do this once", flush=True)
        else:
            print(f"  WebSocket: ws://localhost:{self.port}", flush=True)
            print(flush=True)
            print("  NOTE: If connecting from HTTPS, you may need to", flush=True)
            print("  enable chrome://flags/#allow-insecure-localhost", flush=True)
        print(flush=True)
        print("  CAN bus will connect when the browser sends", flush=True)
        print("  its first request (or you can pre-connect with", flush=True)
        print("  the CHECK button in the app).", flush=True)
        print("=" * 60, flush=True)
        print(flush=True)
        print("  Waiting for browser connection...", flush=True)
        print(flush=True)

        # Keep running
        await asyncio.Future()

    async def handle_client(self, websocket):
        """Handle a WebSocket client connection."""
        client_addr = websocket.remote_address
        is_secure = hasattr(websocket, 'transport') and hasattr(websocket.transport, 'get_extra_info') and websocket.transport.get_extra_info('ssl_object') is not None
        proto = "wss" if is_secure else "ws"
        log.info(f"Browser connected from {client_addr} ({proto})")
        self.clients.add(websocket)

        # Send connection confirmation
        await websocket.send(json.dumps({
            "type": "connected",
            "adapter": self.interface,
            "channel": self.channel,
            "bitrate": self.bitrate,
            "version": "2.1.0",
            "secure": is_secure,
            "can_ready": self.can_initialized,
            "can_error": self.can_error,
            "active_protocol": self.active_protocol,
            "supported_protocols": SUPPORTED_PROTOCOLS,
            "can_fd": self.can_fd_enabled
        }))

        try:
            async for message in websocket:
                try:
                    msg = json.loads(message)
                    msg["_ws"] = websocket
                    response = await self.handle_message(msg)
                    if response:
                        await websocket.send(json.dumps(response))
                except json.JSONDecodeError:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "Invalid JSON"
                    }))
                except Exception as e:
                    log.error(f"Error handling message: {e}")
                    await websocket.send(json.dumps({
                        "type": "error",
                        "id": msg.get("id", "unknown"),
                        "message": str(e)
                    }))
        except websockets.ConnectionClosed:
            log.info(f"Browser disconnected from {client_addr}")
        finally:
            self.clients.discard(websocket)

    async def handle_message(self, msg: dict) -> Optional[dict]:
        """Route incoming messages to the appropriate handler."""
        msg_type = msg.get("type")
        req_id = msg.get("id", "0")

        # ─── Ping ────────────────────────────────────────────────────
        if msg_type == "ping":
            return {
                "type": "pong",
                "adapter": self.interface,
                "channel": self.channel,
                "status": "bus_active" if self.can_initialized else "ready",
                "can_ready": self.can_initialized,
                "can_error": self.can_error,
                "protocol": self.active_protocol,
                "can_fd": self.can_fd_enabled
            }

        # ─── Protocol Switching ──────────────────────────────────────
        elif msg_type == "set_protocol":
            new_proto = msg.get("protocol", "obd2").lower()
            if new_proto not in SUPPORTED_PROTOCOLS:
                return {
                    "type": "error",
                    "id": req_id,
                    "message": f"Unsupported protocol: {new_proto}. Supported: {', '.join(SUPPORTED_PROTOCOLS)}"
                }

            # Determine bitrate
            new_bitrate = msg.get("bitrate", PROTOCOL_BITRATES.get(new_proto, 500000))
            is_fd = new_proto == 'canfd'

            # Only stop the REQUESTING client's monitor, not ALL monitors.
            # This allows Datalogger and IntelliSpy to run simultaneously.
            requesting_ws = msg.get("_ws")
            if requesting_ws and requesting_ws in self._monitor_clients:
                self._monitor_clients[requesting_ws]["task"].cancel()
                del self._monitor_clients[requesting_ws]

            # Reinitialize CAN bus only if bitrate or FD mode actually changed
            needs_reinit = (new_bitrate != self.bitrate) or (is_fd != self.can_fd_enabled) or not self.can_initialized
            if needs_reinit:
                # If other monitors are active, we must stop them too since CAN bus is being reinitialized
                if self._monitor_clients:
                    log.warning(f"Protocol switch requires CAN reinit — stopping {len(self._monitor_clients)} other monitor(s)")
                    for ws, info in list(self._monitor_clients.items()):
                        info["task"].cancel()
                    self._monitor_clients.clear()
                await self._stop_all_protocols()
                success = await self._ensure_can_bus(new_bitrate, is_fd)
                if not success:
                    return {
                        "type": "error",
                        "id": req_id,
                        "message": f"Failed to reinitialize CAN bus for {new_proto}: {self.can_error}"
                    }

            # Start new protocol
            await self._start_protocol(new_proto)

            return {
                "type": "protocol_changed",
                "id": req_id,
                "protocol": new_proto,
                "bitrate": self.bitrate,
                "can_fd": self.can_fd_enabled
            }

        # ─── Explicit CAN Init ───────────────────────────────────────
        elif msg_type == "init_can":
            bitrate = msg.get("bitrate", self.bitrate)
            fd = msg.get("fd", False)
            success = await self._ensure_can_bus(bitrate, fd)
            if success:
                await self._start_protocol(self.active_protocol)
                return {
                    "type": "can_initialized",
                    "id": req_id,
                    "success": True,
                    "channel": self.channel,
                    "bitrate": self.bitrate,
                    "protocol": self.active_protocol,
                    "can_fd": self.can_fd_enabled
                }
            else:
                return {
                    "type": "error",
                    "id": req_id,
                    "message": f"Failed to open CAN bus: {self.can_error}\n"
                               f"Check that PCAN-USB is plugged in and drivers are installed."
                }

        # ─── OBD-II Request ──────────────────────────────────────────
        elif msg_type == "obd_request":
            if not self.can_initialized:
                success = await self._ensure_can_bus()
                if not success:
                    return {
                        "type": "error",
                        "id": req_id,
                        "message": f"CAN bus not available: {self.can_error}"
                    }
                await self._start_protocol('obd2')
            if not self.protocol:
                self.protocol = OBDProtocol(self.bus)
                await self.protocol.start()
            mode = msg.get("mode", 1)
            pid = msg.get("pid", 0)
            return await self.protocol.send_obd_request(mode, pid, req_id)

        # ─── J1939 Request ───────────────────────────────────────────
        elif msg_type == "j1939_request":
            if not self.can_initialized:
                success = await self._ensure_can_bus(250000)
                if not success:
                    return {
                        "type": "error",
                        "id": req_id,
                        "message": f"CAN bus not available: {self.can_error}"
                    }
                await self._start_protocol('j1939')
            if not self.j1939_protocol:
                self.j1939_protocol = J1939Protocol(self.bus)
                await self.j1939_protocol.start()
            pgn = msg.get("pgn", 0)
            dest = msg.get("dest", J1939_GLOBAL_ADDR)
            priority = msg.get("priority", J1939_PRIORITY_DEFAULT)
            return await self.j1939_protocol.request_pgn(pgn, dest, priority, req_id)

        # ─── UDS Request ─────────────────────────────────────────────
        elif msg_type == "uds_request":
            if not self.can_initialized:
                success = await self._ensure_can_bus()
                if not success:
                    return {
                        "type": "error",
                        "id": req_id,
                        "message": f"CAN bus not available: {self.can_error}"
                    }
                await self._start_protocol('uds')
            if not self.uds_protocol:
                self.uds_protocol = UDSProtocol(self.bus)
                await self.uds_protocol.start()
            # Optional target ECU override
            target = msg.get("target")
            if target and isinstance(target, int):
                self.uds_protocol.set_target(target, target + 8)
            service = msg.get("service", UDS_READ_DID)
            sub = msg.get("sub")
            data = msg.get("data", [])
            return await self.uds_protocol.send_service(service, sub, data, req_id, target)

        # ─── UDS Set Target ──────────────────────────────────────────
        elif msg_type == "uds_set_target":
            if self.uds_protocol:
                req = msg.get("request_id", 0x7E0)
                resp = msg.get("response_id", 0x7E8)
                self.uds_protocol.set_target(req, resp)
                return {
                    "type": "uds_target_set",
                    "id": req_id,
                    "request_id": req,
                    "response_id": resp
                }
            return {"type": "error", "id": req_id, "message": "UDS protocol not initialized"}

        # ─── Raw CAN Send ────────────────────────────────────────────
        elif msg_type == "can_send":
            if not self.can_initialized:
                success = await self._ensure_can_bus()
                if not success:
                    return {
                        "type": "error",
                        "id": req_id,
                        "message": f"CAN bus not available: {self.can_error}"
                    }
                if not self.protocol:
                    self.protocol = OBDProtocol(self.bus)
                    await self.protocol.start()
            arb_id = msg.get("arb_id", 0)
            data = msg.get("data", [])
            extended = msg.get("extended", False)
            return await self.protocol.send_raw_frame(arb_id, data, req_id, extended)

        # ─── Filter Management ───────────────────────────────────────
        elif msg_type == "set_filter":
            if self.protocol:
                arb_ids = msg.get("arb_ids", [])
                self.protocol._filter_ids = set(arb_ids) | RESPONSE_IDS
                return {"type": "filter_set", "id": req_id, "arb_ids": list(self.protocol._filter_ids)}
            return {"type": "error", "id": req_id, "message": "CAN bus not initialized yet"}

        elif msg_type == "clear_filter":
            if self.protocol:
                self.protocol._filter_ids = RESPONSE_IDS.copy()
                return {"type": "filter_cleared", "id": req_id}
            return {"type": "error", "id": req_id, "message": "CAN bus not initialized yet"}

        # ─── IntelliSpy Bus Monitor ──────────────────────────────────
        elif msg_type == "start_monitor":
            if not self.can_initialized:
                success = await self._ensure_can_bus()
                if not success:
                    return {
                        "type": "error",
                        "id": req_id,
                        "message": f"CAN bus not available: {self.can_error}"
                    }
                if not self.protocol:
                    self.protocol = OBDProtocol(self.bus)
                    await self.protocol.start()

            # Clients differ: IntelliSpy / PCANConnection may send arb_ids or filter_ids
            raw_ids = msg.get("arb_ids")
            if raw_ids is None:
                raw_ids = msg.get("filter_ids")
            filter_set = set(raw_ids) if raw_ids else None

            ws = msg.get("_ws")
            if ws and ws not in self._monitor_clients:
                task = asyncio.create_task(self._bus_monitor_loop(ws, filter_set))
                self._monitor_clients[ws] = {"task": task, "filter": filter_set}
                log.info(f"IntelliSpy: Bus monitor started for {ws.remote_address} (filter: {raw_ids or 'all'})")

            return {
                "type": "monitor_started",
                "id": req_id,
                "filter": list(filter_set) if filter_set else "all"
            }

        elif msg_type == "stop_monitor":
            ws = msg.get("_ws")
            if ws and ws in self._monitor_clients:
                self._monitor_clients[ws]["task"].cancel()
                del self._monitor_clients[ws]
                log.info(f"IntelliSpy: Bus monitor stopped for {ws.remote_address}")
            return {"type": "monitor_stopped", "id": req_id}

        # ─── Disconnect ──────────────────────────────────────────────
        elif msg_type == "disconnect":
            ws = msg.get("_ws")
            if ws and ws in self._monitor_clients:
                self._monitor_clients[ws]["task"].cancel()
                del self._monitor_clients[ws]
            return {"type": "disconnected", "id": req_id}

        else:
            return {"type": "error", "id": req_id, "message": f"Unknown message type: {msg_type}"}

    async def _bus_monitor_loop(self, websocket, filter_set: Optional[set] = None):
        """Background task: read ALL CAN frames and forward to a specific client.
        
        This runs in parallel with protocol listeners. It reads raw
        frames from the bus and sends them to the IntelliSpy UI.
        Supports both standard (11-bit) and extended (29-bit) frames,
        as well as CAN FD frames with >8 byte payloads.
        """
        frame_count = 0
        start_time = time.time()
        loop = asyncio.get_event_loop()

        try:
            while True:
                try:
                    msg = await loop.run_in_executor(
                        None, lambda: self.bus.recv(timeout=0.05)
                    )
                    if msg is None:
                        continue

                    # Apply optional filter
                    if filter_set and msg.arbitration_id not in filter_set:
                        continue

                    frame_count += 1

                    # Build frame message with full metadata
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

                    # For J1939 frames, decode the PGN and source address
                    if msg.is_extended_id:
                        pgn = J1939Protocol._extract_pgn(msg.arbitration_id)
                        source = J1939Protocol._extract_source(msg.arbitration_id)
                        priority = (msg.arbitration_id >> 26) & 0x07
                        frame_msg["j1939"] = {
                            "pgn": pgn,
                            "source": source,
                            "priority": priority
                        }

                    await websocket.send(json.dumps(frame_msg))

                except asyncio.CancelledError:
                    raise
                except websockets.ConnectionClosed:
                    break
                except can.CanError as e:
                    log.warning(f"Monitor CAN read error: {e}")
                    await asyncio.sleep(0.01)
                except Exception as e:
                    log.error(f"Monitor error: {e}")
                    await asyncio.sleep(0.05)
        except asyncio.CancelledError:
            pass
        finally:
            elapsed = time.time() - start_time
            rate = frame_count / elapsed if elapsed > 0 else 0
            log.info(f"IntelliSpy monitor ended: {frame_count} frames in {elapsed:.1f}s ({rate:.0f} frames/sec)")

    async def shutdown(self):
        """Clean up resources."""
        for ws, info in list(self._monitor_clients.items()):
            info["task"].cancel()
        self._monitor_clients.clear()

        await self._stop_all_protocols()
        if self.bus:
            self.bus.shutdown()
            log.info("CAN bus closed")


def main():
    parser = argparse.ArgumentParser(
        description='PCAN-USB WebSocket Bridge for PPEI Performance Analyzer',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python pcan_bridge.py                                    # Auto-detect PCAN-USB (Windows/macOS)
  python pcan_bridge.py --channel PCAN_USBBUS1             # Specific PCAN channel
  python pcan_bridge.py --interface socketcan --channel can0  # Linux socketcan
  python pcan_bridge.py --bitrate 250000                   # 250k bitrate (J1939)
  python pcan_bridge.py --protocol j1939                   # Start in J1939 mode
  python pcan_bridge.py --protocol uds                     # Start in UDS mode
  python pcan_bridge.py --fd                               # Enable CAN FD
  python pcan_bridge.py --port 9000                        # Custom WebSocket port
  python pcan_bridge.py --no-tls                           # Disable TLS (ws:// only)

Supported protocols:
  obd2    - OBD-II over CAN (ISO 15765-4), 500kbps, 11-bit IDs
  j1939   - SAE J1939, 250kbps, 29-bit extended IDs, PGN-based
  uds     - UDS (ISO 14229) over ISO-TP, configurable target ECU
  canfd   - CAN FD (flexible data rate), up to 64-byte payloads
  raw     - Raw CAN frame send/receive

Supported adapters (via python-can):
  pcan       - PEAK PCAN-USB, PCAN-USB Pro, PCAN-USB FD
  socketcan  - Linux SocketCAN (any adapter: PCAN, Kvaser, CANable, etc.)
  kvaser     - Kvaser USB adapters
  ixxat      - IXXAT USB-to-CAN
  vector     - Vector CANalyzer/CANoe
  canalystii - Canalyst-II
        """
    )
    parser.add_argument('--interface', '-i', default='pcan',
                        help='python-can interface (default: pcan)')
    parser.add_argument('--channel', '-c', default='PCAN_USBBUS1',
                        help='CAN channel (default: PCAN_USBBUS1)')
    parser.add_argument('--bitrate', '-b', type=int, default=500000,
                        help='CAN bitrate in bps (default: 500000)')
    parser.add_argument('--protocol', '-P', default='obd2',
                        choices=SUPPORTED_PROTOCOLS,
                        help='Initial protocol (default: obd2)')
    parser.add_argument('--fd', action='store_true',
                        help='Enable CAN FD (flexible data rate)')
    parser.add_argument('--port', '-p', type=int, default=8765,
                        help='WebSocket server port (default: 8765)')
    parser.add_argument('--tls-port', type=int, default=8766,
                        help='Secure WebSocket server port (default: 8766)')
    parser.add_argument('--no-tls', action='store_true',
                        help='Disable TLS/wss:// server')
    parser.add_argument('--verbose', '-v', action='store_true',
                        help='Enable verbose logging')

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Override bitrate for J1939 if not explicitly set
    bitrate = args.bitrate
    if args.protocol == 'j1939' and args.bitrate == 500000:
        bitrate = 250000

    bridge = PCANBridge(
        interface=args.interface,
        channel=args.channel,
        bitrate=bitrate,
        port=args.port,
        tls_port=args.tls_port,
        enable_tls=not args.no_tls
    )
    bridge.active_protocol = args.protocol
    bridge.can_fd_enabled = args.fd

    try:
        asyncio.run(bridge.start())
    except KeyboardInterrupt:
        print("\nShutting down...", flush=True)
        asyncio.run(bridge.shutdown())
    except Exception as e:
        print(f"\nFatal error: {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
