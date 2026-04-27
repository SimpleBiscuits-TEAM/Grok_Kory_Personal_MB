# HPT BUSMASTER Complete Protocol Analysis

## Critical Finding: HPT sends ZERO Mode 22 reads during periodic streaming

After DDDI setup, HPT sends ONLY TesterPresent (0x3E) every ~2 seconds.
**No Mode 22 reads. No batch_read_dids. Nothing else on 0x7E0.**

## HPT's Exact Step-by-Step Sequence (0x7E0 only)

### Pre-DDDI (Steps 1-12): Vehicle ID + Capability Probing
- Steps 1-4: FC responses (receiving multi-frame VIN data)
- Step 5: `01 A2` — ReportProgrammedState → OK (0xE2)
- Step 6: `02 1A C0` — ReadByAddress → OK
- Step 7-8: `02 1A B4` — ReadByAddress (multi-frame) → OK
- Step 9: `02 01 00` — Mode 01 PID 0x00 → OK (supported PIDs)
- Step 10: `03 22 01 00` — ReadDID 0x0100 → **NRC 0x31** (requestOutOfRange)
- Step 11: `07 23 00 00 00 00 00 01` — ReadMemByAddr → **NRC 0x31**
- Step 12: `03 AA 04 00` — ReadPeriodicDID stop → **NRC 0x31**

### DDDI Setup (Steps 13-19): IOCTL + DDDI + Start
- Step 13-14: IOCTL FE00 (multi-frame)
  - FF: `10 08 2D FE 00 40 01 4F` → FC: `30 00 0A` (STmin=10ms)
  - CF: `21 08 04 00 00 00 00 00` → OK: `03 6D FE 00`
  - Full payload: `2D FE00 40 014F08 04` = Read 4 bytes from RAM 0x014F08

- Step 15: DDDI FE
  - TX: `06 2C FE FE 00 00 0A 00` → OK: `02 6C FE`
  - Maps periodic ID 0xFE to IOCTL DID 0xFE00, position 0x00, size 0x0A

- Step 16-17: IOCTL FE01 (multi-frame)
  - FF: `10 08 2D FE 01 40 02 25` → FC: `30 00 0A`
  - CF: `21 D8 04 00 00 00 00 00` → OK: `03 6D FE 01`
  - Full payload: `2D FE01 40 0225D8 04` = Read 4 bytes from RAM 0x0225D8

- Step 18: DDDI FD
  - TX: `04 2C FD FE 01 00 00 00` → OK: `02 6C FD`
  - Maps periodic ID 0xFD to IOCTL DID 0xFE01

- Step 19: Start periodic streaming
  - TX: `04 AA 04 FE FD 00 00 00` → OK: `01 7E` (TesterPresent response??)
  - **WAIT**: The response is `01 7E` not `02 EA FE` or similar
  - Actually 0x7E = positive response to TesterPresent... but this is response to 0xAA
  - Actually looking more carefully: the first 0x5E8 frame arrives at the SAME timestamp
  - The `01 7E` might be the TesterPresent response from step 20 arriving early

### During Streaming (Steps 20-30): ONLY TesterPresent
- **Every ~2000ms**: `01 3E 00 00 00 00 00 00` → `01 7E`
- **NOTHING ELSE** — no Mode 22, no batch reads, no session changes

### Teardown (Step 31): Stop periodic
- TX: `02 AA 00 00 00 00 00 00` → OK: `01 60`
- `0xAA 0x00` = stop all periodic reads

## 0x5E8 Periodic Frame Analysis
- Total frames: 1702 (851 FE + 850 FD)
- FE interval: avg 25ms (40 Hz!)
- FRP_ACT range: 4712 - 20,599 PSI (451 unique values)
- Values change EVERY frame — this is live data

## CRITICAL DIFFERENCES vs Our Bridge

### 1. We flood the ECU with Mode 22 reads DURING periodic streaming
HPT sends ZERO Mode 22 reads. We send 61 DIDs per batch cycle.
**This kills the periodic scheduler.**

### 2. We don't send TesterPresent keepalive
HPT sends `0x3E` every 2 seconds to keep the diagnostic session alive.
Without this, the ECU may drop back to default session and stop periodic.

### 3. Our 0xAA start command format
HPT: `04 AA 04 FE FD 00 00 00` (PCI length = 4, so 4 bytes: AA 04 FE FD)
Our bridge: `bytes([0xAA, 0x04] + [0xFE, 0xFD])` padded to 8 — should be same

### 4. Our DDDI FE command format
HPT: `06 2C FE FE 00 00 0A 00` (PCI length = 6)
Need to verify our bridge sends the same 6-byte payload

### 5. Our DDDI FD command format
HPT: `04 2C FD FE 01 00 00 00` (PCI length = 4)
Need to verify our bridge sends the same 4-byte payload

## FIX PLAN
1. **Stop sending Mode 22 batch reads for FRP_ACT/FRP_DES** when periodic is active
2. **Add TesterPresent (0x3E) keepalive every 2 seconds** during periodic streaming
3. **Verify DDDI FE/FD command bytes match HPT exactly**
4. Consider: should we stop ALL Mode 22 reads during periodic? Or just exclude FRP?
