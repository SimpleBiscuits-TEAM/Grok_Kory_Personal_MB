# PPEI Duramax Performance Analyzer — System Architecture

## AI-Powered Vehicle Diagnostics Platform

---

## System Overview

The PPEI Duramax Performance Analyzer is a browser-based, AI-powered vehicle diagnostics platform that connects directly to vehicles through OBD-II adapters and professional CAN bus hardware. Unlike traditional code readers that simply display fault codes, this system provides deep analysis, real-time monitoring, AI-assisted diagnostics, and active vehicle programming capabilities.

The platform operates across seven interconnected layers, each feeding data and intelligence into the next. The result is a system where every module makes every other module smarter.

---

## Layer 1 — User / Vehicle Interface

The system accepts input from three sources, covering both real-time and offline analysis workflows.

| Input Source | Connection Method | Use Case |
|---|---|---|
| **OBD-II Port** | ELM327 (WebSerial) or PEAK PCAN-USB (WebSocket) | Real-time live data, DTC reading, vehicle coding |
| **CSV Log Files** | File upload (HP Tuners, EFILive, datalogger format) | Offline analysis of previously recorded data |
| **PEAK PCAN-USB** | Python WebSocket bridge (pcan_bridge.py) | UDS diagnostics, CAN bus sniffing, VIN programming |

The ELM327 adapter handles standard OBD-II communication for everyday diagnostics. The PEAK PCAN-USB device enables professional-grade operations including raw CAN bus access, UDS protocol services, and hardware-level vehicle programming.

---

## Layer 2 — Hardware Bridge

Two bridge implementations translate hardware signals into browser-consumable data streams.

**ELM327 Bridge** uses the WebSerial API to communicate directly with ELM327-compatible adapters from the browser. It handles AT command initialization, automatic baud rate detection (38400/115200/500000), protocol negotiation, and PID availability scanning via Mode 01 bitmask queries.

**PCAN Bridge** is a Python WebSocket server (pcan_bridge.py) that wraps the python-can library. It provides three protocol modes:

- **OBD-II Protocol** — Standard Mode 01-0A requests with ISO-TP framing
- **UDS Protocol** — Full ISO 14229 services including DiagnosticSessionControl, SecurityAccess, ReadDataByIdentifier, WriteDataByIdentifier, RoutineControl, and IOControlByIdentifier
- **Raw CAN** — Bus monitor mode for IntelliSpy, broadcasting all CAN frames to the browser in real-time

---

## Layer 3 — Transport Layer

Two TypeScript transport modules abstract the hardware bridges into clean APIs.

**OBD Connection** (obdConnection.ts) manages the standard OBD-II workflow: adapter detection, protocol initialization, PID support scanning, multi-PID batch requests with adaptive sizing, VIN auto-detection, and DTC read/clear operations. It emits events for connection state, live data, vehicle info, and errors.

**UDS Transport** (udsTransport.ts) manages the UDS diagnostic workflow: session control (default/extended/programming), security access with seed/key computation, DID read/write, routine control start/stop/results, IO control with return-to-ECM safety, and ECU reset. It handles ISO-TP multi-frame assembly and negative response code interpretation.

---

## Layer 4 — Data Layer

The data layer contains six interconnected databases that power every tool and analysis module.

### PID Database (366 PIDs)

| Category | Count | Coverage |
|---|---|---|
| Standard OBD-II (Mode 01/02) | ~96 | All vehicles 1996+ |
| GM Extended (Mode 22) | 48 | Duramax L5P/LML/LBZ, Gen 2 E42 |
| Ford Extended (Mode 22) | 32 | 6.2L Boss, 6.7L Power Stroke, EcoBoost |
| BMW UDS | 28 | S68 V8, ZF 8HP, xDrive, iDrive |
| CAN-am / BRP | 28 | Maverick X3, Outlander, Commander, Defender |
| Sea-Doo / BRP Marine | 22 | RXP-X, GTX, Fish Pro (Rotax 4-TEC) |
| Polaris | 26 | RZR Pro XP, Ranger, Sportsman, General |
| Kawasaki | 18 | KRX 1000, Teryx, Mule Pro |
| Toyota / Honda / Chrysler | ~68 | Universal coverage |

### UDS Reference Library

Contains 50+ Data Identifier definitions, 15+ routine control procedures, IO control definitions for actuator testing, and complete NRC (Negative Response Code) decode tables. Includes manufacturer-specific security access procedures with seed/key algorithms for GM (CMAC-based), Ford (LFSR), Cummins (byte-swap + rotate + XOR), CAN-am (lookup table matrix), Polaris (polynomial), and BRP dashboard modules.

### Module Database

Maps 80 ECU module addresses across Ford (48 modules), RAM (21 modules), and GM (11 modules) with CAN arbitration IDs, response addresses, human-readable names, and acronyms. Used by the Module Scanner for full bus discovery and by IntelliSpy for automatic frame identification.

### VIN Decoder

Decodes Vehicle Identification Numbers using WMI (World Manufacturer Identifier) codes for 50+ manufacturers including powersports (CAN-am, Polaris, Kawasaki, Sea-Doo). Extracts make, model, year, engine type, fuel type, and platform for automatic PID selection and diagnostic filtering.

### DTC Database

Comprehensive database of P (Powertrain), C (Chassis), B (Body), and U (Network) diagnostic trouble codes with descriptions, severity levels, and categorization. Supports Mode 03 (stored), Mode 07 (pending), and Mode 0A (permanent) DTC retrieval.

---

## Layer 5 — Active Tool Modules

Seven tool modules provide hands-on vehicle interaction capabilities.

### Live Datalogger
Real-time data acquisition with Canvas-based charting, zoom/pan, custom presets, CSV export with VIN metadata, and automatic PID availability filtering. Supports simultaneous monitoring of up to 20 PIDs at configurable sample rates.

### IntelliSpy — AI CAN Bus Sniffer
Real-time CAN frame capture with automatic module identification, byte-level change highlighting, three view modes (Live trace, Statistics, AI Decode), arbitration ID filtering, frame rate analysis, and CSV export. The AI decode mode cross-references captured frames against the module database and UDS reference to identify what each frame means.

### Vehicle Coding
Ford and RAM fuel tank size and tire size correction through as-built data manipulation. Reads IPC configuration blocks, decodes bit-level fields (fuel capacity, dual sender, flex fuel, transmission type, TPMS, eco cruise), and writes modified values back. Includes speedometer correction calculator showing exact percentage error for any tire size change.

### CAN-am VIN Changer
Step-by-step wizard for CAN-am VIN programming using the PEAK device. Walks through ECU identification, current VIN read, security access (with automatic seed/key computation), VIN write, ECU reset, and DESS key re-learn guidance. Supports both MED17.8.5 (pre-2020) and MG1CA920 (2020+) ECU variants.

### Service Procedures
Seven guided service procedures: DPF Forced Regeneration, Injector Coding (IQA/IMA), TPMS Sensor Relearn, Transmission Adaptive Reset, Oil Life Reset, Throttle Body Alignment, and Steering Angle Calibration. Each procedure includes prerequisites, safety warnings, step-by-step UDS commands, and progress tracking.

### DTC Reader
Full diagnostic trouble code management: read stored (Mode 03), pending (Mode 07), and permanent (Mode 0A) codes. Display severity, description, and category. Clear codes (Mode 04) with safety confirmation.

### Module Scanner
Full CAN bus scan (0x700-0x7FF) to discover all responding ECU modules. Reads identification DIDs (part number, software version, hardware version, calibration ID, VIN) from each discovered module. Builds a complete vehicle module map.

---

## Layer 6 — AI Analysis Engine

Five analysis modules process data from the tools and produce actionable intelligence.

**CSV Parser** handles three log formats (HP Tuners, EFILive, native datalogger) with automatic format detection, unit conversion (metric to imperial), PID name aliasing, and vehicle metadata extraction from headers.

**Diagnostics Engine** runs pattern-based fault detection across 20+ conditions including rail pressure deviation, boost pressure faults, EGT anomalies, MAF correlation, TCC slip analysis, VGT position faults, and coolant temperature trends. Includes transient exclusion, gear shift filtering, and minimum sustained duration requirements to eliminate false positives.

**Reasoning Engine** applies AI-powered contextual analysis to diagnostic findings, explaining not just what the fault is but why it matters, what likely caused it, and what to do about it. Cross-references vehicle-specific knowledge (Gen 1 vs Gen 2 Duramax, Allison vs 10L1000 transmission) for targeted recommendations.

**Health Report** generates a scored assessment of overall vehicle health with section-by-section grades (engine, fuel system, turbo, transmission, emissions, cooling). Produces exportable PDF reports with charts, condition cards, and maintenance recommendations.

**Drag Analyzer** extracts quarter-mile performance data from datalogs, calculating 0-60, 60-foot, 1/8-mile, and 1/4-mile times with trap speeds. Generates visual timeslip cards.

---

## Layer 7 — Erika AI Assistant

Erika is the AI brain that ties every layer together. She has access to:

- The complete PID database (366 PIDs across 8 manufacturer platforms)
- The UDS reference library (DIDs, security procedures, routine controls, IO controls)
- The module database (80 ECU addresses across Ford/RAM/GM)
- CAN bus tool expertise (Vehicle Spy, SavvyCAN, CANape, CANoe, PCAN-View, BusMaster)
- AlphaOBD and FORScan feature knowledge (proxy alignment, as-built data, output control)
- Vehicle coding procedures (Ford fuel tank/tire size bit-level encoding, RAM BCM configuration)
- Powersports platform knowledge (CAN-am ECU types, MG1CA920 lockdown timeline, Polaris dual-CAN, Kawasaki KDS)
- Service procedure knowledge (DPF regen, injector coding, TPMS relearn, transmission adaptive reset)
- Complete NRC code reference with common causes and solutions

Erika doesn't just answer questions — she receives context from the active diagnostic session, sees the fault analysis results, and provides targeted guidance based on the specific vehicle, the specific data, and the specific conditions detected.

---

## How the Modules Feed Each Other

The power of this system is in the interconnections. Here is how data flows between modules:

```
Vehicle → Hardware Bridge → Transport → PID Database → Datalogger → CSV Parser
                                                                        ↓
                                                              Diagnostics Engine
                                                                        ↓
                                                              Reasoning Engine
                                                                        ↓
                                                               Health Report → PDF
                                                                        ↓
                                                                   Erika ← Knowledge Base
                                                                        ↓
                                                                  Chat Response

Vehicle → PCAN Bridge → UDS Transport → Module Scanner → Module Database
                                    ↓                            ↓
                              Security Access              IntelliSpy (frame ID)
                                    ↓                            ↓
                              Vehicle Coding              Erika (frame decode)
                              CAN-am VIN
                              Service Procedures

VIN Decoder → Auto-selects PIDs → Filters diagnostics → Targets Erika's advice
```

Every module enriches every other module. The VIN decoder tells the datalogger which PIDs to use. The datalogger feeds the diagnostics engine. The diagnostics engine feeds the reasoning engine. The reasoning engine feeds Erika. Erika uses the UDS reference to explain what the Module Scanner found. IntelliSpy uses the module database to identify frames. The vehicle coding panel uses the UDS transport to read and write configuration. It's a closed loop of intelligence.

---

*PPEI Custom Tuning — Duramax Performance Analyzer*
*Built with AI. Built for the shop floor.*
