# Diagnostic Analysis: 2020 L5P Duramax - Rapid Soot Loading & Reduced Engine Power

## Vehicle Information
- **Year/Model**: 2020 GM L5P 6.6L Duramax
- **Tune**: PPEI 145HP (+145 over stock), T93 fuel, tuned TCM
- **Customer Complaint**: Rapid soot loading, reduced engine power
- **Datalog**: WOT pull, 16 seconds, HP Tuners format

## Datalog Summary (20 PIDs Available)

| Parameter | Min | Max | Average | Samples |
|-----------|-----|-----|---------|---------|
| DPF Soot Load | 51% | 53% | 52% | 8 |
| Engine RPM | 1488 | 3202 | 2375 | 473 |
| Boost Pressure | 0 | 34.7 PSI | 19.6 | 399 |
| MAF | 102 | 454 g/s | 265.9 | 126 |
| Injection Qty (D) | 0 | 150 mm3 | 80.9 | 280 |
| Rail Pressure (A) | 12.1 | 32.7 kPSI | 26.4 | 417 |
| Rail Pressure (D) | 13.1 | 31.5 kPSI | 25.4 | 174 |
| VGT Position (A) | 3% | 87% | 49.1 | 278 |
| VGT Position (D) | 4% | 86% | 48.3 | 274 |
| Throttle Position | 0% | 99% | 50.3 | 66 |
| Main Timing Cyl 1 | -4.9 deg | 27.0 deg | 9.5 | 288 |
| TCC Slip | -53 | 678 RPM | 76.1 | 114 |

## Key Observations from Datalog

1. **DPF Soot Load at 51-53% during WOT** - This is critically high. Normal operating range is 0-30%. At 51%, the ECM is likely already requesting or about to request a regen. The soot rose +1% during a 16-second WOT pull.

2. **Injection Quantity peaks at 150 mm3** - This is significantly above stock (~80-90 mm3 peak for the 445hp L5P). The +145HP tune is commanding roughly 150 mm3 at peak, which produces substantially more particulate matter per combustion event.

3. **Boost peaks at 34.7 PSI** - Good boost levels, but the question is whether the air-fuel ratio is rich enough at high IQ to cause excess soot. With 150 mm3 fuel and 454 g/s MAF, the lambda could be running rich under load.

4. **Timing at 27 deg peak** - Very aggressive timing. While this helps efficiency, combined with high IQ it can affect combustion completeness.

## Calibration Binary Comparison (Stock vs 145HP Tune)

### 162 Difference Regions Found (3,419 bytes changed)

### Critical DPF/Regen Changes

| Region | Address | Stock | Tuned | Interpretation |
|--------|---------|-------|-------|----------------|
| DPF Enable Flags | 0x40FCD6 | 0x0101 (enabled) | 0x0000 (disabled) | **Regen enable flags turned off** |
| Regen Threshold 1 | 0x40FCE6 | 160 | 65535 (0xFFFF) | **Threshold maxed out = never trigger** |
| Regen Threshold 2 | 0x40FCE8 | 229 | 65535 (0xFFFF) | **Threshold maxed out** |
| Regen Threshold 3 | 0x40FCEA | 160 | 65535 (0xFFFF) | **Threshold maxed out** |
| Regen Temp Target | 0x40FD15 | 15232 | 23232 | **Regen temp target raised ~52%** |
| DPF Enable 2 | 0x40FDCC | 0x0101 | 0x0001 | **Second regen enable partially disabled** |
| More Thresholds | 0x40FDD0 | 160 | 65535 | **Another threshold maxed** |
| Regen Fuel Qty | 0x40FEF2 | 4800 | 65535 | **Regen fuel quantity maxed** |

### Fuel/Power Changes

| Region | Address | Stock | Tuned | Interpretation |
|--------|---------|-------|-------|----------------|
| Torque Limiters | 0x4023A8 | 4100-19665 | 47453 (all) | All torque limiters raised to ~47.5k |
| Feature Flags | 0x400E24 | 5x 0x00 | 5x 0x01 | 5 features enabled (likely DPF bypass flags) |
| Main Fuel Map | 0x42B9D1 | (stock values) | (increased) | 1018 bytes - entire fuel map rewritten |
| Timing Map | 0x42C114+ | (stock values) | (advanced) | Evenly spaced timing advances |
| A/F Ratio | 0x42A6D0 | 38.6 / 32.0 | 8.0 / 4.8 | **Lambda targets dramatically richer** |

## Root Cause Analysis

### Primary Cause: Soot Model vs Actual Soot Mismatch

The tune has modified DPF regen thresholds and enable flags, but the DPF itself is still physically present and accumulating soot. The key issue:

1. **The tune raises regen thresholds to 0xFFFF (65535)** - This effectively tells the ECM "never request a regen based on these triggers." However, the ECM's soot MODEL is still calculating soot accumulation based on:
   - Fuel quantity injected (now 150 mm3 vs stock 80-90 mm3)
   - Exhaust flow rate
   - DPF differential pressure sensor reading
   - Operating time since last regen

2. **The soot model sees 51% loading** - Even with modified thresholds, the ECM's soot model is tracking real soot accumulation. At 51%, the ECM may enter a "reduced engine power" protective mode because the DPF differential pressure is physically high.

3. **More fuel = more soot** - The +145HP tune injects significantly more fuel. With the A/F ratio targets changed from 38.6/32.0 to 8.0/4.8, the engine is running much richer, producing substantially more particulate matter per combustion event.

4. **Regen cannot clear the soot** - Because regen thresholds are maxed to 0xFFFF, the normal passive/active regen cycle that would burn off accumulated soot is either delayed or prevented. The DPF fills up faster than it can be cleaned.

### Secondary Factors

- **Aggressive timing (27 deg)** combined with high IQ can cause incomplete combustion at certain RPM/load points, producing more soot
- **VGT position tracking** shows desired vs actual are close, so turbo response is not the issue
- **Rail pressure tracking** is good (actual follows desired), so fuel atomization is adequate

## Diagnosis: What's Happening

The vehicle is in a feedback loop:
1. Tune adds +145HP via more fuel (150 mm3 peak)
2. More fuel = more soot production per combustion event
3. Regen thresholds are raised/disabled, so regens happen less frequently or not at all
4. DPF physically fills with soot (51%+ and climbing)
5. DPF differential pressure rises as filter loads
6. ECM detects high differential pressure via physical sensor (cannot be calibrated away)
7. ECM enters "Reduced Engine Power" to protect the DPF from overpressure/meltdown
8. Customer experiences power loss

## Missing PIDs for Complete Diagnosis

The datalog has 20 PIDs but is missing critical aftertreatment PIDs. Knox needs these to confirm the diagnosis:

### Priority 1 (Must Have)
| PID | Hex | Description | Why Needed |
|-----|-----|-------------|------------|
| DPF Regen Status | 0x303E | Active/inactive regen state | Confirm if regens are actually occurring |
| DPF Differential Pressure | 0x3337 | Physical soot load measurement | Confirm physical vs modeled soot load |
| DPF Inlet Temp | Mode 01 0x7C | Exhaust temp before DPF | Verify if regen temps are being reached |
| DPF Outlet Temp | Mode 01 0x7C | Exhaust temp after DPF | Verify regen is actually burning soot |
| EGR Position (Actual) | 0x006E | EGR valve position | EGR affects soot production rate |

### Priority 2 (Dial It In)
| PID | Hex | Description | Why Needed |
|-----|-----|-------------|------------|
| SCR Efficiency | 0x331C | NOx conversion rate | Overall aftertreatment health |
| DEF Level/Quality | 0x331B | DEF fluid status | DEF issues can trigger reduced power |
| NH3 Load in SCR | 0x334B | SCR catalyst loading | Aftertreatment system balance |
| Cylinder Balance Rate | 0x162F-0x1636 | Per-cylinder fuel trim | Identify if one cylinder is producing excess soot |
| Combustion Mode | Engine State | Current operating mode | Confirm not in regen/limp mode |

### Priority 3 (Advanced)
| PID | Hex | Description | Why Needed |
|-----|-----|-------------|------------|
| NOx Sensor Pre-SCR | Mode 01 0x7F | Engine-out NOx | Correlate with soot model |
| NOx Sensor Post-SCR | Mode 01 0x7F | Tailpipe NOx | SCR efficiency verification |
| Fuel Rate | 0x1638 | Actual fuel consumption | Verify fuel delivery vs commanded |
| PM Sensor | - | Particulate matter sensor | Direct soot measurement |

## Recommended Customer Actions

1. **Immediate**: Perform a dealer-initiated service regen (or use scan tool forced regen) to clear the DPF to baseline
2. **Re-datalog with Priority 1 PIDs added** to confirm regen behavior
3. **Monitor DPF soot load over a drive cycle** (not just WOT) to see accumulation rate
4. **Check DPF differential pressure sensor** for correct reading (stuck/failed sensor can cause false high readings)

## Calibration Recommendations (for PPEI tuner review)

1. The regen threshold modifications (0xFFFF) may be too aggressive - consider allowing periodic passive regens
2. The A/F ratio change from 38.6 to 8.0 is extreme - verify this is intentional and not causing excess soot
3. Consider adding a soot model correction factor to account for the higher fuel quantity
4. The 5 enable flags at 0x400E24 should be reviewed - they may be disabling critical aftertreatment monitoring
