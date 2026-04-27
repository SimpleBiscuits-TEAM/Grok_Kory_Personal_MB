# GMLAN Flash Timing — Extracted from BUSMASTER Stock Flash Log

## Broadcast Sequence (0x101) — Inter-Command Delays

| Step | Command | Data | Delay from Previous |
|------|---------|------|---------------------|
| 1 | ReturnToNormal | FE 01 20 | START |
| 2 | ReadDID 0xB0 | FE 02 1A B0 | +1000ms |
| 3 | DiagSession 0x02 | FE 02 10 02 | +50ms |
| 4 | DisableComm | FE 01 28 | +50ms |
| 5 | ProgrammedState | FE 01 A2 | +50ms |
| 6 | ProgrammingMode 0x01 | FE 02 A5 01 | +1000ms |
| 7 | ProgrammingMode 0x03 | FE 02 A5 03 | +50ms |
| 8+ | TesterPresent x427 | FE 01 3E | +1000ms first, then +500ms |

## Key Timing Observations

1. **Two distinct delay patterns in broadcast:**
   - 1000ms delay BEFORE: ReturnToNormal→ReadB0, ProgrammedState→ProgrammingMode01, ProgrammingMode03→TesterPresent
   - 50ms delay BETWEEN: ReadB0→DiagSession→DisableComm→ProgrammedState, ProgrammingMode01→03

2. **TesterPresent is GMLAN UUDT format:** `FE 01 3E` on 0x101 (functional), NOT UDS `3E 80`
   - `FE` = UUDT message type
   - `01` = single byte payload length
   - `3E` = TesterPresent service
   - ECU does NOT respond to UUDT messages
   - 427 total TesterPresent frames throughout the flash
   - ~500ms interval (average 486ms)

3. **Pre-read DIDs are FAST:** 5-15ms between each DID read on physical 0x7E0

4. **Security access:** 284ms after last TesterPresent
   - Seed request: `02 27 01` on 0x7E0
   - Seed response: `07 67 01 A0 9A 34 9B 06` — 4ms later
   - Key send: `07 27 02 AF 72 2A 51 7E` — 5ms later (single frame, not multi-frame!)
   - Key accepted: `02 67 02` — 4ms later

5. **Key send is SINGLE FRAME:** `07 27 02 AF 72 2A 51 7E` (7 bytes payload in single CAN frame)
   - NOT multi-frame ISO-TP!

6. **First RequestDownload:** 206ms after key accepted
   - `05 34 00 00 0F FE` (single frame)

## GMLAN UUDT Message Format

All functional broadcast commands on 0x101 use UUDT format:
```
FE <length> <service> [<sub-function>] [padding...]
```
- `FE` = UUDT message type identifier
- Length byte = number of service bytes following
- No response expected from ECU
- Padding with 0x00 to fill 8-byte CAN frame

## TesterPresent Keepalive Pattern

The tool sends TesterPresent continuously throughout the ENTIRE flash:
- Starts 1000ms after ProgrammingMode 0x03
- Runs at ~500ms intervals
- 427 frames total over ~11 minutes
- NEVER stops during block transfer — runs alongside TransferData
- Uses GMLAN UUDT format (FE 01 3E), NOT UDS (3E 80)
