/**
 * Knox's Knowledge Base — SANITIZED VERSION (client-safe)
 * ==========================================================
 * This file contains ONLY non-sensitive technical reference information.
 * All seed/key secrets, algorithm details, and proprietary RE knowledge
 * have been moved to server/lib/knoxKnowledgeServer.ts (server-only).
 *
 * DO NOT add any secret material to this file.
 * It is in /shared/ and gets bundled into the client JavaScript.
 *
 * For the full knowledge base with secrets, use:
 *   import { getFullKnoxKnowledge } from '../lib/knoxKnowledgeServer';
 */

export const KNOX_KNOWLEDGE_BASE_SANITIZED = `
## OEM Control Strategy Knowledge (from Bosch P654 / EDC17 / MG1 documentation)

### Diesel Torque Path
Driver Demand (pedal %) → Torque Request (Nm) → Torque Coordinator → Smoke Limiter (caps IQ based on available air) → Injection Quantity (mg/stroke) → Injector Pulsewidth (μs).
The smoke limiter is the #1 reason a tune feels "flat" at low RPM — if boost hasn't built yet, the smoke map caps fueling regardless of what the driver demand table says.

### Key Map Relationships (EDC17/MG1 architecture)
1. **Driver's Wish maps** (6-8 maps): Pedal % × RPM → Torque request. Multiple maps for different modes (eco, sport, tow).
2. **Torque-to-IQ maps** (2 maps): Torque (Nm) × RPM → Injection Quantity (mg/stroke). This is where torque becomes fuel.
3. **Smoke Limiter maps** (2 maps): Air mass × RPM → Max IQ. Prevents black smoke by capping fuel based on available air.
4. **SOI maps** (6 maps): Start of Injection timing (°BTDC) × RPM × load. Multiple maps for different conditions.
5. **Rail Pressure maps** (4 maps): Target rail pressure × RPM × IQ. Higher pressure = better atomization = more power but more stress on CP4.
6. **Boost/N75 maps** (5-8 maps): VGT duty cycle or wastegate position × RPM × load. Controls turbo response.
7. **Boost Limiter**: Absolute maximum boost cap. Safety net.
8. **EGR maps** (5 maps): EGR valve position × RPM × load. Reduces NOx but costs power.
9. **DPF Regen maps** (3 maps): Control regen fuel injection, timing, and duration.

### Boost Control (LDRPID — Boost PID Controller)
- Open-loop base duty cycle map + closed-loop PID correction
- P, I, D gains are separate maps indexed by RPM and boost error
- Trajectory calculator sets charger speed targets for smooth boost build
- Anti-surge: disturbance controller monitors crankshaft speed oscillation

### Engine Protection Systems
- **Overspeed**: Hard RPM cut (fuel cut, not spark cut on diesel)
- **Overheating**: Progressive torque reduction based on coolant temp
- **Turbo Protection**: Low oil pressure → VGT moves to safe (open) position
- **Rail Pressure Protection**: If actual rail pressure exceeds limit, PCV duty reduced immediately
- **DPF Overtemp**: If exhaust temp exceeds threshold during regen, regen aborted

### NOx Raw Emission Model (from exhmod_rawnoxmdl)
The ECM predicts engine-out NOx using this algorithm:
1. Base NOx = f(RPM, fuel quantity) from ExhMod_ratNoxBas_MAP
2. Corrections (all multiplicative):
   - Injection timing correction: ExhMod_facNoxInjCorrn
   - EGR rate correction: ExhMod_facNoxEGRCorrn
   - Boost pressure correction: ExhMod_facNoxBstCorrn
   - Coolant temp correction: ExhMod_facNoxColtCorrn
   - Humidity correction: ExhMod_facNoxHumCorrn
   - Altitude correction: ExhMod_facNoxEnvPCorrn
   - Injection fuel ratio: ExhMod_facNoxInjFuRat
3. Post-processing: PT1 filter + dead time for exhaust transport delay
4. Output: Predicted NOx rate (compare vs actual NOx sensor for diagnostics)

### DPF Regeneration States (PID 0x303E)
- 0: No Regen Needed
- 1: Fuel Consumption Based
- 2: Operating Time Based
- 3: Distance Based
- 4: Soot Model Based (normal)
- 5: Service Regen (dealer-initiated)
- 6: Forced Regen (emergency)
Too-frequent regens = soot model miscalibration, fuel dilution, or injector issues.

### Duramax Transmission Identification (CRITICAL — year-specific)
- **2001-2005 (LB7, early LLY)**: Allison 1000 5-speed (AL5) — 5 forward gears, hydraulic torque converter
- **2006-2019 (late LLY, LBZ, LMM, LML, LGH, L5P Gen1)**: Allison 1000 6-speed — 6 forward gears
- **2020+ (L5P Gen2)**: GM/Allison 10L1000 10-speed — 10 forward gears
- NEVER reference 10L1000 for pre-2020 trucks. NEVER reference 6-speed for 2001-2005.

### Duramax High-Pressure Fuel Pump Identification (CRITICAL — year-specific)
- **2001-2004 (LB7)**: Bosch CP3.3 — single-piston, gear-driven off front of engine
- **2004.5-2010 (LLY, LBZ, LMM)**: Bosch CP3 — improved version, same basic design
- **2011-2016 (LML, LGH)**: Bosch CP4.2 — two pumping chambers, dual-pulse rail pressure signature, known failure-prone
- **2017+ (L5P)**: Denso HP4 — high-pressure pump, only on L5P platform
- NEVER reference HP4 for pre-2017 trucks. NEVER reference CP4 for LB7/LLY/LBZ/LMM.

### PCV (Pressure Control Valve) / Fuel Pressure Regulator (CRITICAL)
- PCV controls rail pressure by regulating fuel bypass on the CP3/CP4/HP4 pump
- PCV is measured in **milliamps (mA)**, NOT percentage or duty cycle
- If a datalog shows PCV values >100, it is mA, not percent
- **Higher mA = more fuel bypass = LESS rail pressure** (valve opens more, dumps fuel back to tank)
- **Lower mA = less fuel bypass = MORE rail pressure** (valve closes, forces more fuel to rail)
- At ~400mA: pump is supplying roughly 97% of available fuel to the rail
- Fuel path: Fuel tank → Lift pump (if equipped) → CP3/CP4/HP4 → PCV regulates → Common rail → Injectors
- PCV at max mA with low rail pressure = fuel supply issue (lift pump, filter, air leak)
- PCV at min mA with high rail pressure = normal high-load operation
- PCV oscillating wildly = air in fuel, failing lift pump, or clogged filter

### LB7 Specific (2001-2004)
- CP3.3 high pressure fuel pump
- Allison 1000 5-speed (AL5) transmission
- No vane position sensor, no EGT sensors from factory
- OEM MAP sensor has limited reading range
- Solenoid injectors (not piezo) — failure-prone, common replacement item
- No DPF, no SCR, no DEF — pre-emissions era

### LML/LGH Specific (2011-2016)
- CP4.2 high pressure fuel pump — two pumping chambers, dual-pulse rail pressure signature
- Piezoelectric injectors with 9th injector for DPF regen fuel spray
- SCR NOx reduction target: 70-80% (sensor 1 to sensor 2)
- IQA codes: Injector Quantity Adjustment — per-injector flow calibration values
- Aftertreatment order: DOC → SCR → DPF → PM sensor
- Allison 1000 6-speed transmission

### L5P Specific (2017+)
- 2017-2019: Denso HP4 fuel pump, Allison 1000 6-speed
- 2020+: Denso HP4 fuel pump, GM/Allison 10L1000 10-speed
- Piezoelectric injectors
- Full emissions: DPF + SCR + DEF

## E42 (2024 L5P Gen2) A2L Knowledge
- 50,636 calibration maps, 2,575 scaling formulas, 2,668 shared axes
- Zero MEASUREMENT blocks (no XCP/CCP live reads — use UDS Mode 22 instead)
- 1,683 UDS DID entries for freeze frame / live data
- Extended CAN IDs (29-bit): Physical RX = 0x14DA11F1, Functional = 0x10DB7EF1
- ELM327 needs ATSP 6 (ISO 15765-4 CAN 29-bit 500kbps)
- Address range: 0x500000 - 0xBBF000, maps directly into binary (base address = 0)
- Key subsystems: FHPC (fuel/rail), CHGR (boost/VGT), EGTC/SOTC (exhaust temps), TCCM (torque converter), ETQC (torque management)

## Advanced Logger PIDs (from P654 Mode 22 table)
These PIDs are available via Mode $22 WITHOUT security access:

### Per-Cylinder Health (UNIQUE — no consumer tool has this)
- 0x162F-0x1636: Cylinder Balance Rate 1-8 (mm³/st, E=N/64-512)
  >5% deviation from mean = injector wear, >10% = failing injector
- 0x20AC-0x20B3: Total Injection Time per cylinder
- 0x20B4-0x20BB: Start of Main Injection per cylinder

### Turbo Health
- 0x1689: VGT Open Learned Offset (increasing = vane wear/carbon)
- 0x168A: VGT Close Learned Offset
- 0x1540: VGT Desired Position
- 0x1543: VGT Actual Position
- 0x2041: VGT Duty Cycle

### DPF/Emissions
- 0x303E: Regen Demand/Completion Status (decoded enum)
- 0x3337: DPF Delta Pressure (soot load)
- 0x3311: SCR Service status
- 0x331B: SCR Fluid (DEF level/quality)
- 0x331C: SCR Average efficiency
- 0x334B: NH3 Load in SCR catalyst

### Performance
- 0x1A2D: Engine Actual Steady State Torque (Nm, E=N*0.25)
- 0x1638: Fuel Rate
- 0x2300-0x2303: Humidity sensor data (for SAE-corrected power)
- 0x208A: Extended Range MAP (high-boost reading)

## Security Access Knowledge

### Security Access Overview
Security access (UDS Service $27) is required for write operations, flash programming, and certain diagnostic functions.
Security levels vary by platform. Seed/key computation is handled server-side for all supported ECU families.
Supported platforms: GM Global B, Ford MG1/EDC17, Cummins CM2350/CM2450, CAN-am/BRP, Polaris, Ford TCU 10R80.

**Note:** All seed/key algorithms and secret material are stored server-side only.
Use the Knox API to perform security access computations — secrets are never exposed to the client.

## CAN-am DESS Key System
- D.E.S.S. = Digitally Encoded Security System
- RFID chip in key (13.56 MHz NFC) + magnet for hall effect switch
- ECM stores up to 8 key codes
- Key types: Normal (yellow/black), Learning (green, 25mph limit)
- ECU types: Bosch MED17.8.5 (older), MG1CA920 (newer 2020+)
- CAN bus: 500kbps, typically 11-bit standard addressing
- ECM typically at 0x7E0/0x7E8

### VIN Change Sequence (UDS)
1. $10 03 — Extended Diagnostic Session
2. $27 03 — SecurityAccess Request Seed (16-bit)
3. Compute key using CAN-am algorithm
4. $27 04 + key — SecurityAccess Send Key
5. $2E F190 + VIN bytes — WriteDataByIdentifier (VIN)
6. $11 01 — ECUReset
7. Re-learn DESS keys after VIN change

### DESS Key Learn Sequence (UDS)
1. $10 03 — Extended Diagnostic Session
2. $27 03/04 — SecurityAccess
3. Place DESS key on RF post
4. $31 01 xxxx — RoutineControl Start (key learn)
5. Wait for completion
6. $31 03 xxxx — RoutineControl Get Result

### BuDS Megatech ECM Coding
Logistic Programming Bytes control vehicle configuration:
- Byte 0: Vehicle type, Byte 1: Platform, Byte 2: Engine, Byte 3: Variant
- Byte 4-7: Model number (MSB to LSB)
- Bit flags: Supercharger, iS, iBR, CLU/Inter, fuel tank config, SPORT BALLAST
- Bit flags: CRUISE+SLOW SPEED, SkiMODE, Fuel Autonomy, TopAvr, Altitude, VTS Switch

## UDS Service Reference (for advanced logger operations)
| Service | ID | Description | Security Required |
|---------|-----|-------------|-------------------|
| DiagnosticSessionControl | $10 | Switch session (01=default, 03=extended, 02=programming) | No |
| ECUReset | $11 | Reset ECU (01=hard, 02=key-off-on, 03=soft) | Level 1+ |
| ReadDataByIdentifier | $22 | Read DID value (live data, config) | No (most DIDs) |
| SecurityAccess | $27 | Seed/key authentication | N/A |
| WriteDataByIdentifier | $2E | Write DID value (VIN, config, coding) | Level 3-5 |
| IOControlByIdentifier | $2F | Control outputs (forced regen, actuator test) | Level 1-3 |
| RoutineControl | $31 | Start/stop/get result of routines (TPMS learn, key learn) | Level 1-3 |
| RequestDownload | $34 | Begin flash download | Level 5 |
| TransferData | $36 | Send flash data blocks | Level 5 |
| RequestTransferExit | $37 | End flash transfer | Level 5 |
| ReadMemoryByAddress | $23 | Read arbitrary ECU memory (calibration verification) | Level 3-5 |
| ClearDiagnosticInformation | $14 | Clear DTCs | Level 1 |
| ReadDTCInformation | $19 | Read DTCs with status, freeze frame, snapshot | No |

## Standard UDS DIDs
| DID | Description |
|-----|-------------|
| F186 | Active Diagnostic Session |
| F187 | Vehicle Manufacturer Spare Part Number |
| F188 | Vehicle Manufacturer ECU Software Number |
| F189 | Vehicle Manufacturer ECU Software Version |
| F18A | System Supplier Identifier |
| F18B | ECU Manufacturing Date |
| F18C | ECU Serial Number |
| F190 | VIN (Vehicle Identification Number) |
| F191 | Vehicle Manufacturer ECU Hardware Number |
| F192 | System Supplier ECU Hardware Number |
| F193 | System Supplier ECU Hardware Version |
| F194 | System Supplier ECU Software Number |
| F195 | System Supplier ECU Software Version |

## CAN Bus Analysis Tool Knowledge

### Vehicle Spy (Intrepid Control Systems)
Vehicle Spy is the gold standard for professional CAN bus analysis. Key concepts:
- **Message Editor**: Define CAN messages with arbitration IDs, signal definitions (start bit, length, byte order, scaling, offset, min/max, units). Messages can be periodic (cyclic) or event-triggered.
- **Signal Decoding**: Uses DBC-style signal definitions. Big-endian (Motorola) vs little-endian (Intel) byte order matters — getting this wrong flips the decoded value. Most automotive CAN uses Motorola byte order.
- **Transmit Messages**: Can craft and send arbitrary CAN frames. Supports scripting via Function Blocks (visual programming) or C-like scripts for automated test sequences.
- **Filters/Triggers**: Hardware-level message filtering by arb ID range. Triggers can start/stop capture on specific conditions (message received, signal value threshold, time elapsed).
- **J1939 Support**: Built-in J1939 PGN/SPN database for heavy-duty diesel. Decodes transport protocol (TP.CM/TP.DT) for multi-frame messages automatically.
- **Scripting**: Function Blocks allow complex automation — send a UDS request, wait for response, branch on NRC, retry with different parameters. Used heavily for production-line EOL testing.
- **neoVI hardware**: FIRE 3, RED 2, ION — multi-channel CAN/CAN-FD/LIN/Ethernet interfaces. Support hardware-accelerated filtering and timestamping.

### SavvyCAN (Open Source)
SavvyCAN is the go-to open-source CAN analyzer for reverse engineering:
- **DBC File Loading**: Import Vector DBC files to decode CAN signals. Can also create DBC definitions from scratch by observing byte patterns.
- **Frame Filtering**: Filter by arb ID, data pattern, direction. Color-code frames by module for visual identification.
- **Reverse Engineering Workflow**: 
  1. Capture baseline (engine off, ignition on)
  2. Capture with one input changed (e.g., turn steering wheel)
  3. Use "Sniffer" view to highlight bytes that changed between captures
  4. Identify which arb ID and byte position corresponds to the input
  5. Determine scaling by correlating byte values to known physical values
- **Graphing**: Plot any byte or decoded signal over time. Overlay multiple signals for correlation analysis.
- **Playback**: Record a CAN bus session and replay it frame-by-frame. Useful for debugging timing-sensitive issues.
- **Supported Hardware**: PCAN-USB, Kvaser, SocketCAN (Linux), LAWICEL, ELM327 (limited).

### CANape (Vector Informatik)
CANape is the industry-standard measurement and calibration tool:
- **A2L Integration**: Loads A2L files to define measurement and calibration variables. Maps A2L addresses to ECU memory for live read/write.
- **XCP/CCP Protocol**: Uses XCP (Universal Measurement and Calibration Protocol) or CCP for high-speed ECU access. XCP on CAN supports up to ~100 variables at 10ms sample rate.
- **Measurement**: Configure measurement lists (rasters) at different sample rates. DAQ (Data Acquisition) mode streams data from ECU without polling overhead.
- **Calibration**: Live-edit calibration values (scalars, curves, maps) while engine is running. Changes are written to ECU RAM via XCP and can be flashed to NVM.
- **Scripting**: CASL (CANape Scripting Language) for automation. Can automate measurement sequences, data export, and calibration procedures.
- **Diagnostic Integration**: CDD/ODX-based diagnostic access alongside measurement. Can read DTCs, freeze frames, and perform service procedures.

### CANoe (Vector Informatik)
CANoe is the premier network simulation and testing tool:
- **CAPL Scripting**: C-like programming language for CAN node simulation. Can simulate entire ECU networks — create virtual BCM, PCM, TCM nodes that respond to messages.
- **Simulation**: Build complete vehicle network simulations. Test ECU behavior by simulating all other nodes on the bus. Used for HIL (Hardware-in-the-Loop) testing.
- **Trace Analysis**: Capture and analyze CAN/CAN-FD/LIN/FlexRay/Ethernet traffic. Symbolic decoding via DBC/ARXML databases.
- **Diagnostic Tester**: Built-in UDS/KWP2000 diagnostic tester. Can script complete diagnostic sequences (session control → security access → read/write DIDs → routine control).
- **Panel Designer**: Create custom GUI panels with gauges, buttons, sliders that interact with CAN signals in real-time.
- **Replay**: Replay captured traces with timing preservation. Useful for reproducing intermittent issues.

### PCAN-View (PEAK-System)
PCAN-View is the basic CAN bus monitor that ships with PEAK hardware:
- **Trace View**: Real-time scrolling view of all CAN frames with timestamp, ID, DLC, data bytes.
- **Transmit List**: Define messages to send manually or periodically. Useful for quick UDS testing.
- **Statistics**: Per-ID message count, rate (Hz), bus load percentage.
- **Filters**: Accept/reject filters by arb ID range.
- **PCAN-Explorer**: Advanced version with signal decoding, scripting, and database support.
- **Hardware**: PCAN-USB, PCAN-USB Pro, PCAN-USB FD — reliable and affordable CAN interfaces. Our PCAN bridge uses python-can with PCAN hardware.

### BusMaster (Open Source)
BusMaster is an open-source alternative to Vehicle Spy:
- **J1939 Database**: Built-in J1939 PGN/SPN database for heavy-duty diesel applications.
- **Signal Database**: Create/import signal databases for message decoding.
- **Node Simulation**: Simulate CAN nodes with C-like scripting.
- **Logging**: Log to various formats (ASC, BLF, CSV) for offline analysis.

### AlphaOBD (Stellantis/FCA Specialist)
AlphaOBD is the go-to tool for Chrysler/Dodge/RAM/Jeep diagnostics:
- **Proxy Alignment**: Syncs all modules to BCM master configuration after module replacement. Critical for RAM trucks after BCM swap.
- **DPF Forced Regen**: Initiates stationary desoot cycle. Monitors soot load, EGT, and regen progress.
- **Injector Coding**: Write IMA (Injector Metering Adjustment) trim values to PCM. Required after injector replacement.
- **Body Coding**: Enable/disable features via BCM configuration bits — DRL brightness, auto-lock speed, mirror fold, ambient lighting, puddle lights.
- **TPMS Relearn**: Program sensor IDs to BCM after tire rotation or sensor replacement.
- **Key Fob Programming**: Add new key fobs to the immobilizer system.
- **Transmission Adaptive Reset**: Clear shift adaptive values in 68RFE/8HP/ZF transmissions.

### FORScan (Ford Specialist)
FORScan is the essential tool for Ford/Lincoln/Mercury diagnostics:
- **As-Built Data**: Read/write raw hex configuration blocks from every module. Each block is a 5-byte hex string with auto-calculated checksum.
- **As-Built Block Format**: "XXXX XXXX XX" where last byte is checksum. Example: "2120 6047 39" for IPC block 720-01-01.
- **Community Spreadsheets**: Crowd-sourced decode tables that map individual bits in as-built blocks to features. Example: IPC 720-01-01 bits 0-11 = fuel tank capacity in 0.1L units.
- **Module Coverage**: 150+ modules including PCM, BCM, ABS, IPC, APIM, TCM, PSCM, RCM, PAM, IPMA, GWM, SCCM, DACMC, DDM, PDM, OCSM, FCIM, ACM, GPSM.
- **Output Control**: Bidirectional actuator testing — fire individual injectors, command solenoids, test lights, cycle blend doors, activate horns, test wipers.
- **DPF Service**: Forced regen, soot load reset, ash accumulator reset, DPF mileage counter reset.
- **Module Flash**: Flash programming with Ford calibration files. Requires compatible ELM327 or J2534 adapter.

## Vehicle Coding Knowledge

### Ford Fuel Tank Size Coding
- Location: IPC (Instrument Panel Cluster) module, As-Built block 720-01-01
- DID: 0xDE00 (ReadDataByIdentifier)
- Encoding: First 12 bits of block = fuel tank capacity in 0.1 liter units
- Example: 0x1A0 = 416 decimal = 41.6 liters = 11.0 gallons (stock F-150 SWB)
- Example: 0x5E7 = 1511 decimal = 151.1 liters = 39.9 gallons (Super Duty SWB)
- Common aftermarket sizes: 50 gal (Titan), 60 gal (S&B/Titan), 65 gal (Titan XXL), 70-80 gal (Transfer Flow)
- After changing: DTE (Distance to Empty) recalculates immediately. Fuel gauge accuracy depends on sender compatibility.
- Dual sender bit: Block 720-01-01, byte 1, bit 3. Must be enabled for dual-sender aftermarket tanks.
- Checksum: Last byte of each as-built block is auto-calculated (sum of all preceding bytes mod 256).
- Security: Requires Extended Diagnostic Session ($10 03) + Security Access Level 1 ($27 01/02) for IPC write.

### Ford Tire Size / Speedometer Correction
- Location: IPC module, As-Built block 720-01-02
- Method: Change tire revolutions per mile value to match new tire size
- Stock LT275/70R18: 654 rev/mile, Stock LT275/65R20: 643 rev/mile
- 35" tire: ~601 rev/mile → speedometer reads ~8% high with stock calibration
- 37" tire: ~571 rev/mile → speedometer reads ~13% high with stock calibration
- Correction formula: (stock_revs / new_revs - 1) × 100 = % error
- Alternative: Some Ford trucks allow tire size selection in IPC settings menu (2017+ Super Duty)

### RAM Fuel Tank Size Coding
- Location: BCM (Body Control Module) via AlphaOBD or UDS
- DID: 0x0120 (manufacturer-specific)
- Encoding: 16-bit value = fuel tank capacity in 0.1 liter units
- Stock 2500/3500 SWB: 33 gal (124.9L), LWB: 52 gal (196.8L)
- Common aftermarket: 60 gal (Titan/S&B), 65 gal (Titan XXL), 70-80 gal (Transfer Flow)
- Security: Requires Extended Session + Security Access Level 3

### RAM Tire Size Correction
- Location: PCM (Powertrain Control Module)
- DID: 0x0121 (tire circumference in mm), 0x0122 (revolutions per km)
- Also affects: ABS module (wheel speed calculation), Transmission (shift points based on vehicle speed)
- After changing: Must also update ABS module tire size to prevent false ABS/traction control activation

## Module Address Reference

### Ford Module Addresses (CAN bus)
| Module | Tx ID | Rx ID | Description |
|--------|-------|-------|-------------|
| PCM | 0x7E0 | 0x7E8 | Powertrain Control Module |
| TCM | 0x7E1 | 0x7E9 | Transmission Control Module |
| ABS | 0x760 | 0x768 | Anti-lock Brake System |
| IPC | 0x720 | 0x728 | Instrument Panel Cluster |
| BCM | 0x726 | 0x72E | Body Control Module |
| APIM | 0x7D0 | 0x7D8 | Accessory Protocol Interface Module (SYNC) |
| PSCM | 0x730 | 0x738 | Power Steering Control Module |
| ACM | 0x740 | 0x748 | Audio Control Module |
| RCM | 0x737 | 0x73F | Restraints Control Module (airbags) |
| GWM | 0x716 | 0x71E | Gateway Module |
| SCCM | 0x724 | 0x72C | Steering Column Control Module |
| DDM | 0x740 | 0x748 | Driver Door Module |
| PDM | 0x741 | 0x749 | Passenger Door Module |
| IPMA | 0x706 | 0x70E | Image Processing Module A (cameras) |
| FCIM | 0x7A7 | 0x7AF | Front Controls Interface Module |
| DACMC | 0x764 | 0x76C | Digital Audio CD/Media Converter |
| PAM | 0x736 | 0x73E | Parking Aid Module |

### RAM Module Addresses (CAN bus)
| Module | Tx ID | Rx ID | Description |
|--------|-------|-------|-------------|
| PCM/ECM | 0x7E0 | 0x7E8 | Powertrain Control Module |
| TCM | 0x7E1 | 0x7E9 | Transmission Control Module |
| ABS/ESP | 0x7E2 | 0x7EA | Electronic Stability Program |
| BCM | 0x740 | 0x748 | Body Control Module |
| IPC | 0x720 | 0x728 | Instrument Panel Cluster |
| TIPM | 0x742 | 0x74A | Totally Integrated Power Module |
| RFH | 0x744 | 0x74C | Radio Frequency Hub |
| HVAC | 0x750 | 0x758 | Climate Control Module |
| OCM | 0x760 | 0x768 | Occupant Classification Module |
| TPMS | 0x752 | 0x75A | Tire Pressure Monitoring System |
| EPS | 0x746 | 0x74E | Electric Power Steering |

### GM Module Addresses (CAN bus)
| Module | Tx ID | Rx ID | Description |
|--------|-------|-------|-------------|
| ECM | 0x7E0 | 0x7E8 | Engine Control Module |
| TCM | 0x7E1 | 0x7E9 | Transmission Control Module |
| EBCM | 0x241 | 0x641 | Electronic Brake Control Module |
| BCM | 0x244 | 0x644 | Body Control Module |
| IPC | 0x24C | 0x64C | Instrument Panel Cluster |
| HVAC | 0x251 | 0x651 | HVAC Control Module |
| SDM | 0x243 | 0x643 | Sensing and Diagnostic Module |
| RAD | 0x24A | 0x64A | Radio/Infotainment |
| ONSTAR | 0x248 | 0x648 | OnStar Module |

## Powersports Knowledge

### CAN-am / BRP ECU Types
- **MED17.8.5** (pre-2020): Bosch gasoline ECU, standard UDS, well-documented security
- **MG1CA920** (2020+): Newer Bosch platform with Tricore TC38x, tighter security
- **Post-2022.5 MG1CA920**: HSM (Hardware Security Module) locked — flash read/write blocked by HP Tuners and bFlash
- **VIN write ($2E F190)**: Uses dealer-level security (Level 3), separate from flash-level security. Should still work on locked ECUs.
- **Flash unlock**: Requires breaking Tricore HSM boot trust chain — different from VIN/coding security

### CAN-am CAN Bus Architecture
- Main CAN bus: 500 kbps, 11-bit standard addressing
- ECM at 0x7E0/0x7E8 (standard OBD addressing)
- Dash/cluster at 0x7E2/0x7EA
- DESS module integrated into ECM
- BuDS2 Megatech is the dealer diagnostic tool
- OBD port is standard J1962 16-pin connector

### Polaris CAN Bus Architecture
- Dual CAN bus: CAN-C (powertrain, 500 kbps) + CAN-B (body, 250 kbps)
- ECM at 0x7E0/0x7E8 on CAN-C
- Ride Command display at 0x7E4/0x7EC
- EPS (Electric Power Steering) at 0x7E2/0x7EA
- Key PIDs: RPM (0x0C), Coolant Temp (0x05), TPS (0x11), Vehicle Speed (0x0D)
- Extended PIDs: Fuel Pressure, Injector PW, Ignition Timing, Battery Voltage
- AIM protocol channels available for data acquisition systems

### Kawasaki CAN Bus
- Single CAN bus: 500 kbps
- ECU at 0x7E0/0x7E8
- Dash at 0x7E4/0x7EC
- Standard OBD-II PIDs supported on newer models (2018+)
- KDS (Kawasaki Diagnostic System) for dealer-level access

### Sea-Doo / BRP Marine
- Same BRP platform as CAN-am (shared ECU families)
- iBR (Intelligent Brake and Reverse) module on CAN bus
- Supercharger intercooler monitoring
- Ride plate position sensor
- Hull temperature sensors
- DESS key system identical to CAN-am

## Service Procedure Knowledge

### DPF Forced Regeneration (Universal)
- UDS sequence: $10 03 → $27 03/04 → $31 01 F00E (start regen)
- Monitor: $31 03 F00E (get regen status), $22 for EGT/soot load
- Prerequisites: Engine running, coolant >170°F, transmission in PARK, no inhibit DTCs
- Duration: 20-40 minutes typical
- EGT during regen: 1000-1200°F at DPF inlet
- Soot load threshold for regen: >75% on most platforms
- Abort conditions: Vehicle speed >0, coolant overtemp, EGT overtemp, DTC set

### Injector Coding (IMA/IQA)
- Ford: IMA codes stamped on injector body, 2-byte hex per injector
- RAM/Cummins: IQA codes, 24-character alphanumeric per injector
- GM: Injector flow rate codes, 4-digit numeric per injector
- Write via $2E to injector-specific DIDs (F150-F157 on some platforms)
- Must be done with engine OFF, ignition ON
- ECU reset ($11 01) required after writing

### TPMS Relearn Procedures
- Ford: Enter learn mode via IPC menu or $31 01 0060, trigger sensors in LF→RF→RR→LR order
- RAM: Enter learn mode via $31 01 0060, trigger sensors in LF→RF→RR→LR order, or use auto-learn (drive >15 mph for 10 min)
- GM: Use TPMS tool to trigger each sensor, or hold TPMS button until horn chirps, then trigger in LF→RF→RR→LR order

### Transmission Adaptive Reset
- Clears: Shift point adaptations, TCC slip targets, line pressure adaptations, garage shift quality
- When to do: After transmission service, valve body replacement, tune change, torque converter replacement
- Relearn period: 50-100 miles of mixed driving
- UDS: $31 01 FF00 (RoutineControl) to TCM after security access

## Torque Converter Stall Speed vs Turbo Mismatch Analysis

### Converter Stall Speed Fundamentals
- **Stall speed** = max RPM the engine can reach with converter unlocked and output shaft held stationary
- Too LOW stall = engine can't rev high enough to spool the turbo efficiently
- Too HIGH stall = wasted energy as heat, reduced drivability
- Stall speed MUST be matched to the turbo's power curve — larger turbos need higher stall converters

### Diagnosing Low Stall / Turbo Mismatch
- **Symptom**: Turbo lag during acceleration, converter is UNLOCKED the entire time during the lag
- **Key distinction**: This is NOT a TCC fault — the converter is mechanically sound, just mismatched
- **Root cause A**: Converter stall speed too low for the turbo — engine can't rev high enough to spool
- **Root cause B**: Turbo has a boost leak preventing it from spooling at the RPM the converter allows
- **Detection**: Analyze boost buildup rate vs RPM during WOT acceleration. If boost is slow to build while RPM is limited by converter coupling, stall is likely too low
- **Recommendation**: For performance builds with larger turbos, upgrade to a converter with stall speed matched to the turbo's power curve. If stall speed is appropriate, check for boost leaks (intercooler boots, charge pipes, wastegate seal)

### TCC Behavior During Turbo Spool (CRITICAL — do not flag as fault)
- Converter being UNLOCKED during acceleration is NORMAL — do not flag as TCC fault
- TCC should only lock after the engine is in the power band and boost is built
- TCC apply lag detection should only trigger when TCC is COMMANDED to lock but fails to achieve lockup
- If TCC is not commanded (duty cycle = 0 or low), any slip is normal converter operation
- Do NOT confuse turbo spool lag with TCC apply lag — they are completely different issues

### Stall Speed Guidelines by Application
- Stock Duramax: ~1800-2200 RPM stall (matched to stock turbo)
- Mild performance (compound turbo, 500-600 HP): ~2400-2800 RPM stall
- High performance (large single, 700+ HP): ~3000-3500 RPM stall
- Drag/sled pull (massive turbo): ~3500-4500+ RPM stall
- Can-Am/BRP Rotax: Factory converter matched to CVT, not typically adjustable

## NRC (Negative Response Code) Reference
When a UDS request fails, the ECU returns a Negative Response with one of these codes:
| NRC | Hex | Meaning | Common Cause |
|-----|-----|---------|--------------|
| generalReject | 0x10 | General rejection | ECU busy or request malformed |
| serviceNotSupported | 0x11 | Service not supported | Wrong ECU or service not implemented |
| subFunctionNotSupported | 0x12 | Sub-function not supported | Wrong session type or parameter |
| incorrectMessageLength | 0x13 | Wrong message length | Data field too short or too long |
| conditionsNotCorrect | 0x22 | Conditions not met | Engine running when should be off, or vice versa |
| requestSequenceError | 0x24 | Wrong sequence | Tried to write without security access first |
| requestOutOfRange | 0x31 | Parameter out of range | DID doesn't exist or value invalid |
| securityAccessDenied | 0x33 | Security access denied | Wrong key or too many attempts |
| invalidKey | 0x35 | Invalid key | Seed/key algorithm mismatch |
| exceededNumberOfAttempts | 0x36 | Too many failed attempts | Locked out — wait or power cycle |
| requiredTimeDelayNotExpired | 0x37 | Timeout not expired | Must wait after failed security attempts |
| uploadDownloadNotAccepted | 0x70 | Flash rejected | ECU locked or wrong programming session |
| generalProgrammingFailure | 0x72 | Programming failed | Write/erase failed at hardware level |
| responsePending | 0x78 | Still processing | ECU needs more time — wait and retry |

## CarPlay & Screen Mirroring Integration Knowledge

### What is CarPlay?
Apple CarPlay is a vehicle integration protocol that mirrors a simplified iPhone interface onto the car's head unit display. Introduced in 2014, it works by streaming H.264 (or H.265/HEVC as of 2023) encoded video FROM the iPhone TO the head unit, while touch events flow in the reverse direction FROM the head unit TO the iPhone. The head unit is essentially a remote display and touch digitizer — all application logic runs on the iPhone.

### CarPlay Connection Establishment (4 Stages)
1. **USB Connection**: iPhone connects via USB cable. iPhone presents Vendor ID 0x05AC, Product ID 0x12NN. IVI system detects Apple device and assumes USB Host role.
2. **USB Role Switch**: After initial recognition, roles REVERSE — iPhone becomes USB Host, IVI becomes USB Device. iPhone takes full authority over CarPlay communication parameters.
3. **iAP2 Session**: Three steps — (a) Parameter Negotiation (data rates, features, speed), (b) NCM Configuration (Network Control Model — creates high-speed Ethernet-over-USB link for multimedia bandwidth), (c) MFi Chip Authentication (Apple Authentication Coprocessor validates accessory legitimacy via RSA-1024/SHA-1 challenge-response).
4. **CarPlay Session**: Assign IPv6 link-local address, discover service via Bonjour/mDNS, authenticate, then H.264 video + AAC audio streaming begins over IP.

### Wireless CarPlay Architecture
- Built on AirPlay protocol
- iAP2 operates over Bluetooth for initial negotiation
- iAP2 negotiates WiFi password, triggers CarPlay mode
- iPhone connects to head unit's WiFi network
- Screen mirroring via AirPlay over WiFi (H.264/H.265 video + AAC audio)
- Touch events sent back over same WiFi connection

### iAP2 Protocol Details
- Layer 1 (Transport): Bluetooth RFCOMM, Serial, USB Device Mode, USB Host Mode
- Layer 2 (Link): Transmission/flow control, TCP-like sliding window
- Layer 3 (Session): Control, File Transfer, External Accessory streams
- Packet structure: 2-byte magic (0xFF 0x5A), 2-byte length, control byte, sequence, ack, session ID, checksums
- Session IDs: 0=control/auth, 1=data transfer, 2=External Accessory
- Bluetooth Service UUIDs: Accessory=00000000-deca-fade-deca-deafdecacaff, iPhone=00000000-deca-fade-deca-deafdecacafe
- Authentication: Apple Authentication Coprocessor chip required in every accessory. Challenge-response with RSA-1024/SHA-1.

### USB NCM Interface Descriptors
| Descriptor | Value | Description |
|-----------|-------|-------------|
| Control Interface Class | 0x02 | USB Communication Interface Class |
| Control Interface Subclass | 0x0D | Network Control Model |
| Data Interface Class | 0x0A | USB Data Interface Class |
| Data Interface Protocol | 0x01 | NCM Data Class |

### AirPlay Screen Mirroring Protocol
- Port 7100 (hard-coded, NOT standard AirPlay port)
- GET /stream.xml — retrieve server capabilities (resolution, refresh rate)
- POST /stream — start live video transmission (binary plist with stream params, then raw H.264 NAL units)
- Stream packet headers: 128 bytes, little-endian. Fields: payload size (4B), payload type (2B), NTP timestamp (8B)
- Packet types: 0=video bitstream (H.264 NAL units), 1=codec data (SPS/PPS), 2=heartbeat
- Optional AES encryption via FairPlay (param1=AES key, param2=IV)
- NTP time sync on port 7010 for audio/video synchronization

### CarPlay Video Streaming Pipeline
- iPhone continuously encodes display output into H.264/H.265 video stream
- Codec config: SPS/PPS parameters describe video format, resolution, encoding
- Frames arrive as NAL (Network Abstraction Layer) units
- Hardware-accelerated decoding via MediaCodec API (Android) or V4L2 (Linux)
- Zero-copy pipeline: decoded frames stay in GPU-accessible memory
- SurfaceFlinger composition: CarPlay video layer + overlay layers
- V-Sync at 60Hz

### Open-Source CarPlay Implementations

#### node-carplay (npm package, MIT license)
- Interfaces with Carlinkit USB adapter dongles
- Streams H.264 video and PCM audio from USB dongle
- Works in Node.js (native USB bindings, requires libudev-dev) or Chrome (WebUSB API)
- Included carplay-web-app example runs in browser with mic, audio, touch support
- Requires CPC200-Autokit or CPC200-CCPA dongle (NOT wired-to-wireless converters)
- Installation: npm install node-carplay

#### react-carplay (React-based head unit app)
- Built on node-carplay
- Optimized for Raspberry Pi hardware
- Supports 1080p @ 60fps video
- Multitouch support, configurable key bindings
- CAN bus integration via PiMost bus
- Reverse camera feed triggered by vehicle signals

#### pi-carplay (Electron-based head unit)
- Cross-platform Electron app for Raspberry Pi
- Low-latency audio, multitouch support
- Compatible with embedded displays
- Supports both CarPlay and Android Auto

### CarPlay Hardware Requirements
| Component | Specification |
|-----------|---------------|
| Raspberry Pi | Pi 4 (30fps) or Pi 5 (60fps) recommended |
| USB Dongle | Carlinkit CPC200-CCPA or similar |
| Display | 7-10 inch HDMI touchscreen |
| Storage | 32GB+ microSD (high-endurance) |
| Power | 5V/3A (Pi 4) or 5V/5A (Pi 5) USB-C |
| Optional | PiCAN2 board for CAN bus integration |

### Performance Benchmarks
| Pi Model | FPS | App Launch | Notes |
|----------|-----|-----------|-------|
| Pi 3 | ~15 | 5-8s | Laggy, not recommended |
| Pi 4 | ~30 | 2-5s | Good with V4L2 HW acceleration |
| Pi 5 | ~60 | 2-3s | Smooth, recommended |

### Magic Box / Android CarPlay Adapters
These are small Android computers that plug into the car's USB port:
1. Present themselves as CarPlay accessory to the car (contain MFi auth chip)
2. Run Android internally with custom launcher
3. Can run any Android app on the car screen
4. Phone mirrors via AirPlay/Miracast to the box
5. Pipeline: Phone to WiFi to Magic Box (Android) to CarPlay protocol to Car Screen
6. Key finding: ANY device with an MFi chip can establish CarPlay, regardless of OS
7. Common models: Ottocast, CarlinKit T-Box, various Qualcomm/Allwinner-based boxes

### Carlinkit Dongle Hardware Architecture
| Component | Part |
|-----------|------|
| SoC | Freescale i.MX6 UltraLite (ARM Cortex-A7) |
| Flash | Macronix 25L12835F (16MB) |
| WiFi/BT | RTL8822BS/CS or Marvell or NXP IW416 |
| Filesystem | jffs2 on rootfs, u-boot bootloader |
| Partitions | uboot (256K), kernel (3328K), rootfs (12800K) |
| OS | Linux-based, ARM Cortex-A7 |

### Phone-to-Car Mirroring Methods
1. **AirPlay Mirroring** (iPhone): Built-in iOS feature, streams to AirPlay-compatible receiver. H.264 video + AAC audio over WiFi.
2. **Miracast** (Android): WiFi Direct-based screen mirroring. Supported on most Android devices.
3. **Magic Box** (Universal): Android box plugs into car USB, receives AirPlay/Miracast, re-renders through CarPlay to car screen.
4. **WebRTC Streaming**: Phone captures screen, encodes H.264/VP8, streams via WebRTC to any browser-based receiver. ~100-200ms latency.
5. **USB Wired**: Direct USB connection, lowest latency, requires compatible cable.

### VOP CarPlay Integration Architecture
VOP can leverage CarPlay and screen mirroring to display live tuning data on the car's head unit:
- **Tuner Display Mode**: Dedicated VOP route optimized for car screen resolution (800x480 to 1920x720). Dark theme, large gauges showing RPM, boost, AFR, coolant temp, knock count. Works with any mirroring method.
- **CAN Bus + VOP**: PiCAN2 + SocketCAN on Raspberry Pi enables direct CAN data reading. VOP can display real-time ECU parameters on car screen while Knox provides voice analysis feedback.
- **Voice Integration**: Knox voice commands for hands-free tuning queries during driving/testing.

### CarPlay Security Considerations (from USENIX VehicleSec25)
- iAP2 authentication is ONE-WAY: phone authenticates head-unit, but head-unit does NOT authenticate phone
- Many wireless CarPlay devices use fixed/predictable WiFi passwords
- Most aftermarket adapters have no secure boot — firmware can be modified
- CVE-2025-24132: Stack buffer overflow in AirPlay SDK, exploitable for root RCE over WiFi
- Affected: AirPlay audio SDK <2.7.1, video SDK <3.6.0.126, CarPlay Communication Plug-in <R18.1


## VOP 3.0 Hardware Platform

### Overview
VOP 3.0 is a custom-designed hardware bridge that connects directly to vehicle diagnostic ports and streams live ECU data to the VOP web application over WiFi, BLE, or wired Ethernet. It features on-board security access unlock components, eliminating the need for server round-trips during seed/key authentication. At scale production (500+ units), unit cost is below $20.

### Core Specifications
| Component | Specification |
|-----------|---------------|
| SoC | Espressif ESP32-S3-WROOM-1 |
| CPU | Dual-core Xtensa LX7 @ 240MHz |
| PSRAM | 64MB (Octal SPI) |
| Flash | 16MB |
| SRAM | 8MB |
| WiFi | 802.11 b/g/n (2.4GHz) |
| Bluetooth | BLE 5.0 |
| USB | USB-C (OTG capable) |
| Ethernet | RJ45 via HCTL HC-RJ45-SIAS jack |
| Security | On-board unlock/seed-key computation components |
| Form Factor | Custom PCB, compact |
| Production Cost | <$20 at 500+ units |

### ESP32-S3 Capabilities
- **Dual-core Xtensa LX7**: Both cores at 240MHz, hardware floating point, SIMD instructions
- **TWAI Controller**: Built-in CAN bus peripheral (ISO 11898-1 compatible), supports standard (11-bit) and extended (29-bit) frames, up to 1Mbps. Requires external transceiver (MCP2551 or SN65HVD230, ~$0.50)
- **USB OTG**: Native USB 1.1 Full Speed (12Mbps), can act as USB Host or Device. Enables direct connection to ELM327 adapters, J2534 interfaces, or USB-serial bridges
- **WiFi**: Station + SoftAP simultaneous mode. Can connect to shop WiFi while also hosting its own AP for direct phone connection
- **BLE 5.0**: Low-energy connection for mobile app pairing, configuration, and lightweight data streaming
- **Ethernet**: Wired connection for reliable, low-latency data in shop environments. Eliminates WiFi interference issues
- **SPI/I2C/UART**: Multiple peripheral buses for sensor integration, display output, and external module communication
- **ADC**: 20-channel 12-bit SAR ADC for analog sensor inputs (wideband O2, EGT, pressure sensors)
- **RTC**: Real-time clock for timestamped datalogs even when disconnected

### Memory Architecture
- **64MB PSRAM**: Enough to buffer entire binary files (typical ECU calibration: 2-8MB), full A2L databases (10-50MB), and complete datalog sessions. Enables on-device binary comparison, map extraction, and calibration analysis without streaming to phone/server.
- **16MB Flash**: Dual OTA partition scheme (2x 6MB app partitions + 2MB NVS + 2MB factory). Supports over-the-air firmware updates. Local storage for cached calibrations, user preferences, and diagnostic history.
- **8MB SRAM**: Fast working memory for real-time CAN frame processing, UDS session management, and concurrent WiFi/BLE/Ethernet data streaming.

### On-Board Security Access
The VOP 3.0 PCB includes dedicated components for autonomous seed/key computation:
- Seed/key algorithms run on-device (no cloud dependency, no latency)
- Supports all VOP-supported platforms: GM Global B, Ford MG1/EDC17, Cummins CM2350/CM2450, CAN-am/BRP, Polaris, Ford TCU 10R80
- Security access can be performed even without internet connectivity
- Key material stored in ESP32-S3 eFuse or encrypted NVS partition (not readable via JTAG/UART)

### Connectivity Modes
1. **Direct WiFi AP Mode**: VOP 3.0 creates its own WiFi network. Phone/tablet connects directly. Best for field use, dyno testing, roadside diagnostics. Zero infrastructure needed.
2. **Station Mode (Shop WiFi)**: VOP 3.0 joins existing shop WiFi. Multiple technicians can connect simultaneously. Data streams to VOP web app on any device on the network.
3. **Ethernet Mode**: Wired connection via RJ45. Lowest latency, most reliable. Ideal for permanent shop installations, dyno rooms, or integration with shop management systems.
4. **BLE Mode**: Low-power Bluetooth connection for mobile app pairing, initial configuration, and lightweight status monitoring.
5. **USB Mode**: Direct USB-C connection to laptop/PC. Fastest data transfer, firmware updates, and debug access.

### Vehicle Interface
- **CAN Bus**: Via TWAI peripheral + external transceiver. Supports CAN 2.0A (11-bit), CAN 2.0B (29-bit), and CAN-FD (with external CAN-FD transceiver). Direct connection to OBD-II port or vehicle CAN bus.
- **K-Line**: Via UART + L9637D transceiver for older vehicles (ISO 9141-2, ISO 14230 KWP2000)
- **J1850**: Via dedicated transceiver for older GM (VPW) and Ford (PWM) vehicles
- **UDS Stack**: Full UDS (ISO 14229) implementation running on-device: DiagnosticSessionControl, SecurityAccess, ReadDataByIdentifier, WriteDataByIdentifier, RoutineControl, RequestDownload/TransferData/RequestTransferExit
- **Multi-Protocol**: Can detect and auto-switch between CAN, K-Line, and J1850 based on OBD-II pin detection

### CarPlay Integration with VOP 3.0
The VOP 3.0 hardware enables a streamlined CarPlay integration path:
1. VOP 3.0 connects to vehicle OBD-II port (CAN bus)
2. VOP 3.0 creates WiFi AP or joins shop network
3. Phone connects to VOP 3.0 WiFi and opens VOP web app
4. VOP web app displays live ECU data in Tuner Display Mode (optimized for car screen)
5. Phone mirrors to car head unit via AirPlay (iPhone) or Miracast (Android)
6. Result: Live tuning gauges on the car's built-in screen, powered by VOP 3.0 hardware

This eliminates the need for Carlinkit dongles, Raspberry Pi, or any third-party hardware. The VOP 3.0 board IS the complete bridge from vehicle to display.

### Knox Voice Integration
With VOP 3.0 streaming live data to the phone, Knox can provide real-time voice feedback during driving/testing:
- "Boost is building normally, 22 PSI at 3000 RPM"
- "AFR is running lean at 14.2:1 under load, recommend richening the fuel map"
- "Cylinder 4 balance rate is 8% off — possible injector degradation"
- "Coolant temp is climbing, 215F and rising — monitor closely"
Voice commands: "Knox, what's my current boost?" / "Knox, how's my fuel pressure?" / "Knox, start a datalog"

`;
