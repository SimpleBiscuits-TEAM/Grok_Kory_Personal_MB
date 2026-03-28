# Seed/Key & Security Access Findings from Docs Archive

## Source
- `Databases/GB_ASR_IPC_21_21_142R1_RBS.arxml` — AUTOSAR ECU configuration for GM Global B IPC
- `Databases/SeednKey.dll` — 32KB seed/key computation DLL (CANoe/CANalyzer)
- `Diagnostics/SecurityDLL.dll` — 26KB security DLL (GM Global B)
- `Nodes/DiagnosticCAN_GB.can` — CAPL diagnostic script with UDS $27 handling

## Important Note
This is for the **IPC (Instrument Panel Cluster)**, NOT the ECM. The IPC is a GM Global B module.
The ECM (E42/E86) uses a different security access scheme. However, the architecture and level structure are informative.

## Security Access Levels (from ARXML)
The IPC defines these security levels:

| Level | Sub-Service IDs | Seed Size | Key Size | Purpose |
|-------|----------------|-----------|----------|---------|
| Locked (0) | — | — | — | Default locked state |
| Level 1 | RequestSeed=1, SendKey=2 | 31 bytes | 12 bytes | Basic diagnostic access |
| Level 3 | RequestSeed=3, SendKey=4 | 31 bytes | 12 bytes | Extended diagnostic access |
| Level 5 | RequestSeed=5, SendKey=6 | 31 bytes | 12 bytes | Programming access |
| Level 9 | RequestSeed=9, SendKey=10 | 31 bytes | 12 bytes | Manufacturing access |
| Level 11 | — | — | — | Additional level |
| Level 13 | — | — | — | Additional level |
| Level 15 | — | — | — | Additional level |

## Key Observations

### Seed/Key Algorithm (from SecurityDLL.dll strings)
1. **31-byte seed, 12-byte key** — much larger than older GM systems (which used 2-byte seed/key)
2. **CMAC-based** — the DLL references "CMAC key", "SessionKey", and MAC generation
3. **Algorithm flow**:
   - Receive 31-byte seed from ECU
   - "Try to replace the default secret CMAC key with specified value"
   - "First MAC (SessionKey) successfully generated"
   - "Second MAC (SessionKey) successfully generated"
   - "Upper 12 bytes of CMAC successfully copied to provided key buffer"
4. **Option string**: 32-character hex string can be passed to customize the CMAC key
5. **Export function**: `GenerateKeyExOpt` — standard CANoe seed/key DLL interface
6. **Build path**: `D:\AnalyseTemp\EIP36142_GMGlobalBSecurityAccessDll_1.0.00100.000`
7. **"CANDiVa UNLK KEY"** — references CANDiVa (CANoe Diagnostic Validation) unlock key

### CAPL Script ($27 Handling)
From DiagnosticCAN_GB.can:
- Service $27 sub-parameter 1 = Request Seed (sends 2-byte request)
- Service $27 sub-parameter 2 = Send Key (sends 4 bytes: sub + keyHigh + keyLow)
- Response: $67 01 [seedH] [seedL] — seed returned in response
- Note: The CAPL script only handles 2-byte seed/key for the simple case, the DLL handles the full 31/12 scheme

### What This Means for the ECM
- The ECM (E42/E86) likely uses a similar CMAC-based scheme but with ECM-specific keys
- GM moved from simple XOR-based seed/key (pre-2014) to CMAC-based (2015+)
- The 31-byte seed provides enough entropy that brute-force is not feasible
- The CMAC key is module-specific — each ECU type has its own secret key
- EFILive/HP Tuners have their own licensed seed/key implementations for ECM access

### Security Level to DID Access Mapping
From the ARXML, different DIDs require different security levels:
- Most ReadDataByIdentifier ($22) DIDs: No security required (default session)
- IOControl ($2F) DIDs: Require Level 1 or Level 3 in Extended Session
- WriteDataByIdentifier ($2E): Require Level 3 or Level 5
- RoutineControl ($31): Various levels depending on routine
- RequestDownload ($34): Require Level 5 (Programming session)

## Implications for Our Logger
1. **Reading PIDs via Mode $22 does NOT require security access** — we can read all DIDs freely
2. **Writing calibration values would require security access** — Level 5 minimum
3. **The seed/key DLLs are for the IPC, not the ECM** — ECM has its own security
4. **For logging purposes, we don't need seed/key** — all the PIDs we want to read are accessible in default or extended diagnostic session without security unlock
5. **To enter Extended Session**: Send $10 03 (DiagnosticSessionControl - Extended)
