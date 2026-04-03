# Short Flash Analysis — 2018 L5P E41 (VOP3 Device)

## PuTTY Log Key Findings

### Device Info
- Serial: 60001012
- Firmware: 25817-2g008a
- Hardware: 53
- Brand: PPEI
- VIN: 1GT12UEY2JF273430

### ECU Identification (from FID response)
- Controller type: ecu
- SW1: 12709844 (matches container)
- SW2: 12688366
- SW3: 12688360
- SW4: 12688384
- SW5: 12712835
- SW6: 12712823
- Boot: 21836
- **Seed: 888437048070** (decimal — this is the seed value!)
- GMHW: 55499085

### Seed Value Conversion
- Decimal from PuTTY FID: 888437048070 → Hex: 0xCEE8B3F306
- BUT actual CAN seed from BUSMASTER: CE DA F9 83 06 (different!)
- PuTTY FID seed field may be from a different read or different format
- Bench ECU seed: A0 9A 34 9B 06 (different ECU)

### ACTUAL Seed/Key from BUSMASTER (TRUCK):
- Seed: CE DA F9 83 06 (5 bytes) — STATIC, same both times
- Key:  59 2E F4 0F 33 (5 bytes) — ACCEPTED
- This is the TRUCK's seed/key pair

### Bench ECU Seed/Key (from earlier logs):
- Seed: A0 9A 34 9B 06
- Key:  AF 72 2A 51 7E

### Both ECUs have STATIC seeds (HPTuners unlocked)
- Each ECU has its own fixed seed and corresponding fixed key
- The key is deterministic for a given seed (AES-based)

### Flash Sequence (from VOP3 device)
1. Read ID on 0x7DF (functional) → connection established
2. Read ID on 0x7E0 (physical ECU)
3. Read ID on 0x7E2 (TCM?)
4. E41-Patch(34) ENABLED(6) — firmware patch applied
5. "Switching Boot-Mode"
6. "Prepare Memory..."
7. Programming Block 1/5 through 5/5 (5 blocks for short/cal flash)
8. "Resetting Controller"
9. Progress 0-99% reported
10. Stack smashing protect failure → device reboots (known firmware bug)
11. After reboot: "Flashing done...wait alive"
12. Reads FID again to verify

### Key Observations
- **6 blocks** for short/cal flash (from BUSMASTER: 6 RequestDownload commands)
- **Stack smashing** at end — device crashes after flash completes but flash itself succeeded
- **Seed is STATIC** — same seed both times it was requested (CE DA F9 83 06)
- **E41-Patch(34)** — firmware has a specific E41 patch enabled
- **No key cycle** during short flash — just straight through
- **Progress 0-99** with ~1% per update
- **BLE connection** used (disconnects at end)
- **0xAE 0x28 0x80** command sent after last TransferData (unknown — possibly ECU reset or finalize)
- **Functional broadcast sequence** same as full flash: ReturnToNormal → ReadB0 → DiagSession → DisableComm → ProgrammedState → ProgrammingMode
- **TesterPresent on 0x101** during programming (functional keepalive)
- **First RequestDownload** gets NRC 0x78 (ResponsePending) then positive — ECU erasing flash
- **Total flash time**: ~2 minutes (10:16:37 to 10:18:45) — much faster than full flash

### Bank Files (from 9844Banks.zip)
- Each bank is 5,898,192 bytes (~5.6 MB)
- Available: STOCK, 30hp, 45hp, 80hp, 125hp, 145hp
- These are the calibration-only files for short flash
