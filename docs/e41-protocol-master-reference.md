# E41 L5P Flash Protocol — Master Reference (Extracted from ALL Internal Documents)

## Sources Cross-Referenced
1. busmaster_analysis.md — 3 successful BUSMASTER flash logs (stock, mod, short)
2. shortflash_analysis.md — VOP3 device short flash PuTTY log
3. e88_flash_procedure_analysis.md — E88 FlashprocedurE88_v1.4 binary analysis
4. gmlan_timing.md — Exact inter-command timing from BUSMASTER
5. knoxKnowledgeServer.ts — DevProg V2 container format, flash DSL, ECU database, PCAN engine knowledge

## CRITICAL FINDINGS

### 1. NO SEPARATE ERASE COMMAND (0x31) EXISTS IN THE E41 PROTOCOL
- busmaster_analysis.md Phase 5: "RequestDownload → TransferData → TransferExit" — NO 0x31 anywhere
- shortflash_analysis.md: "First RequestDownload gets NRC 0x78 (ResponsePending) then positive — ECU erasing flash"
- busmaster_analysis.md: "NRC 0x78 (ResponsePending) on first RequestDownload is normal — ECU is erasing flash"
- Knox DEVPROG_FLASH_KNOWLEDGE: `FLASH_CM_ERASE` is explicitly called out as "Cummins-specific erase command"
- The E41 erases internally when it receives RequestDownload (0x34). NRC 0x78 = "I'm erasing, please wait"

### 2. EXACT RequestDownload FORMAT
From busmaster_analysis.md:
- First block: `34 00 00 0F FE` (single frame: `05 34 00 00 0F FE`)
- Subsequent blocks: `34 10 0F FE` (single frame: `04 34 10 0F FE`)
- NOT `34 00 44 {4-byte addr} {4-byte len}` — that format is WRONG for E41

From gmlan_timing.md:
- "First RequestDownload: 206ms after key accepted"
- "`05 34 00 00 0F FE` (single frame)"

From Knox DEVPROG_FLASH_KNOWLEDGE block_struct:
- `rc34`: RequestDownload parameters — CONTAINER-PROVIDED, not constructed
- Each block has its own `rc34` field with the exact bytes to send

### 3. BLOCK TRANSFER SEQUENCE (per block)
From busmaster_analysis.md:
1. RequestDownload `34 ...` → ECU responds NRC 0x78 (first block only, erasing), then 0x74 (positive)
2. TransferData `36 xx ...` in multi-frame ISO-TP
3. TransferExit `37` after each block

From Knox DEVPROG_FLASH_KNOWLEDGE:
1. Write PriRC (primary routine control) — from block_struct.pri_rc
2. RequestDownload (0x34) — from block_struct.rc34
3. TransferData (0x36) in xferSize chunks
4. RequestTransferExit (0x37) if protocol requires it
5. Write PostRC (post routine control) — from block_struct.post_rc

### 4. PriRC (GM Custom Priority Routine Control)
From e88_flash_procedure_analysis.md:
- `34 00 00 0F FE` sent BEFORE first block as USDT on 0x7E0
- This is the "CUSTOM_GM_PRIRC" step in the DevProg state machine

From Knox DEVPROG_FLASH_KNOWLEDGE:
- Step 4 in state machine: "CUSTOM_GM_PRIRC — GM-specific priority routine control (GMLAN only)"
- `FLASH_WRITE_PRIC()` command in DSL

### 5. ECU FLOW CONTROL
From busmaster_analysis.md:
- "ECU flow control: `30 00 F1` — STmin=241 (0xF1), BlockSize=0 (unlimited)"

### 6. TransferExit
From busmaster_analysis.md: "TransferExit `37` after each block" — YES, E41 uses TransferExit
From e88_flash_procedure_analysis.md: "No TransferExit on E88" — E88 does NOT use it, but E41 DOES

### 7. POST-FLASH SEQUENCE
From busmaster_analysis.md:
1. ReadDID 0x1A 0x90 (VIN)
2. ReadDID 0x1A 0xC1-C6 (Cal IDs)
3. ReadDID 0x1A 0xD0 → `55 4C` (unlock status)
4. ReadDID 0x1A 0xCC

From shortflash_analysis.md:
- `0xAE 0x28 0x80` command sent after last TransferData (finalize)

### 8. CONTAINER-DRIVEN BLOCK TRANSFER
From Knox DEVPROG_FLASH_KNOWLEDGE:
- Each block in `block_struct` has: `pri_rc`, `rc34`, `rc36`, `start_adresse`, `end_adresse`, `block_length`, `post_rc`, `erase`, `xferSize`
- The `rc34` field contains the EXACT RequestDownload bytes for that block
- The `erase` field is per-block — but for E41, the erase is implicit in 0x34 (NRC 0x78)
- `xferSize` defaults to 0xFFE for E41 (from ECU database: Transfer Size = 0xFFE)

### 9. E41 ECU DATABASE ENTRY
From Knox:
- ECU: E41 | Name: Bosch MG1CS111 (L5P) | TX: 0x7E0 | RX: 0x7E8
- Seed Level: 0x09 | CAN Speed: 500 | Transfer Size: 0xFFE
- Protocol: GMLAN
- Security: GM UDS 5-byte seed, 5-byte key with AES-128

## WHAT THE ORCHESTRATOR SHOULD DO

### PRE_FLASH Phase:
1. PriRC: `34 00 00 0F FE` on 0x7E0 (USDT, response expected) — nonFatal if NRC 0x22
2. NO EraseMemory (0x31) — remove it completely

### Per-Block (BLOCK_TRANSFER Phase):
1. Write PriRC from block_struct.pri_rc (if present)
2. RequestDownload from block_struct.rc34 (container-provided bytes)
3. Wait for NRC 0x78 (ResponsePending) on first block — ECU is erasing
4. Then 0x74 (positive response)
5. TransferData (0x36) with sequence counter, xferSize chunks
6. TransferExit (0x37) after each block
7. Write PostRC from block_struct.post_rc (if present)

### The `erase` field in block_struct:
- For E41/GMLAN: the erase is IMPLICIT in RequestDownload (NRC 0x78)
- The `erase` field may contain a value but it should NOT be sent as a separate 0x31 command
- `FLASH_CM_ERASE` is Cummins-specific, not for GM GMLAN ECUs
