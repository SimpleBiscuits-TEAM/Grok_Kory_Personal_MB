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
