# Flash Log #10 Analysis — 73b202dc

## Result: FAILED at BLOCK_TRANSFER — TransferData timeout

## Timeline
- 0s: PRE_CHECK starts
- 13.6s: PRE_CHECK security seed NRC 0x12 (subFunctionNotSupported) — ECU not in programming session yet
- 14.0s: SESSION_OPEN broadcast begins
- 20.5s: A5 03 ProgrammingMode Complete
- 21.0s: SECURITY_ACCESS seed request sent
- 52.3s: Seed received (31s after A5 03 — bootloader polling worked!)
- 52.5s: Security GRANTED
- 52.7s: PriRC (34 00 00 0F FE) sent
- 54.5s: NRC 0x78 — ResponsePending (ECU erasing!)
- 61.7s: PriRC timeout — correctly nonFatal
- 61.7s: BLOCK_TRANSFER starts

## CRITICAL FINDINGS

### Bug 1: xferSize is 0x0 (0 bytes)
Line 57: `Transfer size: 0x0 (0 bytes), Start addr: 1000`
The xferSize is reading as 0! This means the block transfer will try to send 0-byte chunks.
Even though we set E41 xferSize to 0xFFE in ecuDatabase.ts, the engine is reading 0.
This could mean the ECU config isn't being passed correctly to the engine.

### Bug 2: Constructed fallback rc34 instead of container rc34
Line 58: `RequestDownload (0x34) constructed: addr=0x1000 len=0x160D45`
Line 59: `TX: RequestDownload (0x34) — 00 44 00 00 10 00 00 16 0D 45`
The engine used the CONSTRUCTED fallback (addr=0x1000, len=0x160D45) instead of the container's rc34 field.
This means either:
a) The container doesn't have rc34 in block_struct, OR
b) The engine isn't reading it correctly

The constructed format `00 44 00 00 10 00 00 16 0D 45` is:
- 0x00 = dataFormatIdentifier (no compression/encryption)
- 0x44 = addressAndLengthFormatIdentifier (4-byte addr + 4-byte len)
- 00 00 10 00 = address (0x1000)
- 00 16 0D 45 = length (0x160D45 = 1,445,189 bytes = 1.4 MB)

But BUSMASTER shows the correct format is: `34 00 00 0F FE`
- 0x00 = dataFormatIdentifier
- 0x00 = addressAndLengthFormatIdentifier (0 bytes addr + 0 bytes len??)
- 0F FE = ??? (could be xferSize or block-specific parameter)

Wait — the BUSMASTER format `34 00 00 0F FE` is completely different:
- Service 0x34
- 0x00 = dataFormatIdentifier
- 0x00 0F FE = this is NOT standard UDS format. It's GMLAN-specific.

### Bug 3: RequestDownload ACCEPTED but TransferData timed out
Line 60: `RX: RequestDownload accepted` — the ECU accepted the constructed 0x34!
Line 62: `FAILED: Timeout waiting for CAN response` — TransferData (0x36) timed out

This means the ECU DID accept the RequestDownload, but then TransferData failed.
Possible causes:
1. xferSize=0 means the engine tried to send 0-byte chunks (or infinite loop)
2. TransferData framing is wrong
3. The ECU accepted the 0x34 but the session timed out before 0x36 was sent

### Bug 4: PriRC NRC 0x78 was NOT polled
Line 53: `NRC 0x78 — Response pending, waiting...`
Line 54: `Error: Timeout waiting for CAN response — retrying...`
The PriRC got NRC 0x78 (ECU was erasing!) but then timed out instead of polling.
This is the PriRC command, not the per-block RequestDownload. The PriRC is nonFatal so it continued.
BUT — the ECU was in the middle of erasing when the per-block 0x34 was sent at 61.7s.
The ECU accepted the per-block 0x34 at 63s — so the erase completed between 54s and 63s.

## ROOT CAUSE PRIORITY
1. **xferSize = 0** — This is the primary bug. The engine can't transfer data without knowing chunk size.
2. **Container rc34 not used** — The constructed fallback works (ECU accepted it) but we should use container data.
3. **TransferData framing** — Need to verify the 0x36 format being sent.
