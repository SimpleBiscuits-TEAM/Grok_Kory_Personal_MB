# HP Tuners Exact Sequence on 2019 L5P E41 (BUSMASTER Log)

## Phase 1: Standard OBD Discovery (0x7DF functional broadcast)
```
7DF: 02 01 00  → 7E8: 06 41 00 98 79 00 13  (ECM bitmask)
7DF: 02 01 20  → 7E8: 06 41 20 80 03 A0 01
7DF: 02 01 40  → 7E8: 06 41 40 C4 C2 80 1D
7DF: 02 01 60  → 7E8: 06 41 60 E9 E9 83 43
7DF: 02 01 80  → 7E8: 06 41 80 E9 F2 01 00
7DF: 02 01 01  → 7E8: 06 41 01 00 2F EB 28  (MIL/DTC status)
7DF: 02 09 00  → 7E8: 06 49 00 54 60 00 00  (Mode 09 support)
7DF: 02 09 02  → 7E8: VIN multi-frame        (VIN read)
```
**KEY: All Mode 01/09 use 0x7DF (functional), NOT 0x7E0 (physical)**

## Phase 2: Legacy GM Reads (0x7E0 physical)
```
7E0: 01 A2                     → (unknown legacy service)
7E0: 02 1A C0                  → 7E8: 06 5A C0 ... (ReadDataByLocalIdentifier - cal ID)
7E0: 02 1A B4                  → 7E8: multi-frame 5A B4 ... (ReadDataByLocalIdentifier - part number)
```
**KEY: HP Tuners uses legacy service 0x1A (ReadDataByLocalIdentifier) — NOT 0x22**

## Phase 3: DTC/Freeze Frame (0x7DF functional)
```
7DF: 01 03                     → 7E8: 02 43 00  (no DTCs)
7DF: 01 07                     → 7E8: 02 47 00  (no pending DTCs)
7DF: 01 0A                     → 7E8: 02 4A 00  (no permanent DTCs)
```

## Phase 4: Mode 02 Freeze Frame Bitmask (0x7DF functional)
```
7DF: 03 02 00  → 7E8: 07 42 00 00 58 79 00 03
7DF: 03 02 20  → 7E8: 07 42 20 00 00 03 A0 01
7DF: 03 02 40  → 7E8: 07 42 40 00 44 C0 80 1D
7DF: 03 02 60  → 7E8: 07 42 60 00 E9 E9 83 41
7DF: 03 02 80  → 7E8: 07 42 80 00 28 32 01 00
7DF: 03 02 02  → 7E8: 05 42 02 00 00 00
```

## Phase 5: Physical Mode 01 Bitmask (0x7E0 physical)
```
7E0: 02 01 00  → 7E8: 06 41 00 98 79 00 13  ✅ WORKS on physical too
7E2: 02 01 00  → 7EA: 06 41 00 80 00 00 05  (TCM)
7E6: 02 01 00  → 7EE: 06 41 00 00 00 00 01  (other module)
```

## Phase 6: Probe Mode 22/23/AA — ALL FAIL with NRC 0x31
```
7E0: 03 22 01 00  → 7E8: 03 7F 22 31  (requestOutOfRange)
7E0: 07 23 00 00 00 00 00 01  → 7E8: 03 7F 23 31  (requestOutOfRange)
7E0: 03 AA 04 00  → 7E8: 03 7F AA 31  (requestOutOfRange)
7E2: 03 22 01 00  → 7EA: 03 7F 22 31  (requestOutOfRange)
7E2: 07 23 00 00 00 00 00 01  → 7EA: 03 7F 23 31  (requestOutOfRange)
7E2: 03 AA 04 00  → 7EA: 03 7F AA 31  (requestOutOfRange)
```
**KEY: Direct Mode 22 DID 0x0100 gets NRC 0x31 — but this is a probe for "supported DIDs" bitmask, not actual data reads**

## Phase 7: DDDI Setup (0x2D/0x2C) — ~6 second gap before this
```
7E0: [multi-frame] 2D FE 00 40 02 21 58 04  → 7E8: 03 6D FE 00  (Define DID 0xFE00 by memory address)
7E0: [multi-frame] 2C FE FE 00 00 10 30 35  → 7E8: 02 6C FE     (Define DID 0xFE by source DID)
... (6 more DDDI pairs)
7E0: [multi-frame] AA 04 FE FD FC FB FA F9 F8 F7  → (ReadDID periodic scheduler setup)
```

## Phase 8: TesterPresent + Mode 22 Reads — ALL SUCCEED
```
7E0: 01 3E                     → (TesterPresent, no response expected with suppressPosRsp)
7E0: 03 22 00 71  → 7E8: 10 09 62 00 71 ...  ✅ NOx Concentration (multi-frame)
7E0: 03 22 00 6A  → 7E8: 10 08 62 00 6A ...  ✅ Exhaust Gas Pressure
7E0: 03 22 00 5D  → 7E8: 05 62 00 5D 68 6F   ✅ Injection Timing
7E0: 03 22 00 62  → 7E8: 04 62 00 62 88       ✅ Actual Torque %
7E0: 03 22 30 C1  → 7E8: 05 62 30 C1 5B 32   ✅ FRP Actual
7E0: 03 22 30 BC  → 7E8: 05 62 30 BC 5B 32   ✅ FRP Desired
... (all 25+ DIDs respond)
```

## Phase 9: Interleaved 0x23 ReadMemoryByAddress + Mode 22
After each Mode 22 read, HP Tuners also sends:
```
7E0: 07 23 40 01 15 44 00 04  → 7E8: multi-frame 63 response  (ReadMemoryByAddress)
```
These read the DDDI-defined memory regions for composite data.

## CRITICAL FINDING
HP Tuners does NOT send DiagnosticSessionControl (0x10 0x03) before Mode 22 reads.
The DDDI setup (0x2D/0x2C) appears to implicitly enable Mode 22 access.
Without DDDI, direct Mode 22 reads may or may not work depending on the DID.

**The first Mode 22 read (DID 0x0071) succeeds IMMEDIATELY after DDDI + TesterPresent.**
**Our datalogger sends 0x10 0x03 (extended session) instead of DDDI — this might be the wrong approach for the 2019 OS.**
