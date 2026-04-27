# Knox Knowledge Base: Polaris Pro R — Bosch MG1C400A (MDG1) ECU

## Vehicle Overview

The Polaris Pro R is a high-performance UTV (side-by-side) powered by a ProStar engine managed by a Bosch MG1C400A ECU on the MDG1 (Modular Diesel/Gasoline) platform. This is the same Bosch MG1 family used in many European automotive applications (VW/Audi EA888, BMW B48, etc.), adapted for Polaris powersports use.

## ECU Identification

| Field | Value |
|-------|-------|
| ECU Platform | Bosch MG1C400A (MDG1) |
| A2L Project | MG1C400A |
| A2L Version | 425_MG1C400A1T2_00 |
| S-Record File | MG1C4E0A1T2.s |
| Processor | Infineon TriCore (big-endian) |
| CAN Baudrate | 500,000 bps |
| OBD RX Address | 0x7E0 |
| OBD TX Address | 0x7E8 |
| XCP Master CAN ID | 0x7F0 |
| XCP Slave CAN ID | 0x7F1 |

## Memory Layout

| Region | Address Range | Size | Purpose |
|--------|--------------|------|---------|
| Program (Code) | 0x08FC0000 - 0x0937FFFF | 3,840 KB | Firmware / executable code |
| Calibration Data | 0x09380000 - 0x095BFFFF | 2,304 KB | Tunable maps, curves, values |
| Header | 0x08FC0000 - 0x08FC003F | 64 B | File header with DEADBEEF marker at 0x08FC0020 |
| Total Binary | 0x08FC0000 - 0x095C0000 | 6,144 KB (6 MB) | Complete flash image |

The S-record file uses Motorola S3 format with 16 data bytes per record (393,216 records total). All multi-byte values are stored big-endian (TriCore convention).

## Calibration Statistics

| Type | Count | Description |
|------|-------|-------------|
| VALUE | 10,676 | Single scalar calibration values |
| VAL_BLK | 1,166 | Block/array calibration values |
| CURVE | 604 | 1D lookup tables (x→y) |
| MAP | 428 | 2D lookup tables (x,y→z) |
| ASCII | 9 | Text string calibrations |
| **Total CHARACTERISTIC** | **12,883** | All calibration parameters |
| **Total MEASUREMENT** | **12,718** | Live runtime variables |

## Calibration Groups (Work Packages)

The A2L organizes calibrations into these functional work packages:

| Group | Description |
|-------|-------------|
| _WP__Base_Cal | Base calibration parameters |
| _WP__Base_SW | Base software configuration |
| _WP__Driveability / _2 | Throttle response, pedal maps, torque delivery |
| _WP__EPM | Engine Position Management (crank/cam timing) |
| _WP__Exhaust | Exhaust gas management, EGT, component protection |
| _WP__Knock | Knock detection and control |
| _WP__Misfire | Misfire detection |
| _WP__O2_Sensor | Oxygen sensor / lambda control |
| _WP__Catalyst | Catalyst monitoring and warmup |
| _WP__Start | Cold start, cranking enrichment |
| _WP__Temp_Models | Temperature modeling |
| _WP__Fan_Control | Cooling fan control |
| _WP__Cruise_Control | Cruise control |
| _WP__HVAC | HVAC integration |
| _WP__Comp_Protect | Component protection (EGT limits, torque limits) |
| _WP__Diagnostic | OBD diagnostics, DTC management |
| _WP__Monitoring | Function monitoring (safety) |
| _WP__Can_Comm | CAN communication configuration |
| _WP__MESCtl | Maximum Engine Speed Control |
| _WP__Vehicle | Vehicle-level parameters |
| _WP__Output_State_Control | Output state control |
| _WP__Purge_Control | EVAP purge control |
| _WP__DINH | Diagnostic Inhibit conditions |
| _WP__Release | Release/production parameters |
| _WP__Bench_Cal | Bench calibration |

## Key Tuning Maps (2D MAP Type)

### Ignition / Spark Timing

| Map Name | Description | Address |
|----------|-------------|---------|
| **KFZW** | Base ignition advance angle map (primary timing map) | 0x939BF3C |
| **KFZWOP** | Optimized model reference ignition angle | 0x939C2DE |
| **KFZWMN** | Minimum ignition angle (burning limit) | 0x939C1F2 |
| KFZWMNBTS | Latest allowed ignition timing for component protection | 0x939C080 |
| KFZWMNKHLL | Minimum ignition angle for catalyst warmup at idle | 0x939C2B2 |
| KFDZWKG | Ignition angle correction due to knock limit shift | 0x939BEB0 |
| EngStrt_diaAdvEngWrmUp_M | Delta ignition advance during engine warmup | 0x939D02A |
| EngStrt_diaAdvWrmUp_M | Delta ignition advance in warmup phase | 0x939D0BA |
| ExhMgT_IaCorrnCptProtn_M | Ignition angle correction for component protection | 0x938E4E2 |
| MoFAirFl_iaOptm_M | Optimal ignition angle (function monitoring) | 0x939D981 |

### Fuel / Lambda Control

| Map Name | Description | Address |
|----------|-------------|---------|
| **ExhMgT_ratLamCptProtn_GM** | Lambda vs engine speed and air charge (component protection) | 0x938EA5E |
| **ExhMgT_ratLamRichCptProtn_M** | Rich lambda enrichment map (air charge × RPM) | 0x938EC3E |
| ExhMgT_LamCptProtn_M | Lower rich limit near temperature threshold for fuel cutoff | 0x938BDF0 |
| ExhMgT_ratLamCatHeatgIdleMod_M | Lambda at catalyst heating during idle | 0x93922B6 |
| ExhMgT_ratLamCatHeatgStrt_M | Lambda at catalyst heating during afterstart | 0x939235A |
| ExhMod_facTExhVlvCorrnLamB1_M | Lambda correction for exhaust temp at valve bank 1 | 0x938FB50 |
| ExhMod_facTExhVlvCorrnLamB2_M | Lambda correction for exhaust temp at valve bank 2 | 0x938FC08 |
| EngStrt_facAftStrtEnchmt_T | Afterstart enrichment factor cylinder 1 | 0x938CD80 |
| EngStrt_facAftStrtEnchmtSecCyl_T | Afterstart enrichment factor cylinder 2 | 0x938CB3C |

### Torque / Pedal Maps (Drive Modes)

The Polaris Pro R has **4 drive modes** with **5 transmission ranges** each (Default, High, Low, Reverse, Still), totaling 20 torque request maps:

| Map Name | Description | Address |
|----------|-------------|---------|
| **AccPed_tqDes_DrvMod1_TraRngDft_MAP** | Desired torque Mode 1, Default range | 0x9386398 |
| AccPed_tqDes_DrvMod1_TraRngHi_MAP | Desired torque Mode 1, High range | 0x93865DC |
| AccPed_tqDes_DrvMod1_TraRngLo_MAP | Desired torque Mode 1, Low range | 0x9386820 |
| AccPed_tqDes_DrvMod1_TraRngRev_MAP | Desired torque Mode 1, Reverse | 0x9386A64 |
| AccPed_tqDes_DrvMod1_TraRngStill_MAP | Desired torque Mode 1, Still | 0x9386CA8 |
| **AccPed_tqDes_DrvMod2_TraRngDft_MAP** | Desired torque Mode 2, Default range | 0x9386EEC |
| **AccPed_tqDes_DrvMod3_TraRngDft_MAP** | Desired torque Mode 3, Default range | 0x9387A40 |
| **AccPed_tqDes_DrvMod4_TraRngDft_MAP** | Desired torque Mode 4, Default range | 0x9388594 |

The torque maps are indexed by Engine Speed (RPM) on the X axis and Accelerator Pedal Position (%) on the Y axis. All 4 drive mode default maps currently contain identical data (16×16 grid, RPM range 2000-16000, same torque values), suggesting the drive modes may not yet be differentiated in this calibration.

### Knock Control

| Map Name | Description | Address |
|----------|-------------|---------|
| IKCtl_FacKnockDetThdPhy1_GM | Knock detection threshold factor, cylinder 1 | 0x9391CC8 |
| IKCtl_FacKnockDetThdPhy2_GM | Knock detection threshold factor, cylinder 2 | 0x9391CFC |
| IKCtl_FacKnockDetThdPhy3_GM | Knock detection threshold factor, cylinder 3 | 0x9391D30 |
| IKCtl_FacKnockDetThdPhy4_GM | Knock detection threshold factor, cylinder 4 | 0x9391D64 |
| **IKCtl_facKnkRtdt_M** | Knock retard step size map | 0x9391FFC |
| IKCtl_facTiKnkExRtd_M | Time for ignition advancing after knock | 0x93920A2 |
| IKCtl_facTiKnkPrem_M | Time for ignition advancing (knock premature) | 0x93920FA |
| KFKRINTPHY1G | Knock control integration weighting, channel 1 | 0x9391D9C |
| KFKRINTPHY2G | Knock control integration weighting, channel 2 | 0x9391DD3 |
| KFKRINTPHY3G | Knock control integration weighting, channel 3 | 0x9391E0A |

### Airflow / Charge / Filling

| Map Name | Description | Address |
|----------|-------------|---------|
| **Chrset_ratMaxChrgCylFillgRng_MAP** | Maximum cylinder filling at WOT by gear range | 0x938B61A |
| Chrset_ChrgLimnKnkSnsrRng_MAP | Charge limitation in case of knock sensor error | 0x938B4DA |
| AirMod_facAsymcPredAirChrg_M | Asymmetric load distribution factor | 0x938A5A2 |

### Component Protection

| Map Name | Description | Address |
|----------|-------------|---------|
| **ExhMgT_tqLimnCptProtn_M** | Torque limitation for component protection | 0x938F230 |
| ExhMgT_IaCorrnCptProtn_M | Ignition correction for component protection | 0x938E4E2 |
| ExhMgT_facDeltaLamIntkAirTCptProtn_GM | Delta lambda correction for intake air temp | 0x938E68C |
| OVH_tqLimOvrheatProtn_MAP | Overheat protection torque limit | 0x9399CD0 |

### Rev / Speed Limits

| Map Name | Description | Address |
|----------|-------------|---------|
| **DNMAXH** | Engine speed limit leading to fuel cutoff in all cylinders | 0x939B1E0 |
| TCD_nMaxGearOilTRnge_T | Max engine speed based on temperature and gear range | 0x939B316 |
| TCD_nMaxVehSpdGearRngeBasd_M | Max engine speed when zero vehicle speed error is active | 0x939B45E |
| MESCtrlr_tqBascHiEngSpdLimnMaxLead_MAP | Torque map for max engine speed controller | 0x9394706 |
| MESCtrlr_tqBascIdleSpdLimnMaxLead_MAP | Torque map for idle speed controller | 0x93948EE |

### Anti-Jerk / Driveability

| Map Name | Description | Address |
|----------|-------------|---------|
| ASDdc_KdDynMod1_GMAP | Dynamic anti-jerk amplification, Mode 1 | 0x9385D44 |
| ASDdc_trqThresDynMod1Neg_GMAP | Anti-jerk threshold negative, Mode 1 | 0x9385DCA |
| ASDdc_trqThresDynMod1Pos_GMAP | Anti-jerk threshold positive, Mode 1 | 0x9385E3A |
| AccPed_facDesDynRnge_MAP | Desired dynamic behaviour map | 0x9385C5E |

## Key Live Measurements (for Datalogging)

### Engine Performance

| Category | Count | Key Signals |
|----------|-------|-------------|
| Engine Speed/RPM | 37 | EpmSyn_CaSData, EpmCrS signals |
| Throttle/Pedal | 153 | AccPed_ApprLimd, AccPed_rTrq, AccPed_tqDeltaDes |
| Fuel/Injection | 179 | InjSys signals, lambda values |
| Ignition/Spark | 72 | B_zwappl (applied timing), advance signals |
| Knock | 102 | KnDet signals, per-cylinder knock detection |
| Boost/Intake | 2 | Com_EngineTurbo1BoostPressure, Com_EngineTurbo1BoostPressureAppl |
| Airflow/Load | 268 | MoFAirFl signals, filling calculations |
| Torque | 8 | Com_TorqSpdCntrl0-4 |

### Vehicle / Diagnostics

| Category | Count | Key Signals |
|----------|-------|-------------|
| Exhaust/Emissions | 1,692 | HEGO signals (1,044), ExhMod (215), HEGOD (289) |
| Temperature | 56 | Coolant, oil, intake air temps |
| Vehicle Speed | 30 | Com_VehSpdHw, speed signals |
| Misfire | 590 | MisfDet per-cylinder detection |
| Diagnostic/DTC | 663 | DFC fault codes, DDRC states |

## Communication Protocol Notes

The MG1C400A uses standard Bosch UDS/KWP2000 over CAN:

- **OBD-II**: Standard addressing (0x7E0/0x7E8), 500 kbps CAN
- **XCP (Calibration Protocol)**: Master 0x7F0, Slave 0x7F1 — used for real-time measurement and calibration via tools like INCA/CANape
- **J1939**: The ECU also speaks J1939 (heavy-duty CAN protocol) for communication with the Polaris vehicle network, including transmission control messages (ETC2, CCVS, TSC, etc.)

## Bosch MG1 Naming Conventions

Understanding the Bosch naming helps navigate the 12,883 calibration parameters:

| Prefix | Meaning |
|--------|---------|
| KF | Kennfeld (characteristic map / 2D table) |
| KL | Kennlinie (characteristic curve / 1D table) |
| ZW | Zündwinkel (ignition angle) |
| MN | Minimum |
| MX | Maximum |
| AccPed | Accelerator Pedal |
| AirMod | Air Model |
| Chrset | Charge Set (filling/load) |
| CoEng | Coordination Engine |
| CEngDsT | Coolant Engine Desired Temperature |
| EngStrt | Engine Start |
| Epm | Engine Position Management |
| ExhMgT | Exhaust Management Temperature |
| ExhMod | Exhaust Model |
| HEGO | Heated Exhaust Gas Oxygen (sensor) |
| IKCtl | Individual Knock Control |
| InjSys | Injection System |
| KnDet | Knock Detection |
| MESCtrlr | Maximum Engine Speed Controller |
| MisfDet | Misfire Detection |
| MoF | Monitoring Function |
| MoFAirFl | Monitoring Function Air Flow |
| OVH | Overheat |
| TCD | Torque Coordination Drive |
| ThrVlv | Throttle Valve |
| TWCC | Three Way Catalyst Control |

## Tuning Considerations for Polaris Pro R

1. **Drive Modes**: 4 modes × 5 transmission ranges = 20 torque request maps. Currently all default maps appear identical — differentiating these is the primary way to create distinct drive mode personalities (e.g., Sport mode with more aggressive pedal response).

2. **Ignition Timing**: KFZW is the primary timing map. KFZWOP provides the optimized reference. The gap between KFZW and KFZWMN (minimum) defines the knock control authority range.

3. **Component Protection**: The ECU has extensive EGT-based component protection (ExhMgT_tqLimnCptProtn_M, ExhMgT_LamCptProtn_M) that limits torque and enriches fuel when exhaust temps get too high. This is critical for the turbo Pro R engine.

4. **Rev Limiter**: DNMAXH controls the hard rev limit via fuel cutoff. TCD_nMaxGearOilTRnge_T provides temperature and gear-dependent rev limits.

5. **Knock Control**: Per-cylinder knock detection with individual threshold maps (IKCtl_FacKnockDetThdPhy1-4_GM). The retard step and recovery time maps (IKCtl_facKnkRtdt_M, IKCtl_facTiKnkExRtd_M) control how aggressively the ECU responds to knock.

6. **Lambda/Fuel**: The ECU uses torque-based fuel control (not direct injection PW maps). Fuel delivery is derived from the torque request → air charge → lambda target chain. To modify fueling, adjust the lambda target maps (ExhMgT_ratLamCptProtn_GM) or the torque request maps.

7. **J1939 Integration**: The ECU communicates with the Polaris vehicle network via J1939 messages, including transmission control (ETC2), vehicle speed (CCVS), and torque speed control (TSC). Any tuning changes must maintain compatibility with these messages.
