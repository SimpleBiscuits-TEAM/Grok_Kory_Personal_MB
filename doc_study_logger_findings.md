# OEM Document Study — Logger Advancement Findings

## Source Documents
1. **P654_V1303_030_0_Docu.pdf** — Bosch EDC17 complete software documentation (10,262 pages), covers LML/LGH era Duramax
2. **exhmod_rawnoxmdl_en_fs.pdf** — Bosch Raw NOx Emission Model (19 pages), the internal NOx prediction algorithm
3. **LML_LGH_OPERATIONMANUAL_ctiwtiduramax.pdf** — CARQUEST/CTI training manual (100 pages, image-based), covers LML/LGH service procedures

## Key Findings for Logger Advancement

### 1. Complete Mode 22 PID Table (from P654 pages 8001-8060)
The P654 documents the FULL RDBPI ($22) service — every PID the ECM responds to via Mode 22. This is the definitive list of what can be read live over OBD-II. Key PIDs not in our current database:

| PID | Description | Unit | Conversion | Logger Impact |
|-----|-------------|------|------------|---------------|
| 0x156B | Startup Fuel Temperature | °C | E=N*1-40 | Cold start analysis |
| 0x162B | Actual Fan Speed | rpm | E=N*16 | Cooling system monitoring |
| 0x162F-0x1636 | Cylinder Balance Rate (1-8) | mm³/st | E=N/64-512 | Per-cylinder fuel trim — injector health |
| 0x1638 | Fuel Rate | - | - | Actual fuel consumption |
| 0x1639 | Main Injection Timing | - | - | Actual vs desired timing |
| 0x163F | Desired Fan Speed | rpm | - | Cooling demand |
| 0x1641 | Percent Fan Commanded | % | - | Thermal load indicator |
| 0x1689 | VGT Open Learned Offset | - | - | Turbo wear/adaptation |
| 0x168A | VGT Close Learned Offset | - | - | Turbo wear/adaptation |
| 0x1942 | Transmission Output Speed | rpm | E=N*0.125 | Trans slip calculation |
| 0x1A2D | Engine Actual Steady State Torque | Nm | E=N*0.25 | Real torque output |
| 0x2000 | Intake Manifold Absolute Pressure A/D | %5V | E=N*100/255 | Raw MAP sensor |
| 0x2041 | VGT Duty Cycle | % | - | Turbo control |
| 0x1540 | VGT Desired Position | - | - | Turbo target |
| 0x1543 | VGT Actual Position | - | - | Turbo actual |
| 0x208A | Extended Range MAP | - | - | High-boost MAP reading |
| 0x20AC-0x20B3 | Total Injection Time Cyl 1-8 | - | - | Per-cylinder injection duration |
| 0x20B4-0x20BB | Start of Main Injection Cyl 1-8 | - | - | Per-cylinder timing |
| 0x20BC | Fuel Injection Status | - | - | Injection mode state |
| 0x20DB | Desired Intake Air Flow Valve Position | - | - | Throttle target |
| 0x20DC | Actual Intake Air Flow Valve Position | - | - | Throttle actual |
| 0x2300 | Humidity Sensor IAT Frequency | - | - | Ambient humidity |
| 0x2301 | Relative Humidity | % | - | Ambient humidity |
| 0x2303 | Weight Percent Water in Air | % | - | Humidity correction |
| 0x303E | Regen Demand/Completion Status | enum | - | DPF regen state machine |
| 0x3240 | Fuel Rail Actual | - | - | Actual rail pressure |
| 0x328A | Desired Turbo | - | - | Boost target |
| 0x3308 | VGT (extended) | - | - | VGT extended data |
| 0x3309-0x3310 | Fuel Injector (1-8) | - | - | Per-injector data |
| 0x3311 | SCR Service | - | - | SCR system status |
| 0x331B | SCR Fluid | - | - | DEF level/quality |
| 0x331C | SCR Average | - | - | SCR efficiency |
| 0x3337 | DPF Delta Pressure | - | - | DPF soot load |
| 0x3348 | Average DEF | - | - | DEF consumption |
| 0x3349 | DEF Tank Mass | - | - | DEF quantity |
| 0x334B | NH3 Load in SCR | - | - | Catalyst ammonia storage |

### 2. NOx Raw Emission Model (from exhmod_rawnoxmdl)
The NOx model document reveals the ECM's internal NOx prediction algorithm. This is what the ECM uses to estimate engine-out NOx WITHOUT a sensor. Key insights:

- **Base NOx map**: ExhMod_ratNoxBas_MAP — 2D map of NOx vs engine speed and fuel quantity
- **Correction factors** (all multiplicative):
  - **Injection timing**: ExhMod_facNoxInjCorrn — SOI offset changes NOx
  - **EGR rate**: ExhMod_facNoxEGRCorrn — EGR reduces NOx
  - **Boost pressure**: ExhMod_facNoxBstCorrn — higher boost = different NOx
  - **Coolant temperature**: ExhMod_facNoxColtCorrn — cold engine = different NOx
  - **Humidity**: ExhMod_facNoxHumCorrn — ambient humidity affects NOx
  - **Environmental pressure**: ExhMod_facNoxEnvPCorrn — altitude affects NOx
  - **Injection fuel ratio**: ExhMod_facNoxInjFuRat — pilot/post injection split

- **Post-calculation**: PT1 filter + dead time model for exhaust transport delay
- **Output**: ExhMod_ratNOXEngOut (engine-out NOx rate) and ExhMod_ratNOXEGSys (post-EGR NOx)

**Logger impact**: We can replicate this model in the datalogger. Given RPM, fuel quantity, injection timing, EGR position, boost, coolant temp, and humidity — we can PREDICT what the ECM thinks NOx should be, and compare against the actual NOx sensor reading. Deviation = tuning issue or sensor fault.

### 3. LML/LGH Operation Manual Key Facts
- **SCR NOx reduction target**: 70-80% reduction from NOx sensor 1 to NOx sensor 2
- **LML uses Bosch E86 ECM** (not E42 like 2024)
- **CP4.2 high pressure fuel pump** — two-pumping chamber design
- **Piezoelectric injectors** — 9th injector for DPF regen fuel spray
- **VGT vane position sensor** — can be read live for turbo health
- **Cylinder balance rates** (PIDs 0x162F-0x1636) — the ECM adjusts fuel per-cylinder to balance power output. Deviation = injector wear
- **IQA codes** — Injector Quantity Adjustment codes programmed per-injector for flow matching
- **DPF regen states**: No Reason, Fuel Consumption, Operating Time, Distance, Soot Model, Service Regen, Forced Regen
- **Aftertreatment components**: DOC → SCR → DPF → PM sensor (in that order)

### 4. Control Strategy Insights (from P654)
- **Torque path**: Driver Demand → Torque Coordinator → Smoke Limiter → Injection Quantity → Injector Pulsewidth
- **Active Surge Damper**: Anti-surge control with disturbance controller + reference filter + governor — monitors crankshaft speed oscillation
- **Engine Protection**: Overspeed (hard RPM cut), overheating (torque reduction), turbo protection (low oil pressure → VGT to safe position)
- **Speed Governor**: Engine-Interval-Speed Governor with P+I+D components, configurable per operating mode
- **Boost Control**: Open-loop base + closed-loop PID, with trajectory calculation for charger speed targets
- **DPF monitoring**: Frequency monitoring (too-frequent regen = soot model error or fuel dilution)

## Actionable Logger Features

### A. Per-Cylinder Health Monitor (NEW)
Read PIDs 0x162F-0x1636 (balance rates) and 0x20AC-0x20BB (injection times per cylinder).
Display as 8-bar chart showing each cylinder's deviation from mean.
Flag: >5% deviation = injector wear, >10% = failing injector.

### B. NOx Model Replication (NEW — market first)
Implement the ExhMod_RawNOXMdl algorithm in JavaScript.
Compare predicted vs actual NOx sensor readings.
Flag: >20% deviation sustained = tune issue or sensor drift.

### C. DPF Regen State Machine (NEW)
Read PID 0x303E to decode the exact regen state.
Track regen frequency, duration, and fuel consumption.
Alert: too-frequent regens = soot model miscalibration or fuel dilution.

### D. Turbo Wear Tracking (NEW)
Read PIDs 0x1689/0x168A (VGT learned offsets).
Track over time — increasing offsets = vane wear or carbon buildup.
Compare desired (0x1540) vs actual (0x1543) position for response lag.

### E. Enhanced Diagnostics Context
Use the P654 control logic to explain WHY a fault occurs, not just WHAT.
Example: "Rail pressure low because PCV duty cycle is at max but pump output is insufficient — likely CP4 wear or fuel filter restriction."

### F. Humidity-Corrected Performance
Read PIDs 0x2300-0x2303 for ambient humidity.
Apply the NOx model's humidity correction factor to normalize dyno results.
Show "SAE-corrected" vs raw power numbers.
