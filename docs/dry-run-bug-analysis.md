# Dry Run Bug Analysis — Live PCAN + E41 L5P

## Log Summary
- ECU: E41 (L5P Duramax), Protocol: GMLAN, TX: 0x7E0, RX: 0x7E8
- Duration: 76.3s, Result: SUCCESS (dry run)
- Bridge connected in 6.2s

## Bug 1: "Cannot read properties of undefined (reading 'toString')"
**Where:** SecurityAccess Send Key (line 32-34), RequestDownload (line 36-39)
**Root cause:** In `pcanFlashEngine.ts executeCommand()`, the response parsing code calls
`response.data.map(b => b.toString(16)...)` but `response.data` is undefined.

Looking at `parseISOTPResponse()`: when the response is an "unexpected response" (not positive,
not negative 0x7F), it returns `data: payload` which could be empty. But the crash is in the
flash engine, not the parser.

The actual crash: in `executeCommand()` line that does:
```ts
const rxHex = response.data.map((b: number) => b.toString(16)...
```
When `response` is returned from `sendUDSRequest` but `response.data` is undefined or the
response itself has issues.

Actually, looking more carefully at the log:
- SecurityAccess Request Seed (0x27 0x01) returns "NRC 0x0: unknown" — this means the
  response parsing returned a UDSResponse with `positiveResponse: false` and `nrc: 0`.
- The Send Key step then crashes because it tries to use the seed response data.

The "NRC 0x0" is the real root cause — the response IS a positive response but is being
misclassified.

## Bug 2: NRC 0x0 (unknown) on Multiple Commands
**Where:** TesterPresent (line 25), DiagSessionControl (line 28), SecurityAccess (line 30)
**Root cause:** `parseISOTPResponse()` has three paths:
1. `responseServiceId === 0x7F` → negative response with NRC
2. `responseServiceId === service + 0x40` → positive response
3. Fallback → returns `positiveResponse: false` with NO nrc field

The fallback path is being hit, which means the response service ID doesn't match
`service + 0x40`. This could happen if:
- The raw CAN frame data includes extra bytes or different framing
- The PCI byte parsing is wrong

For TesterPresent (0x3E): positive response should be 0x7E. If the frame is
`02 7E 00 00 00 00 00 00`, PCI=0x02, payload=[0x7E, 0x00], responseServiceId=0x7E,
service+0x40=0x3E+0x40=0x7E ✓ — this SHOULD work.

But wait — in the dry run, TesterPresent was sent with sub-function 0x00:
`TX: 0x7E0 02 3E 00`
The ECU responded with NRC 0x12 in the previous dry run. But now it shows "NRC 0x0".

Hypothesis: The response frame is being received but the data array from the bridge
has a different format than expected. Need to check what the bridge actually sends.

## Bug 3: GMLAN ReadDID Returns Wrong Data
**Where:** VIN DID 0x90 (line 21), Programming Status DID 0xA0 (line 22)
**Data:** Both return exactly "90 31 47 54 31" (5 bytes)

The GMLAN ReadDID (0x1A) is sent as: `sendUDSRequest(0x1A, 0x90, undefined, 0x7E0)`
This builds ISO-TP frame: `[02, 1A, 90, 00, 00, 00, 00, 00]`

The ECU responds with a positive response: `5A 90 ...` (0x1A + 0x40 = 0x5A, then DID echo)

But the response data shows "90 31 47 54 31" — this is the DID byte (0x90) followed by
partial VIN bytes (0x31='1', 0x47='G', 0x54='T', 0x31='1'). This is actually correct
partial VIN data! "1GT1..." is the start of a GM VIN.

The issue is that only 5 bytes are shown because this is a SINGLE FRAME response.
The VIN is 17 bytes, so it should be a MULTI-FRAME response. The bridge is only
capturing the first frame.

Also suspicious: DID 0xA0 returns the EXACT same bytes "90 31 47 54 31". This means
the response listener is capturing the SAME response frame for both requests — likely
a race condition or the listener isn't being reset properly between requests.

## Bug 4: Verification Uses UDS 0x22 Instead of GMLAN 0x1A
**Where:** VERIFICATION phase (line 43), KEY_CYCLE CalID read (line 57)
The orchestrator generates `TX: 0x7E0 03 22 F1 90` for verification.
For GMLAN ECUs, this should be `TX: 0x7E0 02 1A 90`.
The ECU responds with NRC 0x31 (requestOutOfRange) because it doesn't support UDS 0x22.

## Bug 5: Clear DTCs Times Out on 0x7DF
**Where:** CLEANUP phase (line 59-63)
Functional addressing (0x7DF) may not work with the raw CAN transport because
the response comes from 0x7E8 (physical), not 0x7DF+8. The response listener
is looking for `targetAddress + 0x08 = 0x7DF + 0x08 = 0x7E7`, but the ECU
responds on 0x7E8.

## Bug 6: Extended Session Switch Returns False
**Where:** PRE_CHECK (line 16)
`setUDSSession('extended')` sends `0x10 0x03` but the response is being
misclassified as negative (NRC 0x0 bug). The SPS log showed the ECU DOES
respond positively to `0x10 0x03`.
