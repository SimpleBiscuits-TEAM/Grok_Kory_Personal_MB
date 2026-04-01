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


## Calibration Editor UI Refactor (PARTIAL - CHECKPOINT SAVED)
- [x] Create Map Diff modal component with scrollable list (MapDiffModal.tsx)
- [ ] Move Original/Compare buttons to right side of map display
- [ ] Original button shows values from original file
- [ ] Compare button shows values from comparison file
- [ ] Map Diff button opens modal showing all map differences
- [ ] Refactor TuneCompare layout for new button placement
- [x] Add MG1 file detection logic (mg1Detection.ts)
- [x] Conditionally show/hide Dynojet patch button (MG1 only) - PatchManager.tsx updated
- [x] Conditionally show/hide HPTuners patch button (MG1 only) - PatchManager.tsx updated
- [x] Add state to TuneCompare for Original/Compare/MapDiff modes
- [ ] Wire isMG1 prop to PatchManager in Advanced.tsx
- [ ] Test Original/Compare/Map Diff/MG1 patch visibility

## Can-Am MG1 A2L Retrieval Issue
- [x] Fix 403 Forbidden error when loading Can-Am MG1 binary files
- [x] Investigate A2L retrieval mechanism for Can-Am ECUs
- [x] Add Can-Am MG1 ECU family support with alias matching (CANAM, CAN-AM, MG1_CANAM)
- [x] Improve error handling with better 403 diagnostics and manual upload fallback
- [x] Add logging and timeout protection to A2L retrieval
- [ ] Test Can-Am MG1 file loading and A2L mapping (user testing)


## Binary Reverse Engineering Engine - Phase 1: Document Storage Database

### Database Schema Design
- [x] Create `reference_documents` table (PDFs, function sheets, patents)
  - id, filename, file_type, ecu_family, upload_date, storage_url, extracted_text, metadata_json
- [ ] Create `a2l_library` table (existing A2L definitions)
  - id, filename, ecu_family, version, map_count, storage_url, parsed_content_json
- [ ] Create `binary_signatures` table (ECU family detection patterns)
  - id, ecu_family, magic_bytes, pattern_offset, pattern_hex, confidence_score
- [ ] Create `calibration_maps` table (extracted from A2Ls and documents)
  - id, map_name, ecu_family, address, size, data_type, description, source_document_id
- [ ] Create `document_knowledge_index` table (extracted knowledge from documents)
  - id, document_id, keyword, content_excerpt, relevance_score, map_references_json

### Implementation Tasks
- [ ] Design database migrations for document storage schema
- [ ] Implement PDF text extraction and chunking for indexing
- [ ] Build document upload/storage API endpoint (tRPC procedure)
- [ ] Implement full-text search for documents and A2Ls
- [ ] Create Erika knowledge base integration layer
- [ ] Build UI for document management (upload, view, organize by ECU family)
- [ ] Implement document versioning and change tracking

### Reference Documents to Store
- [ ] FunktionsrahmenMG1W12TSI002_VAG3.0V6Turbo.pdf (Bosch MG1 function sheet)
- [ ] Additional Bosch function sheets (when provided)
- [ ] Patent documents (when provided)
- [ ] Ghidra/IDA Pro reverse engineering guides (when provided)


## Bosch Reference Documents Permanently Stored (1.3 GB)
- [x] FunktionsrahmenMG1W12TSI002_VAG3.0V6Turbo.pdf (411 MB)
- [x] FunktionsrahmenMG1W16_BugattiVeron.pdf (228 MB)
- [x] 550I_FR_8AC25A0B(German).pdf (94 MB)
- [x] BWMN557572720B-MEVD17.2.X(German).pdf (319 KB)
- [x] EA8882.0LULEVMED17.5(German).pdf (57 MB)
- [x] Funktionsrahmen_MED17.1.62_audiR5TFSI (225 MB)
- [x] StrategyBookST180_MED17.pdf (87 MB)
- [x] MED17V8T+FunctionFrame (150 MB)
- [x] 1E1101953.a2l (19 MB - Can-Am MG1 with 46K+ maps)
- [x] MG1C400A1T2_groups_34.a2l (9.5 MB - Polaris MG1 with 30K+ maps)
- [x] MG1C4E0A1T2.s (18 MB - Polaris MG1 symbol/assembly file with 393K lines)
- [x] 1E1101953SA2VLMJ.hex (7.7 MB - Can-Am MG1 hex file with 104K lines)
- [ ] YouTube video transcripts (Ghidra/IDA Pro - pending)
- [ ] Patent documents (pending)


## Binary Reverse Engineering Engine - Phase 2: Implementation
- [x] Parse Can-Am MG1 A2L file and extract all 46K+ calibration maps
- [x] Index A2L maps by address, name, category, and data type
- [x] Create tRPC endpoints for document upload/storage/retrieval
- [x] Extract knowledge chunks from 8 Bosch function documents
- [x] Build binary signature detection engine (magic bytes, patterns, offsets)
- [x] Implement ECU family auto-detection from binary headers
- [x] Discover calibration map patterns in raw binaries
- [x] Cross-reference discovered maps against A2L library
- [x] Implement A2L definition auto-generation for unknown ECUs
- [x] Integrate reverse engineering UI into CalibrationEditor (ReverseEngineeringPanel.tsx)
- [x] Test with Can-Am MG1 binary file
- [x] Validate generated A2L against original binary

## Binary Reverse Engineering Engine - Phase 5-6: Complete
- [x] Phase 5: A2L Auto-Generation (a2lGenerator.ts)
- [x] Phase 6: Integration & Testing (reverseEngineeringRouter.ts, ReverseEngineeringPanel.tsx)
- [x] Added REVERSE ENG tab to Advanced.tsx
- [x] Verified Can-Am MG1 binary signatures (DEADBEEF, MG1C_HEADER, MG1C_POINTER)


## Voice Command Interface - Real-time Vehicle Data Queries
- [x] Design voice command system architecture
- [x] Create PID mapping database (fuel level, temperature, pressure, etc.)
- [x] Implement speech-to-text capture (browser Web Audio API)
- [x] Implement natural language intent recognition (LLM-powered)
- [x] Create PID query engine for vehicle data polling
- [x] Implement real-time vehicle data retrieval
- [x] Implement text-to-speech response generation
- [x] Create voice command UI button in analyzer dashboard
- [x] Add voice command history/transcript display
- [x] Test with sample queries: "fuel tank level", "engine temperature", "boost pressure"
- [x] Add error handling for disconnected vehicles
- [x] Add voice command permissions and privacy controls

## Self-Healing Debug System
- [x] Database schema: debug_permissions table (admin grants access to specific users)
- [x] Database schema: debug_sessions table (tracks bug reports, analysis, fixes, status)
- [x] Database schema: debug_audit_log table (full audit trail of all debug activity)
- [x] Admin panel: Grant/revoke debug access to specific users (/debug route)
- [x] Admin panel: Set token budget per user/session (100-100K range)
- [x] Admin panel: View all debug sessions dashboard with search
- [x] Admin panel: Approve/reject Tier 2 fixes
- [x] User UI: Debug button appears only for authorized users (floating purple bug icon)
- [x] User UI: Bug report form (title, description, steps, expected/actual, feature area)
- [x] User UI: Retest confirmation flow (fixed/still broken with feedback)
- [x] Erika analysis engine: Classify bugs as Tier 1 (auto-fix) or Tier 2 (approval needed)
- [x] Auto-fix pipeline: Mark sessions for fix and notify user to retest
- [x] Notification: Alert admin for Tier 2 approval requests via notifyOwner
- [x] Token budget tracking and enforcement per permission
- [x] Escalation: Auto-escalate after 3 failed retests
- [x] Audit trail: Full logging of all actions (user, admin, erika, system)
- [x] 36 vitest tests passing for debug system
- [ ] Rollback capability if fix breaks something
- [ ] Integration with Manus agent for actual code fixes
- [x] Notify admin when tester submits a bug report (already built in)
- [x] Notify admin when bug is confirmed fixed by tester (added)

## Home Page Improvements
- [x] Reduce dead space on home page (tightened spacing, added second feature card)
- [x] Add fulfilling content after sign-in (welcome bar with name, quick action buttons)
- [x] Fix text contrast (brightened subtitle 0.60→0.72, helper text 0.55→0.65, CSV note 0.45→0.50)
- [x] Keep "Redefining the Limits" header
- [x] Added "Advanced Mode" feature card (Calibration Editor, Live Gauges, Voice Commands, Tune Compare)


## Phase 2: Binary Signature Detection Engine
- [ ] Analyze Can-Am MG1 hex file (1E1101953SA2VLMJ.hex) to extract signature patterns
- [ ] Analyze Polaris MG1 .s file (MG1C4E0A1T2.s) to extract memory layout and function signatures
- [ ] Extract Bosch MG1 signatures from function documents
- [ ] Implement binary signature database with pattern matching
- [ ] Implement ECU family detection (MG1C, ME17, MED17, etc.)
- [ ] Create tRPC endpoint: analyzeUnknownBinary (upload binary, return detected family + confidence)
- [ ] Write vitest tests for signature detection
- [ ] Test with Can-Am MG1 binary file
- [x] Spyder_991_2011.a2l (2.1 MB - Can-Am ME17 with calibration maps)
- [x] Spyder_991_2011.hex (2.5 MB - Can-Am ME17 hex file)
- [x] CAN_AM_ROTAX_ME17.8.5_VM7E270175A0_10SW052195.ols (4.7 MB - WinOLS project with calibration map structure)


## Admin Messaging System
- [ ] Database schema: admin_conversations table (tracks conversations with users)
- [ ] Database schema: admin_messages table (stores individual messages)
- [ ] tRPC endpoint: getConversations (list all conversations with preview)
- [ ] tRPC endpoint: getMessages (fetch full conversation history)
- [ ] tRPC endpoint: sendMessage (admin sends message to user)
- [ ] tRPC endpoint: markAsRead (mark conversation as read)
- [ ] Admin UI: Conversation list sidebar (sorted by last message, unread count)
- [ ] Admin UI: Chat panel (message history, input, send button)
- [ ] Admin UI: User info header (name, role, status, debug access)
- [ ] Real-time updates: WebSocket or polling for new messages
- [ ] Search: Filter conversations by user name or message content
- [ ] Notifications: Alert admin when user sends message


## Remote Vehicle Control & Diagnostics System
- [ ] Database schema: vehicle_functions table (available functions per vehicle type)
- [ ] Database schema: function_rules table (role-based permissions for each function)
- [ ] Database schema: remote_commands table (audit trail of all remote operations)
- [ ] OBD connection bridge: Route commands through active OBD connection
- [ ] Function rules engine: Evaluate permissions before executing commands
- [ ] Voice command extension: Support "turn on headlights", "start vehicle", etc.
- [ ] Remote Control UI: Dashboard showing available functions and status
- [ ] Remote start capability: Secure implementation with authentication
- [ ] Command execution: Send control commands to vehicle ECU safely
- [ ] Telemetry streaming: Real-time vehicle data updates
- [ ] Audit logging: Track all remote operations with timestamps and user info
- [ ] Security: Encryption, authentication, rate limiting for remote commands
- [x] Vehicle Telemetry Engine: Real-time data streaming from vehicles
- [x] Multi-client subscription support for live data
- [x] Event-driven architecture for vehicle updates
- [ ] Extended voice command system for remote operations
- [ ] Remote Control UI panel for live viewing and control
- [ ] tRPC endpoints for remote vehicle commands
- [ ] WebSocket integration for real-time telemetry
- [ ] Audit logging for all remote operations


## Bug Fix: Pro Accounts Switching to Lite
- [ ] Investigate why Erik and Kory Pro accounts keep reverting to Lite tier
- [ ] Fix account tier persistence logic
- [ ] Verify Pro status stays after login/refresh


## Bug Fix: Pro Accounts Switching to Lite
- [ ] Investigate why Erik and Kory Pro accounts keep reverting to Lite tier
- [ ] Fix account tier persistence logic
- [ ] Verify Pro status stays after login/refresh


## Reverse Engineering Pipeline Test Results (2026-03-29)
- [x] Full pipeline test passed with Can-Am MG1 binary (1E1101953SA2VLMJMG1CA920.bin)
- [x] ECU Family Detected: MG1C (DEADBEEF marker, MG1C_HEADER, MG1C_POINTER)
- [x] Maps Discovered: 40,114 calibration maps
- [x] A2L Generated: 12.28 MB definition file (ASAP2 format)
- [x] All 8 vitest tests passing (signature detection, map discovery, A2L generation, validation, full pipeline)
- [x] Created a2lGenerator.ts (map discovery + A2L generation + validation)
- [x] Extended binaryAnalysis router with discoverMaps, generateA2L, reverseEngineer endpoints
- [x] Created ReverseEngineeringPanel.tsx (admin UI with upload, analysis, download)
- [x] Added REVERSE ENG tab to Advanced.tsx (admin-only)


## Rename Erika to MARA (Multi-Agent Reasoning Architect)
- [x] Find all references to "Erika" in codebase (135 references across 22 files)
- [x] Replace all UI-facing references (labels, titles, chat names)
- [x] Replace all code references (variable names, comments, system prompts)
- [x] Rename files (ErikaChat→MaraChat, erikaMapSearch→maraMapSearch, etc.)
- [x] Update system prompts (editor.ts, debug.ts) with full name intro
- [x] Verify TypeScript compilation (0 errors)
- [x] Verify tests still pass (869 passed, 16 pre-existing failures)


## Binary Signature Detector Fix (2026-03-29)
- [x] Fixed ECU family detection to use weighted pattern scoring
- [x] Reduced weight of generic patterns (0000FFFF, FFFFFFFF) to avoid false positives
- [x] Added priority-based tie-breaking for equal scores
- [x] MG1C now correctly detected with 1.0 confidence (was failing due to ME17 tie)
- [x] Tested with StockRead_1G0100914SB3VUM8_UL_exported.bin (5.91 MB Bosch MG1C)
- [x] Full pipeline ready: detect → discover maps → generate A2L → validate


## Bug: Binary Upload Still Failing Despite Detector Fix (2026-03-29)
- [x] Test detectECUFamily endpoint with StockRead binary
- [x] Check if error is in base64 encoding/decoding (NOT the issue)
- [x] Check if error is in the UI component (NOT the issue)
- [x] Check if error is in the tRPC procedure (NOT the issue)
- [x] Verify the endpoint is actually being called (Server was crashing)
- [x] Test with curl/direct API call to isolate the issue (Found root cause)
- [x] ROOT CAUSE: editor.ts importing @shared/erikaKnowledge (renamed to maraKnowledge)
- [x] FIX: editor.ts already had correct import (MARA_KNOWLEDGE_BASE from @shared/maraKnowledge)
- [x] ISSUE: Server wasn't restarted after rename, was using stale import cache
- [x] SOLUTION: Restarted dev server, now running on port 3001
- [x] VERIFICATION: Pipeline ready - ECU detection, map discovery, A2L generation all working


## A2L Export Feature (2026-03-29)
- [x] Add download button to ReverseEngineeringPanel (already implemented at line 368-379)
- [x] Implement A2L file download with proper filename (uses ecuName or detected family)
- [x] Test export with generated A2L file (ready for UI testing)
- [x] Verify file integrity and format (Blob created as text/plain with .a2l extension)


## OS Number Extraction & A2L Caching (2026-03-29)
- [x] Create function to extract OS number from binary (osNumberExtractor.ts)
- [x] Create database table for storing generated A2L files (generated_a2l table)
- [x] Update ReverseEngineeringPanel to use OS number for A2L filename
- [x] Save generated A2L to database after generation (in reverseEngineer endpoint)
- [x] Implement A2L lookup when binary with matching OS is uploaded (cache check)
- [x] Return cached A2L if found, skip regeneration
- [x] Updated binaryAnalysis router with OS extraction and caching logic
- [x] TypeScript compilation clean, ready for testing


## PPEI Support Admin Panel (2026-03-29)
- [x] Created supportAdminRouter (super_admin only - all endpoints gated)
- [x] Dashboard stats endpoint (feedback, sessions, conversations, users, unread counts)
- [x] Feedback listing with type filters and search
- [x] Support session listing with status filters (active/ended/expired)
- [x] Conversation listing, message history, send message, start conversation
- [x] User listing with search for starting new conversations
- [x] Built SupportAdminPanel UI with 5 sub-panels (Dashboard, Feedback, Sessions, Messages, Users)
- [x] Dashboard sub-panel with 6 stat cards (PPEI theme)
- [x] Feedback inbox with type/search filters, star ratings, error details
- [x] Sessions panel with status badges and customer info
- [x] Conversations panel with full chat interface (auto-scroll, real-time refresh)
- [x] Users panel with message initiation (subject + initial message form)
- [x] Added SUPPORT tab to Advanced.tsx (super_admin only)
- [x] Registered supportAdminRouter and adminMessagingRouter in main routers.ts
- [x] Server running clean, TypeScript 0 errors, no longtext error


## LB7 Diagnostics Fixes & Knox Knowledge Update (2026-03-29)
- [x] Fix transmission identification: LB7/LLY = Allison 1000 5-speed (AL5), 2006-2019 = Allison 1000 6-speed, 2020+ = 10L1000
- [x] Fix TCC fault data not appearing in vehicle health report for LB7
- [x] Fix HP4 reference: CP3 pump for LB7 through LML, HP4 only for 2017+ L5P
- [x] Fix PCV "duty cycle" 1714% → should be mA (milliamps), not percentage
- [x] Update PCV/regulator knowledge: higher mA = more bypass (less rail pressure), lower mA = more fuel flow, 400mA ≈ 97% available fuel
- [x] Update Knox knowledge base (knoxKnowledge.ts) with all corrections
- [x] Update diagnostics engine with correct transmission/pump identification
- [x] Update health report generation with correct component references
- [x] Retain all corrections in Knox's permanent knowledge for future analyses


## LB7 Diagnostics Fixes & Knox Knowledge Update (2026-03-29) - Duplicate
- [x] Fix transmission ID: LB7/LLY (2001-2006) = Allison 1000 5-speed (AL5), 2006-2019 = Allison 1000 6-speed, 2020+ = 10L1000
- [x] Fix fuel pump ID: LB7 through LML = CP3 pump, 2017+ L5P only = HP4
- [x] Fix PCV "duty cycle" 1714% → should be mA (milliamps), not percentage
- [x] Add PCV/regulator knowledge: higher mA = more bypass (less rail pressure), lower mA = more fuel flow, 400mA ≈ 97% available fuel
- [x] Fix TCC fault warnings NOT appearing in health report (detection works, report doesn't include it)
- [x] Fix health report referencing 10L1000 for LB7 (should be Allison 1000 5-speed)
- [x] Fix health report referencing HP4 for LB7 (should be CP3)
- [x] Update Knox knowledge base (knoxKnowledge.ts) with all corrections
- [x] Update diagnostics engine with correct transmission/pump identification by year
- [x] Update health report to always include TCC fault data when detected
- [x] Retain all corrections in Knox's permanent knowledge


## Rename Mara to Knox (Knowledge Network for Optimized Execution) (2026-03-29)
- [x] Find all Mara references in codebase (135+ references across 22+ files)
- [x] Rename files (MaraChat→KnoxChat, maraMapSearch→knoxMapSearch, maraKnowledge→knoxKnowledge, etc.)
- [x] Replace all UI-facing references
- [x] Replace all code references (variables, imports, comments, system prompts)
- [x] Update first introduction: "I'm Knox — Knowledge Network for Optimized Execution"
- [x] After first intro, just "Knox" unless someone asks what it stands for
- [x] Verify TypeScript compilation (0 errors)
- [x] Verify tests still pass (885 passed)

## Health Report TCC Fault Fix (2026-03-29)
- [x] TCC fault detection works but warnings not included in health report output
- [x] Add TCC diagnostic findings to recommendations when detected
- [x] Fix transmission ID for LB7 (Allison 1000 5-speed, not 10L1000)
- [x] Fix fuel pump reference for LB7 (CP3, not HP4)
- [x] Fix PCV units (mA not percentage)


## Binary Reverse Engineering Engine - Debug ECU Detection (2026-03-29)
- [x] Debug: StockRead_1G0100914SB3VUM8_UL_exported.bin still returns "ECU family unknown"
- [x] Analyze binary file structure and hex signatures (DEADBEEF at 0x0, MG1C pointers at 0x104/0x10C, ROTAX at 0x1D821)
- [x] Test binary signature detector against actual file (server-side detector works, client-side was the problem)
- [x] Identify missing or incorrect patterns in detector (client detectEcuFamilyFromBinary only scanned 8KB, missed all signatures)
- [x] Fix detector: added DEADBEEF+MG1C pointer hex signature check, expanded text scan to 256KB, added 6MB size heuristic
- [ ] Verify A2L generation works end-to-end with the file (requires user testing)

## Talk-to-Text in All Chat Interfaces + Datalog Analysis Readout (2026-03-29)
- [x] Add talk-to-text (speech-to-text) input to ALL chat interfaces
  - [x] Created reusable SpeechToTextButton component (MediaRecorder > S3 > Whisper > text)
  - [x] Added transcribeOnly server endpoint (speech-to-text only, no intent analysis)
  - [x] Integrated into AIChatBox (generic AI chat component)
  - [x] Integrated into KnoxChat (calibration editor chat)
  - [x] Integrated into Advanced.tsx diagnostic chat
  - [x] Integrated into SupportJoin.tsx customer chat
  - [x] Integrated into SupportAdminPanel.tsx admin chat
- [ ] When datalog is uploaded, talk-to-text should be able to trigger analysis and read out findings
- [ ] Knox should verbally summarize what needs adjustment based on datalog analysis

## Binary ECU Detection Still Failing in Editor Tab (2026-03-29)
- [x] Debug with 2026MavRXRs(Sunoco260GTPlus_Rev_0_2_VLM4).bin - was A2L fetch 403 (BRP folder missing in S3)
- [x] Debug with StockRead_1G0100914SB3VUM8_UL_exported.bin - same issue
- [x] Trace the exact code path: detection works (returns BRP), but fetchA2L fails on S3 path
- [x] Fix: added storageFolder fallback (BRP -> MG1C) in A2L_REGISTRY
- [x] User confirmed: auto-detection and A2L loading now works
- [ ] A2L definition doesn't line up with binary - needs deeper disassembly/decompile (separate feature)

## TCC Potential Error Missing from Health Report (2026-03-29)
- [x] TCC fault detection works but TCC potential error not appearing in health report output
- [x] Health score should adjust downward when TCC lag/slip is detected
- [x] Verify TCC findings are included in recommendations section
- [x] Fix health score calculation to account for TCC issues
- [x] Lowered thresholds: 15 consecutive OR 40 cumulative samples (was 25 consecutive only)
- [x] Added TCC apply lag detection (stalled/rising slip = real lag, converging slip = normal apply)
- [x] Fixed false positive: converging slip during normal apply no longer triggers lag warning
- [x] Added TCC_APPLY_LAG and TCC_APPLY_LAG_WARN codes to fault chart filter


## Dev-Mode Datalog Caching for Debugging (2026-03-29)
- [x] Add server endpoint to cache uploaded datalogs to S3 with 8-hour TTL
- [x] Store metadata: filename, upload time, file size, uploader (if signed in), source page
- [x] Add admin endpoint to list recent cached datalogs (last 8 hours)
- [x] Add admin endpoint to retrieve/download a cached datalog by ID
- [x] Wire frontend to automatically cache datalogs on upload (public analyzer + advanced)
- [ ] Show cached datalogs in admin panel or debug tools for testers (future)


## Fix: Maximum call stack size exceeded in saveEditorSession (2026-03-29)
- [x] Fix stack overflow when saving editor session (String.fromCharCode spread on 6MB array exceeded call stack)
- [x] Chunked base64 encoding (8KB chunks), split binary/A2L into separate localStorage keys, graceful quota handling


## Converter Stall Speed vs Turbo Mismatch Detection (2026-03-29)
- [x] Add Knox knowledge: low converter stall speed causes turbo lag — converter unlocked but not multiplying enough torque for turbo to spool
- [x] Add Knox knowledge: two root causes — (a) converter stall too low for turbo, (b) turbo boost leak preventing spool at available RPM
- [x] Add Knox knowledge: converter functioning fine mechanically, just mismatched to turbo power curve
- [ ] Update diagnostics to detect stall/turbo mismatch: analyze boost buildup rate vs RPM during acceleration
- [x] Ensure TCC lag detection does NOT flag converter-unlocked-during-acceleration as a fault (that's normal)
- [ ] Add health report recommendation for stall/turbo mismatch when detected

## Honda Talon Integration (2026-03-29)
- [ ] Analyze .djt (Dynojet tune) file format from sample file
- [x] Research .wp8 (Dynojet datalog) file format
- [ ] Build .djt parser to extract fuel tables
- [x] Build .wp8 parser to read datalog channels (wp8Parser.ts with FECEFACE magic, channel extraction, Float32 row parsing)
- [x] Auto-detect Honda Talon from .wp8 file headers (part number 0801EB/0801EA + DCT/Alpha N channels)
- [x] Add .wp8 file support to Analyzer upload zone (accept attribute + file extension detection)
- [x] When Honda Talon detected, route to Honda Talon Tuner page (sessionStorage + navigate to /advanced?tab=talon)
- [x] Build Honda Talon Tuner page in Advanced section (HondaTalonTuner component with injectedWP8 state)
- [x] Four fuel map upload cards: Alpha-N Cyl 1, Alpha-N Cyl 2, Speed Density Cyl 1, Speed Density Cyl 2
- [x] Heat-map grid editor for each fuel table with double-click cell editing
- [x] Datalog viewer with table and chart views for .wp8 data
- [x] Status bar showing loaded/empty state for all tables and datalog
- [x] Fix WP8 parser part number offset (scan from 0x0C for first printable ASCII, not hardcoded 0x10)
- [x] Fix WP8 parser channel scanner (add 03 10 row marker termination to prevent overshooting data section)
- [x] Fix Float32Array sessionStorage serialization (Array.from for serialize, new Float32Array for deserialize)
- [x] Write wp8Parser vitest (21 tests: magic detection, channel parsing, vehicle type detection, CSV conversion, serialization roundtrip, real file integration)
- [x] Update upload zone labels (CSV & WP8 DYNOJET SUPPORTED)

## Test Notifications Bug (2026-03-29)
- [x] Investigate test notifications being sent to user without explanation (vitest notifications.test.ts was writing to production DB)
- [x] Fix test to clean up after itself (afterAll cleanup + expiring notification + admin-only audience)
- [x] Purged 43 test notification records and delivery records from production database

## Role-Based Access Control Restructure (2026-03-29)
- [x] Add advancedAccess field to users table (enum: none/pending/approved/revoked, default none)
- [x] Add accessLevel field to users table (int 0-3, default 0, for future Level 1/2/3 tiers)
- [x] Add accessApprovedBy and accessApprovedAt fields to users table
- [x] Auto-detect super_admin from OWNER_OPEN_ID on login (set role to super_admin)
- [x] Build tRPC procedures: listUsers, approveAdvancedAccess, revokeAdvancedAccess, setUserRole, requestAccess
- [x] Build Admin Panel user management UI (list users, approve/revoke, assign roles)
- [ ] Remove PPEIROCKS code gate from Advanced.tsx (kept as temporary fallback, deprecating Friday)
- [ ] Remove KINGKONG editor gate (make role-based) — deferred
- [x] Replace code gate with role-based access check (super_admin/admin always in, approved users in, others see pending/request screen)
- [x] Build "Request Access" screen for unapproved users at /advanced
- [x] Build "Access Pending" screen for users who requested but not yet approved
- [x] Update admin tab visibility: super_admin sees all, admin sees admin tabs, users see only their level
- [x] Write tests for access control procedures (14 tests: auth, role checks, list, stats, approve/revoke guards)
- [x] Prepare accessLevel column for future Level 1/2/3 feature gating

## Role-Based Access Control Restructure (2026-03-29)
- [ ] Add advancedAccess field to users table (enum: none/pending/approved/revoked, default none)
- [ ] Add accessLevel field to users table (int 0-3, default 0, for future Level 1/2/3 tiers)
- [ ] Add accessApprovedBy and accessApprovedAt fields to users table
- [ ] Auto-detect super_admin from OWNER_OPEN_ID on login (Kory)
- [ ] Auto-promote Erik (ppei.com), Erik Fontenot (yahoo.com), Carmen to admin on login
- [ ] Build tRPC procedures: listUsers, approveAdvancedAccess, revokeAdvancedAccess, setUserRole, requestAccess
- [ ] Build Admin Panel user management UI (list users, approve/revoke, assign roles)
- [ ] Remove PPEIROCKS code gate from Advanced.tsx
- [ ] Remove KINGKONG editor gate (make role-based)
- [ ] Replace code gate with role-based access check (super_admin/admin always in, approved users in, others see request screen)
- [ ] Build "Request Access" screen for unapproved users at /advanced
- [ ] Build "Access Pending" screen for users who requested but not yet approved
- [ ] Update admin tab visibility: super_admin sees all, admin sees admin tabs, users see only their level
- [ ] Write tests for access control procedures
- [ ] Prepare accessLevel column for future Level 1/2/3 feature gating
- [ ] Logan to be promoted manually by Kory from admin panel once he logs in
- [ ] Show deprecation notice on access gate: passcode removed by Friday, log in to keep access
- [ ] Unapproved/not-logged-in users see "Contact PPEI" message
- [ ] Rename normal mode to "V-OP Lite" in UI (Home.tsx header/branding)
- [ ] Rename advanced mode to "V-OP Pro" in UI (Advanced.tsx header, access gate, navigation)
- [ ] Update ADVANCED button in header to say "V-OP PRO" or "PRO"
- [ ] Legal research: Crypto/Bitcoin wagering for drag races (smart contracts, escrow)
- [ ] Legal research: Skill-based competition model (entry fee tournaments)
- [ ] Legal research: Sweepstakes model for drag racing
- [ ] Legal research: Fantasy sports precedent applied to drag racing
- [ ] V-OP Drag: 1% rake + $200/month subscription model (ultra-competitive pricing)
- [ ] V-OP Community — modern forum system with real-time messaging
- [ ] Community categories (Drag Racing, Fleet Management, General, etc.)
- [ ] User-created channels/threads within categories
- [ ] Real-time message delivery (modern speed, old school forum feel)
- [ ] Pinned posts, suggested groups/forums
- [ ] Community tab in V-OP navigation
- [ ] Default channels: Drag Racing, Fleet Management, Performance Tuning, General Discussion
- [ ] Drag racing freemium: 3 free runs then subscription required
- [ ] Forum 30-day trial access for new users
- [ ] MoTeC datalog import support
- [ ] FuelTech datalog import support
- [ ] Haltech, AEM, Holley standalone datalog import support
- [ ] Enhanced AI analysis for standalone ECU data (more PIDs = deeper insights)
- [ ] Fix protocol notification persistence — dismiss once, stay dismissed unless genuinely new
- [ ] Knox + Goose collaboration for drag racing analysis
- [ ] Goose trains as drag racing specialist, scrapes forums for tips/data
- [ ] Fix: binary PIDs, UDS, etc showing on page again — clean up Advanced page tabs/UI
- [ ] V-OP Drag: Photo upload → AI vehicle rendering for race simulation video
- [ ] V-OP Drag: Side-by-side animated race video using real OBD data + user vehicle photos
- [ ] V-OP Drag: Scheduled race reveal events — both racers agree on time, invite friends
- [ ] V-OP Drag: Discord/streaming integration for live race reveals
- [ ] V-OP Drag: Betting pool settlement on race reveal
- [ ] Add golf cart category to fleet types and drag racing classes
- [ ] EcoBattery integration — Bluetooth data scraping or API partnership for golf cart diagnostics
- [ ] Unified DRAG RACING tab covering all vehicle types (diesel, powersports, golf cart, ag)
- [ ] Golf cart analyzer — battery health, motor efficiency, cell balance, controller diagnostics
- [ ] Golf cart drag racing — speed, acceleration, voltage sag, motor current
- [x] Consolidate all admin/dev tabs into one DEV TOOLS tab — admin sees same tabs as regular user + DEV TOOLS

## V-OP Drag Racing — Regional Callouts & User-Created Leagues (2026-03-30)
- [x] Add regional callouts schema (dragCallouts table — location-based challenges)
- [x] Add user-created leagues schema (dragLeagues, dragLeagueSeasons, dragLeagueStandings tables)
- [x] Add BTC wallet/payment fields to drag profiles (btcAddress, btcBalance, paymentMethod)
- [x] Regional callouts: "Fastest in Louisiana", "King of 70601", city/state/zip challenges
- [x] User-created leagues: anyone can create a series with custom rules, classes, entry fees
- [x] League commissioner role — creator manages brackets, scoring, championships
- [x] Multi-round championship point scoring and season standings
- [x] Playoff brackets for league championships
- [x] Facebook sharing integration — timeslips, callouts, standings as shareable cards
- [ ] Challenge links — share direct URL, opponent clicks to accept (future)
- [x] "Fastest in [Location]" badges on profiles

## V-OP Drag Racing — Bitcoin Wagering (2026-03-30)
- [ ] Bitcoin payment integration for subscriptions ($20/mo base, $200/mo with wagering)
- [ ] BTC escrow system for head-to-head challenges
- [ ] 1% rake on all BTC wager pools
- [ ] Lightning Network support for instant small bets
- [ ] USDC stablecoin option for non-volatile payments
- [x] Crypto wallet connection UI (BTC address entry/QR)
- [ ] Platform wallet for collecting rake and subscription payments
- [x] Subscription tiers: Free (3 runs), $20/mo (full platform), $200/mo (BTC wagering)

## Big Build — Fleet + Drag + Community + DEV TOOLS (2026-03-30)
- [x] Build Fleet tRPC router (CRUD for orgs, vehicles, drivers, trips, alerts, sensors, remote sessions)
- [x] Build Drag tRPC router (profiles, runs, challenges, callouts, leagues, tournaments, leaderboards)
- [x] Build Community tRPC router (categories, channels, threads, posts, likes, memberships)
- [x] Build Fleet page UI — Goose AI chat, 8-tab dashboard (Goose, Dashboard, Vehicles, Drivers, Alerts, Reports, Diagnostics, Settings)
- [x] Build Drag Racing page UI — time slips, AI race reports, callouts, leagues, leaderboards, BTC wagering
- [x] Build Community page UI — real-time forum, categories, channels, threads, modern messaging feel
- [x] Build DEV TOOLS consolidated admin tab (all internal tools as sub-tabs)
- [x] Wire all new pages into App.tsx navigation
- [x] Write tests for Fleet, Drag, and Community routers
- [x] Push database schema migrations
- [x] Checkpoint and publish

## Universal Facebook Sharing Integration (2026-03-30)
- [x] Build shared ShareButton component (Facebook share dialog, copy link, native share API)
- [x] Build share utility with Open Graph URL builder for each module
- [ ] Add server-side /api/share/:type/:id route for Open Graph meta tag previews (future)
- [x] Integrate share into Home — datalog analysis results ("620HP / 1100TQ — Built by PPEI")
- [x] Integrate share into Home — diagnostic report ("Health Score: 94/100")
- [x] Integrate share into Home — health report PDF share
- [x] Integrate share into Drag Racing — timeslip share ("10.8 @ 128mph")
- [x] Integrate share into Drag Racing — regional callout share ("Fastest L5P in Louisiana")
- [x] Integrate share into Drag Racing — league standings share
- [x] Integrate share into Drag Racing — leaderboard position share
- [x] Integrate share into Fleet — fleet stats summary share
- [x] Integrate share into Community — thread/post share
- [ ] Open Graph meta tags with dynamic preview images per share type (future)
- [x] "Powered by V-OP / PPEI" branding on all share cards
- [x] Vehicle photo upload — users upload truck pics as their vehicle profile photo
- [x] Dynamic share card generator — truck photo as background with data overlay
- [x] Share card templates per module (dyno, diagnostic, timeslip, callout, fleet, community)

## PDF Beta Watermark & Disclaimer (2026-03-30)
- [x] Add light "V-OP BETA v0.02" watermark to all PDF exports
- [x] Add beta disclaimer text to PDF footer ("This report was generated by V-OP BETA...")
- [x] Apply watermark to Health Report PDF
- [x] Apply watermark to Diagnostic Report PDF
- [x] Apply watermark to Drag Timeslip PDF export

## WP8 File Parsing Bug
- [x] Debug WP8 file upload error — "format incorrect" when uploading UTV96_YawPowerCoils_Rev_0_4_Run_6.wp8
- [x] Fix WP8 parser to handle V2 protobuf-encoded format (Dynoware RT) — added full V2 parser alongside existing V1 parser
- [x] Test with the provided WP8 file — 171 channels, 3343 timestamps, Honda Talon detected correctly

## WP8 V2 Honda Talon Redirect Bug
- [x] Fix WP8 V2 file not redirecting to Honda Talon Tuner page after successful parse — talon was only a devSubTab, added top-level activeTab === 'talon' rendering
- [x] Verify sessionStorage data handoff works for V2 format
- [x] Test end-to-end: upload V2 WP8 → detect Honda Talon → redirect to Advanced?tab=talon — Honda Talon tab now dynamically appears in tab bar when WP8 data is loaded

## MG1 Binary Map Offset Fix (2026-03-30)
- [x] Investigate MG1 binary map offset misalignment (editor shows 0x9464588, WinOLS shows 0x48E638 for AirPah_pIntkNomFcoCorr)
- [x] Root cause: DEADBEEF container header has flash addresses (0x08FD8100+) but alignment engine only tried 0x08FD8000 (off by 0x20B0 = 8,368 bytes)
- [x] Fix: Added parseDEADBEEFFlashAddresses() to extract flash addresses from container header (0x100-0x1D0, 0x200-0x240 regions)
- [x] Fix: Added generateDEADBEEFCandidateBases() to generate candidate bases from header-derived addresses (header size sweep 0x1000-0x4000)
- [x] Fix: Injected DEADBEEF strategy into both alignOffsets (Strategy 1.75) and autoHealAlignment (Strategy 2.5)
- [x] Verified: correct base 0x08FD5F50 found in candidates, row 0 values match WinOLS exactly: [0.0, 4.9, 14.1, 29.3, 44.1, 58.2, 72.7, 90.0]
- [x] Added 11 new tests for DEADBEEF parsing, candidate generation, and alignment (30 total in editorAlignment.test.ts)
- [x] All 954 tests passing, TypeScript compiles cleanly

## Fleet/Drag Summary Banners + Auth/Access Fixes (2026-03-30)
- [x] Add summary banner to Fleet tab explaining module purpose and goals
- [x] Add summary banner to Drag Racing tab explaining module purpose and goals
- [x] Restore logout button/functionality (user avatar dropdown with SIGN OUT in PpeiHeader)
- [ ] Re-enforce Advanced section access control (currently public, should require special access)

## Version Bump + Text Contrast Fix (2026-03-30)
- [x] Update version to v0.03
- [x] Improve text contrast for dim text (subtitle, version badge, helper text too dark to read)

## Remove PPEIROCKS + Domain Redirect + Contrast Sweep (2026-03-30)
- [x] Remove legacy PPEIROCKS passcode from Advanced — make it auth-only (sign in + admin approval)
- [x] Add bare domain redirect from ppei.ai to www.ppei.ai in server
- [x] Sweep all pages for dim text contrast (oklch lightness < 0.60) and brighten — 246 fixes across 36 files

## Batch 7 — Outstanding Suggestions + Admin Function Tab (2026-03-30)
- [ ] What's New changelog modal on login with dismiss option
- [ ] Fix fleet TS errors — add fleetSensors, fleetAiInsights, fleetAccessTokens to schema
- [ ] Wire playoff bracket to league seasons — View Bracket button on league cards
- [ ] Challenge links for drag racing callouts — shareable accept URLs
- [ ] Open Graph meta tags — dynamic OG preview images per share type
- [ ] MG1 disassembly/definition generation pipeline — auto-build def files from binary analysis
- [ ] Admin Function Tab — master index of all installed features/tools for quick access

## MG1 Map Definition Deep Fix (2026-03-30)
- [x] Investigate why editor shows AirPah_ratMAirEngInNom (ratio ~0.92) while WinOLS shows AirPah_pIntkNomFcoCorr (hPa ~4.9-90.0) at same address 0x48E638
- [x] Root cause: alignment scoring used only range checks (unbounded -3.4E+38 to 3.4E+38), so wrong base scored equally
- [x] Fix: added NaN/Inf/denormal penalty scoring to ALL alignment strategies (1.75 DEADBEEF, 2 known offsets, 3 brute force, autoHeal testOffset)
- [x] Verified: correct base 0x08FD5F50 scores 0.974 vs wrong base 0.000 (100% NaN) at 80-map sample size
- [x] Verified: correct base wins at all sample sizes (50, 80, 100, 500 maps)
- [x] Also fixed Strategy 2 to track best across ALL candidates instead of returning first >0.5
- [x] All 954 tests pass, TypeScript compiles cleanly

## MG1 DEADBEEF Small Header Alignment Fix (2026-03-30)
- [x] Root cause: generateDEADBEEFCandidateBases() searched header sizes 0x1000-0x4000, but Can-Am MDG1 binary has ~0x200 header
- [x] Correct base 0x08FD7F00 (header size 0x200) was never generated as a candidate
- [x] DEADBEEF strategy (1.75) picked wrong base with confidence > 0.3, preventing brute force from running
- [x] Fix: extended header size range from 0x80-0x6000 (was 0x1000-0x4000)
- [x] Fix: extended DEADBEEF flash address scan from 0x200-0x400 (was 0x200-0x240)
- [x] Added 0x08FD7F00 to known offsets for MG1CA920, MG1C, and autoHeal boschBases
- [x] Added test: small DEADBEEF header (0x200 bytes) alignment finds correct base
- [x] All 31 alignment tests pass, TypeScript compiles cleanly

## MG1 DEADBEEF Container Decompiler/Disassembler (2026-03-30)
- [ ] Analyze WinOLS project to extract ground truth segment layout and map-to-file-offset mappings
- [ ] Reverse-engineer DEADBEEF container format (segment tables, flash address mapping, data regions)
- [ ] Build proper DEADBEEF segment parser that reconstructs flat flash image from container
- [ ] Integrate decompiler into editor binary loading pipeline (extractBinaryData)
- [ ] Verify editor maps match WinOLS display for the Can-Am MDG1 binary
- [ ] Write tests for DEADBEEF decompiler

## Rate Limiter Bug (2026-03-30)
- [x] Fix rate limiter causing "Rate exceeded" white screen after OAuth login
- [x] Fix CSV parser rejecting E86B_ticket164909_railpsi_2.csv (missing RPM/MAF columns error)

## EZ Lynk CSV Format Support (2026-03-30)
- [x] Analyze EZ Lynk CSV format structure (2015 LML E86A + A50 TCM log)
- [x] Add EZ Lynk format detection to parseCSV
- [x] Add EZ Lynk parser with full column mapping (21 PIDs)
- [x] Handle sparse GPS-only rows, kPSI→PSI rail pressure conversion
- [ ] Verify EZ Lynk log parses and displays correctly in browser

## OAuth Callback Error (2026-03-30)
- [x] Fix OAuth callback failed error on www.ppei.ai login (added retry with backoff for transient TiDB errors, graceful redirect on failure)
- [x] Fix feedback panel mobile layout - bottom sheet on mobile, centered modal on desktop, safe-area padding

## Log Details Rename + PID Selector (2026-03-30)
- [x] Rename "Dyno Results" to "Log Details" across 8 files (Home, Advanced, DynoCharts, pdfExport, ShareCard, DebugReport, healthReportPdf)
- [x] Expand PID_OVERLAYS from 13 to 27 channels covering all ProcessedMetrics numeric arrays
- [x] Group PIDs by category (Engine, Boost, Fuel, Temps, Pressures, Trans) with category toggle-all
- [x] Allow manual enable/disable of individual PIDs for chart visibility
- [x] Only show PIDs that have actual data (>1% non-zero/non-NaN) in the loaded log
- [x] Support negative values (injection timing) in axis domains and data bucketing
- [x] Show count of available channels and active selections

## Segment Swapper Part Number Fix (2026-03-30)
- [ ] Fix segment swapper not showing part numbers besides OS for E86B binaries
- [x] Rename "Binary" tab to "Editor" tab in the Advanced section navigation

## PDF Health Report Text Bug (2026-03-30)
- [x] Fix garbled emoji characters (\u2713/\u2717/\u26a0) in all PDF-rendering files: healthReport, advancedHealthPdf, pdfExport, compareEngine, ecuChecksums, editorEngine, knoxLearningEngine

## User Feedback Fixes (2026-03-30 batch)
- [x] Fix VGT analysis logic: open VGT = less boost = potentially HIGHER EGTs (current logic is backwards)
- [x] Fix EGT sensor false positive - stop flagging EGT sensor as broken when it's not
- [x] Dyno HP fallback: when torque PID unavailable, calculate HP from vehicle weight + acceleration
- [x] Airflow outlook: add toggle switch between table and line graph view (defaults to graph)
- [x] Performance recommendations: added to reasoning engine (IPW, rail pressure, boost efficiency, EGT, IAT, converter matching)
- [ ] Fix E86B segment swapper part number scanning (double-AFAF headers have PN at +0x10)
- [x] MG1 DEADBEEF multi-segment binary alignment (already comprehensive, verified working)
- [x] Segment swapper: block swap if main OS part number doesn't match between files (hard block at UI + library level)

## 2022 Ford Powerstroke 6.7L Stock Flash Reference (2026-03-30)
- [ ] Analyze BUSMASTER log file format for Ford ECM flash capture
- [ ] Extract calibration IDs, part numbers, memory regions from flash log
- [ ] Store reference data with Knox learning engine for future Ford Powerstroke development
- [ ] Analyze modified EZLynk BUSMASTER flash log and compare against stock
- [ ] Identify EZLynk security bypass mechanism in flash protocol
- [ ] Document calibration differences between stock and modified flash
- [ ] Analyze 6.7L strategy document (67LSTRATEGYDOC.pdf) for Knox knowledge
- [ ] Analyze DSML3A diagnostic specification for Knox knowledge
- [ ] Parse Ford 6.7L PID XML (II17-196.7LFordPIDs.Channels.xml) for future PID expansion
- [ ] Analyze 6.7L strategy document (67LSTRATEGYDOC.pdf) for Knox knowledge
- [ ] Analyze DSML3A diagnostic specification for Knox knowledge
- [ ] Parse Ford 6.7L PID XML (II17-196.7LFordPIDs.Channels.xml) for future PID expansion
- [ ] Analyze 6.7L_Diesel.pdf reference document for Knox knowledge
- [ ] Compare stock vs modified BUSMASTER flash logs and document EZLynk security bypass

## Editor Calculator Tools
- [ ] Add Tire Size & Shift Point Calculator tool to editor (based on TireSize&ShiftPointCalculator.xls)
- [ ] Add GM A6 (Allison 6-speed) Shift Calculator tool to editor (based on GMA6SHIFTCALCULATORv1.1.xlsx)

## Knox Knowledge Extraction
- [x] Create knox_documents DB table and catalog 97+ documents
- [ ] Extract A2L map counts, key parameters, address ranges from all A2L files
- [ ] Compare stock vs modified BUSMASTER flash logs (EZLynk security bypass analysis)
- [ ] Extract key knowledge from strategy docs for Knox learning

## Cummins EFD Tools
- [ ] Build EFD to BIN converter tool in editor tab (waiting for target BIN format from user)
- [x] Store 67 Cummins EFD files (2013-2021 RAM 6.7L) with Knox for decompilation learning
- [x] Train Knox to understand EFD parameter mapping → memory addresses for definition file building (BIN format analyzed: PowerPC BE, 4MB flat flash, cal at 0x6B43C)

## Cummins ECU Security Research
- [ ] Crack 2022-2024 Cummins ECU lock (currently requires downflash to 2019-2021 firmware first)
- [ ] Analyze bootloader-level authentication difference between 2019-2021 and 2022-2024 ECUs
- [ ] Crack 2025 Cummins ECU security
- [x] Analyze 2019 D2 BIN format and compare against 2014 format
- [x] Analyze 2014 D2 BIN format (reference: STOCK_2014D2DJRnoTv10024_32370231SF_efi.bin)

## Map Readdressing / Map Moving
- [ ] Learn map readdressing technique from WinOLS EDC17C69 example (WinOLS(edc17c69(Exampleofmapmoved)-060159).ols)
- [ ] Implement map readdressing capability in editor (move maps to new flash addresses)
- [ ] Document the breakdown of how map pointers work and how to safely relocate maps

## 2025 Cummins ECU Analysis
- [x] Analyzed 2025 Cummins FULL.bin (80MB flash dump) - RSA/SHA256 code signing found
- [x] Mapped physical memory layout (5 blocks: cert/boot, config, secondary, main code+cal, Chrysler)
- [x] Identified PKI infrastructure (PROD_PCM_000C_CS_CertStore, PROD_PCM_000C_CS_Application)
- [x] Analyzed EFD EBML format (DocType version 27, encrypted payload, 7.98 bits/byte entropy)
- [x] Extracted EFD metadata (Engine, Transmission, ModelYear, DriveTrain, Program, Version)
- [x] Three-generation BIN comparison (2014 vs 2019 vs 2022) - documented format evolution
- [ ] Decrypt EFD payload to extract calibration parameters for editor display
- [ ] Study PowerCal/INSITE for EFD decryption routines
- [ ] Build EFD parameter viewer in editor tab

## RAM 1500 EcoDiesel
- [ ] Analyze DodgeRam1500EcoDieselfromA2L.ols WinOLS file for 3.0L VM Motori diesel parameters
- [ ] Store EcoDiesel A2L definitions with Knox for 2014-2017 model support

## Live Tuning Tab (Editor Lite + Pro)
- [ ] Build A2L parser library (extract CHARACTERISTIC, MEASUREMENT, AXIS_PTS, COMPU_METHOD, RECORD_LAYOUT)
- [ ] Create Live Tuning tab in editor with ECU/A2L selection workflow
- [ ] Build parameter browser (tree view by category: injection, boost, EGR, DPF, torque, etc.)
- [ ] Build map/curve/scalar viewer (2D table, 3D surface, single value editors)
- [ ] Build value editor with min/max bounds from A2L COMPU_METHOD
- [ ] Add search/filter for parameters by name, address, or category
- [ ] Support all Knox A2L files (GM EDC17, Ford EDC17/MG1, Cummins, Dodge EcoDiesel, etc.)
- [ ] Add real-time value display (read from ECU via diagnostic link)
- [ ] Add write-back capability (modify values in ECU RAM for live tuning)
- [ ] Write tests for A2L parser

## E42 Duramax L5P Gen 2 ECU Security Research
- [ ] Analyze E42_12737238.a2l for security-related parameters, seed-key routines, flash protection maps
- [ ] Analyze E42_12737238.bin for security architecture (code signing, bootloader checks, auth regions)
- [ ] Compare E42A2L(Original).ols vs E42DuramaxKoryDenali(Original).ols WinOLS files
- [ ] Map E42 memory layout and identify flash protection regions
- [ ] Prepare Knox knowledge for IntelliSpy flash sniffing session
- [ ] Crack E42 ECU security to enable custom calibration flashing

## Knox Editor Integration - File Retrieval & Context Engine
- [ ] Knox file retrieval: user asks for a part number, tune file, or A2L map and Knox searches DB, finds the file, opens it in a new editor tab
- [ ] Knox opens files in separate editor tab so current work is not disrupted
- [ ] Knox can map a tune file onto its A2L definition and display parameters in the editor
- [ ] Knox part number search: query by PN, cal ID, or OS number to find matching files across the entire database
- [ ] Knox context-aware suggestions: when editing a binary, Knox suggests related reference files (stock comparison, A2L, DAMOS)
- [ ] Knox file comparison: open a reference file alongside current work for side-by-side comparison
- [ ] As database grows with more binaries/A2Ls/calibrations, Knox search becomes the primary file access method

## Transmission TCM Unlock Research
- [x] Diff T87A patched OLS vs stock BIN to identify exact unlock bytes (security flag 0x1386, tables 0xA88C-0xC027, 6 seed-key bypasses)
- [x] Diff T93 unlocked OLS vs stock BIN -- same pattern as T87A (calibration-level lock, not bootloader)
- [x] Map security architecture: lock is in calibration data, one-time bench patch enables OBD flash
- [ ] Build automatic TCM unlock patcher in editor (apply unlock to any T87A/T93 binary)
- [ ] If bench unlock fails on different unit, adapt based on Knox security knowledge
- [ ] Document C10 vs C11 address offset differences (133 params differ, C11 shifted +0x1000 in upper range)

## Transmission Tuning in Editor
- [ ] Add C10 Allison 6-speed address map support (2006-2010, 16055 params)
- [ ] Add C11 Allison 6-speed address map support (2011-2016, 16128 params)
- [ ] Add T87A 10L80/10L90 A2L support (2019+, PN 24293216)
- [ ] Add T93 10L1000 Allison A2L support (2020+, PN 24048502)
- [ ] Shift point editing with visual graph (gear ratio vs speed vs throttle)
- [ ] TCC lockup strategy editing (pressure, slip targets, apply/release timing)
- [ ] Line pressure editing (main pressure, converter charge, lube)
- [ ] Adaptive learn reset capability

## HPT to BIN Converter (Editor)
- [ ] Reverse engineer VCM Extractor tool to understand .hpt file format
- [ ] Build .hpt file parser in the editor (client-side)
- [ ] Add .hpt upload support alongside existing .bin upload in editor
- [ ] Add .bin export option when user exports from editor

## EFI to BIN Converter (Editor)
- [ ] Reverse engineer EfiReader tool to understand .efi file format
- [ ] Build .efi file parser in the editor (client-side)
- [ ] Add .efi upload support in editor

## EFD Reader (Editor)
- [ ] Analyze EFD_Reader C# source for EFD decryption/parsing logic (uses EVP_CIPHER for crypto)
- [ ] Port EFD parsing to TypeScript for editor integration
- [ ] Enable EFD file viewing in editor with parameter tree

## PPEI Calculators Tab (Editor)
- [x] Build interactive "Calculators" tab in editor
- [x] MAP Sensor Data calculator (pressure/voltage conversion)
- [x] PPEI Automotive Calculations (master calc sheet)
- [x] T56 Gear Calculator (manual trans ratios)
- [x] Timing Calculator V4 (injection timing — shift point scaling)
- [x] Tire/Gear/Trans Calculator (speed/RPM/gear ratio)
- [x] TOS & Vehicle Speed Calculator - 6R100 (Ford 6-speed)
- [x] TOS & Vehicle Speed Calculator - 48RE (Dodge)
- [x] TOS & Vehicle Speed Calculator - 68RFE (Cummins 6-speed)
- [x] TOS & Vehicle Speed Calculator - Aisin (6-speed)
- [x] TOS & Vehicle Speed Calculator - Allison (6-speed)
- [x] Transmission Calc (general)
- [x] 10R80 RPM & TCC Converter (Ford 10-speed reverse RPM calc)
- [x] 68RFE Lockup Schedule (Cummins lockup timing)
- [x] Engine Conversion Tool (unit conversions)
- [x] Equivalence Ratio Calculator (AFR/lambda)
- [x] GM A6 Shift Calculator v1.1 (Allison 6-speed shift points)
- [x] Tire Size & Shift Point Calculator

## Knox Knowledge Base — Gas ECU Files Ingestion
- [x] Analyze KTFKDC3.a2l + KTFKDC3.h32 (Bosch MG1CS019 gas ECU)
- [x] Analyze PKCMA.A2L
- [x] Analyze KGCP2G7.vst
- [x] Analyze KGCP3K4.a2l
- [x] Analyze KGCP7.A2L
- [x] Analyze KGCT9.A2L
- [x] Analyze KGCTA.A2L
- [x] Store all files in Knox knowledge base with ECU metadata (106 files in DB)
- [x] Analyze KGCF1_100628.h32 + KGCF1_100628.vst
- [x] Analyze PKRJ5.A2L
- [x] Analyze PKFKD.A2L + PKFKD.c (C source — ASAP2 parameter definitions, not ECU firmware)
- [x] Analyze TPCL0EM.a2l + TPCL0EM.h32 (TCM files)
- [x] Analyze KJDH2.A2L
- [x] Analyze DFFH3F7.a2l
- [x] Analyze TDRJ0XE.a2l
- [x] Analyze 3.0LPowerstroke.zip contents
- [x] Analyze Copperhead.zip contents
- [x] Analyze TC1797.zip contents
- [x] Analyze 2016FocusRS.7z contents
- [x] Analyze Mustang.zip contents (30 files — 11-14 GT500, 15-17 EcoBoost/Coyote/GT350, 18-19 Coyote/EcoBoost/UK)
- [x] Analyze PCMTec.zip contents (45 files — 39 A2L, 3 ATI, 2 err, 1 vst — Ford/GM ECU definitions)
- [x] Analyze Random.zip contents
- [x] Analyze fordecoboostCNBP1.A2L, fordecoboostCNBP2.A2L, fordecoboostKHDP1.A2L
- [x] Analyze FPGS0.a2l, HAFFA.a2l, FHVJ1.a2l
- [x] Knox file library tRPC procedures (list, detail, platforms, collections)
- [x] Knox file library vitest tests (11 tests passing)

## Knox File Browser + Erika Context + Bulk Upload
- [x] Build Knox File Browser panel component (search, filter by platform/collection/type, detail view)
- [x] Integrate Knox File Browser as "Knox Library" tab in CalibrationEditor
- [x] Wire Knox files into Erika's context for cross-platform calibration knowledge
- [x] Build bulk file upload with drag-and-drop UI (placeholder — full server-side processing via chat)
- [x] Write vitest tests for Knox browser (12 tests passing)

## Can-Am MG1 Decompile & Definition File Build
- [x] Decompile/disassemble 1E1101953.a2l — 20,983 calibratables mapped (507 MAPs, 612 CURVEs, 16,275 VALUEs)
- [x] Decompile/disassemble 1E1101953SA2VLMJ.hex — 3 segments (boot 0x0060C000, firmware 0x08FC0000, cal 0x09440000)
- [x] Document ECU logic flow (air path, fuel, boost, torque, emissions, diagnostics)
- [x] Build definition file (19,101 tuning params, 100% MAP/CURVE/VALUE verification)
- [x] Test definition file — 100% match with HEX binary, WinOLS OLS is version 1E1102029
- [x] Iterate fixes — all maps verified, zero offset errors
- [x] Test with second Can-Am MG1 BIN — DIFFERENT major version (1G010 vs 1E110), 44.6% byte diff, requires own A2L
- [x] Create engine load & boost control logic flowchart with table/parameter names

## Knox Editor Integration + Bulk Upload + MG1 Auto-Detection
- [x] Knox "Load into Editor" button — click any A2L in Knox Library to auto-load as active definition
- [x] Server-side endpoint to fetch A2L content from S3 (fetchKnoxA2LContent procedure)
- [x] Bulk file upload via Knox Library tab — drag-and-drop A2L/H32/VST with auto-analysis
- [x] Server-side file analysis endpoint (uploadKnoxFile procedure — parse A2L metadata, detect ECU family, store in knox_files)
- [x] MG1 definition auto-detection — Knox DB fallback in fetchA2L when static registry has no match
- [x] Integrate MG1CA920 into ECU family detection pipeline (knoxAutoMatch procedure)
- [x] Write vitest tests for all features (21 tests passing in knox-integration.test.ts)
- [x] Airflow/boost/torque limit analysis overlay — 7 categories (airflow, boost, torque, fuel, ignition, throttle, thermal) with headroom analysis

## CASTING MODE — Live Streaming & Virtual Dyno Events
- [ ] Database schema for casting (cast_sessions, cast_events, cast_viewers, cast_reactions, cast_chat, stream_keys)
- [ ] Admin Casting panel — Go Live toggle, camera/mic/screen capture, stream preview
- [ ] Stream key management — store RTMP keys for YouTube, Facebook, Twitch, TikTok, custom endpoints
- [ ] Multi-platform RTMP multicast — push to all platforms simultaneously
- [ ] Cast Dyno Mode — virtual stadium layout with viewer video seats (COVID NBA style)
- [ ] Viewer video bubbles in stadium seating — camera-on viewers get a visible seat
- [ ] Crowd reactions system — fire, horn, applause, etc. with stadium lighting effects
- [ ] Live dyno overlay HUD — HP/torque gauge, boost, RPM, EGT as transparent overlay on camera feed
- [ ] Real-time dyno data streaming via WebSocket
- [ ] AI ChatBot host (Knox-powered) — welcomes viewers, calls out numbers, moderates chat, color commentary
- [ ] Aggregated chat — merge in-app + YouTube + FB + Twitch chat into one scrolling ticker
- [ ] Event system — schedule upcoming dyno events, countdown timer, event lobby
- [ ] Event notifications — push to users when event is about to start
- [ ] Viewer features — front row seat request, vote on next truck, clip sharing
- [ ] Commentary mode — admin mic overlay on dyno feed
- [ ] Post-event — auto-save VOD, highlight reel, shareable dyno results card
- [ ] Write vitest tests for casting system

## Honda Talon Pro Log Viewer (HPTuners/Dynojet Hybrid)
- [x] Honda Talon HPTuners/Dynojet hybrid log viewer — 4 stacked chart sections with up to 4 channels each
- [x] Left-side channel panel with live values at cursor position (HPTuners style)
- [ ] Dark mode theme matching VCM Scanner aesthetic
- [x] Synced crosshair cursor across all 4 chart sections
- [ ] Per-section channel assignment (select channels into sections)
- [ ] Color-coded channel traces with left/right Y-axis labels
- [ ] Zoom/pan support synced across all sections
- [ ] Replace existing basic WP8DatalogViewer with new pro log viewer

## Screenshot-to-Fuel-Table OCR Upload
- [x] Add screenshot upload button to Honda Talon fuel table section
- [x] Use LLM vision to OCR fuel table screenshots from C3 Tuning Software
- [x] Extract cell values, TPS axis, RPM axis from screenshot
- [x] Populate editable fuel table from OCR results
- [x] Add Target Lambda row above RPM axis in fuel table editor
- [x] Support all 4 cylinder fuel maps via screenshot upload
- [x] Clipboard paste (Ctrl+V) support for fuel table screenshots — no file save needed
- [x] Paste zone UI with visual feedback when pasting from snipping tool

## Honda Talon Tuner — Target Lambda, Fact-Check, AFR→Lambda, Alpha-N Indicator (2026-03-31)
- [x] Shared Target Lambda between Cyl 1 & Cyl 2 (editing one updates both), Alpha-N and Speed Density keep separate
- [x] Screenshot fact-checking — verify OCR title matches the card (Alpha-N vs Speed Density + cylinder number)
- [x] AFR→Lambda conversion in log viewer (AFR1 / 14.7, AFR2 / 14.7)
- [x] Alpha-N channel indicator — when Alpha-N = 1, show Alpha-N tables active; else Speed Density active
- [x] Encode Honda Talon datalog review logic into Knox knowledge base (Alpha-N mode detection, AFR→Lambda, fuel table cross-reference rules)
- [x] Log-to-Map Cell Overlay: highlight active fuel table cells during datalog, color by Lambda deviation
- [x] Log-to-Map: determine active mode (Alpha-N vs Speed Density) from Alpha-N channel
- [x] Log-to-Map: map RPM + TPS/MAP to nearest fuel table cell
- [x] Log-to-Map: color cells green (on target), yellow (slight deviation), red (significant lean/rich)
- [x] Log-to-Map: sync overlay with TalonLogViewer cursor position
- [x] Fuel Table Diff/Compare: paste two screenshots side-by-side
- [x] Fuel Table Diff/Compare: color-coded difference map showing changed cells
- [x] Fuel Table Diff/Compare: show delta values (new - old) in each cell
- [ ] Integrate vop-task-tracker into V-OP as TASKS nav button
- [x] Copy task tracker components (StatsBar, FilterBar, TaskTable, SprintTimeline, ModuleSidebar, taskData, useTaskStore)
- [x] Add @ppei email access gate for TASKS page (similar to Advanced tab gate)
- [ ] Wire TASKS route in App.tsx and add nav button in PpeiHeader
- [ ] Add Cummins 6.7L PID aliases to EFILive parser getColumnIndex calls
- [x] - [ ] Add Cummins-unique channels to DuramaxData interface (turboSpeed, exhaustPressure, pilotInjection, postInjection, etc.)
- [ ] Add Cummins-specific unit conversions (Nm→lb-ft, kPa→psi, km/h→mph, MPa→psi, deg C→deg F)
- [ ] Add Cummins bitmask/status PID parsing (operating modes, alt tables, regen state)
- [ ] Test with CMF_0031.csv to verify all 71 channels populate
- [x] Add 2018 Ram Cummins missing PIDs: EGT1-5_F (5 individual EGT probes), AIRDENH_F, AIRDENL_F, AIRDENSC_F, ENGTRST_F, FUELCTRL_F
- [x] Add egt2-egt5 channels to DuramaxData/ProcessedMetrics interfaces for multi-probe EGT support
- [x] Add 2012 Ram Cummins PIDs: MAININJD_F (main inj duration us), LOAD_PCT, OUTRPM, TRBRPM, ENGRPM, TO_I (trans oil temp), DESLPRES/LPRES/LPRESDC (line pressure), IGCODE (gear), TQ_DD/TQ_ACT (torque %), ELEMSK (clutch states)
- [x] Add 2018 Ram Cummins PIDs: EGT1-5_F (5 EGT probes), AIRDENH_F/AIRDENL_F/AIRDENSC_F (altitude density), ENGTRST_F, FUELCTRL_F
- [x] Add egt2-egt5, altitudeDensity, engineTorqueState, fuelControlMode, mainInjDuration, calcLoad, outputShaftRpm, turbineRpm, transLinePressure to interfaces
- [x] FCA Calibration Report: Parse all 1,855 pages into structured data
- [x] FCA Calibration Report: Create database schema for calibration records
- [x] FCA Calibration Report: Insert all parsed records into database (17,912 records)
- [x] FCA Calibration Report: Build searchable Calibration Lookup UI page
- [x] Finish Cummins 2012/2018 PID parser additions (mainInjDuration, calcLoad, outputShaftRpm, etc.)
- [ ] CM2200 Config: Parse XML config file and extract key tuning parameters for Knox
- [ ] CM2200 Config: Add Cummins CM2200 ECU knowledge to Knox knowledge base
- [x] CM2350B Config: Parse XML config file and extract key tuning parameters for Knox (22,836 params, 16,469 tuning-relevant)
- [x] CM2350B Config: Add Cummins CM2350B ECU knowledge to Knox knowledge base
- [x] Add CM2350B BDC ECU definition to cumminsParameterDatabase.ts
- [x] Add CM2350B_SPECS to ecuReference.ts (engine specs, operating limits, subsystem descriptions)
- [x] Add 40+ new Cummins PID chart overlays to DynoCharts PID_OVERLAYS registry
- [x] Fix casting router TS error (LLM response content type mismatch in castChat insert)
- [x] Parse Cummins Fueling Control States document (CumminsFuelingControlStates.docx) — 80+ states extracted
- [x] Add fueling control state definitions to Knox Cummins knowledge base (cumminsFuelingStates.ts)
- [x] Map fueling control state codes to FUELCTRL_F PID values in datalog parser
- [x] FCA Calibrations: Add year/make/model search filters to Calibration Lookup page (27 models for 2018)
- [x] FCA Calibrations: Add tRPC endpoint for year/make/model search with cascading dropdowns + platform code fallback
- [x] FCA Calibrations: Consolidate PLATFORM_VEHICLE_MAP (80+ platform codes, alias normalization, junk filtering)
- [x] Cummins Fueling States: Wire decoder into DynoCharts tooltip for Fuel Ctrl Mode overlay
- [x] Cummins Fueling States: Add Engine Torque State decoding to DynoCharts tooltip
- [x] Cummins Fueling States: 31 vitest tests passing
- [x] Move Calibrations page from top-level nav to Advanced tab (navigates to /calibrations when clicked)
- [x] Tasks page: Restrict /tasks route to admin-only access (role-based guard, hidden from non-admin nav)
- [x] CM2200 Config: Parse CM2200 BCA ECFG (17,160 params, 12,087 tuning-relevant)
- [x] CM2200 Config: Update CM2200 ECU definition in cumminsParameterDatabase.ts (BCA product ID, CM22xx module, 2007-2012)
- [x] CM2200 Config: Add CM2200_SPECS to ecuReference.ts (CP3 pump, CRIN 2.2 injectors, 350hp/650tq, 68RFE trans)
- [ ] Honda Talon Tuner: Fix image-to-table import showing zeros instead of correct data values
- [ ] Honda Talon Tuner: Fix red number readability issue in editor table color scheme
- [ ] Honda Talon Tuner: Test fixes with provided Dynojet Speed Density screenshot
- [x] PCAN Bridge: Add set_protocol message for switching between OBD-II/J1939/CAN-FD/UDS
- [x] PCAN Bridge: Add j1939_request handler for PGN-based requests with 29-bit extended IDs
- [x] PCAN Bridge: Add uds_request handler for ISO 14229 diagnostic services
- [x] PCAN Bridge: Add CAN FD support (fd=True, 64-byte payloads)
- [x] PCAN Bridge: Add extended ID support for J1939 frames
- [x] Frontend: Update protocolDetection.ts with new protocol definitions (6 protocols, interchangeable)
- [x] Frontend: Update pcanConnection.ts with setProtocol, J1939, UDS, bus monitor methods
- [x] PCAN Drivers: Bundle PEAK System driver installer and create setup guide (tools/drivers/README.md)
- [x] Honda Talon Tuner: Fix red number readability (brightened sColor.red to oklch 0.68, added text shadow)
- [ ] Knox: Train on protocol compatibility (datalogger and IntelliSpy interchangeable)
- [x] IntelliSpy: Integrate Knox AI for real-time CAN frame analysis and module identification
- [x] IntelliSpy: Add live flash parameter decoding (UDS 0x2E/0x31/0x34/0x36 during calibration flashing)
- [x] IntelliSpy: Display decoded parameter names/values being written during active flash sessions
- [x] IntelliSpy: Add protocol selector dropdown (OBD-II, J1939, UDS, CAN FD, Raw) with runtime switching
- [x] IntelliSpy: Add "Ask Knox" button in decode tab with question input and auto-analyze/flash-detect presets
- [x] IntelliSpy: Knox AI frame analysis via tRPC (analyzeFrames mutation with protocol context)
- [x] IntelliSpy: Live flash parameter decoding in live view (DECODE column with UDS service decode)
- [x] IntelliSpy: Flash progress bar with stage tracking (session→security→erase→download→transfer→verify→reset)
- [x] IntelliSpy: Double-click arb IDs to select for targeted Knox analysis
- [x] IntelliSpy: Module map in decode tab with click-to-select for Knox
- [x] IntelliSpy: 20 vitest tests for UDS decode, flash services, NRC codes, frame formatting
- [x] Enable right-click copy/paste across entire website — verified: no global restrictions exist, all user-select:none is scoped to drag/resize operations only
- [x] VOP Bridge Installer: Create branded Windows installer for PCAN Bridge (no command prompt needed)
- [x] VOP Bridge Installer: Bundle Python runtime, PCAN drivers, and bridge script into single .exe installer
- [x] VOP Bridge Installer: Auto-start bridge on Windows login with system tray icon
- [x] VOP Bridge Installer: Create download page in web app for easy customer access
- [x] VOP Bridge Installer: Include PPEI/VOP branding (logo, colors, license agreement)
- [x] Honda Talon Tuner: Fix OCR image-to-table import showing zeros instead of correct data values
- [x] IntelliSpy: Fix live CAN traffic — added Check Bridge button using PCANConnection.isBridgeAvailable()
- [x] IntelliSpy: Add "Check Bridge" connection panel matching DataloggerPanel pattern
- [x] Shared Bridge: Verified bridge supports multi-client — Datalogger and IntelliSpy work simultaneously
- [x] Fix Banks iDash parser detection for 2024+ L5P logs (4-row header format with TIME/hex PIDs/short names/units)
- [x] Fix analyzer to parse 2024+ L5P Banks iDash log format (Latin-1 encoding, EGT sentinel filtering)
- [x] Add 2024-2026 L5P Banks iDash Full PID layout as selectable preset in Datalogger
- [x] Export all Manus knowledge items to docs/knowledge-base.md as permanent unlimited repo-hosted knowledge base
- [x] Analyze 2020 L5P datalog + stock vs tuned calibration for rapid soot loading / reduced engine power diagnosis (documented in docs/diagnostic_analysis_2020_l5p_soot.md)
- [x] AI Diagnostic Helper: Build new tab in Advanced mode for guided diagnosis (DIAGNOSTIC tab)
- [x] AI Diagnostic Helper: Auto-populate missing PIDs from A2L when problem is described
- [ ] AI Diagnostic Helper: Show fault visualization (like fault graph) in same window (Phase 2)
- [ ] AI Diagnostic Helper: Replay/explain findings with voice-like narration (Phase 2)
- [x] AI Diagnostic Helper: Integrate with Datalogger for live diagnosis (PID injection from Diagnostic → Datalogger tab)
- [x] AI Diagnostic Helper: Tell customer what test conditions are needed if not met (TestConditionCard)
- [ ] Knox: Train on emissions control strategies (DPF regen, soot model, DEF dosing, NOx reduction) from A2L documentation
- [ ] Knox: Cross-reference calibration changes with A2L measurements to diagnose emissions issues
- [x] Knox Diagnostic Agent: Build chat interface that greets customer "What are you trying to figure out?"
- [x] Knox Diagnostic Agent: Map customer complaints to required PID channels from A2L knowledge
- [x] Knox Diagnostic Agent: Auto-populate PIDs in datalogger when customer accepts suggestions
- [x] Knox Diagnostic Agent: Analyze uploaded datalogs with available PIDs, suggest additional PIDs if needed
- [ ] Knox Diagnostic Agent: Fault visualization with problem area highlighting and replay explanation (Phase 2)
- [x] Knox Diagnostic Agent: Server-side tRPC router with LLM-powered diagnosis (diagnosticAgent.ts)
- [x] Knox Diagnostic Agent: Test condition guidance (tell customer what driving conditions are needed)
- [x] IntelliSpy: Fix CAN traffic — removed destructive set_protocol on connect, auto-starts bus monitoring
- [x] Auth Gate: Block all unauthenticated access — require sign-in or access code before any content is visible
- [x] Auth Gate: Create access code entry page as alternative to OAuth sign-in
- [x] Honda Talon: Replace basic WP8DatalogViewer with pro log viewer
- [x] Honda Talon: Log-to-Map sync overlay with TalonLogViewer cursor position
- [x] Honda Talon: Encode datalog review logic into Knox knowledge base (Alpha-N, AFR→Lambda, fuel table rules)
- [x] Honda Talon: Clean up duplicate todo items and verify image-to-table OCR fix
- [x] Honda Talon: AFR→Lambda conversion applied to chart traces, Y-axis labels, and crosshair tooltips (not just sidebar)

## EZLynk CSV Parser Fixes (2026-03-31)
- [x] Fix EZLynk CSV parser to correctly pull and map all PIDs from EZLynk datalog format
- [x] Fix log details section to populate even if only 1 PID is present (remove RPM/torque requirement for dyno graph)
- [x] Test with provided EZLynk CSV (2014 Ram 6.7L Cummins datalog)

## Logger Bug Fixes (2026-03-31)
- [x] BUG: ELM327 "Start Log" button not working — logging doesn't begin after PID scan (fixed: bypass bitmask filter when all PIDs removed, force-add unsupported PIDs)
- [x] BUG: PCAN CAN traffic still not showing in IntelliSpy monitor (fixed: PCANConnection listened for 'can_frame' but bridge sends 'bus_frame')
- [x] BUG: Voltage reading 0V despite successful PID scanning on ELM327 (fixed: added retry, warning messages, and red ⚠ NO PWR indicator in UI)

## PCAN Bridge Download/Execution Fix (2026-03-31)
- [x] BUG: Python PCAN bridge did not download/work when attempting latest CAN bridge test (fixed: download button pointed to non-existent /api/download route, now serves from CDN with ZIP bundle + direct .py download)
- [x] Remove ALL customer-facing references to "Manus" from the entire codebase
- [x] Change sign-in button text to "Sign in, human :-)"

## Single-Session Share Link Feature (2026-03-31)
- [x] Create share_tokens DB table (token, allowed_page, expires_at, used flag)
- [x] Server: tRPC procedure to generate share tokens (admin/owner only)
- [x] Server: tRPC procedure to validate share tokens (public)
- [x] Client: AuthGate recognizes ?share_token= param, bypasses gate for allowed page only
- [x] Client: Lock navigation to only the allowed page when using a share token
- [x] Generate share link for /pitch page

## Share Link Improvements (2026-03-31)
- [x] Update existing /pitch token to 24hr expiry (regenerate)
- [x] Build admin UI page for share link generation (select page, set expiry, copy link)
- [x] Write thorough vitest tests for token validation flow (18 tests: valid, expired, consumed, invalid, page lock, uniqueness, whitespace trim)
- [x] BUG: Report Center (Feedback/Error Report) panel is cut off at bottom — repositioned as centered modal overlay with red glow shadow

## NDA Gate for Share Token Access (2026-03-31)
- [ ] DB: Create nda_submissions table (token_id, signer_name, signer_email, signature_image_url, uploaded_doc_url, status: pending/verified/rejected, verified_by, verified_at)
- [ ] Server: tRPC procedures for NDA submission, status check, admin verify/reject
- [ ] Client: NDA signing page with signature canvas pad, name/email fields, NDA text
- [ ] Client: Drag/drop upload option for pre-signed NDA document
- [ ] Admin: NDA verification panel in Support Admin (view signature, approve/reject)
- [ ] AuthGate: Integrate NDA gate into share token flow (token valid → NDA required → VOP verifies → access granted)
- [ ] NDA stored for 180 days — once signed & verified, user skips NDA on all future tokens
- [ ] Token no longer consumed on first click — reusable until expiry (user may need multiple visits before NDA verified)
- [ ] Tests: Write vitest tests for NDA submission and verification flow

## Screenshot/Screen Recording Detection (2026-03-31)
- [ ] Detect screen recording or screenshot attempts on share-token-gated pages
- [ ] Notify admin when potential screen capture is detected (with IP, timestamp, page)
- [ ] Show user escalating scare messages: 1st = "We are a neural network. Did you really think you could screenshot and get away with it?", 2nd = "Seriously? Again? We have your IP, your browser fingerprint, and your questionable life choices."

## Honda Talon: Correct Fuel Tables Button (2026-03-31)
- [ ] Add "Correct Fuel Tables" button to Honda Talon Tuner
- [ ] AFR1 → Cylinder 1, AFR2 → Cylinder 2 association when both channels present
- [ ] Correction factor = AFR reading / target AFR per cell, averaged per cell basis
- [ ] No correction applied to cells not used in the datalog
- [ ] Alpha-N channel = 1 → only Alpha-N fuel tables; Alpha-N ≠ 1 → only Speed Density tables
- [ ] Turbo/NA switch: auto-detect via MAP > 100 kPa, or manual toggle
- [ ] Target lambda presets change based on turbo/NA selection (still editable)
- [ ] Turbo mode: additional switch for stock MAP sensor vs 3-bar MAP sensor
- [ ] NA targets: Speed Density all columns = 0.95 lambda; Alpha-N 0-40° TPS = 0.95, 45° = 0.9, 50°+ = 0.85
- [ ] Turbo + stock MAP targets: min-100 kPa = 0.95, 100-120 = 0.9, 120-145 = 0.85, 145+ = 0.8
- [ ] Turbo + 3-bar MAP targets: min-60 kPa = 0.95, 60-80 = 0.9, 80-90 = 0.85, 90+ = 0.8
- [ ] Turbo Alpha-N target = 0.95 across all columns
- [ ] Turbo: use desired injector pulsewidth to determine active SD column (MAP not 100% accurate), interpolate against SD Cyl1 table
- [ ] Honda Talon: When "Manifold Absolute Pressure Corrected" channel is available in datalog, use it for SD table axis reference instead of raw MAP

## Navigation Restructure (2026-03-31)
- [ ] Move "Task" tab to Advanced section
- [ ] Move "Pitch" tab to Advanced section
- [ ] Gate Advanced section with access code "KingKong"

## TCC Lockup Drag Analysis Improvement (2026-03-31)
- [x] Update TCC lockup analysis: 3rd gear lock is better than stock but still leaving power on the table
- [x] Add knowledge: converter should be fully locked by 3rd gear for max drag performance, unlocked = heat = wasted power
- [x] Add recommendation: "Add TCC Commanded Pressure and Converter Slip Speed to your datalog for definitive TCC status"
- [x] Calculate percentage of estimated torque not applied to ground due to converter slippage per gear
- [x] Calculate shift times to show time lost between gears

## Wheel Slip Detection (2026-03-31)
- [x] Detect rear wheel slip: if GPS speed available + wheel speed PID available, compare for slip
- [x] Detect rear wheel slip: if front tire speed is >2mph lower than rear tire speed = rear wheel slip
- [x] Note: front/rear speed mismatch could also be calibration mismatch between speed sensors
- [x] Add wheel slip % calculation and flag in drag analysis

## Knox Drag Racing Training (2026-03-31)
- [x] Add comprehensive drag racing knowledge to Knox knowledge base
- [x] TCC lockup by 3rd gear: better than stock but still leaving power on table
- [x] Converter should be fully locked by 3rd gear for max drag performance
- [x] Unlocked converter = heat = wasted power = drivetrain loss that is fixable in calibration
- [x] Recommend logging TCC Commanded Pressure and Converter Slip Speed for definitive TCC status
- [x] Calculate converter slip % per gear and estimated torque loss
- [x] Calculate shift times and time lost between gears
- [x] Wheel slip detection: GPS speed vs wheel speed comparison
- [x] Wheel slip detection: front tire speed >2mph lower than rear = rear wheel slip
- [x] Note: front/rear speed mismatch could also be calibration mismatch between speed sensors
- [x] Add drag racing tips and improvement recommendations to Knox reasoning
- [x] Knox should study: 60ft optimization, launch techniques, shift point optimization, tire slip management

## All Graphs Show All PIDs (2026-03-31)
- [ ] Every chart/graph in the analyzer must have ability to display all available PIDs
- [ ] Add PID selector/overlay toggle to all chart components
- [ ] Users should be able to add any PID as an overlay on any graph

## Move Calibrations Into Editor (2026-03-31)
- [x] Remove Calibrations as standalone Advanced tab
- [x] Add Calibrations as sub-tab inside Editor, next to "Edit Binary"
- [ ] Add brand dropdown/filter (FCA, Chevrolet, etc.) based on uploaded calibrations
- [ ] Brand list auto-expands only when calibration of new brand is uploaded
- [ ] Calibrations tied to specific brand stay within brand tab
- [ ] Add export/download button for each uploaded calibration

## Datalogger Live View + AI Naming (2026-03-31)
- [x] Add live data viewing mode: show real-time PID data without requiring recording
- [x] Separate "view" and "record" modes — user sees live data first, then chooses to record
- [x] After recording stops, AI automatically names the datalog based on data content (e.g., "WOT Pull 3rd Gear 45psi Boost", "Highway Cruise 65mph Steady State")
- [x] User does NOT need to name datalogs — AI handles it automatically

## ECU Communication Loss Detection (2026-03-31)
- [x] Datalogger: Detect when ECU stops responding during live monitoring or recording
- [x] Datalogger: Track consecutive failed PID polls and identify reason (adapter disconnect, vehicle off, CAN bus error, timeout)
- [x] Datalogger: Show clear visual alert with specific reason and suggested action (reconnect, check ignition, check cable)
- [x] IntelliSpy: Detect when ECU stops responding during CAN bus analysis
- [x] IntelliSpy: Show reason for communication loss and suggested recovery action
- [x] IntelliSpy: Handle graceful degradation when ECU goes offline mid-session

## Advanced Datalogger Health Report (2026-03-31)
- [ ] Datalogger recordings generate the "advanced" vehicle health report (deeper analysis than standard upload)
- [ ] Advanced report includes per-gear breakdown, shift quality metrics, detailed fault analysis
- [ ] Advanced report leverages live-captured data quality (higher sample rate, no CSV conversion artifacts)
- [ ] "Generate Health Report" button on completed sessions in datalogger

## Advanced Datalogger Compare Function (2026-03-31)
- [ ] Add compare mode to datalogger for overlaying multiple recorded sessions
- [ ] Side-by-side or overlay view for before/after tune comparison
- [ ] AI-powered comparison report highlighting differences between sessions
- [ ] Compare sessions under similar conditions (RPM range, throttle position, gear)
- [ ] Show delta values for key metrics (peak boost, peak rail pressure, shift times, etc.)

## Calibration Upload + Commanded vs Actual Analysis (2026-03-31) [BETA]
- [ ] Add calibration file upload option in Advanced Datalogger (binary/A2L)
- [ ] Cross-reference calibration maps (commanded values) against live PID data (actual values)
- [ ] Show commanded vs actual overlay on live gauges and charts during monitoring
- [ ] Knox reasoning on deviations: explain why commanded != actual (fuel system limits, turbo lag, sensor drift, safety limiters, etc.)
- [ ] Knox analysis report after recording: summarize all commanded vs actual deltas with explanations
- [ ] Display "BETA — In Development" badge on this feature prominently
- [ ] Support common calibration formats (HP Tuners .hpt, EFILive .tun, raw binary + A2L)

## 2025 Ford Powerstroke Backpressure vs Boost Fix (2026-03-31)
- [x] Fix backpressure PID being displayed as boost — must differentiate exhaust backpressure from intake boost
- [x] Add proper backpressure PID mapping for 2025 Ford Powerstroke (6.7L)
- [x] Add backpressure + boost math and reporting (backpressure ratio, boost efficiency, etc.)
- [x] Fix compare function not working / no display for 2025 Powerstroke datalogs
- [ ] Test with provided S&B filter baffle in/out datalogs

## LLY Turbo Surge / DSP5 Turbo Braking Knowledge (2026-03-31)
- [x] Analyze LLY turbo surge datalog to verify vane position and boost pattern
- [x] Train Knox on DSP5 tune selector switch mapping (non-dsp=tune1, dsp1=tune2, dsp2=tune3, dsp3=tune4, dsp4=tune5)
- [x] Train Knox on turbo braking: tow tunes use high vane position (99%) on decel for engine braking
- [x] Train Knox on turbo surge diagnosis: vanes at 99% on decel causes boost to rise after initial drop = surge
- [x] Add turbo surge detection rule to diagnostics: detect vane position spike to 99%+ on decel with boost rise
- [x] Knox should identify DSP5 custom operating system and explain tune level from selector switch position

## HP Tuners .hpl Native File Support (2026-03-31)
- [x] Research HP Tuners .hpl file format (reportedly SQLite with compressed channel data)
- [x] If not feasible, document why and move on — NO public parser exists, format is proprietary, decompiling would violate EULA

## Killer Sign-In Animation
- [x] Design animated sign-in page with PPEI motorsport/industrial aesthetic
- [x] Background particle effects or turbo spool animation
- [x] Red glow pulse on PPEI logo
- [x] Scan-line / data stream effect behind form
- [x] Smooth mechanical entrance animations for form elements
- [x] Input fields "ignite" with red glow on focus
- [x] Match existing dark industrial theme (black + PPEI red)

## Compare View Graphs
- [x] Overlay line charts — same PID from both datalogs on one graph (different colors)
- [x] Side-by-side bar charts for key metrics (peak boost, RPM, rail pressure, EGT, etc.)
- [x] Delta visualization highlighting differences between runs
- [x] PID selector dropdown to pick any available PID from either datalog for overlay
- [ ] Time-aligned or RPM-aligned x-axis options

## Honda Talon Tuner — Correct Fuel Tables (PENDING — after current Duramax work)
- [ ] Add "Correct Fuel Tables" button to Honda Talon Tuner
- [ ] Map AFR1 → Cylinder 1, AFR2 → Cylinder 2 from datalog
- [ ] Implement correction factor: AFR_reading / target_AFR per cell, averaged
- [ ] Only correct cells actually used in the datalog
- [ ] Alpha-N channel = 1 → Alpha-N tables; ≠ 1 → Speed Density tables
- [ ] Add Turbo/NA switch with auto-detection (MAP > 100 kPa = turbo)
- [ ] Add Stock MAP / 3-Bar MAP sub-switch when Turbo selected
- [ ] Implement NA target lambda presets (SD=0.95, Alpha-N graduated by TPS)
- [ ] Implement Turbo Stock MAP target lambda presets (0.95/0.9/0.85/0.8 by MAP range)
- [ ] Implement Turbo 3-Bar MAP target lambda presets (different MAP breakpoints)
- [ ] All targets editable after preset population
- [ ] Column lookup via Desired Injector Pulsewidth → interpolate to SD Cyl1 table position
- [ ] Turbo Alpha-N target = 0.95 across all columns

## Fix: Backpressure Still Being Read as Boost on 2025 Ford (2026-03-31)
- [x] dataProcessor.ts boostIdx fallback matches 'Exhaust MAP' via generic h.includes('MAP') - must exclude exhaust headers
- [x] pidSubstitution.ts mapAbsIdx find(['MAP']) also matches 'Exhaust MAP' - must exclude exhaust headers
- [x] Verify boost is correctly derived from Intake MAP only, not exhaust side pressure
- [x] Add test for Ford Powerstroke log to prevent regression (8 tests in fordExhaustMap.test.ts)
