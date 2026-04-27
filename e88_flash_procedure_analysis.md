# E88 Flash Procedure Analysis (FlashprocedurE88_v1.4)

## Critical Findings — Applies to E41 Too

### Exact UUDT Broadcast Sequence with Delays
The procedure defines the exact order and post_delay for each command:

| Step | Address | Data | Post Delay | Description |
|------|---------|------|------------|-------------|
| 1100 | 0x101 | FE 01 20 | 1000ms | ReturnToNormal |
| 1101 | 0x101 | FE 01 3E | 500ms cycle | TesterPresent CYCLIC (start here, runs continuously) |
| 1200 | 0x101 | FE 02 1A B0 | 250ms | ReadDID 0xB0 |
| 1300 | 0x101 | FE 02 10 02 | 250ms | Programming Session |
| 1400 | 0x101 | FE 01 28 | 1000ms | Disable Normal Communication |
| 1500 | 0x101 | FE 01 A2 | 2000ms | Report Programmed State |
| 1600 | 0x101 | FE 02 A5 01 | 1000ms | ProgrammingMode Enable |
| 1700 | 0x101 | FE 02 A5 03 | 500ms | ProgrammingMode Complete |
| 1800 | - | Request Seed | 1000ms | Security Access Seed Request |
| 1900 | - | Send Key | 1000ms | Security Access Key Send |
| 2000 | 0x7E0 | 34 00 00 0F FE | 250ms | **CUSTOM GM PriRC (0x34 RequestDownload BEFORE blocks!)** |

### KEY FINDINGS:
1. **TesterPresent cyclic starts EARLY** — at step 1101, right after ReturnToNormal, BEFORE the other broadcast commands
2. **Two different A5 commands**: `FE 02 A5 01` (Enable) with 1000ms delay, then `FE 02 A5 03` (Complete) with 500ms delay
3. **0x34 command BEFORE first block**: `DATA (3400000FFE)` = RequestDownload with address 0x0000 and length 0x0FFE — this is sent as USDT (with response expected) on 0x7E0
4. **Report Programmed State (A2) has 2000ms delay** — longest delay in the sequence
5. **No TransferExit on E88** — commented out in the block loop
6. **CAN DATA definitions confirm UUDT format**: All broadcast commands use FE prefix

### Post-Flash Sequence
| Step | Address | Data | Delay | Description |
|------|---------|------|-------|-------------|
| 3000 | - | - | 250ms | Wait |
| 3100 | 0x7E0 | 11 01 | 1000ms | ECU Reset (USDT) |
| 3200 | 0x7DF | 04 | 1000ms | Clear DTCs (UDS functional 0x7DF, NOT GMLAN 0x101) |
| 3300 | 0x101 | FE 01 20 | 500ms | ReturnToNormal (UUDT) |
| 3400 | - | - | - | Verify (ECU alive check) |

### Block Loop (per block)
1. FLASH_REQUEST_DOWNLOAD (0x34)
2. FLASH_TRANSFER_DATA (0x36)
3. NO TransferExit on E88
4. INC_BLOCK → next block or jump to post-flash

### CAN Data Area (hex payloads)
```
70000000: FE 01 20        — ReturnToNormal
70000010: FE 02 1A B0     — ReadDID 0xB0
70000020: FE 02 10 02     — Programming Session
70000030: FE 01 28        — Disable Normal Comm
70000040: FE 01 A2        — Report Programmed State
70000050: FE 02 A5 01     — ProgrammingMode Enable
70000060: FE 02 A5 03     — ProgrammingMode Complete
70000070: 34 00 00 0F FE  — RequestDownload (PriRC, USDT with response)
70000080: 11 01           — ECU Reset
70000090: 04              — Clear DTCs (just service byte 0x04, not 0x14)
70000100: FE 01 3E        — TesterPresent (cyclic UUDT)
```

### Important: ClearDTC uses 0x04 NOT 0x14
The E88 procedure uses service 0x04 (ClearDiagnosticInformation in GMLAN/KWP) on functional address 0x7DF, NOT UDS service 0x14. This is a GMLAN-specific difference.

### Important: 0x34 PriRC before blocks
`3400000FFE` = service 0x34, address 0x0000, length 0x0FFE
This is a "custom GM PriRC" sent as USDT on 0x7E0 with response expected.
This must be sent BEFORE the first block transfer begins.
