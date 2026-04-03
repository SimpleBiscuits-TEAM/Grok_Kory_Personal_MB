# Flash Log #11 Analysis — 10a615c8

## Timeline
- 0s: PRE_CHECK start
- 9.5s: Programming session — NRC 0x12 x2, then timeout (3 attempts)
- 23s: Seed received (57 09 FD 6C 06)
- 28s: Key send TIMEOUT — key C6 BF 02 28 58 sent but no response
- 35s: SESSION_OPEN broadcast (A5 01 → A5 03)
- 35.6s: Bootloader polling starts
- 86s: Seed received (attempt 5/12) — 51s after A5 03
- 91.7s: Key send TIMEOUT again
- 113s: Second seed received — key send TIMEOUT again
- 130s: Third seed received — key send TIMEOUT again
- 135s: Security access gave up (non-fatal)
- 135.5s: Send Key attempted with "xx" prefix — NRC 0x12
- 141.6s: Send Key timeout
- 143.6s: PriRC NRC 0x22 (expected, nonFatal)
- 143.7s: Block transfer starts — xferSize correctly 0xFFE (4094)!
- 143.8s: RequestDownload constructed: 34 00 44 00 00 10 00 00 16 0D 45
- 143.8s: NRC 0x12 (subFunctionNotSupported) — WRONG FORMAT

## Critical Findings

### Bug 1: Key Send Always Times Out
The seed is received successfully every time (57 09 FD 6C 06), the key is computed correctly (C6 BF 02 28 58), but the key send ALWAYS times out. This has been happening across multiple logs.

Possible causes:
- The key send frame is malformed
- The response listener is not matching the key-accepted response (0x67 0x02)
- The ECU is responding but on a different CAN ID
- The key send is using wrong ISO-TP framing (key is 5 bytes + SID 0x27 + sub 0x02 = 7 bytes total, fits in single frame)

Actually: 0x27 0x02 + 5 key bytes = 7 bytes UDS payload. PCI = 0x07. Frame = [07, 27, 02, C6, BF, 02, 28, 58] = exactly 8 bytes. This should work as a single frame.

Wait — the log at line 66 shows: "TX: 0x7E0 xx 27 02 ..." — there's an "xx" prefix! The key send is using the orchestrator command's canTx template which has "xx" as the PCI placeholder. The engine is sending "xx" literally, which parses to 0 → PCI byte is 0x00 instead of 0x07.

### Bug 2: Constructed RequestDownload Format Wrong
Line 78: `TX: RequestDownload (0x34) — 00 44 00 00 10 00 00 16 0D 45`

This is `34 00 44 {4-byte addr} {4-byte len}` format:
- 0x34 = RequestDownload
- 0x00 = dataFormatIdentifier (no compression/encryption)
- 0x44 = addressAndLengthFormatIdentifier (4-byte address + 4-byte length)
- 00 00 10 00 = address 0x1000
- 00 16 0D 45 = length 0x160D45

But BUSMASTER shows the E41 uses: `34 00 00 0F FE` for first block
- 0x34 = RequestDownload
- 0x00 = dataFormatIdentifier
- 0x00 = addressAndLengthFormatIdentifier (0 bytes address + 0 bytes length)
- 0x0F 0xFE = maxNumberOfBlockLength (0x0FFE = 4094)

The E41 uses a GMLAN-specific format where the address is NOT in the RequestDownload — it's implied from the block order. The maxNumberOfBlockLength tells the ECU the chunk size.

NRC 0x12 = subFunctionNotSupported — the ECU doesn't understand the 0x44 format.

### Bug 3: Security Never Granted
Because the key send always times out (due to xx PCI bug), security is NEVER granted. The engine proceeds because SECURITY_ACCESS is nonFatal, but the ECU hasn't unlocked. This means RequestDownload will also fail because the ECU requires security access before programming.

## Root Causes

1. **Key send uses orchestrator canTx template with "xx" PCI placeholder** — the engine sends PCI=0x00 instead of computing the correct PCI length byte. The ECU can't parse the frame.

2. **Constructed RequestDownload uses UDS format (0x44)** — E41 uses GMLAN format (no address, just maxBlockLength). The container's rc34 field has the correct format but isn't reaching the engine.

3. **Security never granted** — consequence of bug 1. Even if RequestDownload format were correct, the ECU would reject it because security access wasn't completed.

## Fixes Needed

1. Fix key send to NOT use orchestrator canTx template — use sendUDSRequest directly with proper parameters
2. Fix constructed RequestDownload to use GMLAN format (34 00 00 0F FE) when container rc34 is available
3. Ensure container rc34 reaches the engine — check if header.block_struct has rc34 populated
