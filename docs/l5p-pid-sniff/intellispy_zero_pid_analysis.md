# IntelliSpy Zero PID Scan Analysis — 2019 L5P E41

## Capture Summary
- File: `intellispy_capture_2026-04-22T16-26-50-444Z.csv`
- Total frames: 3960
- Duration: ~40 seconds

## Key Finding: ZERO diagnostic frames on standard OBD addresses
- **0x7DF** (OBD broadcast): 0 frames
- **0x7E0** (ECM request): 0 frames
- **0x7E8** (ECM response): 0 frames

## What IS on the bus
- 89 unique arb IDs, all in range 0x0BE-0x530 (normal GMLAN broadcast traffic)
- 4 non-standard diagnostic addresses: 0x773, 0x778, 0x77F, 0x785
  - 0x773: CommunicationControl requests (periodic, every ~3-4 seconds)
  - 0x778: RoutineControl RESULTS (ACCM_R module, periodic)
  - 0x77F: PCSM_R module requests
  - 0x785: ReadDataByIdentifier DID 0x0 (periodic)

## Root Cause Analysis

The `sendUDSviaRawCAN` method in pcanConnection.ts sends:
```json
{ "type": "can_send", "id": "req_X", "arb_id": 0x7E0, "data": [3, 0x22, DID_hi, DID_lo, 0, 0, 0, 0] }
```

The bridge `handle_message` routes `can_send` to `self.protocol.send_raw_frame()` which calls `self.bus.send(msg)`.

**BUT** — the `_listen()` filter only captures `RESPONSE_IDS = {0x7E8-0x7EF}`.

The flow is:
1. Client sends `can_send` with arb_id 0x7E0 → bridge sends on CAN bus → returns `tx_ack`
2. ECU responds on 0x7E8 → bridge listener captures it (0x7E8 is in RESPONSE_IDS)
3. Bridge broadcasts as `can_frame` via `_rx_broadcast` to WebSocket
4. Client `udsResponseListener` picks up the `can_frame` with arb_id 0x7E8

**CRITICAL**: The `tx_ack` response from `send_raw_frame` has the request ID, so `pendingRequests` resolves it.
But `sendUDSviaRawCAN` sends the frame **fire-and-forget** (no request ID matching for the response).
The response comes via `_rx_broadcast` → `udsResponseListener`.

**The problem**: If the bridge's OBD listener is NOT running (self.protocol is None), then:
- `can_send` handler at line 1481 checks `if not self.can_initialized` → calls `_ensure_can_bus()`
- Then checks `if not self.protocol` → creates OBDProtocol and starts it
- BUT: the `_ensure_can_bus()` call may fail silently, or the protocol may not be started

**OR**: The `sendUDSviaRawCAN` fires the frame but the `udsResponseListener` never gets the response
because the bridge's `_rx_broadcast` is not being called (listener not running or filter mismatch).

**MOST LIKELY**: The CAN bus is never initialized because the first `can_send` from `ensureGmLiveDataSessionForTx`
(TesterPresent 0x3E) fails with a timeout, and the error is silently caught. Subsequent requests also fail.
But the IntelliSpy capture shows the bus IS active (broadcast traffic), so the PCAN adapter IS connected.

**WAIT** — The IntelliSpy capture was taken DURING the scan. If 0x7E0 frames aren't in the capture,
that means the bridge is NOT sending them. The bridge `send_raw_frame` calls `self.bus.send(msg)` —
if this succeeds, the frame WOULD appear on the bus and IntelliSpy WOULD see it.

**CONCLUSION**: Either:
1. The bridge `can_send` handler is failing before `bus.send()` (CAN not initialized)
2. The `bus.send()` is throwing a CanError that's being caught
3. The WebSocket connection between browser and bridge is not established
4. The scan is using a different code path that doesn't send frames
