# AlphaOBD & FORScan Feature Research — Implementation Plan

## AlphaOBD Key Features (Stellantis/FCA Focus)

### 1. Active Diagnostics & Service Procedures
- **DPF Regeneration** — Force stationary desoot / moving regen via UDS RoutineControl ($31)
  - "DPF Regeneration Enabling" = moving regen (drive at highway speed)
  - "Stationary Desoot" = parked regen (45-60 min, exhaust temps 1100°F+)
  - Monitors soot load %, exhaust temps, coolant temp during regen
- **Service Light Reset** — Oil change, maintenance reminders via WriteDataByIdentifier ($2E)
- **ABS Bleed** — Opens ABS solenoid valves via RoutineControl ($31) for proper brake bleeding
- **Air Suspension Maintenance** — Calibration, leveling procedures
- **Transmission Calibration** — Adaptive value reset, valve body relearn, quicklearn
- **Throttle Body Alignment** — Reset idle positions after cleaning/replacement

### 2. Module Coding / Configuration
- **Proxy Alignment** — Writes vehicle configuration to BCM, syncs all modules
  - Tells every module what equipment the vehicle has
  - Required after BCM replacement or adding new equipment
- **Body Computer Configuration** — Enable/disable features:
  - DRL behavior, auto-lock settings, horn honk on lock
  - Mirror fold on lock, ambient lighting, puddle lights
  - Speed-dependent door locks, seatbelt chime behavior
- **Sales Code Modification** — Activate dealer-installed options
- **Maximum Speed Limiter** — Adjust from factory 105 to custom value
- **Tire Size Adjustment** — Correct speedometer for different tire sizes

### 3. Key Programming
- **Electronic Key Programming** — Learn new key fobs via UDS SecurityAccess ($27) + RoutineControl ($31)
- **RF Remote Control Programming** — Pair new remotes
- **PIN extraction** — Read immobilizer PIN for key programming

### 4. TPMS
- **TPMS Sensor Relearn** — Program new sensor IDs into BCM
- **Pressure Threshold Adjustment** — Change low-pressure warning thresholds
- **TPMS Enable/Disable** — Toggle TPMS system on/off

### 5. Injector Coding
- **Injector Classification** — Write injector trim codes after replacement
- **IMA (Injector Metering Adjustment)** — Fine-tune injector delivery

---

## FORScan Key Features (Ford Focus)

### 1. As-Built Data Modification
- **Module Configuration via Hex Blocks** — Read/write raw configuration data
  - Each module has blocks of hex data controlling features
  - Community spreadsheets decode what each bit controls
  - Backup before modify, write new values, verify
- **Supported Modules (150+ types):**
  - PCM (Powertrain), TCM (Transmission), BCM (Body Control)
  - ABS, IPC (Instrument Panel), APIM (Sync/Audio)
  - PSCM (Power Steering), SCCM (Steering Column)
  - RCM (Restraint/Airbag), PAM (Park Assist)
  - IPMA (Camera), FDSM (Front Distance Sensing)
  - GWM (Gateway), BECM (Battery Energy), DCDC (DC-DC Converter)
  - And 130+ more...

### 2. Service Procedures
- **DPF Regeneration** — Forced static regen via RoutineControl ($31)
  - Also: Enable operator-commanded regen from dash button
  - DPF soot load display on instrument cluster
- **ABS Bleed** — Open/close ABS valves for proper bleeding
- **TPMS Relearn** — Sensor ID programming
- **Injector Coding** — Write injector trim codes (IQA codes on diesels)
- **DTC Reset** — Clear codes from all modules simultaneously
- **Battery Management Reset** — BMS reset after battery replacement

### 3. Output Control / Bidirectional Controls
- **Actuator Testing** — Command individual outputs:
  - Fuel injectors (fire individually)
  - Solenoids (VGT, wastegate, EGR)
  - Relays (fuel pump, glow plugs, cooling fan)
  - Motors (throttle body, idle air control)
  - Lights (individual bulb testing)
  - HVAC (blend doors, blower motor)
- **IO Control by Identifier ($2F)** — Override sensor inputs for testing

### 4. Module Programming
- **Flash Programming** — Update module firmware (with proper calibration files)
- **As-Built Write** — Write configuration blocks to modules
- **Module Reset** — Soft-reset individual modules
- **Adaptive Value Reset** — Clear learned values (fuel trims, transmission shifts)

---

## Features We Can Implement in Our Tool

### Tier 1 — Direct Implementation (UDS Protocol, No Proprietary Keys)

| Feature | UDS Service | Implementation |
|---------|-------------|----------------|
| DTC Read (all modules) | $19 ReadDTCInformation | Scan all known module addresses |
| DTC Clear (all modules) | $14 ClearDTCInformation | Clear per-module or all |
| Live Data (multi-module) | $22 ReadDataByIdentifier | Read DIDs from any module |
| Freeze Frame Data | $19 sub-function 04 | Read DTC snapshot records |
| Module Identification | $22 DID F1xx | Read part numbers, SW versions |
| ECU Reset | $11 ECUReset | Soft/hard reset modules |
| Session Control | $10 DiagnosticSessionControl | Switch default/extended/programming |
| Output Control / Actuator Test | $2F InputOutputControlByIdentifier | Command actuators directly |
| Routine Control | $31 RoutineControl | Start/stop/get results of routines |
| Adaptive Value Reset | $2E WriteDataByIdentifier | Clear learned values |

### Tier 2 — Requires Security Access (Seed/Key per manufacturer)

| Feature | UDS Service | Notes |
|---------|-------------|-------|
| DPF Forced Regen | $31 + $27 | Routine ID varies by manufacturer |
| Injector Coding | $2E + $27 | Write IQA/trim codes |
| TPMS Sensor Learn | $2E + $27 | Write sensor IDs to BCM |
| Key Programming | $27 + $31 | High security level required |
| VIN Write | $2E + $27 | Level 3 security typically |
| As-Built Data Write | $2E + $27 | Module configuration blocks |
| Speed Limiter Adjust | $2E + $27 | Write to PCM configuration |
| Service Reset | $2E + $27 | Oil life, maintenance counters |

### Tier 3 — Community Knowledge Required

| Feature | Notes |
|---------|-------|
| Proxy Alignment | Need module address map + config format per vehicle |
| BCM Feature Coding | Need bit-level decode of config blocks (community spreadsheets) |
| As-Built Spreadsheets | Need to build/import decode databases |
| Flash Programming | Need calibration file format + transfer protocol |

---

## Architecture for Implementation

### Module Scanner
1. Scan all standard module addresses (0x700-0x7FF range)
2. For each responding module, read identification DIDs (F187, F188, F189, F18A, F190, F191, F193, F195)
3. Build module map: address → name, part number, SW version, HW version
4. Store as vehicle profile for future reference

### Service Procedure Engine
1. Define procedures as JSON/TS sequences of UDS operations
2. Each step: session control → security access → operation → verify → next step
3. UI shows step-by-step wizard with real-time feedback
4. Procedures are manufacturer/model specific, loaded from database

### As-Built Data Manager
1. Read raw configuration blocks from each module
2. Display as hex editor with bit-level decode overlay
3. Allow modification with validation
4. Write back with proper session/security
5. Backup/restore capability

### Output Control Panel
1. List available IO controls per module (from DID database)
2. Toggle/slider UI for each controllable output
3. Real-time feedback showing actual vs commanded state
4. Safety timeout — auto-revert after configurable period
