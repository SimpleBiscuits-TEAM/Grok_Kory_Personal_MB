# Ford & RAM As-Built Coding Research — Fuel Tank & Tire Size

## Ford IPC (Instrument Panel Cluster) — Module 720

### As-Built Data Structure
- Module address: 0x720 (IPC)
- Data organized in blocks: 720-01-01, 720-01-02, 720-01-03, 720-01-04, 720-02-01, 720-02-02
- Each block is 3 words (6 bytes) of hex data
- Individual bits control specific features
- Last byte of each block is a CHECKSUM (auto-calculated)

### Fuel Tank Capacity (720-01-01)
- Located in first 12 bits of block 720-01-01
- The fuel tank capacity, in liters, multiplied by 10
- Example: 0x2101 = binary 0010 0001 0000 0001 → value depends on bit layout
- For C-Max: value 0x210 = 528 → 52.8 liters ≈ 13.95 gallons
- For Super Duty: different values per tank size
  - 34 gal = 128.7L → 0x507 (1287 decimal)
  - 48 gal = 181.7L → 0x719 (1817 decimal)  
  - 60 gal = 227.1L → 0x8DB (2267 decimal)
- Note: 2023+ Super Duty firmware limits DTE calculation to 48 gallons max
- Fuel gauge still works correctly with larger values

### Tire Size / Speedometer Correction
- Multiple locations depending on model year:
  - IPC (720): tire circumference for display
  - PCM (7E0): tire revolutions per mile for fuel/speed calculations
  - ABS (760): wheel speed calibration
  - TPMS/RTM: tire pressure thresholds
- For 2017-2019 Super Duty: IPC block 720-01-02 or 720-01-03
- For 2020-2022 Super Duty: Similar structure
- For 2023+ Super Duty: Different block layout, community still mapping

### Key Ford Module Addresses
| Module | Address | Name | Function |
|--------|---------|------|----------|
| PCM | 0x7E0 | Powertrain Control Module | Engine/trans calibration |
| IPC | 0x720 | Instrument Panel Cluster | Gauges, DTE, speedometer |
| ABS | 0x760 | Anti-Lock Brake System | Wheel speed, stability |
| BCM | 0x726 | Body Control Module | Lighting, locks, features |
| TCM | 0x7E1 | Transmission Control Module | Shift strategy |
| APIM | 0x7D0 | Accessory Protocol Interface | Sync/infotainment |
| PSCM | 0x730 | Power Steering Control | EPS calibration |
| RCM | 0x737 | Restraint Control Module | Airbags |
| GWM | 0x716 | Gateway Module | CAN bus routing |
| RTM | 0x750 | Tire Pressure Monitor | TPMS sensors |

### Ford As-Built Read/Write Protocol
1. Enter Extended Diagnostic Session ($10 03)
2. Security Access ($27) — may not be required for read
3. Read As-Built: ReadDataByIdentifier ($22) with DID DE00-DEFF (block format)
   - DID DE01 = Block 01-01
   - DID DE02 = Block 01-02
   - etc.
4. Write As-Built: WriteDataByIdentifier ($2E) with same DIDs
5. ECU Reset ($11 01) after writing

### FORScan As-Built Format
- Blocks displayed as: `720-01-01  XXXX XXXX XXXX`
- 3 words per block, each word is 4 hex chars (16 bits)
- Checksum is last byte of last word in each row
- FORScan auto-calculates checksum on write

---

## RAM / Stellantis (AlphaOBD) — BCM/PCM Configuration

### Fuel Tank Size (RAM Diesel)
- Stored in BCM (Body Control Module) configuration
- AlphaOBD: BCM → Configuration → Vehicle Configuration
- DID varies by model year:
  - 2013-2018 RAM: BCM configuration parameter
  - 2019+ RAM: May require proxy alignment after change
- Values are typically in liters or gallons depending on market

### Tire Size (RAM)
- Stored in PCM and BCM
- AlphaOBD: PCM → Adaptation → Tire Size
- Also affects: speedometer, ABS, TPMS thresholds
- Common adjustments:
  - Tire circumference (mm)
  - Tire revolutions per km/mile
  - Axle ratio correction

### RAM Module Addresses (CAN)
| Module | Address | Name |
|--------|---------|------|
| ECM | 0x7E0 | Engine Control Module (Cummins) |
| TCM | 0x7E1 | Transmission Control Module |
| ABS | 0x7E2 | Anti-Lock Brake System |
| BCM | 0x740 | Body Control Module |
| IPC | 0x720 | Instrument Panel Cluster |
| TIPM | 0x742 | Totally Integrated Power Module |
| RFH | 0x744 | Radio/Head Unit |
| HVAC | 0x746 | Climate Control |
| SGW | 0x748 | Security Gateway (2018+) |

### RAM Proxy Alignment
- Required after changing BCM configuration
- Syncs all modules to BCM's vehicle configuration
- AlphaOBD: BCM → Service → Proxy Alignment
- Process: BCM writes config to each module via CAN
- 2018+ requires SGW bypass for third-party tools

---

## GM Duramax — PCM Configuration

### Fuel Tank Size (GM)
- Stored in PCM calibration (not easily user-changeable)
- HP Tuners / EFILive can modify in calibration file
- Not typically done via UDS — requires cal file edit + reflash
- Some models: IPC DID for display-only tank size

### Tire Size (GM)
- HP Tuners: PCM → Speedometer → Tire Size (revs/mile)
- Also: Final Drive Ratio, Transmission Ratio corrections
- UDS approach: Limited — GM locks PCM config behind security

---

## Implementation Strategy

### Phase 1: Ford Fuel Tank + Tire Size (highest priority)
1. Read IPC (720) as-built blocks via ReadDataByIdentifier
2. Decode fuel tank capacity from block 720-01-01 (first 12 bits × 0.1 = liters)
3. Display current value in gallons
4. Allow user to enter new tank size in gallons
5. Calculate new hex value, update checksum
6. Write back via WriteDataByIdentifier
7. Same flow for tire size in appropriate block

### Phase 2: RAM Fuel Tank + Tire Size
1. Read BCM (740) configuration via ReadDataByIdentifier
2. Decode fuel tank and tire size parameters
3. Display current values with human-readable labels
4. Allow modification with validation
5. Write back + trigger proxy alignment if needed

### Phase 3: GM (limited — mostly cal file based)
1. Read PCM identification and current config where possible
2. Display what we can read
3. Note that full modification requires HP Tuners/EFILive cal edit
