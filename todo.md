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

## UI Fixes (Current Session)
- [x] Fix RPM/speed overlay on health report PDF graphs — they overlap each other making it hard to read
- [x] Add dyno results disclaimer to on-screen dyno display (same as health report PDF disclaimer)
- [x] Make subsystem values collapsible — hidden by default, shown only when subsystem is clicked
- [x] Fix binary upload drag & drop not working
- [x] Add peak power vs peak torque side-by-side snapshot stats in health report PDF (RPM, MAF, vane position, boost, rail pressure, fuel quantity mm3/mg at peak HP and peak torque moments)
- [x] Fix injector pulsewidth diagnostic messaging: high PW is hard on pistons (wide spray patterns on stock injectors), not stress on injectors. Acceptable for 1/4 mile bursts.
- [x] Add low-timing-at-high-PW diagnostic warning: 15° timing at 2500μs PW and 3000 RPM is too low — flag as potential timing issue (late burn, high EGTs, reduced efficiency). Timing should scale with PW and RPM.
- [x] Add piezo injector shutoff delay context: ~800μs shutoff delay means a 1.5ms command = ~2.3ms actual fuel delivery. Piezo needle bottoms out at 1400-1600μs, fuel past that is extremely inefficient. Factor into PW analysis and commentary.

## Compare Datalog Feature
- [x] Build comparison engine: condition matching, pairing logic (RPM ranges, load events, boost sweeps), delta analysis
- [x] Extend existing upload box to support multi-file compare mode (upload 2+ datalogs)
- [x] Build comparison results UI: side-by-side metrics, overlay charts, tune change report
- [x] Add reasoning/commentary explaining what changed between tunes and the implications
- [x] Optional context chat: user describes what changed between tests (tune change, turbo swap, etc.) to improve comparison reasoning
- [x] Add combustion mode PID detection (mode 0/1 = normal, higher = regen/DPF). Warn if comparing logs with different operating modes. Filter comparison to normal-mode samples when available. 80+ HP difference if in regen.
- [x] Fix VIN decoder: Cummins VIN correctly decoded by NHTSA but analyzer mixes it with L5P engine type. VIN-decoded engine type must override default Duramax assumptions.
- [ ] Add Cummins exhaust pressure PID parsing (exhaust pressure vs boost pressure, not just boost)
- [ ] Add Cummins-specific thresholds: exhaust pressure concern at 75 PSI (stock), ideal boost:exhaust ratio ~1:2, achieved through vane adjustments
- [ ] When VIN detects Cummins, apply Cummins-specific diagnostic logic instead of Duramax defaults
- [x] Fix PW diagnostic: pulse width severity must factor in rail pressure. 2.9ms at low pressure is not the same as 2.9ms at high pressure. Only flag as concerning when PW is high AND rail pressure is high simultaneously.

## Segment Swap Feature
- [x] Build segment swap engine — copy entire segment data blocks between two binaries using segment map boundaries
- [x] Hex-verify segment boundaries before copying (confirm expected bytes at offset, pattern search fallback if shifted)
- [x] Build segment swap UI — two-bin upload (target + source), side-by-side segment maps, swap selection per segment
- [x] Download modified binary with descriptive filename after segment swap
- [x] Validate OS compatibility between source and target before allowing swap

## Segment Swap Button Visibility Fix
- [x] Fix SEGMENT SWAP button hidden for PPEI container binaries (parser didn't populate segments for ppei_container format)
- [x] Add pattern-scan segment discovery to binaryParser.ts for PPEI containers (section 2b)
- [x] Remove analysis.segments.length > 0 gate on SEGMENT SWAP button — always show when binary is loaded

## Quick Stats EGT + Health Report HP4 Fix
- [x] Add peak EGT to datalog quick stats summary
- [x] Skip EGT in quick stats if sensor is flatlined (stuck past 1800°F or constant value = not working)
- [x] Fix health report referencing CP4 pump when vehicle has HP4 (L5P uses HP4, not CP4)

## PDF Watermark & App Version Badge
- [x] Add very light "PPEI Ai Beta" watermark to all PDF export pages (already existed in pdfExport.ts and healthReportPdf.ts)
- [x] Add v0.01 version badge displayed on app pages (version only changes when user explicitly requests it)

## LB7 EFILive Parser Support
- [x] Fix EFILive format detection to recognize PCM.RPM / PCM.MAF (LB7/LLY prefix)
- [x] Add LB7 PCM.* PID candidates to EFILive parser column lookups
- [x] Handle LB7-specific unit conversions (MPa→PSI, kPa absolute boost, µs→ms, text gears, negative mm3)
- [x] Add PCM.* candidates to pidSubstitution.ts
- [x] Build converter stall / turbo efficiency diagnostic logic in reasoning engine
- [x] Add LB7-specific knowledge to vehicleKnowledgeBase

## Converter Stall & Boost Leak Diagnostics
- [x] Build converter stall vs turbo spool mismatch detection (WOT stall RPM vs turbo spool threshold)
- [x] Build boost leak suspicion logic (peak boost lower than expected for MAF/turbo size, MAP sensor should be maxed)
- [x] Compound diagnosis: tight stall + boost leak exaggerate each other — note this in diagnostics
- [x] Never state stall is "too tight" definitively — suggest as a possibility
- [x] Add LB7 platform to vehicleKnowledgeBase with CP3, solenoid injectors, Allison 1000 5-speed
- [x] Add PCM.* candidates to pidSubstitution.ts

## LB7 Diagnostic Fixes (Post-Upload Testing)
- [x] Suppress VGT vane position recommendations/details for LB7 (no VGT — fixed geometry turbo)
- [x] Suppress EGT sensor warnings/recommendations for LB7 (no EGT sensors on LB7)
- [x] Increase rail pressure deviation threshold by ~10% to eliminate false faults on acceptable deviation
- [x] Map all warnings to corresponding fault analysis graphs (e.g., rail pressure warning must show graph with problematic zone)
- [x] Fix turbo spool lag detection — slow boost build for extended time was not flagged; logic from converter stall analysis should trigger

## LB7 Customer Case Training Data (Kory @ PPEI)
- [x] Encode real case: Suncoast 2200 triple disc actual flash stall ~1300 RPM (well below rated 2200)
- [x] Add knowledge: mechanical boost gauge reading (31-33 PSI) > MAP sensor reading (29 PSI) confirms sensor saturation
- [x] Add knowledge: no boost leak confirmed + tight stall = stall is primary issue for lag/smoke
- [x] Add knowledge: MAF limiting trade-off — less smoke but more lag when converter can't flash high enough
- [x] Add knowledge: turbo shaft speed concern — tight stall can overspeed turbo trying to push air
- [x] Encode into converter stall analysis: rated stall vs actual flash stall discrepancy is common
- [x] Suppress EGT PID suggestion for platforms without factory EGT sensors (LB7)
- [x] Fix fault-to-graph mapping: every warning/fault must have a corresponding graph zone

## LB7 Fixes Round 2
- [x] Suppress DPF PID suggestion for LB7 (no DPF on LB7)
- [x] Fix turbo overspeed context: tight stall does NOT overspeed turbo — boost leak does (turbo spins harder compensating for lost pressure)
- [x] Rename "AI REASONING ENGINE" / "PPEI AI REASONING ENGINE" → just "PPEI AI REASONING" everywhere
- [x] Add converter stall / turbo spool chart — show boost vs RPM during WOT launches to visualize the lag (fault zone graph style)
- [x] Fix reasoning panel title to "PPEI Ai Reasoning" (not all caps) with small beta tab badge
- [x] Add small beta tab badge next to "Performance Analyzer" on home screen branding
- [x] Fix feedback form — already wired to DB + notifyOwner() (confirmed table + router exist)
- [x] Fix feedback form — already wired: saves to DB + notifyOwner() to Manus notifications (verified table exists)

## Chart Zoom/Pan/Scroll + Reasoning Linking
- [x] Add mouse wheel zoom on all charts (Dyno, Boost Efficiency, all Fault Zone charts)
- [x] Add click-drag pan on all charts
- [x] Add zoom controls (buttons for zoom in/out/reset)
- [x] Add pinch-zoom support for touch devices
- [x] Add clickable links from PPEI AI Reasoning findings to their corresponding fault zone chart sections
- [x] Highlight the linked fault zone chart when navigated to from reasoning panel

## PCAN-USB Adapter Detection
- [x] Add USB VID/PID-based adapter detection (PEAK 0x0C72 vs OBDLink/FTDI/STN)
- [x] Show specific error message when PCAN-USB detected explaining it's a raw CAN interface, not ELM327
- [x] Improve generic connection failure messages with adapter compatibility guidance
- [x] Add supported adapter list to the connection UI help section

## PCAN-USB Messaging & Port Picker UX
- [x] Change "select your OBDLink device" log message to generic adapter language
- [x] Add pre-connect warning when PCAN-USB won't appear in port picker (it's not a serial device)
- [x] Update DataloggerPanel connect button flow to show "device not showing?" help
- [x] Update all remaining OBDLink-specific text references to be adapter-agnostic

## PCAN-USB Connection Support
- [x] Research PCAN-USB browser communication (WebUSB vs local bridge)
- [x] Build PCAN-USB connection class with raw CAN frame protocol
- [x] Implement ISO 15765-2 (ISO-TP) transport layer for multi-frame messages
- [x] Implement OBD-II over raw CAN (Mode 01, Mode 09 VIN, Mode 22 GM extended)
- [x] Add adapter selection UI (OBDLink/ELM327 vs PCAN-USB) to DataloggerPanel
- [x] Ensure both connection paths produce identical PID data output
- [x] Write tests for raw CAN frame encoding/decoding and ISO-TP

## PCAN Bridge Connection Fix
- [x] Fix mixed content blocking — HTTPS page cannot connect to ws:// localhost WebSocket
- [x] Add TLS/wss:// support to pcan_bridge.py with auto-generated self-signed certificate
- [x] Update PCANConnection to try wss:// first, fall back to ws://
- [x] Add clear error messaging about mixed content if both fail
- [x] Test connection flow end-to-end

## PCAN Bridge Startup Fix
- [x] Fix bridge hanging on startup — start WebSocket server immediately, defer CAN bus connection
- [x] Add clear startup output logging so user can see what's happening
- [x] Make CAN bus connection happen only when browser sends connect command
- [x] Handle case where PCAN-USB is plugged in but not connected to vehicle

## Accept All CSV Datalogs + Feedback Mobile Fix
- [x] Remove accepted file type text/restrictions from analyzer upload area
- [x] Accept all CSV datalogs regardless of format
- [x] If a file fails to parse, send bug notification to owner with file details instead of rejecting
- [x] Fix feedback panel mobile layout — submit button goes off-screen on phones

## Upload Area Text
- [x] Add "Currently only CSV supported" text to upload areas on Home, Advanced, and CompareView pages

## Live Gauge Dashboard for Datalogging
- [x] Build RadialGauge component (motorsport-style circular gauge with needle, tick marks, value readout, carbon fiber texture)
- [x] Build MiniGauge component (smaller version for secondary PIDs)
- [x] Build BarGauge component (horizontal/vertical bar style for linear values like throttle position)
- [x] Build LiveGaugeDashboard layout with configurable grid of gauge slots
- [x] Add drag-and-drop from PID list to gauge slots for PID assignment
- [x] Add right-click context menu on gauge slots for PID selection/removal
- [x] Add layout toggle in DataloggerPanel (LIST view vs GAUGE view) — keep current list layout as default
- [x] Wire gauge components to live PID data stream from datalogger
- [x] Style gauges with dark motorsport theme (carbon fiber, chrome bezels, red/cyan accents matching reference image)
- [x] Write tests for gauge components and PID assignment logic (23 tests)

## ECU Calibration Editor (EFILive-style)

### Phase 1: A2L Parser & Binary Mapper
- [ ] Build A2L parser supporting GM-style (L5P E41, 10L1000 T93) and Bosch DAMOS-style (Can-Am MG1CA920)
- [ ] Parse CHARACTERISTIC blocks (VALUE, CURVE, MAP types) with address, record layout, compu method, axis descriptors
- [ ] Parse MEASUREMENT blocks for live data definitions
- [ ] Parse COMPU_METHOD blocks (RAT_FUNC linear scaling, TAB_INTP lookup tables)
- [ ] Parse RECORD_LAYOUT blocks to determine data types (UBYTE, UWORD, SWORD, FLOAT32, etc.)
- [ ] Parse AXIS_PTS and AXIS_DESCR (COM_AXIS, FIX_AXIS, STD_AXIS) for table axes
- [ ] Build Cummins CSV map format parser as A2L alternative (semicolon-delimited with Address;Name;Size;Values;AxisX;AxisY)
- [ ] Build binary format readers: raw binary, Motorola S-Record (L5P PTP), Intel HEX (Can-Am), PPEI container format
- [ ] Reuse existing binaryParser.ts format detection for all formats already supported by the binary upload tool
- [ ] Build automatic offset alignment engine (anchor pattern matching between A2L addresses and binary data)
- [ ] Store A2L files in S3 indexed by ECU family for persistent library
- [ ] Auto-match uploaded binaries to stored A2L by ECU family identification

### Phase 2: Calibration Map Viewer/Editor UI
- [ ] Build map tree browser (searchable, organized by subsystem/category from A2L naming conventions)
- [ ] Build 2D table editor with color-coded cells (heat map coloring based on value range)
- [ ] Build 1D curve editor with inline chart visualization
- [ ] Build scalar value editor for single-value calibrations
- [ ] Build 3D surface plot for MAP-type calibrations (RPM x load x value)
- [ ] Build hex view with highlighted regions showing which bytes belong to which map
- [ ] Build side-by-side compare between stock and modified binaries (diff highlighting)
- [ ] Support cell editing with real-unit display (scaling via COMPU_METHOD)
- [ ] Support undo/redo for all edits
- [ ] Right-click context menu on cells (copy, paste, interpolate, fill, scale by %)

### Phase 3: Integration & Navigation
- [x] Add Editor tab next to Datalogger in Advanced mode
- [x] Move existing Binary viewer into Editor as a sub-tab (Hex View)
- [x] File upload flow: upload binary → auto-detect ECU family → match A2L → show map tree
- [x] Support uploading A2L alongside binary (or use stored A2L from library)
- [x] Support uploading Cummins CSV map format as alternative to A2L

### Phase 4: LLM-Assisted Calibration Chat (Erika)
- [x] Build calibration chat panel (ErikaChat) connected to editor context
- [x] LLM can see currently open map, its values, and the A2L annotation/description
- [x] LLM can reference uploaded datalogs to correlate calibration values with logged behavior
- [x] LLM helps with: DTC disable guidance, limiter identification, calibration strategy explanation
- [x] LLM can suggest calibration changes based on datalog analysis
- [x] LLM can study full A2L structure to trace control logic and map relationships (inputs → outputs)
- [x] LLM can help user design new features (e.g., launch control, flat-foot shifting, anti-lag) by identifying relevant tables, proposing strategies, and pointing to specific cells
- [x] LLM can validate feature implementations by analyzing post-test datalogs against the design intent

### Phase 5: File Export & Cloud Storage
- [x] Export modified binary to user's local browser (download)
- [ ] Google Drive integration for file reference and save
- [ ] Support additional cloud storage providers (future)
- [x] Name the calibration LLM assistant "Erika" throughout UI, chat panel, and system prompts

## Erika Personality & Forum Knowledge
- [x] Erika gains knowledge from public forums: PCMHacking, MHHAuto, DuramaxForum, CumminsForums, Powerstroke, BMW, LS, Tesla, 2JZ, Can-Am, powersports forums
- [x] Erika evaluates and reasons with beyond-expert-level knowledge from those sources
- [x] Erika cites sources when giving forum-sourced opinions (non-validated info)
- [x] Erika has a tongue-in-cheek sense of humor, extremely rare mom jokes
- [x] Erika has a fun personality but gets detailed and expert-level thorough when hammering through a project
- [x] Erika provides access to complete mapped A2L when user asks (full map list with all parsed characteristics)
- [x] If maps are missing, Erika explains why (unsupported layout, missing COMPU_METHOD, offset failure), suggests solutions, or says "SOL"

## Editor Smart Search Engine
- [x] Build intelligent on-the-fly search across all maps, measurements, and categories
- [x] Instant results as user types (debounced keystroke search)
- [x] Smart ranking: exact > starts-with > contains > address > description > category > unit > fuzzy (11 scoring tiers)
- [x] Show map type, category, address, unit, and value status in search results
- [x] Click result to navigate directly to that map in the editor
- [x] Search by: map name, description, category, subcategory, address (hex), unit, annotations, camelCase/underscore split
- [x] Keyboard navigation (↑↓ arrows, Enter to select, Escape to clear)
- [x] Highlight matched text in results with red highlight spans
- [x] Show result count and search time (ms)

## Checksum Correction, Flash Procedures & ECU Unlocks (Target: ~4 weeks)
- [ ] Implement checksum correction on binary export (per ECU family: CRC32, sum, XOR, proprietary)
- [ ] Research checksum algorithms from PCMHacking source, A2L checksum blocks, functional docs
- [ ] Detect checksum regions in binary (header checksums, calibration checksums, OS checksums)
- [ ] Auto-fix checksums before export so modified files are flash-ready
- [ ] Build flash procedure support (read/write routines per ECU family)
- [ ] Research flash bootloader routines from PCMHacking, strategy docs, source code
- [ ] Implement ECU unlock/security access routines (seed-key algorithms per ECU family)
- [ ] Study A2L, functional documents, strategy docs, and ECU source code for unlock procedures
- [ ] Support J2534 passthru device communication for flash operations
- [ ] Build flash progress UI with verification and error handling
- [ ] Validate exported files have correct checksums before allowing flash

## WinOLS-Equivalent Hex Editor
- [x] Full hex editor view with byte-level editing (like WinOLS hex view)
- [x] Selectable byte ranges with mouse drag and shift-click
- [x] ASCII/hex dual-pane display (hex on left, ASCII on right)
- [x] Go-to-address navigation (jump to hex offset)
- [x] Find/replace in hex data (byte patterns, text strings)
- [x] Color-coded regions showing mapped A2L areas vs unmapped regions
- [x] Highlight modified bytes (show original vs modified in different colors)
- [x] 2D map detection from hex selection (WinOLS-style: select a region, define axes, preview as table)
- [x] Define new maps from hex selection (user selects bytes, defines data type, rows, cols, axis)
- [x] Byte grouping options (8-bit, 16-bit LE/BE, 32-bit LE/BE, float)
- [x] Copy/paste hex data
- [x] Undo/redo for all hex edits
- [x] Bookmarks for frequently accessed addresses
- [x] Status bar showing cursor position, selection size, data type preview

## Multi-Tune Comparison & Calibration Diff
- [x] Load multiple binary files simultaneously for comparison
- [x] Side-by-side hex diff view (highlight byte differences between files)
- [x] Calibration diff tab showing only maps that differ between tunes
- [x] Per-map diff: color-coded cell differences (green=increased, red=decreased, yellow=changed)
- [x] Diff summary: count of changed maps, changed bytes, percentage difference
- [ ] Copy values from one tune to another (cherry-pick map changes)
- [x] Compare stock vs tuned files with change annotations
- [x] Export diff report (list of all changed maps with before/after values in Markdown)
- [ ] Support comparing more than 2 files (A vs B vs C)

## Aisin TCM Mapping, Tuning & Flashing
- [ ] Aisin transmission binary support (load Aisin TCM binaries)
- [ ] Erika studies Aisin documentation, forums, and hex patterns to help discover/define maps from raw hex
- [ ] Aisin map discovery: Erika analyzes hex data patterns to identify shift tables, pressure curves, TCC maps, line pressure, solenoid duty cycles
- [ ] User-assisted map definition workflow: user selects hex region, Erika suggests what it might be based on data patterns and known Aisin structures
- [ ] Aisin flash procedure support (read/write TCM via appropriate protocol)
- [ ] Aisin-specific diagnostic knowledge for Erika (shift quality, TCC slip, line pressure faults)

## J1939 Flashing Support
- [ ] J1939 protocol communication layer for ECM/TCM flash operations
- [ ] J1939 flash read procedure
- [ ] J1939 flash write procedure with verification
- [ ] J1939 security access / seed-key support
- [ ] Support for Cummins ECMs via J1939
- [ ] Flash progress UI with J1939-specific status reporting

## Editor Access & Location
- [x] Move editor from standalone page into Advanced tab (as a tab alongside Binary, Datalogger, etc.)
- [x] Remove standalone /editor route and EDITOR nav link from header
- [x] Add KINGKONG passcode gate before editor access within Advanced tab
- [x] Add a funny joke/personality when user lands on the editor passcode screen
- [x] Editor UI should have a bit of personality throughout
- [x] Add drag-and-drop file loading to editor (drop A2L/binary files onto editor)
- [x] Make editor more interactive and modern feeling
- [x] Add "Jokes" section in editor with Mom Jokes tab and Dad Jokes tab

## Bugs
- [x] Fix binary offset alignment failure when loading binary in calibration editor (auto-detect + auto-fetch)
- [x] Auto-detect ECU family from binary header/signatures when binary is loaded
- [x] Auto-fetch matching stored A2L from S3 when ECU family is detected
- [x] Keep manual A2L/CSV upload as an option alongside auto mode
- [x] Pre-store all user-provided A2L files (E41 L5P, Can-Am MG1CA920, 10L1000 T93, Cummins CSV) in S3
- [x] Erika does NOT volunteer forum sources unless asked — she acknowledges she spent too much time on forums and may get things wrong, but gives attitude about it

## Bug Reports & Polish (User-reported 2026-03-28)
- [ ] Erika AI chat fails to respond / speak
- [ ] Table rendering looks pixelated — needs crisp, high-quality rendering
- [ ] Overall editor UI needs polish: clean, professional, high-DPI quality
- [ ] Editor clarity improvements — make layout and controls more readable

## OEM Engineering Document Study & Market-Disrupting Features (2026-03-28)
- [ ] Deep study P654 Duramax engine control strategy documentation
- [ ] Deep study Raw NOx Model (exhmod_rawnoxmdl) emissions control documentation
- [ ] Deep study LML/LGH Operation Manual calibration procedures
- [ ] Synthesize all findings into actionable feature proposals
- [ ] Identify market-disrupting capabilities from OEM knowledge integration
- [ ] Map OEM control logic to datalogger/diagnostics/editor improvements

## Tiered Editor Levels & Navigation (2026-03-28)
- [ ] Design Level 1-5 map categorization system
- [ ] Level 1: Basic (speed limiter, driver demand, tire size, idle speed)
- [ ] Level 2: Street Performance (fuel maps, boost targets, timing, torque limits)
- [ ] Level 3: Advanced Tuning (injector curves, EGR, VGT control, rail pressure)
- [ ] Level 4: Expert/Emissions (DPF regen, SCR dosing, NOx model, diagnostics)
- [ ] Level 5: Full A2L (all 50K+ maps, raw engineering view)
- [ ] Implement folder tree with smart grouping (not too many items per folder)
- [ ] Add fast navigation: search, jump-to, keyboard shortcuts, breadcrumbs
- [ ] Fix scroll performance for large map lists (virtualized list)
- [ ] Use Erika LLM to auto-categorize maps into tiers on A2L load

## Drag-and-Drop & Manual Load UX (2026-03-28)
- [ ] Drag-and-drop A2L should auto-load immediately (no extra click)
- [ ] Manual file picker A2L should require a click to confirm/load

## Future: SKOOL Tuning Course (Reminder for User)
- [ ] REMINDER: User needs to upload stock vs tuned binary, datalog, and dyno graphs
- [ ] Build Level 1/2/3 fundamental tuning course content using A2L + editor tools
- [ ] Record educational tuning videos for SKOOL (Alex Hormozi platform)
- [ ] Use binary diff, A2L map viewer, and Erika to walk through calibration changes
- [ ] Content strategy: videos market the project, funding cycle continues
- [ ] User already created SKOOL account — ready when materials are uploaded

## Active Commands & Comprehensive CAN Mining (2026-03-28)
- [ ] Extract all CAN IDs, TX/RX pairs from DBC/ARXML files
- [ ] Extract all IOControl ($2F) commands for actuator tests
- [ ] Extract all RoutineControl ($31) commands (DPF regen, TPMS reset, etc)
- [ ] Extract all DID definitions with data types and scaling from ARXML
- [ ] Build comprehensive PID + command database for logger
- [ ] Add DPF forced regen command to logger
- [ ] Add TPMS reset command to logger
- [ ] Add injector buzz test / cylinder balance test commands
- [ ] Add all new PIDs from P654 Mode 22 table to logger
- [ ] Add per-cylinder balance rate monitoring PIDs
- [ ] Add VGT learned offset tracking PIDs
- [ ] Add DPF regen state machine decoding
- [ ] Add raw CAN bus signal logging (from DBC definitions)
- [ ] Add active command UI panel in datalogger

## Bug Fix (2026-03-28)
- [ ] Fix drag-and-drop A2L auto-load not working (user reported)

## Bug Fix: 2024 E42 Duramax Analyzer Connection (2026-03-28)
- [ ] Fix 2024 E42 Duramax not connecting to analyzer (user reported)
- [ ] Cross-reference E42 A2L DID addresses with analyzer PID database
- [ ] Ensure directed CAN addressing (29-bit extended) works for E42

## Editor Access Control (2026-03-28)
- [x] Move editor into Advanced section (not standalone route)
- [x] Add passcode gate "kingkong" to access editor in Advanced section

## Erika Knowledge Base Training (2026-03-28)
- [ ] Extract key technical content from P654 (injection, turbo, EGR, DPF, diagnostics)
- [ ] Extract key content from EDC17 Tuning Guide (map addresses, tuning procedures)
- [ ] Extract key content from MG1 Strategy Book (control algorithms, module functions)
- [ ] Extract key content from NOx Model document (emissions prediction algorithm)
- [ ] Extract key content from EDC16 Funktionsrahmen (fundamental functions)
- [ ] Build comprehensive Erika knowledge base file with all extracted content
- [ ] Update Erika system prompt to reference functional document knowledge
- [ ] Erika should NOT volunteer her sources unless asked

## Full-Screen Erika Chat Mode (2026-03-28)
- [ ] Add full-screen/expanded mode for Erika chat panel
- [ ] Users should be able to sit and have extended tuning conversations with Erika
- [ ] Toggle between inline editor panel and full-screen chat mode

## Security Access Reference Database (2026-03-28)
- [ ] Compile all seed/key algorithms into structured reference file (Ford MG1, EDC17, Cummins, Polaris, CAN-am, TCU)
- [ ] Build UDS security access reference (levels, DIDs, routines, IO controls per ECU family)
- [ ] Add security access reference to logger's shared knowledge base
- [ ] Logger references security procedures for advanced operations (DPF regen, TPMS, memory read, etc.)
- [ ] Train Erika on seed/key concepts and security access procedures

## Full UDS Service Layer - Beyond ForScan/Alpha OBD (2026-03-28)
- [ ] Build complete UDS protocol stack in logger (all ISO 14229 services)
- [ ] ReadDataByIdentifier ($22) - read any DID from any module
- [ ] WriteDataByIdentifier ($2E) - write DIDs (IQA codes, VIN, tire size, config)
- [ ] ReadMemoryByAddress ($23) - read raw ECU memory using A2L addresses
- [ ] WriteMemoryByAddress ($3D) - write raw ECU memory
- [ ] IOControlByIdentifier ($2F) - actuator tests (injector buzz, VGT override, fan on/off)
- [ ] RoutineControl ($31) - start/stop/get results (DPF regen, TPMS learn, injector coding)
- [ ] SecurityAccess ($27) - seed/key unlock for protected operations
- [ ] DiagnosticSessionControl ($10) - switch sessions (default/extended/programming)
- [ ] CommunicationControl ($28) - enable/disable CAN message transmission
- [ ] TesterPresent ($3E) - keep diagnostic session alive
- [ ] ECUReset ($11) - hard/soft reset ECU
- [ ] ReadDTCInformation ($19) - full DTC read with freeze frame, snapshot, extended data
- [ ] ClearDiagnosticInformation ($14) - clear DTCs per module
- [ ] RequestDownload ($34) / TransferData ($36) / RequestTransferExit ($37) - flash capability
- [ ] Build module scanner - auto-discover all ECUs on the bus with their supported services
- [ ] Build DID browser - scan and display all readable DIDs per module
- [ ] Build command palette UI for sending raw UDS commands
- [ ] Build preset command library (DPF regen, TPMS reset, injector test, etc.)
- [ ] Add A2L-aware memory browser (use A2L addresses for live ECU memory reads)
- [ ] Give user full read/write DID access with safety confirmations for writes

## CAN-am / BRP Vehicle Support (2026-03-28)
- [ ] Implement CAN-am seed/key algorithm (SK_CANAM) in logger
- [ ] Implement BRP Dash seed/key algorithm (SK_DASHCANAM) in logger
- [ ] Add VIN write capability for CAN-am vehicles (DID 0xF190 via $2E)
- [ ] Add CAN-am diagnostic session and security access flow
- [ ] Add BRP-specific DID database for CAN-am vehicles

## HIGH PRIORITY: CAN-am VIN Change + Key Relearn (2026-03-28)
- [ ] Research complete CAN-am VIN change procedure (forums, BuDS reverse engineering)
- [ ] Research CAN-am immobilizer/DESS key relearn procedure
- [ ] Research CAN-am ECU module addresses and CAN bus topology
- [ ] Implement CAN-am VIN write with full validation (checksum, format)
- [ ] Implement CAN-am DESS key relearn sequence
- [ ] Implement CAN-am immobilizer reset/reprogram
- [ ] Build guided wizard UI for CAN-am VIN change + key relearn
- [ ] Add safety confirmations and backup before any write operations

## Tiered Logger Levels & Search (2026-03-28)
- [ ] Logger Level 1 — Basic: Standard OBD-II Mode 01 PIDs (ELM327 friendly)
- [ ] Logger Level 2 — Extended: GM Mode 22 DIDs (per-cylinder balance, VGT offsets, DPF regen state)
- [ ] Logger Level 3 — Advanced: Raw CAN bus signals from DBC (steering angle, wheel speeds, ACC, BCM)
- [ ] Logger Level 4 — Expert: Full UDS (ReadMemoryByAddress, IOControl, RoutineControl, WriteDataByIdentifier)
- [ ] Logger PID search with reasoning (explain what each PID does, level required, hardware needed)
- [ ] TX command panel for sending CAN messages (DPF regen, TPMS reset, injector buzz, etc.)
- [ ] Organize PIDs into smart categories with counts
- [ ] CAN-am VIN write + key relearn module
- [ ] CAN bus gateway bridging (HS→LS like BTDieselWorks AutoSync)

## Live ECU RAM Reading & Live Tuning via A2L (2026-03-28)
- [ ] A2L-aware live RAM reader — poll any CHARACTERISTIC address via ReadMemoryByAddress ($23)
- [ ] Live value display with A2L scaling/conversion (COMPU_METHOD applied in real-time)
- [ ] Live 2D/3D map viewer — read entire map from RAM and display with axis labels
- [ ] Live tuning — WriteMemoryByAddress ($3D) to change calibration values in RAM in real-time
- [ ] Map diff view — compare live RAM values vs binary file values (detect what's been tuned)
- [ ] Watchlist — user selects maps from A2L tree to monitor live
- [ ] Safety: require security access before any write operations
- [ ] Safety: snapshot current values before any write (undo capability)
- [ ] Flash-to-permanent option after live tuning session (RequestDownload/TransferData sequence)

## IntelliSpy — AI-Powered CAN Bus Sniffer (2026-03-28)
- [x] IntelliSpy frame capture engine — real-time CAN frame logging with arb ID tracking, delta detection, frequency analysis
- [x] IntelliSpy auto-decode layer — cross-reference captured frames against UDS DID tables, DBC signals, A2L calibration maps
- [ ] IntelliSpy Erika integration — real-time AI commentary on observed bus traffic patterns and anomalies (Phase 2)
- [x] IntelliSpy unknown ID pattern matching — reverse-engineering suggestions based on byte change patterns and known ECU behavior
- [x] IntelliSpy frame filtering and highlighting — filter by arb ID, data pattern, frequency; highlight changes in real-time
- [ ] IntelliSpy session recording — capture and replay CAN bus sessions with full decode overlay (Phase 2)
- [x] IntelliSpy wire into Advanced.tsx as new tab

## CAN-am VIN Changer — PEAK Device Wizard (2026-03-28)
- [x] CAN-am VIN Changer — step-by-step wizard panel with PEAK device connection
- [x] CAN-am VIN Changer — ECU identification (MED17.8.5 vs MG1CA920 auto-detection)
- [x] CAN-am VIN Changer — security access with seed/key algorithm (level 3)
- [x] CAN-am VIN Changer — current VIN read via DID F190
- [x] CAN-am VIN Changer — new VIN write via WriteDataByIdentifier ($2E F190)
- [x] CAN-am VIN Changer — DESS key re-learn guidance and routine control
- [x] CAN-am VIN Changer — NRC error handling with human-readable explanations
- [x] CAN-am VIN Changer — wire into Advanced.tsx as new tab

## System Architecture Flowchart PDF (2026-03-28)
- [x] Generate comprehensive system architecture flowchart showing how all AI modules feed each other
- [x] Include: Datalogger → Analyzer → Erika, IntelliSpy → UDS Reference → Seed/Key, A2L → CalEditor → Live Tuning, Binary → VIN/ECU decode, CAN-am VIN → PCAN bridge, knowledge base interconnections
- [x] Render as high-quality PDF for visual reference

## Erika CAN Tool Training (2026-03-28)
- [x] Train Erika on Vehicle Spy (Intrepid) concepts: signal decoding, message editor, scripting, filter/trigger
- [x] Train Erika on SavvyCAN: open-source CAN analyzer, DBC loading, frame filtering, RE workflows
- [x] Train Erika on CANape (Vector): A2L/XCP measurement, calibration, ECU flashing concepts
- [x] Train Erika on CANoe (Vector): simulation, CAPL scripting, diagnostic sequences, trace analysis
- [x] Train Erika on PCAN-View (PEAK): trace view, transmit list, CAN bus statistics
- [x] Train Erika on BusMaster: open-source CAN tool, signal database, J1939 support
- [x] Inject all CAN tool knowledge into erikaKnowledge.ts shared module

## Powersports PIDs — CAN-am / BRP / Polaris / Kawasaki (2026-03-28)
- [x] Add CAN-am (Rotax) extended PIDs — ECT, IAT, RPM, TPS, MAP, fuel pressure, oil temp/pressure, DESS status, battery, speed
- [x] Add BRP Sea-Doo extended PIDs — supercharger boost, intercooler temp, exhaust temp, impeller RPM, ride plate, GPS speed
- [x] Add Polaris extended PIDs — ECT, IAT, RPM, TPS, MAP, fuel pressure, oil temp, AWD status, belt temp, battery, speed
- [x] Add Kawasaki extended PIDs — ECT, IAT, RPM, TPS, MAP, fuel pressure, oil temp, gear position, lean angle, battery
- [x] Add powersports presets (CAN-am Performance, Sea-Doo Boost Monitor, Polaris Trail, Kawasaki Sport)
- [x] Add powersports VIN WMI codes for auto-detection
- [x] Write tests for powersports PID definitions

## Module Scanner & Vehicle Coding — AlphaOBD/FORScan-style (2026-03-28)
- [x] Module Scanner — scan all ECU addresses (0x700-0x7FF), read identification DIDs, build module map
- [x] Fuel Tank Size coding — Ford (IPC as-built) and RAM (BCM config) diesel priority (#1 priority)
- [x] Tire Size coding — Ford (IPC/PCM as-built) and RAM (BCM/PCM config) diesel priority (#1 priority)
- [x] As-Built Data reader — read raw config blocks from modules (FORScan-style hex editor)
- [ ] Output Control / Actuator Test panel — bidirectional IO control ($2F) (Phase 2)
- [x] Service Procedure engine — step-by-step wizard framework for DPF regen, ABS bleed, etc.
- [x] DPF Forced Regen procedure — RoutineControl ($31) for Ford/RAM/GM diesels
- [x] Injector Coding panel — write IQA/trim codes after injector replacement
- [x] TPMS Sensor Relearn — program sensor IDs into BCM
- [x] Service Light / Oil Life Reset — WriteDataByIdentifier ($2E)
- [x] Adaptive Value Reset — clear learned fuel trims, transmission shifts

## Market Summary Document (2026-03-28)
- [x] Write comprehensive summary: what this system does better than the market
- [x] Explain why Walmart, truck stops, tire shops, mechanic shops, and everyday people need this tool
- [x] "The code reader is dead" positioning

## Rebrand: V-OP by PPEI (2026-03-28)
- [x] Update app title from "Duramax Performance Analyzer" to "V-OP by PPEI"
- [x] Update all header text — "PERFORMANCE ANALYZER" → "V-OP"
- [x] Update subtitle — "AI-POWERED DIAGNOSTICS" → "VEHICLE OPTIMIZER"
- [x] Update page title (index.html, VITE_APP_TITLE — manual update needed in Settings)
- [x] Update all component references to old branding
- [x] Update PDF reports and export branding
- [x] Update Erika's knowledge base references
- [x] Update document titles (architecture PDF, market summary)

## Remove All "Duramax Analyzer" References (2026-03-28)
- [x] Find and replace every "Duramax Performance Analyzer" and "Duramax Analyzer" reference
- [x] Replace with "V-OP by PPEI" or "V-OP" as appropriate
- [x] Verify no remaining references in source code, comments, documents, or metadata

## Bug Fixes (2026-03-28)
- [x] Fix: Binary + A2L load not populating editor/map tree — Mav R binary loaded with A2L and nothing happened
- [x] Fix: File picker showing "Custom" filter instead of "All Files" — needs to accept all file types
- [x] Fix: Maps don't have values after loading binary + A2L (Mav R) — alignment/populateMapValues issue
- [x] Add map size indicators to MapTreeBrowser (1×1 single, 1×N curve, N×M 3D map)

## Magic Mode - AI Map Name Simplification (2026-03-28)
- [x] Build Magic Mode toggle in CalibrationEditor (Engineering vs Magic view)
- [x] AI-powered map name translation: engineering names → plain English (e.g., "spdlm_rngaccess_thx_Mode_01" → "Speed Limit Mode 1")
- [x] Smart re-categorization: group maps into user-friendly folders (Speed Limits, Fuel, Boost, etc.)
- [x] Keep original A2L engineering names accessible when toggling back
- [x] Batch process map names via LLM with context about ECU type and map parameters
- [x] Cache translated names to avoid re-processing

## Alignment Engine Improvements (2026-03-28)
- [x] Add CAN-am/BRP ECU offset patterns (MED17.8.5, MG1CA920 base addresses)
- [x] Add zero-offset fallback strategy for raw flash dumps
- [x] Widen brute-force search range and improve stepping algorithm
- [x] Add alignment status indicator in CalibrationEditor UI

## Self-Healing Alignment with Erika Auto-Intervention (2026-03-28)
- [x] Build validateAlignment() — scan populated values for misalignment signs (all zeros, out-of-range, NaN)
- [x] Build autoHealAlignment() — progressive retry with alternative strategies when validation fails
- [x] Erika auto-intervention: detect bad alignment, try fixes, report what she tried and found
- [x] Signature-based anchor search: scan binary for known calibration byte patterns
- [x] Self-reporting alignment log: show user what strategies were tried and results

## Version Bump
- [x] Update version from v0.01 to v0.02

## UX Fix (2026-03-28)
- [x] Fix CalibrationEditor: only map tree list should scroll, not the entire page

## Bug Fix (2026-03-28)
- [x] Fix TuneCompare: shows byte differences but reports 0 changed maps — map diff address matching broken

## Feature (2026-03-28)
- [x] TuneCompare: add per-cell copy button to apply individual compare values into primary
- [x] TuneCompare: add per-map copy button to apply all changed cells in a map
- [x] TuneCompare: add confirmation dialog before applying changes
- [x] TuneCompare: update primary binary in-memory after copy operation

## Bug Fix (2026-03-28 continued)
- [x] TuneCompare: diff values showing NaN instead of actual values — fix OOB handling
- [x] TuneCompare: clicking a changed map doesn't select it in left pane — add onSelectMap callback

## Feature (2026-03-28 continued)
- [x] CalibrationEditor: add undo/redo history stack for copy operations
- [x] CalibrationEditor: add Undo/Redo buttons to toolbar
- [x] CalibrationEditor: add keyboard shortcuts (Ctrl+Z / Ctrl+Y) for undo/redo
- [x] CalibrationEditor: display history state in UI (e.g., "Undo (3 changes)" button label)

## Feature (2026-03-28 final)
- [x] CalibrationEditor: add Download Binary button to toolbar
- [x] CalibrationEditor: prompt for filename or use default with timestamp
- [x] CalibrationEditor: export binary in original format (BIN/SREC/iHEX)

## Feature (2026-03-28 advanced)
- [x] TuneCompare: detect file size mismatch between primary and compare binaries
- [x] TuneCompare: Erika auto-fix attempts (padding, truncation, offset adjustment)
- [x] TuneCompare: warning banner with offset diagnostics if mismatch persists
- [x] TuneCompare: show which offsets could be in error and why

## Feature (2026-03-28 batch copy)
- [ ] TuneCompare: group maps by category (from Magic Mode or A2L)
- [ ] TuneCompare: add checkboxes for per-category selection
- [ ] TuneCompare: add "Copy Selected Categories" button
- [ ] TuneCompare: show count of selected maps before batch copy

## Bug Fix (2026-03-28 NaN issue)
- [x] TuneCompare: diff values showing NaN for Min/Max/Avg and actual values — added Min/Max/Avg calculation to MapDiff

## Critical Bugs (2026-03-28)
- [ ] NaN values in TuneCompare: debug data type resolution to ensure it matches A2L definitions
- [ ] Maps not appearing in right pane when selected from left tree — fix state sync issue
- [ ] Compare file lost when switching tabs — preserve compare state and add close button

## MG1CA920 BIN Offset & Map Dimension Fixes (2026-03-28)
- [x] Fix MG1CA920 BIN offset alignment (base 0x08FD8000 confirmed via HEX-to-BIN brute-force)
- [x] Fix AXIS_PTS reading to skip NO_AXIS_PTS_X count word in RB_Axis layouts
- [x] Add 0x08FD8000 to autoHeal boschBases list
- [x] Fix detectEcuFamily routing so MG1CA920 gets its own known offset list
- [x] Document offset-discovery playbook for reuse across EDC17, EDC16, MED9, and other Bosch platforms

## Polaris MG1C400A1T2 Support & Auto-Match A2L (2026-03-28)
- [ ] Analyze Polaris MG1C400A1T2 A2L and S-Record to find correct BIN base address
- [ ] Add Polaris MG1C400A1T2 to alignment engine known offsets and ECU family detection
- [ ] Implement auto-match A2L-on-binary-drop: store A2L files, auto-detect ECU family from BIN, auto-load matching A2L
- [ ] Test Polaris maps display correctly (values, dimensions, 2D/3D types)
- [ ] Update offset discovery playbook with Polaris findings


## Polaris MG1C400A1T2 Unlock Patch Analysis (2026-03-28)
- [x] Dynojet unlock: single-byte patch at 0x030363 (0x23 → 0x03)
- [x] HPTuners unlock: 10-byte patch across multiple regions (checksums + config flags)
- [x] Document both unlock mechanisms in POLARIS_UNLOCK_PATCHES.md
- [x] Race Flash tuning: 4,127 regions modified (comprehensive performance tune)
- [x] Document Race Flash tuning in POLARIS_RACE_FLASH_TUNING.md
- [x] Create PatchManager component for detecting and applying patches
- [x] Create TuneCompareEnhanced component with original vs comparison toggle
- [ ] Integrate patch tool into CalibrationEditor tabs
- [ ] Test patch tool with all Polaris files (stock, unlocked, tuned)


## ECU Auto-Detection & A2L Auto-Load (2026-03-28)
- [x] Create ECU detection engine with binary signature patterns
- [x] Implement A2L registry system (database or local storage)
- [x] Create auto-load logic for matching A2L files
- [x] Add ECU detection UI component with confidence indicator
- [x] Integrate into CalibrationEditor binary upload flow
- [ ] Test with Can-Am MG1CA920 and Polaris MG1C400A1T2 files

## Enhanced TuneCompare UI (2026-03-28)
- [x] Add toggle button to switch between Original and Comparison values in right pane
- [x] Display Original/Comparison/Difference for single VALUE parameters under stats
- [x] Implement side-by-side layout for single-column maps
- [x] Implement top-to-bottom layout for single-row maps
- [ ] Test with Polaris files and verify all layouts work correctly


## Can-Am Spyder ME17 Decompilation (2026-03-28)
- [x] Analyze Spyder ME17 A2L structure vs MG1 differences (3,276 chars, 88 layouts, base 0x80020000)
- [x] Parse Spyder HEX file and map A2L addresses to binary data (1,707 addresses verified)
- [x] Extract calibration definition patterns (maps, curves, values, data types)
- [x] Build ME17 decompilation template for identifying calibrations (documented in ME17_DECOMPILATION_TEMPLATE.md)
- [ ] Create A2L generator tool to synthesize definitions from binary
- [ ] Test decompilation with other Can-Am ME17 files

## Binary Upload Format & Polaris Offset Fix (2026-03-28)
- [ ] Analyze Polaris S-Record to find correct MG1C400A1T2 base address
- [ ] Extend binary file upload to accept .hex, .s, .bdc file formats
- [ ] Add Intel HEX (.hex) parser to binary loading pipeline
- [ ] Add Motorola S-Record (.s) parser to binary loading pipeline
- [ ] Fix Polaris MG1C400A1T2 offset in alignment engine
- [ ] Test with Polaris files and verify correct map values


## Erika Decompilation Learning References (2026-03-28)
- [x] Analyze IDA Pro Nissan ECU decompilation video (SH7058, vector tables, call tables)
- [x] Create IDA_PRO_NISSAN_ECU_DECOMPILATION.md reference guide
- [x] Analyze WinOLS & Ghidra ECU decompilation video (DTC maps, hex search, code verification)
- [x] Create WINOLS_GHIDRA_ECU_DECOMPILATION.md reference guide
- [ ] Implement hex search and pattern detection in binary analyzer
- [ ] Implement Ghidra-style address reference scanning
- [ ] Build reference library of known ECU calibration addresses and patterns

## Tune Management System (2026-03-28)
- [x] Create tune_folders and saved_tunes database tables with auto-organization indexes
- [x] Build tRPC procedures for folder CRUD (create, rename, move, delete)
- [x] Build tRPC procedures for tune CRUD (save, load, update, delete, search, favorites)
- [x] Implement auto-organize mutation (Make > Model > Year > ECU Family hierarchy)
- [x] Rebuild TuneManager UI with Save, Open, Export tabs
- [x] Add folder tree sidebar with hierarchical navigation
- [x] Add tune cards with metadata display (vehicle, ECU, stage, power, fuel)
- [x] Add search functionality across all tunes
- [x] Add favorite toggle for quick access
- [x] Add export to local device (Binary, S-Record, Intel HEX formats)
- [x] Wire TuneManager into CalibrationEditor
- [ ] Add tune version history (save multiple versions of same tune)
- [ ] Add batch operations (move/delete multiple tunes)
- [ ] Implement drag-and-drop for folder organization

## Future: Auto-Delivery Tune System
- [ ] Build tune dispatch matching API (vehicle part number + OS version)
- [ ] Implement hardware device registration and authentication
- [ ] Create presigned S3 URL delivery pipeline
- [ ] Add delivery audit trail and logging
- [ ] Integrate with flash container (when provided)

## Editor Data Loss Fix & Datalog Linking (2026-03-28)
- [x] Fix editor state loss when navigating away and returning
- [x] Implement global editor state store that persists across route changes
- [x] Prevent editor component unmount from clearing state (display:none instead of conditional render)
- [x] Add datalog link/unlink to tune files in editor
- [x] Allow uploading datalog CSV to reference alongside tune binary
- [x] Display linked datalog data in editor for tuner reference

## Map Table Editor Modernization (2026-03-29)
- [x] Refined 5-stop heatmap gradient (navy > teal > emerald > amber > crimson) with smoothstep interpolation
- [x] Right-click context menu with smoothing (5 algorithms x 3 presets + custom)
- [x] Math operations submenu (Add, Subtract, Multiply, Divide, Percentage, Fill)
- [x] Selection submenu (Select All, Invert, Clear)
- [x] Inline cell editing (double-click to edit, Enter to confirm)
- [x] Multi-cell selection (click+drag, Shift+click for range)
- [x] Axis header click to select row/column, corner click to select all
- [x] Editable axis values (double-click axis headers)
- [x] Undo/Redo stack (Ctrl+Z / Ctrl+Y, 50 levels)
- [x] Copy/Paste (Ctrl+C / Ctrl+V)
- [x] Interpolate, Flatten to Average, Set to Min/Max, Mirror, Reset to Original
- [x] Modified cell highlighting with gold left accent bar
- [x] Selection status bar (count, min, max, avg, sum)
- [x] Color legend bar with gradient scale
- [x] Keyboard shortcuts (+/- to increment/decrement, Delete to reset)
- [x] Custom smoothing dialog with method, strength, iterations controls

## 3D Surface Visualization & Advanced Editor Features (2026-03-29)
- [ ] Add 3D WebGL surface visualization for map data
- [ ] Toggle between table view and 3D surface view
- [ ] Split-screen view: original vs modified maps side by side
- [ ] Diff highlighting in split-screen compare view
- [ ] Erika map editing: AI can make changes to maps when directed
- [ ] Approval workflow: user approve/reject each Erika change
- [ ] "Approve All" and "Disable Approval" options
- [ ] Summary of all maps Erika changed
- [ ] User default map list: clickable option to load custom layout
- [ ] Map importance selector: user marks which maps are most important
- [ ] Save user layouts to database
- [ ] Load saved layouts from database

## Data Security Requirements (2026-03-29)
- [ ] Hard delete tune files from database AND S3 on user delete (no soft delete)
- [ ] Hard delete layouts from database on user delete (no soft delete)
- [ ] Ensure deleted data is permanently inaccessible by anyone under any conditions
- [ ] No recycle bin, no archive, no recovery — permanent removal only
- [ ] Cascade delete all related records (versions, metadata, comparisons)

## Tune Sharing Between Tuners (2026-03-29)
- [ ] Tuner can share tune files with other tuners
- [ ] Share by username/email with permission levels (view-only, edit, full access)
- [ ] Shared tunes appear in recipient's library under "Shared With Me" folder
- [ ] Owner can revoke sharing at any time
- [ ] Database schema for tune_shares (owner_id, recipient_id, tune_id, permission_level)
- [ ] Shared tunes respect hard delete — if owner deletes, shared access removed too

## Account Deletion & Authority (2026-03-29)
- [ ] User can delete their own account (hard delete all data: tunes, layouts, shares, everything)
- [ ] Only Kory Willis (super_admin) can delete another user's account
- [ ] super_admin role: separate from admin, only assignable by Kory Willis
- [ ] No other admin or user can delete accounts besides self or super_admin
- [ ] Authority assignment: only super_admin can grant/revoke admin privileges
- [ ] Account deletion cascades: remove all tunes, files, S3 objects, layouts, shares, versions, metadata
- [ ] Confirmation dialog with typed confirmation for account deletion

## Geofencing Restrictions (2026-03-29)
- [ ] Admin (super_admin) can draw geofence zones on a map
- [ ] Geofence zones stored in database (polygon coordinates)
- [ ] Users inside geofenced zones are blocked from uploading/downloading tunes
- [ ] Geofence check runs on every tune upload/download request (server-side)
- [ ] User location obtained via browser geolocation API
- [ ] Admin UI to create, edit, delete geofence zones with Google Maps drawing tools
- [ ] Visual display of all active geofence zones on admin map
- [ ] Block message shown to users in restricted zones
- [ ] Can also restrict specific users regardless of location

## Super Admin Panel (2026-03-29)
- [ ] Dedicated Super Admin dashboard (Kory Willis only)
- [ ] User management: view all users, roles, activity, storage usage
- [ ] Account deletion: only super_admin can delete other users
- [ ] Role management: assign/revoke admin, tuner roles
- [ ] Geofence management: create/edit/delete global geofence zones (GOD MODE override)
- [ ] Tuner geofences: tuners can create their own geofence zones for their clients
- [ ] Super_admin can override or remove any tuner geofence
- [ ] Tune library oversight: view all tunes across all users
- [ ] System settings: global configuration, feature flags
- [ ] Activity log: audit trail of all admin actions
- [ ] User ban/suspend: temporarily or permanently restrict users
- [ ] Storage quotas: set and monitor per-user storage limits

## Admin Invisibility (2026-03-29)
- [ ] Super admin account hidden from all public-facing user lists
- [ ] Super admin panel accessible only via hidden route (no nav links visible to anyone)
- [ ] Super admin does not appear in user search, sharing, or any public directory
- [ ] No UI element, navigation item, or footer link reveals admin panel existence
- [ ] Access via secret URL path known only to Kory Willis


## Live Session Sharing & Collaboration (2026-03-29)
- [ ] Add live_sessions and session_participants tables to database with WebRTC support
- [ ] Add session_messages table for real-time chat
- [ ] Add session_recordings table for storing recording metadata (screen + webcam + audio + chat)
- [ ] Implement tRPC procedures for session CRUD (create, join, leave, end)
- [ ] Build WebSocket server for real-time chat and state sync
- [ ] Implement WebRTC peer-to-peer with screen share, webcam, and audio
- [ ] Build screen capture with editor overlay
- [ ] Build webcam video with mute/unmute controls
- [ ] Build picture-in-picture (screen + webcam overlay)
- [ ] Build audio with mute/unmute controls
- [ ] Build audio quality settings (bandwidth adaptation)
- [ ] Implement session recording (capture screen + webcam + audio + chat)
- [ ] Support solo session recording (tuner recording themselves without participants)
- [ ] Build session playback component with timeline and full sync
- [ ] Add access control (view-only, chat, control-sharing, audio, video)
- [ ] Implement educational course marking and tagging
- [ ] Add session recording download/export to local device (MP4 + WebM formats)
- [ ] Allow tuners to mark recordings as educational content
- [ ] Build educational course library (searchable by topic, tuner, vehicle type)
- [ ] Build session list UI with active/archived sessions
- [ ] Add invite link generation for easy sharing
- [ ] Implement session activity log (who joined, when, duration, video/audio events)


## Support Sessions for PPEI Employees (2026-03-29)
- [ ] Add support_sessions table (link, expiration, customer_name, status, created_by, created_at)
- [ ] Add support_session_recordings table (session_id, video_url, duration, created_at)
- [ ] Add support_metrics table (session_id, response_time, resolution_status, customer_feedback)
- [ ] Implement tRPC procedures for support session CRUD (create, join, end, list)
- [ ] Build invite link generation system with 24-hour expiration
- [ ] Create PPEI support dashboard with active sessions list
- [ ] Add "Generate Support Link" button to tuner dashboard
- [ ] Implement guest session mode (no authentication required)
- [ ] Build session permission levels (view-only, chat, control-sharing)
- [ ] Implement real-time cursor tracking for PPEI employee
- [ ] Add customer request queue/ticketing system
- [ ] Build support metrics dashboard (response time, resolution rate, feedback)
- [ ] Create training library from recorded support sessions
- [ ] Add session tagging and searchability for training content
- [ ] Implement customer satisfaction survey after support session


## Guest Session Join UI (2026-03-29)
- [x] Create SupportJoin page (/support/join/:inviteLink) with lobby UI
- [x] Build session lobby with customer name display, PPEI branding, connection status
- [x] Add device permission checks (camera, microphone, screen share) in lobby
- [x] Build active session view with video/audio/screen share panels
- [x] Add real-time chat sidebar in session view
- [x] Build session controls toolbar (mute audio, toggle video, share screen, end session)
- [ ] Create PPEI Support Dashboard page for employees to manage sessions
- [ ] Add "Generate Support Link" flow with customer name/email input
- [ ] Build active sessions list with status indicators
- [ ] Build session history with recordings and metrics
- [x] Add routes to App.tsx for support pages
- [ ] Write tests for support session UI components

## Bug Fixes (2026-03-29)
- [x] Fix Erika chat scroll behavior — new messages should not jump to bottom, view should follow where reply starts

## Editor Enhancements (2026-03-29)
- [ ] Build "Erika's Help" tab in editor — Erika renders actual calibration maps/tables from binary when requested via chat
- [ ] Modified tables tracking — every modified table gets its own tab with translated labels/folders
- [x] Editor sign-in prompt — prompt sign-in on editor entry, allow dismiss with "missing features" notification
- [ ] Inline interpolation controls — move interpolation options below table view for quick access
- [ ] Inline value editor — keep value editor visible below/beside table view for quick edits
- [ ] Right-click "Reference Point" — shows what other maps reference this map and where it points, uses decompiler
- [ ] Deep Erika integration — Erika assists with reference tracing, interpolation decisions, map explanations
- [ ] WinOLS project parser — parse .ols files to extract calibration definitions for definition builder
- [ ] Decompiler integration — use a2l + function sheets + WinOLS data to build definition files from binary

## Critical Bug Fixes (2026-03-29)
- [x] Fix editor state persistence — navigating away from editor tab loses all loaded data (a2l, binary, modifications); must preserve state across tab switches
- [x] Add checksum correction prompt before binary export — ask user if they want to correct checksums before exporting modified binary

## HexEditor Optimization (2026-03-29)
- [x] Refactor HexEditor to use useReducer for centralized state management
- [x] Consolidate 15+ useState calls into single reducer
- [x] Fix undo/redo to properly track multi-batch modified bytes
- [x] Memoize sub-components (HexRow, HexByte) for render performance
- [x] Preserve all existing features: search/replace, bookmarks, go-to, A2L regions, map detection, cursor preview, nibble editing, ASCII mode, byte grouping

## Erika AI Improvements (2026-03-29)
- [x] Integrate diagnostics engine results into Erika's context automatically (pipe diagnostics.ts findings)
- [x] Build RAG system for A2L maps - embed map names/descriptions, retrieve relevant ones per query
- [x] Eliminate A2L truncation problem with intelligent retrieval

## Optional Sign-In Prompt (2026-03-29)
- [ ] Build SignInPrompt component — modal/dialog that appears on first visit
- [ ] Show feature comparison (signed in vs guest) with clear benefits
- [ ] Allow user to dismiss and continue as guest
- [ ] Store dismissal in localStorage so it doesn't reappear every visit
- [ ] Add subtle persistent reminder banner for unsigned users showing missed features
- [ ] Integrate prompt into Home page and Editor page
- [ ] Wire up to existing Manus OAuth login flow

## Optional Sign-In Prompt (2026-03-29)
- [ ] Build SignInPrompt component — clean modal on first visit, no feature details
- [ ] Allow dismiss and continue as guest
- [ ] Store dismissal in localStorage
- [ ] Add subtle persistent reminder for unsigned users
- [ ] Integrate into Home and Editor pages
- [ ] Wire to Manus OAuth login flow

## Editor Search Performance (2026-03-29)
- [x] Optimize map tree search — debounce input (150ms) + pre-computed lowercase fields

## Humor Style Update (2026-03-29)
- [x] Update Erika's editor personality to include real mom and dad jokes — no Tony Stark style burns


## Airflow Outlook Table Replacement (2026-03-29)
- [x] Replace Boost Efficiency chart with Airflow Outlook table showing actual boost, desired boost, actual vane position, desired vane position, and MAF
- [x] Update section headers in Home.tsx and Advanced.tsx
- [x] Update PDF export to reference Airflow Outlook

## Binary-to-Definition Engine (2026-03-29)
- [x] Research PCMTec, HUD ECU Hacker, and Polaris/Can-Am patent documents
- [x] Build binary signature scanning and map pattern discovery engine
- [x] Implement patent-based description generator for maps and parameters
- [x] Write comprehensive tests for the binary analysis engine (16 tests, all passing)
- [ ] Integrate binary-to-definition into CalibrationEditor workflow (allow binary upload without A2L)
- [ ] Build UI for binary analysis results display (discovered maps, confidence scores)
- [ ] Add ability to refine auto-discovered maps with manual axis corrections

## Datalog-to-Calibration Crosshair (2026-03-29)
- [ ] Build DatalogOverlay component with timeline scrubber
- [ ] Implement PID-to-map correlation engine (match datalog values to map axes)
- [ ] Add visual indicators on map tree showing active operating point
- [ ] Add cell highlighting on map tables showing current datalog values
- [ ] Integrate overlay into CalibrationEditor with live sync
- [ ] Write tests for correlation engine


## Binary-to-Definition Cross-Reference Reasoning (2026-03-29)
- [x] Build A2L pattern database system (learn map signatures from uploaded A2L files)
- [x] Implement hex pattern matching and cross-reference lookup (find matching byte sequences)
- [x] Build confidence scoring combining pattern match + axis analysis
- [ ] Integrate cross-reference reasoning into binary analysis workflow
- [x] Write tests for pattern database and cross-reference matching (18 tests, all passing)
- [ ] Display confidence scores in UI (80% match vs 40% axis-only guess)
- [ ] Allow user to refine guesses by selecting from similar known maps


## Live Tuning System (2026-03-29)
- [x] Build access rights detection system (A2L metadata, pattern database, memory heuristics) (28 tests passing)
- [ ] Implement write capability testing (OBD-II Mode 22, UDS services)
- [ ] Build live tuning engine for RAM address read/write
- [ ] Add UI components (access badges, right-click context menu, live tune dialog)
- [ ] Integrate live tuning into CalibrationEditor with real-time value sync
- [ ] Write tests for access detection and live tuning
- [ ] Support fuel tank and tire size modification (Ford/Ram diesel priority)
- [ ] Support J1939 flashing and Aisin mapping


## Cummins Live Tuning System (2026-03-29)
- [ ] Build Cummins Parameter Database (RAM addresses, DID mappings, scaling factors)
- [ ] Implement OBD-II Mode 3D (Write Memory) support for RAM address writes
- [ ] Build RAM-only tuning engine with read/write operations
- [ ] Build parameter validator to prevent out-of-range writes
- [ ] Integrate Cummins tuning into CalibrationEditor UI
- [ ] Write tests for Cummins parameter database and tuning engine
- [ ] Support fuel tank and tire size modification (Ford/Ram diesel priority)
- [ ] Support J1939 flashing and Aisin mapping


## Erika Knowledge Base Training (2026-03-29)
- [ ] Build Erika's learning engine to ingest binaries and A2L files
- [ ] Extract parameter metadata from A2L files for Erika's knowledge base
- [ ] Build pattern recognition system for Erika to learn map structures
- [ ] Train Erika on Cummins diesel tuning parameters and best practices
- [ ] Train Erika on powersports ECU tuning (Can-Am, Polaris, Arctic Cat, Yamaha, Honda)
- [ ] Add OBD-II and UDS protocol explanations to Erika's context
- [ ] Enable Erika to guide users through live tuning operations
- [ ] Add parameter recommendations and safety warnings to Erika's responses
- [ ] Integrate Cummins and powersports parameter databases into Erika's chat context
- [ ] Train Erika on fuel injection, timing, boost, EGR, DPF, DEF, torque limiting, speed limiting
- [ ] Train Erika on VIN modification, key relearning, and immobilizer procedures

## Cummins Live Tuning System (2026-03-29)
- [x] Build Cummins Parameter Database with RAM addresses and scaling
- [ ] Implement OBD-II Mode 3D (Write Memory) support
- [ ] Build RAM-only tuning engine with read/write operations
- [ ] Build parameter validator to prevent out-of-range writes
- [ ] Integrate Cummins tuning into CalibrationEditor UI
- [ ] Write tests for Cummins parameter database and tuning engine


## Mobile UI & Gauge Modernization (2026-03-29)
- [ ] Audit current gauge components and identify Windows 98-style elements
- [ ] Design modern gauge system with smooth animations and glassmorphism
- [ ] Build responsive mobile-first gauge components
- [ ] Optimize datalogger UI for mobile screens
- [ ] Test gauges on mobile devices and tablets
- [ ] Optimize performance for smooth animations on mobile

## J1939 Protocol Support (Heavy-Duty Trucks)
- [ ] Research J1939 protocol specification (29-bit CAN, PGN addressing, multi-packet messages)
- [ ] Create J1939 PGN database (engine, transmission, brake, fuel system, emissions)
- [ ] Implement J1939 parameter extraction (PGN parsing, byte order, scaling/offset)
- [ ] Add J1939 logging support to OBDConnection (CAN sniffer integration)
- [ ] Create J1939-specific presets (Engine Parameters, Transmission, Emissions, Diagnostics)
- [ ] Implement J1939 DM1/DM2 fault code reading (active/inactive faults)
- [ ] Add J1939 datalog export format (CSV with PGN names and descriptions)
- [ ] Build J1939 diagnostics analyzer (fault pattern recognition, threshold validation)
- [ ] Add J1939 vehicle detection (Cummins ISX/ISB, Duramax, Powertrain controllers)
- [ ] Write comprehensive J1939 tests (PGN parsing, multi-packet assembly, fault detection)

## K-Line Protocol Support (Older Vehicles)
- [ ] Research K-Line specification (ISO 9141-2, 10.4 kbaud, single-wire protocol)
- [ ] Implement K-Line initialization (5-baud wakeup, tester present)
- [ ] Create K-Line PID database (OBD-II Mode 01/02, manufacturer-specific modes)
- [ ] Implement K-Line communication (request/response, timeout handling, error recovery)
- [ ] Add K-Line logging support to OBDConnection (serial port integration)
- [ ] Create K-Line-specific presets (Engine Basics, Fuel System, Emissions)
- [ ] Implement K-Line DTC reading (Mode 03/04 support)
- [ ] Add K-Line datalog export format (CSV with PID names and descriptions)
- [ ] Build K-Line diagnostics analyzer (fault detection, threshold validation)
- [ ] Add K-Line vehicle detection (pre-2010 vehicles, legacy systems)
- [ ] Write comprehensive K-Line tests (initialization, PID reading, DTC handling)

## J1939 and K-Line Logging Components
- [ ] Create J1939LoggingPanel component (PGN selector, real-time parameter display)
- [ ] Create K-LineLoggingPanel component (PID selector, real-time parameter display)
- [ ] Implement protocol auto-detection (CAN vs K-Line vs OBD-II)
- [ ] Add protocol selector to DataloggerPanel (dropdown for J1939, K-Line, OBD-II)
- [ ] Create unified logging interface (protocol-agnostic parameter display)
- [ ] Add real-time gauges for J1939/K-Line parameters
- [ ] Implement CSV export for J1939 and K-Line datalogs

## J1939 and K-Line Diagnostics
- [ ] Implement J1939 DM1 (active faults) analysis
- [ ] Implement J1939 DM2 (previously active faults) analysis
- [ ] Create J1939 fault pattern database (Cummins, Duramax, Volvo, Freightliner)
- [ ] Build K-Line fault detection engine (Mode 03/04 parsing)
- [ ] Create K-Line fault pattern database (OEM-specific codes)
- [ ] Add J1939 diagnostic report generation
- [ ] Add K-Line diagnostic report generation
- [ ] Implement cross-protocol fault correlation (same issue, different protocols)

## Integration and Testing
- [ ] Integrate J1939 support into Advanced Mode tabs
- [ ] Integrate K-Line support into Advanced Mode tabs
- [ ] Update VIN detection for J1939/K-Line vehicles
- [ ] Update vehicle presets for J1939/K-Line protocols
- [ ] Write integration tests for J1939 logging
- [ ] Write integration tests for K-Line logging
- [ ] Test protocol auto-detection logic
- [ ] Test CSV export for all protocols (OBD-II, J1939, K-Line)
- [ ] Verify all existing tests still pass (target: 750+ tests)


## J1939 Protocol Implementation (COMPLETED)
- [x] Research J1939 protocol specification (29-bit CAN, PGN addressing, multi-packet messages)
- [x] Create J1939 PGN database (engine, transmission, brake, fuel system, emissions)
- [x] Implement J1939 parameter extraction (PGN parsing, byte order, scaling/offset)
- [x] Create J1939 DM1/DM2 fault code reading (active/inactive faults)
- [x] Build J1939 diagnostics analyzer (fault pattern recognition, threshold validation)
- [x] Add J1939 vehicle detection (Cummins ISX/ISB, Duramax, Powertrain controllers)
- [x] Create J1939LoggingPanel component (PGN selector, real-time parameter display)
- [x] Implement J1939 diagnostic report generation

## K-Line Protocol Implementation (COMPLETED)
- [x] Research K-Line specification (ISO 9141-2, 10.4 kbaud, single-wire protocol)
- [x] Implement K-Line initialization (5-baud wakeup, tester present)
- [x] Create K-Line PID database (OBD-II Mode 01/02, manufacturer-specific modes)
- [x] Implement K-Line communication (request/response, timeout handling, error recovery)
- [x] Implement K-Line DTC reading (Mode 03/04 support)
- [x] Build K-Line diagnostics analyzer (fault detection, threshold validation)
- [x] Add K-Line vehicle detection (pre-2010 vehicles, legacy systems)
- [x] Create KLineLoggingPanel component (PID selector, real-time parameter display)
- [x] Add K-Line diagnostic report generation

## Protocol Detection and Management (COMPLETED)
- [x] Implement protocol auto-detection (CAN vs K-Line vs OBD-II)
- [x] Create protocol detection module with confidence scoring
- [x] Implement protocol compatibility matrix (year/make/region)
- [x] Create ProtocolSelector component for UI integration
- [x] Add protocol-specific features and adapter recommendations
- [x] Implement protocol health scoring and diagnostics

## J1939 and K-Line Logging Components (COMPLETED)
- [x] Create J1939LoggingPanel component (PGN selector, real-time parameter display)
- [x] Create KLineLoggingPanel component (PID selector, real-time parameter display)
- [x] Implement protocol auto-detection (CAN vs K-Line vs OBD-II)
- [x] Create ProtocolSelector component for Advanced Mode

## J1939 and K-Line Diagnostics (COMPLETED)
- [x] Implement J1939 engine parameter analysis (speed, load, torque)
- [x] Implement J1939 transmission parameter analysis (temperature, lockup status)
- [x] Implement J1939 temperature parameter analysis (coolant, oil, turbo)
- [x] Implement J1939 DM1 (active faults) analysis
- [x] Implement J1939 DM2 (previously active faults) analysis
- [x] Create J1939 fault pattern database (Cummins, Duramax, Volvo, Freightliner)
- [x] Build K-Line fault detection engine (Mode 03/04 parsing)
- [x] Create K-Line fault pattern database (OEM-specific codes)
- [x] Add J1939 diagnostic report generation
- [x] Add K-Line diagnostic report generation

## Next Steps: J1939 and K-Line Integration
- [ ] Add J1939 logging support to OBDConnection (CAN sniffer integration)
- [ ] Add K-Line logging support to OBDConnection (serial port integration)
- [ ] Create J1939-specific presets (Engine Parameters, Transmission, Emissions, Diagnostics)
- [ ] Create K-Line-specific presets (Engine Basics, Fuel System, Emissions)
- [ ] Add protocol selector to DataloggerPanel (dropdown for J1939, K-Line, OBD-II)
- [ ] Create unified logging interface (protocol-agnostic parameter display)
- [ ] Add real-time gauges for J1939/K-Line parameters
- [ ] Implement CSV export for J1939 and K-Line datalogs
- [ ] Add J1939 datalog export format (CSV with PGN names and descriptions)
- [ ] Add K-Line datalog export format (CSV with PID names and descriptions)
- [ ] Integrate J1939 support into Advanced Mode tabs
- [ ] Integrate K-Line support into Advanced Mode tabs
- [ ] Update vehicle presets for J1939/K-Line protocols
- [ ] Write integration tests for J1939 logging
- [ ] Write integration tests for K-Line logging
- [ ] Write comprehensive J1939 tests (PGN parsing, multi-packet assembly, fault detection)
- [ ] Write comprehensive K-Line tests (initialization, PID reading, DTC handling)
- [ ] Implement cross-protocol fault correlation (same issue, different protocols)
- [ ] Test CSV export for all protocols (OBD-II, J1939, K-Line)
- [ ] Verify all existing tests still pass (target: 750+ tests)


## Protocol Integration Phase 2 (COMPLETED)
- [x] Create CSV export utilities for J1939 datalogs (protocolCSVExport.ts)
- [x] Create CSV export utilities for K-Line datalogs (protocolCSVExport.ts)
- [x] Create CSV export utilities for OBD-II datalogs (protocolCSVExport.ts)
- [x] Implement unified CSV export function for all protocols
- [x] Add CSV filename generation with protocol and VIN
- [x] Create real-time gauge components for J1939 parameters (ProtocolGaugeDashboard.tsx)
- [x] Create real-time gauge components for K-Line parameters (ProtocolGaugeDashboard.tsx)
- [x] Create real-time gauge components for OBD-II parameters (ProtocolGaugeDashboard.tsx)
- [x] Implement compact gauge row for sidebar/header display
- [x] Add protocol-specific color coding (J1939=purple, K-Line=orange, OBD-II=blue)
- [x] Implement gauge range detection based on parameter units
- [x] Add gauge sorting by importance (RPM, Speed, Temperature first)

## Next Steps: DataloggerPanel Integration
- [ ] Add ProtocolSelector component to DataloggerPanel
- [ ] Route logging data through appropriate protocol module based on selection
- [ ] Integrate ProtocolGaugeDashboard into DataloggerPanel display
- [ ] Add CSV export button to DataloggerPanel with protocol-specific formatting
- [ ] Add protocol indicator badge to connection status
- [ ] Test protocol switching during active logging
- [ ] Verify CSV export includes proper metadata (VIN, vehicle info, timestamps)
- [ ] Test gauge updates with simulated J1939 and K-Line data
- [ ] Add protocol-specific preset groups to DataloggerPanel
- [ ] Implement protocol auto-detection on connection


## TIER 1: High-Impact Quick Wins

### Protocol Auto-Detection
- [x] Implement protocol detection scanner (OBD-II → J1939 → K-Line sequence)
- [x] Add confidence scoring for detected protocols
- [x] Display detected protocol with confidence in DataloggerPanel
- [x] Create protocolDetection.ts with auto-detection logic
- [x] Add protocol detection UI component (ProtocolAutoDetectionUI)
- [x] Write tests for protocol detection accuracy

### Unified Data Pipeline
- [x] Create ProtocolDataNormalizer to convert J1939/K-Line/OBD-II to common format
- [x] Update diagnostics engine to work with normalized data (unifiedDiagnostics.ts)
- [x] Create unified diagnostics with threshold + pattern analysis
- [x] Add cross-protocol correlation detection
- [x] Add operating state detection (idle, load, cruise, warmup, decel)
- [x] Write tests for data normalization across all protocols (771 tests passing)

### Protocol-Specific Presets
- [x] Create J1939 preset groups (Heavy Duty Truck Monitoring, Engine Focus, Transmission Focus)
- [x] Create K-Line preset groups (Legacy Vehicle Diagnostics, European Cars, Older Trucks)
- [x] Expand OBD-II presets with protocol-aware filtering
- [x] Add preset auto-selection based on detected protocol
- [x] Create preset merge utility for multi-protocol sessions
- [x] Write tests for preset filtering by protocol

---

## TIER 2: Feature Completeness

### Multi-Protocol Comparative Analysis
- [ ] Create ComparisonEngine module for side-by-side protocol analysis
- [ ] Implement simultaneous logging UI (if hardware supports multiple protocols)
- [ ] Add data alignment algorithm (timestamp sync across protocols)
- [ ] Create comparison report showing protocol differences
- [ ] Add latency analysis (J1939 vs K-Line vs OBD-II response times)
- [ ] Create protocol-specific insights panel
- [ ] Write tests for data alignment and comparison logic

### DBC File Import
- [ ] Create DBCParser module (parse DBC format)
- [ ] Implement DBC upload UI component
- [ ] Add custom CAN message definition storage (database)
- [ ] Create dynamic parameter generation from DBC
- [ ] Add DBC-based preset auto-generation
- [ ] Implement DBC validation and error handling
- [ ] Write tests for DBC parsing (standard and edge cases)

### ML Fault Prediction
- [ ] Create trend analysis module (detect parameter drift over time)
- [ ] Implement predictive model for emerging faults
- [ ] Add historical datalog pattern matching
- [ ] Create fault probability scoring
- [ ] Add trend visualization (parameter trajectory charts)
- [ ] Implement alert thresholds for predicted faults
- [ ] Write tests for trend detection and prediction accuracy

### Cross-Protocol Fault Correlation
- [ ] Create FaultCorrelationEngine module
- [ ] Implement J1939 DM1 ↔ OBD-II DTC mapping
- [ ] Implement K-Line fault ↔ OBD-II DTC mapping
- [ ] Add root cause analysis across protocols
- [ ] Create correlation confidence scoring
- [ ] Add multi-protocol fault report generation
- [ ] Write tests for fault correlation accuracy

---

## TIER 3: Professional Features

### Cloud Streaming & Real-Time Remote Diagnostics
- [ ] Create CloudStreamingService (tRPC procedures)
- [ ] Implement real-time datalog streaming to Manus cloud
- [ ] Add remote technician access control
- [ ] Create remote monitoring dashboard
- [ ] Implement fleet-wide data aggregation
- [ ] Add historical datalog database
- [ ] Write tests for streaming reliability and latency

### Protocol-Specific Threshold Tuning
- [ ] Create ThresholdTuner module with protocol awareness
- [ ] Implement J1939-specific thresholds (higher bandwidth tolerance)
- [ ] Implement K-Line-specific thresholds (lower bandwidth tolerance)
- [ ] Add noise floor calibration per protocol
- [ ] Create threshold optimization algorithm
- [ ] Add threshold visualization and adjustment UI
- [ ] Write tests for threshold effectiveness

### Hardware Compatibility Matrix
- [ ] Create HardwareDatabase with adapter specifications
- [ ] Implement adapter detection logic
- [ ] Add protocol support matrix (which adapters support which protocols)
- [ ] Create compatibility warning system
- [ ] Build adapter recommendation engine
- [ ] Add firmware version tracking for adapters
- [ ] Write tests for adapter detection and compatibility

### Bi-Directional Control Commands
- [ ] Implement J1939 command sending (Request PGN, Acknowledge, etc.)
- [ ] Implement K-Line command sending (Mode 10, Mode 11, etc.)
- [ ] Add OBD-II command support (Mode 04 clear DTC, Mode 10 enable tests)
- [ ] Create command safety verification system
- [ ] Add command logging and audit trail
- [ ] Implement command confirmation dialogs
- [ ] Write tests for command execution and safety

---

## TIER 4: Data Intelligence

### Performance Benchmarking System
- [ ] Create BenchmarkDatabase (fleet-wide parameter ranges)
- [ ] Implement anomaly detection (compare to fleet average)
- [ ] Add vehicle-specific benchmarks (by make/model/year)
- [ ] Create benchmark visualization dashboard
- [ ] Implement trend comparison (this vehicle vs fleet average)
- [ ] Add benchmark export/import for fleet sharing
- [ ] Write tests for anomaly detection accuracy

### Predictive Maintenance Scheduling
- [ ] Create MaintenancePredictor module
- [ ] Implement trend analysis for maintenance triggers
- [ ] Add oil temperature trending (predict oil change interval)
- [ ] Add fuel consumption trending (detect injector wear)
- [ ] Add pressure trending (detect pump degradation)
- [ ] Create maintenance calendar integration
- [ ] Write tests for maintenance prediction accuracy

### Expanded Knowledge Base
- [ ] Expand J1939 PGN library (6 → 50+ PGNs)
  - [ ] Heavy-duty truck PGNs (Cummins, Volvo, Freightliner)
  - [ ] Agricultural equipment PGNs (John Deere, AGCO)
  - [ ] Construction equipment PGNs
- [ ] Expand K-Line ISO 9141-2 parameter database
  - [ ] European legacy cars (BMW, Mercedes, Audi, VW)
  - [ ] Japanese legacy cars (Toyota, Honda, Nissan)
  - [ ] Ford legacy vehicles
- [ ] Add protocol-specific diagnostic guides
- [ ] Create manufacturer-specific troubleshooting trees
- [ ] Write tests for knowledge base completeness

---

## TIER 5: UX & Polish

### Protocol-Aware Gauge Customization
- [ ] Create GaugeCustomizer component
- [ ] Implement custom gauge layout saving (per protocol)
- [ ] Add gauge preset templates (Highway, Idle, Diagnostics, etc.)
- [ ] Create gauge drag-and-drop reordering
- [ ] Add gauge size customization
- [ ] Implement gauge color theme customization
- [ ] Write tests for gauge layout persistence

### Live Fault Severity Alerts
- [ ] Create AlertSystem with audio/visual notifications
- [ ] Implement severity-based alert tones (critical, warning, info)
- [ ] Add fault type-specific alert sounds
- [ ] Create alert history log
- [ ] Add alert muting/snooze functionality
- [ ] Implement alert customization per protocol
- [ ] Write tests for alert triggering and delivery

### Protocol Migration Assistant
- [ ] Create ProtocolMigrationEngine
- [ ] Implement parameter mapping between protocols
- [ ] Add data conversion on protocol switch
- [ ] Create migration confirmation dialog
- [ ] Add migration preview (show what will be mapped)
- [ ] Implement migration rollback capability
- [ ] Write tests for parameter mapping accuracy

### Offline Mode for All Protocols
- [ ] Extend offline mode to J1939 datalogs
- [ ] Extend offline mode to K-Line datalogs
- [ ] Add offline datalog browser
- [ ] Create offline analysis report generation
- [ ] Add offline export functionality
- [ ] Implement offline mode indicators in UI
- [ ] Write tests for offline analysis accuracy

---

## Implementation Order (Recommended)
1. TIER 1 (Phases 1-3): Foundation for everything else
2. TIER 2 (Phases 2-3): Builds on TIER 1
3. TIER 3 (Phases 4-5): Requires TIER 1 + 2 foundation
4. TIER 4 (Phase 6): Requires all previous tiers
5. TIER 5 (Phase 7): Polish and UX improvements
6. Integration & Testing (Phase 8): Comprehensive end-to-end testing


## TIER 1 - What's New Feature

- [x] Create WhatsNewManager module for tracking dismissed notifications
- [x] Design WhatsNewPanel component with dismissible cards
- [x] Implement localStorage persistence for dismissed notifications
- [x] Create notification types for protocol updates, new presets, features
- [x] Add WhatsNewPanel to Home page on login
- [x] Add useWhatsNew hook for auto-show control


## Admin Push Notifications

- [x] Create AdminNotificationManager for server-side notification handling
- [x] Create tRPC procedures for admin notification sending (create, send, createAndSend)
- [x] Implement notification delivery tracking and analytics
- [x] Create AdminNotificationPanel UI component with compose form
- [x] Add role-based access control (admin only via adminProcedure)
- [x] Implement notification scheduling and targeting (all/admins/users)
- [x] Create notification history with status filtering and analytics
- [x] Create NotificationBell component for user notification dropdown
- [x] Add DB schema (admin_notifications + notification_deliveries tables)
- [x] Write tests for admin notification system (5 tests passing)


## Step 1: Wire Admin Notification Panel into Advanced Mode
- [x] Add Admin tab to Advanced Mode tab interface
- [x] Show Admin tab only for admin-role users
- [x] Integrate AdminNotificationPanel into Admin tab
- [x] Add notification management section with compose/history/analytics

## Step 2: User Notification Preferences
- [x] Create DB schema for user notification preferences
- [x] Create tRPC procedures for reading/updating preferences
- [x] Build notification preferences UI component (NotificationPrefsPanel)
- [x] Add preferences to Advanced Mode as accessible tab for all users
- [x] Add priority filter (low/medium/high/critical)
- [x] Add mute/unmute functionality with duration options

## TIER 2: Multi-Protocol Comparative Analysis
- [x] Create ComparisonEngine module for side-by-side protocol analysis
- [x] Implement data alignment algorithm (timestamp sync across protocols)
- [x] Create comparison report showing protocol differences
- [x] Implement quality scoring per protocol
- [x] Add CSV export for comparison reports
- [x] Write tests for comparison logic (4 tests passing)

## TIER 2: DBC File Import
- [x] Create DBCParser module (parse DBC format)
- [x] Parse messages (BO_), signals (SG_), comments (CM_), value tables (VAL_)
- [x] Implement CAN frame decoder with Intel/Motorola byte order
- [x] Add DBC search by signal name/comment
- [x] Create bridge to NormalizedReading format
- [x] Write tests for DBC parsing (10 tests passing)

## TIER 2: ML Fault Prediction
- [x] Create trend analysis module (linear regression + moving average)
- [x] Implement predictive model with 9 known fault signatures
- [x] Add anomaly detection via z-score method
- [x] Create fault probability scoring with limit approach detection
- [x] Add predictions for 30s/60s/300s ahead
- [x] Write tests for trend detection (7 tests passing)

## TIER 2: Cross-Protocol Fault Correlation
- [x] Create FaultCorrelationEngine module
- [x] Implement J1939 SPN/FMI to OBD-II DTC mapping (25+ SPNs)
- [x] Implement K-Line fault to OBD-II DTC mapping (13 mappings)
- [x] Add root cause analysis across protocols
- [x] Create correlation confidence scoring
- [x] Add temporal correlation detection (faults within 5s)
- [x] Add FMI descriptions and SPN info lookup
- [x] Write tests for fault correlation (8 tests passing)


## QA Test Checklist for PPEI Admin Panel
- [x] Create DB schema for test_checklists and test_items tables (qa_checklists, qa_test_items, qa_item_comments)
- [x] Create tRPC procedures for CRUD on test checklists and items
- [x] Build QA TestChecklist UI component with checkable items (QAChecklistPanel)
- [x] Add error/comment field per test item for team notes
- [x] Add status tracking (pass/fail/blocked/skipped) per item
- [x] Add team member assignment and timestamps
- [x] Pre-populate default test list covering all V-OP features (50 tests)
- [x] Integrate QA checklist into Admin tab in Advanced Mode
- [x] Add progress bar with color-coded status breakdown


## Binary Offset Detection & Correction System
- [ ] Create binary offset detection engine with table signature matching
- [ ] Implement multi-offset detection (scan for known table patterns)
- [ ] Build offset validation algorithm (verify detected offsets against known values)
- [ ] Create offset calibration UI component with manual entry
- [ ] Add offset persistence per ECU/vehicle type in database
- [ ] Create offset auto-correction pipeline for editor file uploads
- [ ] Implement offset validation and correction utilities
- [ ] Add offset history tracking and audit log
- [ ] Build offset correction report UI
- [ ] Write comprehensive tests for offset detection
- [ ] Integrate into editor file upload workflow
- [ ] Test with Polaris Pro R a2L/.s file pair


## Option A: Full Database-Backed Offset System (COMPLETED)
- [x] Create offset profiles DB schema (offsetProfiles, offsetCorrectionHistory tables)
- [x] Implement offset detection engine with multi-location marker search
- [x] Build offset calibration UI panel with auto-detect and manual entry
- [x] Create tRPC router for offset CRUD and profile management
- [x] Wire offset profiles router into main appRouter
- [x] Integrate OffsetCalibrationPanel into Advanced Mode admin tab
- [x] Fix MG1 ECU family detection to search multiple marker locations
- [x] Write comprehensive offset system tests (offsetSystem.test.ts)

## MG1 Patch Detection Fix (COMPLETED)
- [x] Fixed "Could not detect MG1 ECU family" error
- [x] Enhanced detectECUFamily to search multiple marker locations (0x1000, 0x0000, 0x8000, 0x10000, 0x20000)
- [x] Added full binary search as fallback for unknown layouts
- [x] Supports both MG1C400A1T2 and MG1CA920 variants
- [x] Dynojet and HPTuners patches now work with offset-adjusted binaries

## Next: Map Description Display (PENDING)
- [ ] Update map listing to show descriptions instead of map names
- [ ] Create map description lookup from a2L metadata
- [ ] Sort maps by description for better UX
- [ ] Add search by description functionality
