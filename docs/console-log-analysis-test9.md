# Console Log Analysis — Test 9 (2026-04-23 18:43)

## Key Finding: PCAN-USB bridge was used, NOT Can2USB

Line 1: `PCAN-USB bridge detected via ws: ws://127.0.0.1:8765`
Line 5: `Bridge connected: pcan on PCAN_USBBUS1 @ 500000 bps (v2.1.0)`

The user connected via PCAN-USB WebSocket bridge, NOT the Can2USB serial adapter.
All DDDI code is in vopCan2UsbConnection.ts — the PCAN bridge path (pcanConnection.ts) 
has NO DDDI support at all.

## What happened:
- 86 PIDs selected (25 std + 61 ext)
- FRP_ACT is in the list (line 23)
- FRP_ACT keeps getting paused as "non-responding" (lines 32, 48, 66, 86, 107)
- FP_SAE also keeps getting paused (lines 25, 41, 62, 78, 98)
- No [DDDI] log entries at all — the DDDI code never ran
- 40.1 seconds of logging, only 139 samples

## Root cause:
DDDI periodic streaming only exists in vopCan2UsbConnection.ts (the Can2USB adapter).
The PCAN bridge (pcanConnection.ts) just does Mode 22 polling for everything.
FRP_ACT and FP_SAE are failing because the PCAN bridge doesn't know how to read them
via the correct DID/service.

## Action needed:
1. Check if pcanConnection.ts has startDddiPeriodicStreaming or equivalent
2. If not, port the DDDI logic to the PCAN bridge path
3. Or at minimum, ensure FRP_ACT Mode 22 polling works on PCAN
