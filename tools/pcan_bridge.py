#!/usr/bin/env python3
"""
PCAN-USB WebSocket Bridge for PPEI Performance Analyzer
========================================================

This script bridges a PCAN-USB adapter to the browser-based datalogger
via WebSocket. It translates between the browser's JSON-based OBD-II
requests and raw CAN frames on the bus.

Requirements:
    pip install python-can websockets

Usage:
    python pcan_bridge.py                          # Auto-detect PCAN-USB
    python pcan_bridge.py --channel PCAN_USBBUS1   # Specific channel
    python pcan_bridge.py --bitrate 500000          # Custom bitrate
    python pcan_bridge.py --interface socketcan --channel can0  # Linux socketcan
    python pcan_bridge.py --no-tls                  # Disable TLS (ws:// only)

The bridge starts BOTH a secure (wss://) server on port 8766 and an
insecure (ws://) server on port 8765 by default. The browser tries
wss:// first (works from HTTPS pages), then falls back to ws://.

A self-signed TLS certificate is auto-generated on first run.
You must accept it in your browser once: visit https://localhost:8766
and click "Advanced" -> "Proceed" to trust it.

Protocol:
    Browser -> Bridge:
        {"type": "obd_request", "id": <req_id>, "mode": 1, "pid": 12}
        {"type": "obd_request", "id": <req_id>, "mode": 9, "pid": 2}   # VIN
        {"type": "obd_request", "id": <req_id>, "mode": 34, "pid": 4912}  # GM Mode 22
        {"type": "can_send", "id": <req_id>, "arb_id": 2016, "data": [3, 34, 19, 48, 0, 0, 0, 0]}
        {"type": "ping"}
        {"type": "set_filter", "arb_ids": [2024]}  # Listen for specific IDs
        {"type": "clear_filter"}

    Bridge -> Browser:
        {"type": "obd_response", "id": <req_id>, "mode": 1, "pid": 12, "data": [18, 52]}
        {"type": "obd_response", "id": <req_id>, "mode": 9, "pid": 2, "data": [...]}  # VIN bytes
        {"type": "can_frame", "arb_id": 2024, "data": [4, 65, 12, 18, 52, 0, 0, 0], "timestamp": 1234567.89}
        {"type": "error", "id": <req_id>, "message": "Timeout waiting for response"}
        {"type": "pong", "adapter": "pcan", "channel": "PCAN_USBBUS1", "status": "bus_active"}
        {"type": "connected", "adapter": "pcan", "channel": "PCAN_USBBUS1", "bitrate": 500000}
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
from typing import Optional

try:
    import can
except ImportError:
    print("ERROR: python-can is required. Install with: pip install python-can")
    print("  For PCAN-USB: pip install python-can")
    print("  For socketcan: pip install python-can  (Linux only)")
    sys.exit(1)

try:
    import websockets
    from websockets.asyncio.server import serve
except ImportError:
    print("ERROR: websockets is required. Install with: pip install websockets")
    sys.exit(1)

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    datefmt='%H:%M:%S'
)
log = logging.getLogger('pcan_bridge')

# ─── OBD-II CAN Constants ──────────────────────────────────────────────────
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

# Timeouts
OBD_RESPONSE_TIMEOUT = 2.0   # seconds
ISOTP_FRAME_TIMEOUT = 1.0    # seconds

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
        # openssl not available, try Python's ssl module approach
        try:
            # Use Python cryptography if available
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
            log.warning("  OR install openssl on your system")
            return False


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
                # Read with a short timeout so we can check _running
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

    async def send_obd_request(self, mode: int, pid: int, req_id: str) -> dict:
        """
        Send an OBD-II request and wait for the response.
        Handles single-frame and multi-frame (ISO-TP) responses.
        """
        self._drain_queue()

        # Build the CAN frame
        if mode == 0x22:  # GM Mode 22 (extended PID)
            # Mode 22: 3 data bytes [mode, pid_hi, pid_lo]
            pid_hi = (pid >> 8) & 0xFF
            pid_lo = pid & 0xFF
            data = [0x03, mode, pid_hi, pid_lo, 0x00, 0x00, 0x00, 0x00]
            arb_id = ECM_REQUEST_ID  # Direct to ECM for Mode 22
        elif mode == 0x09 and pid == 0x02:
            # VIN request: Mode 09 PID 02 (multi-frame response)
            data = [0x02, mode, pid, 0x00, 0x00, 0x00, 0x00, 0x00]
            arb_id = OBD_REQUEST_ID
        else:
            # Standard Mode 01/02/03/04/05/06/09
            data = [0x02, mode, pid, 0x00, 0x00, 0x00, 0x00, 0x00]
            arb_id = OBD_REQUEST_ID

        # Send the request
        msg = can.Message(
            arbitration_id=arb_id,
            data=data,
            is_extended_id=False
        )
        try:
            self.bus.send(msg)
        except can.CanError as e:
            return {
                "type": "error",
                "id": req_id,
                "message": f"CAN send error: {e}"
            }

        # Wait for response
        try:
            response = await asyncio.wait_for(
                self._wait_for_response(mode, pid),
                timeout=OBD_RESPONSE_TIMEOUT
            )
            return {
                "type": "obd_response",
                "id": req_id,
                "mode": mode,
                "pid": pid,
                "data": response
            }
        except asyncio.TimeoutError:
            return {
                "type": "error",
                "id": req_id,
                "message": f"Timeout: no response for Mode {mode:02X} PID {pid:04X}"
            }

    async def _wait_for_response(self, mode: int, pid: int) -> list:
        """
        Wait for and decode an OBD-II response.
        Handles single-frame and multi-frame ISO-TP.
        """
        while True:
            msg = await self._response_queue.get()
            if msg.arbitration_id not in RESPONSE_IDS:
                continue

            frame_data = list(msg.data)
            frame_type = (frame_data[0] >> 4) & 0x0F

            if frame_type == 0x0:
                # Single Frame
                length = frame_data[0] & 0x0F
                response_mode = frame_data[1]
                expected_mode = mode + 0x40

                if response_mode == expected_mode:
                    if mode == 0x22:
                        # Mode 22 response: [length, 0x62, pid_hi, pid_lo, data...]
                        return frame_data[4:4 + length - 3]
                    else:
                        # Standard response: [length, mode+0x40, pid, data...]
                        return frame_data[3:3 + length - 2]
                elif response_mode == 0x7F:
                    # Negative response
                    nrc = frame_data[3] if len(frame_data) > 3 else 0
                    raise Exception(f"Negative response: NRC 0x{nrc:02X}")

            elif frame_type == 0x1:
                # First Frame of multi-frame response
                total_length = ((frame_data[0] & 0x0F) << 8) | frame_data[1]
                response_mode = frame_data[2]
                expected_mode = mode + 0x40

                if response_mode != expected_mode:
                    continue

                # Collect first frame data
                assembled = frame_data[2:]  # Skip the 2 PCI bytes
                remaining = total_length - len(assembled)

                # Send Flow Control: CTS (Continue To Send)
                fc = can.Message(
                    arbitration_id=ECM_REQUEST_ID,
                    data=[0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
                    is_extended_id=False
                )
                self.bus.send(fc)

                # Receive consecutive frames
                seq = 1
                while remaining > 0:
                    try:
                        cf_msg = await asyncio.wait_for(
                            self._response_queue.get(),
                            timeout=ISOTP_FRAME_TIMEOUT
                        )
                    except asyncio.TimeoutError:
                        raise Exception("Timeout waiting for consecutive frame")

                    cf_data = list(cf_msg.data)
                    cf_type = (cf_data[0] >> 4) & 0x0F
                    cf_seq = cf_data[0] & 0x0F

                    if cf_type == 0x2 and cf_seq == (seq & 0x0F):
                        assembled.extend(cf_data[1:])
                        remaining -= 7
                        seq += 1

                # Parse the assembled data
                # assembled = [mode+0x40, pid, ...]
                if mode == 0x09 and pid == 0x02:
                    # VIN: skip mode, pid, and VIN message count byte
                    return assembled[3:3+17]  # 17-char VIN
                else:
                    return assembled[2:]  # Skip mode and pid

    async def send_raw_frame(self, arb_id: int, data: list, req_id: str) -> dict:
        """Send a raw CAN frame."""
        msg = can.Message(
            arbitration_id=arb_id,
            data=bytes(data),
            is_extended_id=False
        )
        try:
            self.bus.send(msg)
            return {
                "type": "can_sent",
                "id": req_id,
                "arb_id": arb_id
            }
        except can.CanError as e:
            return {
                "type": "error",
                "id": req_id,
                "message": f"CAN send error: {e}"
            }


class PCANBridge:
    """WebSocket server that bridges browser to PCAN-USB."""

    def __init__(self, interface: str, channel: str, bitrate: int, port: int, tls_port: int, enable_tls: bool):
        self.interface = interface
        self.channel = channel
        self.bitrate = bitrate
        self.port = port
        self.tls_port = tls_port
        self.enable_tls = enable_tls
        self.bus: Optional[can.Bus] = None
        self.protocol: Optional[OBDProtocol] = None
        self.clients: set = set()

    async def start(self):
        """Initialize CAN bus and start WebSocket server(s)."""
        log.info(f"Initializing {self.interface} on {self.channel} at {self.bitrate} bps...")
        try:
            self.bus = can.Bus(
                interface=self.interface,
                channel=self.channel,
                bitrate=self.bitrate
            )
            log.info(f"CAN bus opened: {self.interface} / {self.channel}")
        except Exception as e:
            log.error(f"Failed to open CAN bus: {e}")
            log.error("Ensure PCAN-USB is connected and drivers are installed.")
            if self.interface == 'pcan':
                log.error("  Windows: Install PCAN-Basic from https://www.peak-system.com/Downloads.76.0.html")
                log.error("  Linux: Install peak-linux-driver or use socketcan interface")
            sys.exit(1)

        self.protocol = OBDProtocol(self.bus)
        await self.protocol.start()

        servers = []

        # Start insecure ws:// server
        log.info(f"Starting WebSocket server on ws://localhost:{self.port}")
        ws_server = await serve(self.handle_client, "0.0.0.0", self.port)
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
                    wss_server = await serve(self.handle_client, "0.0.0.0", self.tls_port, ssl=ssl_context)
                    servers.append(wss_server)
                    tls_available = True
                except Exception as e:
                    log.warning(f"Failed to start TLS server: {e}")
                    log.warning("Falling back to ws:// only")

        log.info("")
        log.info("=" * 60)
        log.info("  PCAN-USB Bridge is READY")
        log.info(f"  Connect from the PPEI Performance Analyzer")
        log.info("")
        if tls_available:
            log.info(f"  Secure:   wss://localhost:{self.tls_port}  (recommended)")
            log.info(f"  Insecure: ws://localhost:{self.port}   (fallback)")
            log.info("")
            log.info("  FIRST TIME? Accept the self-signed certificate:")
            log.info(f"  1. Open https://localhost:{self.tls_port} in Chrome")
            log.info("  2. Click 'Advanced' -> 'Proceed to localhost'")
            log.info("  3. You only need to do this once")
        else:
            log.info(f"  WebSocket: ws://localhost:{self.port}")
            log.info("")
            log.info("  NOTE: If connecting from HTTPS, you may need to")
            log.info("  enable chrome://flags/#allow-insecure-localhost")
        log.info("=" * 60)
        log.info("")

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
            "version": "1.0.0",
            "secure": is_secure
        }))

        try:
            async for message in websocket:
                try:
                    msg = json.loads(message)
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

        if msg_type == "ping":
            return {
                "type": "pong",
                "adapter": self.interface,
                "channel": self.channel,
                "status": "bus_active"
            }

        elif msg_type == "obd_request":
            mode = msg.get("mode", 1)
            pid = msg.get("pid", 0)
            return await self.protocol.send_obd_request(mode, pid, req_id)

        elif msg_type == "can_send":
            arb_id = msg.get("arb_id", 0)
            data = msg.get("data", [])
            return await self.protocol.send_raw_frame(arb_id, data, req_id)

        elif msg_type == "set_filter":
            arb_ids = msg.get("arb_ids", [])
            self.protocol._filter_ids = set(arb_ids) | RESPONSE_IDS
            return {"type": "filter_set", "id": req_id, "arb_ids": list(self.protocol._filter_ids)}

        elif msg_type == "clear_filter":
            self.protocol._filter_ids = RESPONSE_IDS.copy()
            return {"type": "filter_cleared", "id": req_id}

        elif msg_type == "disconnect":
            return {"type": "disconnected", "id": req_id}

        else:
            return {"type": "error", "id": req_id, "message": f"Unknown message type: {msg_type}"}

    async def shutdown(self):
        """Clean up resources."""
        if self.protocol:
            await self.protocol.stop()
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
  python pcan_bridge.py --bitrate 250000                   # 250k bitrate (some older vehicles)
  python pcan_bridge.py --port 9000                        # Custom WebSocket port
  python pcan_bridge.py --no-tls                           # Disable TLS (ws:// only)

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

    bridge = PCANBridge(
        interface=args.interface,
        channel=args.channel,
        bitrate=args.bitrate,
        port=args.port,
        tls_port=args.tls_port,
        enable_tls=not args.no_tls
    )

    try:
        asyncio.run(bridge.start())
    except KeyboardInterrupt:
        log.info("Shutting down...")
        asyncio.run(bridge.shutdown())
    except Exception as e:
        log.error(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
