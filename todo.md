# Project TODO

## Universal Vehicle Compatibility Expansion
- [x] Add comprehensive gas engine standard PIDs (O2 sensors, STFT/LTFT bank 2, fuel system status, timing advance, misfire counters, EVAP, VVT)
- [x] Add manufacturer-specific extended PIDs (Ford Mode 22, Chrysler Mode 22, Toyota, Honda)
- [x] Add new PID categories for gas engines (oxygen, catalyst, evap, ignition)
- [x] Update PIDDefinition type with manufacturer/platform tags
- [x] Implement VIN auto-detection on connect (Mode 09 PID 02 decode to make/model/year/engine type)
- [x] Create VIN decoder utility for universal vehicles (not just GM diesel)
- [x] Create vehicle-specific preset auto-selection based on VIN decode
- [x] Add gas engine monitoring presets (Gas Engine Monitor, O2/Lambda Sensors, Catalyst Efficiency, EVAP System)
- [x] Add universal presets (Engine Basics, Fuel Trims, Transmission)
- [x] Update DataloggerPanel UI to show vehicle type and filter PIDs by relevance
- [x] Update PID filter tabs from "GM EXT" to manufacturer-aware labels
- [x] Update tests for new PID database and preset structure
- [x] Verify all existing tests still pass after changes

## Previously Completed
- [x] Basic homepage layout
- [x] Advanced Mode with 9-tab interface
- [x] Live Datalogger with WebSerial OBD-II communication
- [x] 47 GM Mode 22 extended diesel PIDs
- [x] Custom preset system with save/load
- [x] Mode 22 DID discovery scan
- [x] Real-time Canvas-based charting with zoom/pan
- [x] CSV export with timestamp alignment
- [x] Automatic baud rate detection
- [x] OBD-II knowledge base (261 documents)

## Vehicle-Specific Support
- [x] Verify 2012 Ford Raptor 6.2L V8 Boss support (WMI, PIDs, presets)
- [x] Verify 2024 Duramax L5P support (already covered, confirm)
- [x] Verify 2024 BMW XM support (WMI mapping, universal PIDs)
- [x] Add Ford Raptor-specific extended PIDs (6.2L Boss engine codes)

## Universal DTC Reader
- [x] Build DTC reader module (Mode 03 stored, Mode 07 pending, Mode 0A permanent)
- [x] Build comprehensive DTC database with P/C/B/U code descriptions
- [x] Add DTC severity levels and categorization
- [x] Add DTC clear feature (Mode 04) with confirmation dialog
- [x] Build DTC display UI panel in DataloggerPanel with detail cards
- [x] Add clear DTC button with safety confirmation

## Tests
- [x] Write tests for universal VIN decoder (Ford Raptor, Duramax, BMW XM VINs)
- [x] Write tests for DTC parser and database lookup
- [x] Write tests for vehicle-specific PID filtering
- [x] Update existing tests for new ALL_PIDS composition

## Ford 6.2L Boss Engine Extended PIDs
- [x] Research Ford 6.2L Boss Mode 22 DIDs (PCM, TCM, ABS module addresses)
- [x] Add Ford Boss engine-specific PIDs (oil temp, oil pressure, cylinder head temps, knock sensors, VCT, etc.)
- [x] Add Ford Boss transmission PIDs (TFT, line pressure, gear state, torque converter)
- [x] Add Ford Boss presets for the Raptor
- [x] Write tests for Ford Boss PIDs

## BMW UDS Extended Diagnostics (2024 XM)
- [x] Research BMW UDS diagnostic addressing (DME, EGS, DSC, ICM, BDC, ZGW)
- [x] Add BMW iDrive-specific parameters (battery SOC, hybrid motor temps, xDrive torque split)
- [x] Add BMW engine management PIDs (VANOS, Valvetronic, direct injection, turbo)
- [x] Add BMW transmission PIDs (ZF 8HP, mechatronic, adaptive learning)
- [x] Add BMW chassis PIDs (active suspension, dynamic stability, brake energy regen)
- [x] Add BMW-specific presets for the XM
- [x] Write tests for BMW UDS PIDs

## PID Availability Scan (Fix unsupported PID failures)
- [x] Implement Mode 01 PID support bitmask scan (PIDs 0x00, 0x20, 0x40, 0x60) during initialize()
- [x] Parse bitmask response to build Set of supported standard PIDs
- [x] Filter preset PIDs against supported bitmask before logging starts
- [x] Auto-remove unsupported PIDs from active polling list
- [x] Show supported/unsupported PID count in DataloggerPanel UI
- [x] Mark unsupported PIDs visually in PID selector
- [x] Write tests for bitmask parsing and PID filtering

## CSV Export / Analyzer Compatibility Fix
- [x] Fix datalogger CSV export format to be compatible with Analyzer parser
- [x] Fix failing BMW PID tests (shortName mismatches)

## L5P HP Tuners CSV Compatibility Fix (ticket145410)
- [x] Add PID substitution aliases for all new L5P columns (turbo vane, injector timing, DPF, DEF, NOX, etc.)
- [x] Fix duplicate column handling (Trans Output Shaft RPM x2, Auto Trans Drive x3, Injector Pulse Width Cyl 4 x2, etc.)
- [x] Map new PIDs to logical channels used by diagnostics engine
- [x] Fix diagnostic logic for new PID names (turbo analysis, DPF health, DEF system)
- [x] Fix chart rendering for new data channels
- [x] Write test to verify this specific CSV parses correctly (18 tests in l5pParser.test.ts)

## Ford Raptor PID Display Issue
- [x] Analyze Ford datalog to identify which PIDs stopped displaying (multi-PID batch response issue)
- [x] Fix datalogger PID display stopping during recording on Ford (adaptive batch sizing + soft-disable with retry)

## TCC Fault Detection Threshold Tuning
- [x] Add ±15 RPM slip tolerance while converter is locked (logging tool signal noise floor)
- [x] Exclude slip during gear shifts from fault detection (natural shift slip)
- [x] Add grace period for lock/unlock transitions (pressure application delay)
- [x] Distinguish duty cycle vs lockup pressure (high sustained pressure = max clamping, not fault)
- [x] Update reasoning engine TCC analysis with same thresholds

## Automatic Metric-to-Imperial Conversion
- [x] Auto-convert °C to °F for all temperature PIDs (ECT, IAT, EGT, oil temp, etc.)
- [x] Auto-convert kPa to psi for pressure PIDs (MAP, rail pressure, barometric)
- [x] Auto-convert km/h to mph for vehicle speed
- [x] Auto-convert L/h to gal/h for fuel rate
- [x] Auto-convert g/s to lb/min for MAF
- [x] Auto-convert bar to psi, Nm to lb-ft, kg/h to lb/min
- [x] Apply unit-aware conversion in datalogger CSV parser (detects units from header)
- [x] Apply unit-aware conversion in HP Tuners parser (detects units from units row)

## False Positive Fault Detection Fix
- [x] Fix false P0087 (low rail pressure) fault detection
- [x] Fix false P0088 (high rail pressure) fault detection
- [x] Fix false high TCC slip fault detection (still too sensitive after previous tuning)
- [x] Fix false boost pressure deviation fault detection (desired vs actual boost too tight)
- [x] Add transient exclusion for all pressure faults (rapid throttle changes, gear shifts, low RPM)
- [x] Increase minimum sustained duration requirements for all pressure/boost faults
- [x] Only flag TCC slip faults when TCC is truly locked (not during ControlledHyst or ImmediateOff states)
- [x] Fix ECU calibration IDs in knowledge base: LLY=E60, LML 2011-2014=E86A, LML 2015-2016=E86B
- [x] Sync healthReport.ts thresholds with new diagnostics.ts (P0087: 5000psi/100 samples, P0088: 2500psi/80 samples, TCC: 25/50 RPM / 150 samples)
- [x] Update reasoning engine TCC analysis (noise floor 25 RPM, shift window 15, lock grace 20, converging slip exclusion, 15 consecutive samples)
- [x] Write false-positive prevention vitest (10 tests covering transients, low RPM, low throttle, gear shifts, converging slip, lock transitions)

## 2024 L5P Duramax Datalogger Detection Fix
- [x] Research 2024 L5P OBD-II changes (E42 ECM, directed addressing required, 470hp/975tq, 10L1000 trans)
- [x] Fix VIN decoder to recognize 2024+ L5P Gen 2 (E42 ECM, updated specs)
- [x] Fix OBD communication for 2024 L5P (added ecuHeader 7E0/7E1 to all 48 GM PIDs, ATSH switching in readPid/readPids/scanSupportedDIDs)
- [x] Add Gen 2 Duramax presets (Full Gen 2, Fuel System Extended, DPF/DEF/Emissions)
- [x] Update vehicle knowledge base with Gen 2 L5P specs (E42 ECM, 32000 psi rail, 470hp/975tq)
- [x] Update ECU reference panel for Gen 1 vs Gen 2 display
- [x] Update tests for 2024 L5P detection (286 tests passing)

## VIN in Datalogger Display & CSV Export + Vehicle-Aware Diagnostics
- [x] Display detected VIN prominently in DataloggerPanel UI during logging (stored on OBDConnection instance, emitted via vehicleInfo event)
- [x] Embed VIN + vehicle metadata (make, model, year, fuelType, manufacturer, engine, protocol) in CSV export # comment headers
- [x] Update CSV parser to extract VIN metadata from # comment headers (extractVehicleMeta + stripMetaLines)
- [x] Pass vehicleMeta through DuramaxData → ProcessedMetrics → diagnostics pipeline
- [x] Skip diesel-specific checks (EGT, rail pressure P0087/P0088/P0089/P1089, boost P0299, VGT P0046, MAF P0101) for non-diesel vehicles
- [x] Skip gas-specific checks for diesel vehicles (fuel type inference from VehicleMeta)
- [x] Update healthReport.ts with vehicle-aware filtering (skip diesel engine/fuel sections for non-diesel)
- [x] Write tests for VIN extraction from CSV and vehicle-aware diagnostic filtering (8 new tests, 294 total passing)

## Remaining False Positives & UI Cleanup
- [x] Fix P0088 still flagging on 17L5P CSV - improved desiredDroppingMask with multi-window lookback (5/20/50 samples) + recent-peak check (80 samples)
- [x] Fix TCC slip still flagging on 17L5P CSV - raised noise floor to 40 RPM, require 25 consecutive locked samples, raised event thresholds
- [x] Ensure detected faults ALWAYS display in the graph (fault zone charts render when hasFaults=true, each chart self-filters by code)
- [x] Remove Engine Reference Database panel, replaced with searchable Subsystem Reference (expanded from 8 to 25+ subsystems)
- [x] Fix Feedback panel to submit via tRPC + database + owner notification
- [x] Remove "HP TUNERS · EFILIVE · BANKS POWER" from header, changed to "PERFORMANCE ANALYZER" + "AI-POWERED DIAGNOSTICS"
- [x] Changed subtitle to "AI-POWERED DIAGNOSTICS"
- [x] Removed "L5P DURAMAX" badge from top right
- [x] Cleaned up redundant HP Tuners/EFILive/Banks references from upload area and file requirements

## Critical Fixes: Fault Display, DTC Codes, and False Positives
- [x] Find and fix ALL paths that still report P0088 and TCC slip on the 17L5P CSV (diagnostics.ts, healthReport.ts, reasoningEngine.ts)
- [x] Replace all DTC codes (P0088, P0087, P0741, etc.) with descriptive condition names throughout the codebase
- [x] Display conditions as "potential fault area" with description and thresholds, not as DTCs
- [x] Fault zone graphs MUST always render when any condition is reported — never return null
- [x] If fault zone graph has no data to show, display explanation of why it didn't populate
- [x] Update DiagnosticReportComponent to show conditions instead of DTC codes
- [x] Update fault zone chart components to always render when their condition is reported
- [x] Update PDF export to use condition names instead of DTC codes
- [x] Remove file requirements section/tab from UI entirely
- [x] Replace file parsing errors with user-friendly "Contact PPEI" message
- [x] Fix TCC converging slip detection in healthReport.ts — replaced with settle-then-rise logic
- [x] Fix transmission knowledge base: Allison 1000 5-speed (01-05), Allison 1000 6-speed (06-19), GM/Allison 10L1000 10-speed (2020+)
- [x] Fix TCC slip detection for 10L1000: settle-then-rise logic in diagnostics.ts, healthReport.ts, and evaluateDiagnostics

## Format-Aware Beta Suggestions
- [x] Beta suggestions must not reference wrong tool (e.g., don't say "EFILive" when format is Banks Power)
- [x] Remove internal PID ID names from suggestions (no ECM.EGTS1, TCM.TFT etc.) — use plain language like "Exhaust Gas Temperature", "Oil Pressure", "Transmission Fluid Temperature"
- [x] Suggestion text should be generic or match the detected format (Banks Power, HP Tuners, EFILive, OBD datalogger, etc.)

## Fault Zone Analysis Enforcement Rule
- [x] RULE: Every fault/potential fault in diagnostics MUST also appear in fault zone analysis with a graph — no orphaned faults
- [x] Fix low boost fault not populating the fault zone chart
- [x] Audit ALL fault types to ensure each one has a corresponding fault zone chart (EGT-HIGH, CONVERTER-SLIP, CONVERTER-SLIP-WARN, IDLE-RPM-LOW, IDLE-RPM-HIGH all now mapped)
- [x] If a fault zone chart has no data to display, show an explanation instead of returning null/empty (already handled in all charts)

## Standalone Vehicle Health Report PDF
- [x] Create dedicated Vehicle Health Report PDF generator with friendly/funny personality
- [x] Tone adjusts based on severity: light and funny for clean reports, more serious for critical faults
- [x] Include BETA AI model disclaimer with a joke about it
- [x] Author set to "Kory (Maybe?)"
- [x] Training/improving rapidly message included
- [x] Download as standalone PDF via blue button in Health Report section header
- [x] Wire up download button in the UI (Home.tsx and Advanced.tsx)
- [x] Add dyno graph disclaimer: dependent on tuning setup, can be inaccurate, but good reference

## EGT Channel Fix & Report Improvements
- [x] EGT channel selection: all 3 parsers + pidSubstitution now scan ALL EGT columns and pick the one with the highest peak reading
- [x] No fault should appear unless the channel was actually observed with real data (added egtHasRealData guard in diagnostics.ts)
- [x] Darken humor tone in health report PDF: dry/dark truck humor, less bubbly, still respectful to customers
- [x] Add more graphs to the health report PDF (RPM, boost, rail pressure, coolant temp, EGT, converter slip, trans temp, speed) with explanations
- [x] Each graph section includes a customer-friendly explanation of what the parameter means and what to watch for

## Health Report PDF Graph Improvements
- [x] Change graph descriptions from generic warnings to data-driven synopses of what actually happened in the data
- [x] Add MPH speed reference line (light gray overlay) at the bottom of each graph for context

## Advanced Health Report — Correlated Multi-Parameter Graphs
- [x] Add injector pulse width and timing graphs (if available in datalog)
- [x] Add desired boost vs actual boost with vane position overlay graph
- [x] Add desired vs actual fuel rail pressure with PCV duty cycle overlay graph
- [x] Add boost vs MAF vs vane correlation graph with leak detection logic (high MAF + vane >45% at 2900+ RPM + boost <33 PSI = possible boost leak or tune revision needed)
- [x] Add derived analytics: MAD (Manifold Air Density), boost air density with explanations
- [x] Parse injector pulse width and injection timing from datalogs (added to all 3 parsers + ProcessedMetrics)
- [x] All advanced graphs only render when advanced data channels are present in the datalog
- [x] Each advanced graph includes data-driven synopsis and MPH speed reference
- [x] Injector analysis: piezo >1.5ms = race territory / high EGT risk; solenoid >2500uS = hard on pistons
- [x] Rail pressure: >3000 PSI above OEM peak = "getting spicy"
- [x] Timing: >27° on diesels = spicy; high pulse width calls for high timing
- [x] Commentary: recommend injectors matched to desired HP; OEM duration or lower for small builds
- [x] General wisdom: more HP = harder on everything; build correctly, keep cool, efficient, matched components
- [x] Torque converter stall matching: should match power curve shift from larger turbo
- [x] Don't sustain high temps for extended periods
- [x] Add total Crank Angle Duration (CAD) calculation from pulse width + RPM, show injection end relative to TDC (approximate, not exact)
- [x] Include fuel pressure in CAD/TDC analysis context (higher rail pressure affects atomization and combustion)

## Health Report PDF - Basic & Advanced Sections
- [x] Restructure health report PDF into two clearly labeled sections: BASIC and ADVANCED
- [x] BASIC section: customer-friendly overview with simple graphs, plain-language summaries, system scores, findings, recommendations
- [x] ADVANCED section: correlated multi-parameter analysis (injector/timing, CAD/TDC, boost/vane, rail/PCV, MAF/boost leak, MAD, converter stall)
- [x] Add clear visual divider/header between Basic and Advanced sections (blue banner for Basic, red banner for Advanced, new page break)

## L5P ECU Reference Module (E41 A2L)
- [x] Parse and categorize the 71,220 E41 calibration parameters into functional groups (15 subsystems mapped)
- [x] Map GM internal naming convention (Kt/Ka/Ke prefixes, AICC/FHPC/FULC/ETQC subsystems) to human-readable descriptions
- [x] Build L5P-specific knowledge base: fuel system (SOI timing, rail pressure setpoints, PCV), boost control (VGT feedforward, PID gains, boost setpoints), torque management, EGT monitoring, TCC control
- [x] Integrate ECU reference into advanced health report PDF — conditional context boxes appear when thresholds are exceeded (12 observation types)
- [x] Integrate ECU reference into diagnostics via calibration context (injector_pulse_high, timing_aggressive, boost_deviation, rail_pressure_high/hunting, high_egt, tcc_slip, low_boost, pcv_maxed, oil_pressure_low, regen_detected, vane_position_high)
- [x] Add calibration structure info (table dimensions = RPM x load) to explain tuning relationships (e.g., AICC boost setpoint 20x21, FULC ET_InjTbl 22x20)

## Graph Axis Standardization
- [x] All health report PDF graphs must always show RPM and speed as bottom axis references
- [x] Y-axis values should be simple and clean (rounded numbers, no excessive decimals)
- [x] Update drawMiniGraph (basic section) to include RPM + speed dual bottom axis
- [x] Update drawCorrelatedGraph (advanced section) to include RPM + speed dual bottom axis
- [x] Add transmission and torque converter specific graphs to health report PDF (TCC duty cycle, gear position, trans line pressure)
- [x] Fix dyno graph not populating in health report PDF
- [x] Add drag timeslip image to health report PDF when 1/4 mile conditions are met (0 MPH + throttle 80%+)
- [x] Dragy-style data in health report PDF: 0-60, 60ft, 1/8 mile, 1000ft, 1/4 mile times + trap speeds + G-force; suggest missing PIDs if not available

## PDF Graph Readability Improvements
- [x] Make basic graphs taller (30mm → 50mm) for more data room
- [x] Make advanced correlated graphs taller (42mm → 55mm)
- [x] Add 3-5 evenly spaced Y-axis tick labels with values on left edge of all graphs
- [x] Increase RPM/speed overlay from 25% to 35-40% of graph height
- [x] Increase font sizes on axis labels, legend text, and tick values

## Capacitor Android App with PCAN-USB Support
- [ ] Add Capacitor to existing web project (Android platform)
- [ ] Build native Android USB Host plugin for PCAN-USB communication
- [ ] Implement PCAN-USB device detection and connection via USB OTG
- [ ] Implement raw CAN frame send/receive at full bus speed (500kbps/1Mbps)
- [ ] Add ISO-TP (ISO 15765-2) transport layer for multi-frame CAN messages
- [ ] Create CAN transport adapter that plugs into existing OBD communication layer
- [ ] Add UDS (Unified Diagnostic Services) protocol support on top of raw CAN
- [ ] Wire PCAN transport as alternative to WebSerial in datalogger UI
- [ ] Add connection type selector in UI (WebSerial vs PCAN-USB)
- [ ] Test Android build and USB OTG communication

## Binary Upload / ECU Calibration Parser (Advanced Section)
- [x] Build client-side .bin file parser to extract ECU metadata (VIN, part numbers, OS IDs, calibration IDs)
- [x] Display extracted data with hex offsets in structured panel
- [x] Add VIN decode via NHTSA API for full vehicle details
- [x] Look up GM part numbers for component identification
- [x] Add binary upload UI to Advanced section
- [x] Show hex dump view of key data regions
- [ ] Flag mismatched part numbers (tuner-modified vs factory) when official GM records become available

## Multi-Format Binary Parser
- [x] Analyze E46 3.0L Duramax EFILive container binary structure
- [x] Add format auto-detection (WinOLS, EFILive, HP Tuners, raw flash dump)
- [x] Parse filename metadata for EFILive containers (part numbers, OS, platform embedded in filename)
- [x] Handle E46 ECM binary patterns (different from E41)
- [x] Expand GM part number database with E46/3.0L Duramax part numbers
- [x] Test parser with both E41 and E46 binaries
- [x] Analyze E90 gasoline EcoTec3 V8 EFILive binary structure
- [x] Add E90/E88 segment header parsing with CVN extraction
- [x] Add PPEI JSON flash descriptor parsing (author, tuner, version, CAN address, sw_c1-sw_c6)
- [x] Add signature block parsing at 0x800000 region (platform string, module name)
- [x] Map segment functions from SPS log data (OS, System, Fuel, Speedo, Diagnostic, Operation)
- [x] Add segment map table display in BinaryUploadPanel
- [x] Add PPEI flash descriptor card display
- [x] Add format detection card display
- [x] Expand GM part number database with E90/E88 gasoline parts
- [x] Analyze SPS flash programming log for UDS sequence (security access, transfer data, module order)

## False Low Boost & Rail Pressure Alert Fix
- [x] Analyze 145+hp_558_1288.csv to understand what triggers false low boost alert
- [x] Fix low boost detection thresholds (recurring false positives across multiple datalogs)
- [x] Fix low boost fault zone not displaying in the problematic area
- [x] Fix false rail pressure alert if present
- [x] Verify fixes against the 145+hp datalog

## Binary Segment Swap Tool
- [ ] Build binary segment swap: upload two .bin files with same OS and offsets
- [ ] Compare segments between two binaries and display differences
- [ ] Allow user to select which part number/segment to swap from comparison file
- [ ] Generate new binary with swapped segment(s) and offer download
- [ ] Validate same OS and same offsets before allowing swap
- [ ] Only allow swap between same format files (exception: if Manus can make cross-format work)

## L5P Injector Type Fix
- [x] Fix L5P injector type reference from piezo to solenoid in health report and diagnostics

## Health Report Graph Axis Improvements
- [x] All graphs must always have Y-axis values (not just min/max labels)
- [x] RPM and speed bottom axis must have tick markings from beginning to end (not just overlay)
- [x] Speed markings must be clearly labeled so user doesn't have to guess

## Low Rail Pressure Fault Zone Fix
- [x] Low rail pressure deviation must appear in fault analysis zone when detected
- [x] Verify fault zone chart renders for LOW_RAIL_PRESSURE condition

## Cummins 6.7L Support (2019-2024)
- [ ] Analyze Cummins 6.7L binary file structure and extract metadata
- [ ] Add Cummins ECU format detection to binary parser (part numbers, calibration IDs, VIN)
- [ ] Parse Cummins CSV datalog format (PID names, units, structure)
- [ ] Add Cummins PID name mapping to dataProcessor.ts for CSV import
- [ ] Add Cummins 6.7L vehicle knowledge base entry
- [ ] Add 68RFE transmission knowledge and diagnostics
- [ ] Add Aisin AS69RC transmission knowledge and diagnostics
- [ ] Add Cummins-specific DTC codes to diagnostic lookup
- [ ] Verify Cummins datalog analysis produces correct diagnostics
