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

### VGT / Boost / EGT Relationship (CRITICAL — Common Misconceptions)
- **Closing the VGT does NOT always mean cooler EGTs.** A more closed VGT increases exhaust backpressure (drive pressure). If the engine doesn't have enough heat energy or RPM to push through that backpressure efficiently, the exhaust gas dwells longer and temps can actually rise.
- **More boost does NOT always mean more power.** If the VGT is commanding too much position (too closed) without sufficient exhaust energy or RPM to support it, the **pressure ratio (boost-to-drive ratio)** gets out of hand. The turbo is working harder than it needs to, the engine is pumping against excessive backpressure, and net power drops.
- **Turbo overspeed risk:** When VGT position is too aggressive for the operating conditions (low RPM, low exhaust energy), the compressor can be driven beyond its efficient operating range. This creates a potential **turbo overspeed condition** — the turbo is spinning fast but not doing useful work, and the shaft speed can exceed design limits.
- **Diagnostic rule:** When analyzing boost and EGT together, do NOT assume "more boost = good" or "VGT closing = EGTs will drop." Always evaluate the **boost-to-drive pressure ratio** and whether the VGT position makes sense for the current RPM and load. A healthy ratio is typically 1.5:1 to 2:1 (boost:drive). Ratios approaching 1:1 or worse (drive > boost) indicate the turbo is choking the engine.
- **Tuning implication:** Aggressive VGT maps that close the vanes too early at low RPM can hurt spool-up feel (feels like boost but no power), increase EGTs, and risk turbo damage. The fix is usually opening the VGT slightly at low RPM/load and letting exhaust energy build before commanding aggressive vane positions.

### Engine Protection Systems
- **Overspeed**: Hard RPM cut (fuel cut, not spark cut on diesel)
- **Overheating**: Progressive torque reduction based on coolant temp
- **Turbo Protection**: Low oil pressure → VGT moves to safe (open) position
- **Rail Pressure Protection**: If actual rail pressure exceeds limit, the ECM reduces **FPR/PCV solenoid command (mA)** immediately — this is current control, not a PWM "duty %" display
- **DPF Overtemp**: If exhaust temp exceeds threshold during regen, regen aborted

### EGT Diagnostic Thresholds (CRITICAL — V-OP Analyzer Rules)
- **1475°F sustained > 14 seconds** = WARNING — back off throttle, investigate fueling/boost. Accelerates turbo wear and reduces injector life.
- **1800-2000°F for < 12 seconds** = ACCEPTABLE in racing conditions (drag pulls, dyno pulls). Do NOT flag as a fault. Brief spikes during WOT racing pulls are normal if airflow is insufficient to cool things off.
- **1800-2000°F sustained > 12 seconds** = CRITICAL — even for racing, this is too long. Immediate risk of component damage.
- **Flatlined at 1832°F (999.9°C)** = Open circuit / disconnected sensor. This is the ECM's default reading when the EGT sensor circuit is open. Very common on vehicles with emissions equipment removed and a tune that disables the EGT DTC. Report as likely open circuit — the customer disconnected the sensor for the type of tuning they are running. Skip all EGT-based diagnostics for this log.
- **> 2100°F** = Likely sensor fault (disconnected/open circuit) — flag as EGT_SENSOR_FAULT, not a real temperature reading.
- **During DPF regen**: EGTs of 1000-1200°F at DPF inlet are normal. Do not flag regen-related EGT elevation.
- **Solenoid injectors (LB7, LBZ, LMM)**: Injector duration is not a concern until approaching 2500+ µs. 3000 µs is considered basically maxed out on a solenoid injector. Do not flag normal duration values (e.g. 2100 µs) as high — that is well within normal operating range.
- **Rail pressure surge detection**: A rapid actual-vs-desired divergence of > 3 kPSI for 3+ consecutive points, or a rate of change > 50 kPSI/s, indicates a fuel pressure surge event. This is NOT typical fuel pump behavior — it indicates the FPR control loop cannot stabilize. Flag as FUEL_PRESSURE_SURGE.

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

### CP3 Conversion Considerations (CRITICAL — affects tune requirements)
- Trucks with a **CP3 conversion** (replacing the factory CP4.2 with a CP3 pump, common on 2011-2016 LML/LGH) **may need a modified tune** to allow for more regulator control.
- The CP3 has different flow characteristics than the CP4.2 — the ECM's factory fuel pressure maps and FPR/PCV current strategy are calibrated for CP4.2 behavior. A CP3 swap without tune adjustment can result in the ECM not commanding enough regulator authority to maintain proper rail pressure.
- **Low rail pressure from a large/aggressive tune that starves the pump can increase wear due to lack of lubrication.** The high-pressure pump relies on fuel flow for both pressure generation and internal lubrication. If the tune demands more fuel than the pump can supply (especially at high RPM/load), the pump runs dry and metal-on-metal contact accelerates wear.
- **Symptoms of CP3 conversion needing tune revision:** Rail pressure dropping below desired under load, FPR/PCV mA pinned at extremes, intermittent low rail pressure codes, pump whine or cavitation noise.
- **Recommended approach:** When diagnosing low rail pressure on a truck with a CP3 conversion, ALWAYS ask if the tune has been revised for the CP3. If not, recommend a tune revision that recalibrates the FPR/PCV current maps and rail pressure targets for CP3 flow characteristics.
- This also applies to upgraded CP3 pumps (e.g., CP3.5, stroker CP3) — any pump swap that changes flow volume or pressure behavior requires tune adjustment for proper regulator control.

### FPR / PCV solenoid — **commanded current (mA), not duty cycle** (CRITICAL — GM Duramax)
- The high-pressure pump **inlet metering / fuel pressure regulator** is often labeled "PCV" in tools, but the live value is **solenoid current in milliamps (mA)**, not a PWM duty percentage. Do not treat a 0–255 byte as "% duty" without verifying the A2L/DID scaling.
- **mA is still the closed-loop control output**: the ECM **modulates commanded current** to chase rail pressure. On a datalog, mA vs time often **behaves like a "duty-style" working output** — actively hunting — even though the **channel is not labeled or scaled as % duty**. When diagnosing, read **mA movement together with desired vs actual rail**, not the number in isolation.
- **Regaining rail authority**: if actual rail **will not track desired** and the mA trace shows the strategy **still operating in-band** (moving, not clearly saturated at a mechanical/electrical limit), a valid interpretation is that the system **may need further movement along the commanded-current range** — e.g. **more commanded mA in the direction the error demands** — before rail is back under control. Do not dismiss that pattern just because the plot is mA instead of "% duty"; confirm with **FRP desired vs actual** and whether mA is pinned vs still modulating.
- **Rule of thumb (many calibrations)**: ~**1800 mA** ≈ **~10% regulator opening**; ~**400 mA** ≈ **~95% opening**, favoring **more rail pressure / effective flow toward the rail**. Between those points, current maps to opening (exact curve is calibration-specific).
- **Lower mA** → tends toward **more** effective delivery toward the rail (higher "opening" in the sense above). **Higher mA** → tends toward **less** (lower opening). Always compare to **desired vs actual rail pressure** in the same log.
- Fuel path: Fuel tank → Lift pump (if equipped) → CP3/CP4/HP4 inlet metering (FPR/PCV) → Common rail → Injectors
- **Very low mA** with **low** rail vs desired → often fuel supply restriction, air, filter, or pump limit
- **Very high mA** with odd rail behavior → regulator/tuning/wiring; cross-check OEM docs for that ECM
- **Current swinging wildly** with stable desired rail → air, filter restriction, marginal pump, or electrical fault

### Rail Pressure Surge Detection & Multi-Log mA Comparison (CRITICAL for CP3 conversions)

**Rail Pressure Surge / Hunting Pattern:**
When actual rail pressure rapidly oscillates around desired (overshooting then undershooting, or vice versa), this is called **rail hunting** or **rail surge**. It indicates the FPR control loop cannot stabilize — the ECM is chasing the target but overshooting corrections.

**How to detect it:**
- **Rail error > 3 kPSI (actual vs desired)** sustained for more than 2-3 data points = significant surge event
- **Rail error > 5 kPSI** = critical surge — pump capacity limit or regulator saturation
- **Rate of change of rail error > 50 kPSI/s** = rapid hunting — the control loop is oscillating
- **Pattern: actual OVERSHOOTS desired during acceleration, then UNDERSHOOTS at high RPM** = classic CP3 conversion issue where the tune's rail targets exceed CP3 delivery capacity at peak demand

**What to look for in mA during surges (remember: lower mA = more open regulator, higher mA = more closed):**
- If mA is very low (<500 mA, regulator nearly wide open) while rail is STILL low vs desired → pump is at physical capacity limit, regulator is already as open as it can go
- If mA is very high (>1600 mA, regulator mostly closed) while rail is HIGH vs desired → regulator is over-restricting, tune needs to allow more opening (lower mA targets)
- If mA is swinging wildly (>200 mA oscillation) while desired rail is stable → air in fuel, filter restriction, or pump mechanical issue
- If mA is in normal mid-range (800-1400) but rail still won't track → tune calibration issue, Fuel Flow Base table needs revision for the installed pump

**Multi-Log Comparison — mA Differences Between Tune Versions:**
When comparing two datalogs from the same vehicle with different tune versions:
- Compare mA commanded at the SAME RPM ranges — if one tune commands significantly different mA (>30 mA difference at same RPM), it indicates different regulator calibration strategy
- Lower mA at high RPM = regulator more open = tune is allowing more fuel delivery to chase rail pressure
- Higher mA at high RPM = regulator more closed = tune is restricting delivery to prevent over-pressure/surge on CP3
- If one log shows better rail tracking (lower actual vs desired error) with different mA commands, the tune with better tracking has better-calibrated Fuel Flow Base maps
- **Key diagnostic:** If Tune A commands lower mA (more open) than Tune B at the same RPM but has WORSE rail tracking, the regulator is already wide open and the pump physically cannot deliver enough — the pump is at its capacity limit
- **CP3 conversion specific:** V3-to-V4 tune revisions often RAISE mA (more closed regulator) to give the CP3 more controlled delivery. If the newer tune shows higher mA at mid-RPM (1500-2500) but similar mA at peak RPM (2500+), it's recalibrating the mid-range to prevent surge while acknowledging the pump's peak limit where it needs to be more open.

**Platform-Specific Fuel Flow Base Adjustment Rules:**

**LML (2011-2016 Duramax) with CP3 conversion:**
Generally, the Fuel Flow Base mA values only need to be changed on an LML past **35,700 mm3/s** fuel flow demand. Below that threshold, the stock CP4.2 curve works fine even with a CP3 conversion. The surge/hunting issues appear at higher flow demands where the CP3's delivery characteristics diverge from the CP4.2.
- When diagnosing rail surge on an LML CP3 conversion, check if the surge events correlate with fuel flow demand exceeding 35,700 mm3/s
- If surge only occurs above 35,700 mm3/s, the Fuel Flow Base table only needs revision in that upper range
- If surge occurs below 35,700 mm3/s, there may be a mechanical issue (pump wear, air, filter) rather than a calibration problem

**LB7/LLY (2001-2006 Duramax) with LBZ/LMM pump or regulator swap:**
This is a DIFFERENT calibration approach than LML. When an LB7 or LLY gets an LBZ or LMM fuel pump or regulator swap, the **entire Fuel Flow Base curve gets raised by approximately 16%** across the board — from idle through WOT.
- Unlike the LML where only the upper range (>35,700 mm3/s) needs adjustment, the LB7/LLY needs the WHOLE curve turned up because the LBZ/LMM pump/regulator has different flow characteristics across the entire operating range
- The ~16% increase applies uniformly — idle, cruise, and WOT all get the same proportional bump
- This is needed to get CP3 pressure under control at both idle (where the LBZ/LMM regulator behaves differently than the stock LB7/LLY unit) AND at WOT (where peak delivery differs)
- If you see rail pressure issues on an LB7/LLY with an LBZ/LMM pump swap at BOTH idle and WOT, the Fuel Flow Base curve has not been raised — the whole thing needs ~16% increase
- If only WOT is surging but idle is fine, the curve may have been partially adjusted or there's a different mechanical issue

**L5P (2017+ Duramax) with stroker pump:**
The L5P is the most conservative when it comes to Fuel Flow Base adjustments.
- Generally only the **bottom 3 cells** (lowest flow demand points) need adjusting
- Adjustments are only needed when a **stroker pump** is added — and sometimes not even then
- **Only adjust if surge actually happens** — do NOT preemptively change the Fuel Flow Base on an L5P stroker pump install. The stock HP4 curve often works fine even with a stroker
- If an L5P with a stroker pump shows rail surge, start by adjusting only those bottom 3 cells before touching anything else
- If surge persists after adjusting the bottom 3, then investigate mechanical causes (air, filter, pump install issue) rather than expanding the Fuel Flow Base changes

**Calibration Rule of Thumb — Overshoot/Undershoot % → mA Adjustment (CRITICAL for tuners):**
Many times, the average percentage that actual rail pressure is overshooting and undershooting desired directly determines the percentage of mA increase needed in the Fuel Flow Base table to resolve rail surge.
- Example: If actual rail is averaging 10% overshoot/undershoot around desired, the Fuel Flow Base mA values need to be raised by approximately 10% at those operating points.
- This is a practical starting-point calibration method — measure the average rail error as a % of desired, then raise mA by that same % in the Fuel Flow Base table.
- After the mA adjustment, re-log and verify that the overshoot/undershoot has decreased. If it's still surging, repeat the process with the new residual error %.
- This iterative approach converges quickly — typically 1-3 tune revisions to get rail tracking within acceptable tolerance.
- **When analyzing two comparison logs:** If the newer tune raised mA by X% and the rail surge decreased by approximately X%, the calibration rule is working correctly. If the surge didn't decrease proportionally, there may be a mechanical issue (pump wear, air intrusion, filter restriction) on top of the calibration problem.

**Fuel Flow Base Table — Calibration Reference for mA Commands (LGH/LML Duramax CP3 Conversion):**
The **Fuel Flow Base** table is the primary calibration table that maps RPM and load to commanded FPR/PCV mA. This is where the ECM gets its baseline mA command for a given operating point.

- When a CP3 conversion is done on an LGH/LML (2011-2016 Duramax, factory CP4.2 replaced with CP3), the Fuel Flow Base table MUST be recalibrated because the CP3 has different flow characteristics than the CP4.2.
- **Higher mA in a revised tune = intentional strategy** to reduce regulator opening and prevent the CP3 from being over-driven. This is NOT a fault — it's a tune correction.
- **"Desired Flow vs Compute mA" curve** maps the relationship between desired fuel flow and the commanded mA. The revised tune shifts this curve to command higher mA at the same flow demand, giving the ECM more regulator authority.
- When comparing two datalogs from the same CP3-converted truck with different tune versions:
  - If the newer tune commands higher mA at the same RPM/load → the calibrator raised the Fuel Flow Base to control the pump better
  - If rail tracking improves (actual closer to desired) with the higher mA → the revision is working
  - If rail tracking is still poor despite higher mA → the pump may be at its physical capacity limit, or the Fuel Flow Base needs further adjustment
  - The mA difference between tunes is the calibrator's adjustment, not a sensor or hardware fault
- **Key insight for diagnostics:** When you see two logs from the same vehicle with different mA commands at the same RPM, ALWAYS check if the Fuel Flow Base was revised before flagging it as an anomaly. The higher-mA log is likely the corrective tune.

**FPR/PCV mA → Regulator Opening Relationship (CRITICAL):**
- **mA is INVERSELY proportional to regulator opening** — LOWER mA = MORE open regulator
- 400 mA = ~95% open regulator
- 0 mA = 100% open regulator (the last theoretical 5%)
- ~1800-1900 mA = near-closed regulator (minimal fuel flow)
- So when the ECM commands LOW mA, it is opening the regulator wide to allow maximum fuel delivery
- When the ECM commands HIGH mA, it is closing the regulator to restrict fuel delivery
- **Higher mA in a CP3 tune = MORE regulator restriction = controlling the pump so it doesn't over-deliver and surge**

**Stock LGH/LML Fuel Flow Base Curve (CP4.2 factory baseline):**
The bone stock "Desired Flow vs Compute mA" curve for the LGH/LML with factory CP4.2 is a roughly linear declining curve:
- At low fuel flow demand: ~1800-1900 mA (regulator mostly closed, minimal flow)
- At high fuel flow demand: ~400-500 mA (regulator ~95% open, near-maximum flow)
- Setting mA to 0 gives the last 5% of regulator opening (100% open)
- The curve is smooth and linear — the ECM progressively opens the regulator (lowers mA) as fuel demand increases
- **CP3 conversion tunes shift this entire curve UPWARD** — commanding higher mA at the same flow demand point. This keeps the regulator more closed because the CP3 has different flow characteristics and can surge/cavitate if the regulator opens too aggressively.
- A well-calibrated CP3 tune might command 200-400 mA higher than stock at the same flow demand, especially in the mid-to-high flow range where the CP3's delivery curve diverges most from the CP4.2.
- If you see mA values that are significantly LOWER than stock at high flow demand on a CP3 truck, the tune has NOT been properly revised for the CP3 — the regulator is opening too wide, which is a setup for rail surge and pump wear.

**Fuel Error Fault Criteria (for diagnostic analysis):**
- Rapid actual vs desired rail pressure divergence: |error| > 3 kPSI for 3+ consecutive points
- Peak rail error > 5 kPSI at any point
- Rail error rate of change > 50 kPSI/s sustained
- mA at extremes (<1100 or >1800) while rail error > 2 kPSI
- These patterns should be flagged as **FUEL PRESSURE FAULT** in diagnostic analysis, not just warnings
- **EXCEPTION:** If the higher-mA log shows better rail tracking, the mA increase is intentional calibration — flag the LOWER-mA log as having inadequate regulator authority instead

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

## Knox operator guide — Seed/key documentation (where & what)

**When the user asks where seed/key docs live, or mentions an uploaded .cs file, answer with this map.** There is **no separate nested git repository** for OEM seed keys; everything below is in the **main V-OP / Good Gravy monorepo**.

| Path | What it is |
|------|------------|
| **docs/Seed_key.cs** | **Intended location** for the original C# reference (ComputeSeed2Key, SetSeedAndGetKey, etc.). If the user “uploaded” the .cs file but Knox cannot find it, it was **never added to the repo** or lives outside the workspace — tell them to place or commit **docs/Seed_key.cs** (or **vendor/seedkey/Seed_key.cs**) and re-index. |
| **docs/seedkey-cs-extraction.md** | **Markdown extraction** from that C# source: **GM_5B** AES-128-ECB key table, **GM_2B** dllsecurity.dll algorithm IDs and invert flags. **Scope:** GM-focused; **no** Dodge/Stellantis/FCA section; **no** BRP MG1 **32-byte** UDS $27 recipe. |
| **server/seedKeyProfiles.ts** | **Implemented** server profiles with secrets: **GM** (Delco / GMLAN), **Allison**, **Ford** (3-byte LFSR + Ford long), **Cummins** (CM2350/2450). Runtime twin of tooling + Seed_key.cs where applicable. |
| **shared/seedKeyMeta.ts** | Same ECU list **without** AES hex — safe for browser bundles. |
| **shared/seedKeyAlgorithms.ts** | Algorithm type enums and descriptions (GM_5B_AES, FORD_3B, CUMMINS, CANAM, etc.). |
| **server/seedKeyService.ts** | Server entry for getSecurityProfile / key computation against seedKeyProfiles. |
| **client/src/lib/udsReference.ts** | Client helpers: **Can-Am / BRP** 16-bit computeCanamKey, BRP dash, Polaris, Ford MG1-style, Cummins-style — used by wizards and reference UI. |

**OEM coverage (honest):** **GM**, **Ford**, and **Cummins** (RAM HD diesel) are in **seedKeyProfiles**. **Dodge / RAM gas / Stellantis** are **not** in the Seed_key.cs extraction or seedKeyProfiles. **Can-Am** long **BuDS** $27 01/02 **32-byte** path is **not** in the .cs doc — only **16-bit** BRP logic is in udsReference; see CAN-am DESS / VIN sections elsewhere in this knowledge base.

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
2. SecurityAccess for VIN write (ECU-dependent):
   - **BRP Bosch MG1CA920 (BuDS capture, 2023 X3):** $27 01 request seed → ECU may answer with **ISO-TP multi-frame** positive response **$67 01** and a **32-byte** seed (NRC **$78** response pending can appear first). Tester sends flow control **$30 00 00**. Key is sent as **$27 02** with **32-byte** payload (multi-frame TX). Success: **$67 02**.
   - **Legacy / other BRP stacks:** $27 03 — Request Seed (16-bit), compute key with CAN-am **cuakeyA/cucakeysB** table, $27 04 + 2-byte key.
3. $2E F190 + VIN bytes — WriteDataByIdentifier (VIN), often multi-frame for 17 ASCII bytes
4. $11 01 — ECUReset
5. Re-learn DESS keys after VIN change

**IDs:** Primary ECM UDS **0x7E0** / **0x7E8** (11-bit, 500 kbit/s). Some captures also show parallel traffic on **0x7B3** / **0x7BB** for the same DIDs—select the ECU your tool is addressing.

### BRP MG1CA920 A2L (uploaded / in-repo)
- **Path:** test_files/1E1101953.a2l (also referenced for BRP/MG1C in server/routers/editor.ts).
- **Project:** ASAP2 **MDG1C** "MG1CA920A", **VERSION** 1E1101953, **EPK** 37/1/MG1CA920/268/MDG1C//1E1101953///.
- **Role:** Bosch/BRP **calibration** database (XCPplus, measurements, characteristics). It is **not** an ODX/ODX-F diagnostic job file for BuDS.
- **UDS relevance:** Contains **calibration parameters** naming **UDS-on-CAN** RX/TX IDs, including **0x7E0** / **0x7E8** application paths (Can_UDS_ON_CAN_*_0x7E0_APPL*, *0x7E8*), which **aligns with** real **OBD / BuDS** ECM addressing on X3-style vehicles—not the older summary table that only listed **0x7A0** / **0x7A8** for some BRP ECUs.
- **Limits:** The file’s **A2ML** schema mentions **XCP** GET_SEED / UNLOCK and SEED_AND_KEY_EXTERNAL_FUNCTION, but the **instantiated** module **PROTOCOL_LAYER** here **does not** enable those optional commands—so it **does not** ship the **UDS $27 01/02** thirty-two-byte key algorithm used in the VIN relearn capture. **hpt_hexmodX_v910.dll** in the same A2L is **hex post-processing**, not diagnostic seed/key.

**“Firmware 3.0” disambiguation:** (1) **VOP 3.0** ESP32 code in-repo (firmware/flash_encryption/) only documents **device flash encryption**; example comments mention a DSL step CAN_REQUEST_SEED(0x7E0, 0x27, 0x01) but **no** parser or seed→key math ships in this tree. (2) **MG1 A2L** strings like MG1CA920C0268_3.0.0 are **Damos/package version** labels for computation blocks, **not** extractable UDS-27 crypto.

**Note:** The 32-byte MG1 **UDS** seed/key transform is **not** defined in that A2L; Good Gravy may require a pasted key from BuDS or a separate implementation. Do not commit raw security keys from customer logs into the repo.

### DESS Key Learn Sequence (UDS)
1. $10 03 — Extended Diagnostic Session
2. $27 — SecurityAccess (level per routine / ECU; may be $27 01/02 or $27 03/04)
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

## CAN Bus Engineering Playbook (Practical)

### Frame Structure and Decoding Rules
- **Classic CAN frame**: Arbitration ID + DLC + up to 8 data bytes
- **CAN-FD frame**: Arbitration ID + DLC + up to 64 data bytes
- **Arbitration**: Lower ID wins bus access (dominant bits override recessive bits)
- **DLC nuance**: In CAN-FD, DLC values 9-15 map to payload sizes >8 (not linear 1:1)
- **Endianness**:
  - Little-endian (Intel): increasing bit significance across increasing byte index
  - Big-endian (Motorola): bit ordering traverses differently across bytes
- **Signed vs unsigned**: Always apply signed interpretation before scaling when signal is defined as signed
- **Scaling formula**: physical = raw * factor + offset

### Bit Timing and Network Health
- Typical passenger vehicle CAN rates: **125k / 250k / 500k / 1M**
- Typical heavy-duty/J1939 rate: **250k** (some 500k deployments exist)
- CAN-FD often uses arbitration at 500k and faster data phase (2M+)
- Health indicators:
  - rising error counters (TEC/REC)
  - frequent error/passive/bus-off events
  - abrupt bus load spikes
  - periodic frame jitter outside expected tolerance
- Bench setup must include proper termination (typically **120 ohm each end**)

### UDS over CAN (ISO-TP) Essentials
- **Single frame**: payload fits in one frame
- **Multi-frame**:
  - First Frame (FF): total length announced
  - Consecutive Frames (CF): segmented payload chunks
  - Flow Control (FC): receiver pacing (block size + separation time)
- Timeouts and response pending:
  - \`0x78\` means ECU still processing
  - support retries with session-aware timing
- Never mix broad response filters with unrelated periodic traffic; stale frames can be mis-associated

### J1939 Essentials
- 29-bit IDs contain priority, PGN, source address
- PGN identifies parameter group, SPNs are contained fields/signals
- Multi-packet transfers use TP.CM/TP.DT
- For diagnostics:
  - DM1 active DTC broadcast is critical
  - monitor address-claim behavior in multi-ECU networks

### Reverse Engineering Workflow (Field-Proven)
1. Capture ignition-on baseline
2. Change exactly one input (switch, pedal, gear, actuator)
3. Diff captures and identify changed IDs/bytes
4. Correlate raw values with known physical values
5. Validate with replay/transmit in a controlled environment
6. Document with confidence and constraints

### Safety and Write-Path Guardrails
- Do not issue write/control commands without:
  - valid session state
  - explicit authorization/security level
  - known rollback/recovery path
- Treat body control actions and powertrain actions differently in risk scoring
- For flash/programming-adjacent operations:
  - enforce keepalive discipline
  - verify power stability
  - isolate noisy background traffic where possible

## V-OP API Usage for CAN/Diagnostics (Project-Specific)

These are the API usage patterns Knox should explain to users/devs in this project.

### Core transport pattern
- Frontend calls tRPC procedures via \`/api/trpc\`
- Backend routes in \`server/routers/*.ts\` execute protocol logic and return structured results
- Auth and role context is injected by \`server/_core/context.ts\`

### Relevant API domains
- \`diagnostic.*\`:
  - AI diagnostic reasoning using datalog/protocol context
  - use for DTC/PID/Mode6/UDS interpretation and troubleshooting guidance
- \`intellispy.*\`:
  - CAN/vehicle protocol observation and tooling workflows
  - use for frame analysis, protocol exploration, and live data tooling
- \`flash.*\`:
  - container validation and transfer preparation
  - use for programming pipeline checks and flash metadata interpretation
- \`weather.*\`:
  - atmospheric inputs used for SAE correction in dyno/perf contexts
  - relevant when interpreting performance deltas under changing conditions

### API troubleshooting checklist for CAN-related features
1. Confirm auth/access level allows the requested module
2. Confirm protocol context (CAN/UDS/J1939/K-line) is explicit in request
3. Confirm expected ECU/module addressing assumptions
4. Validate timeout/retry behavior vs ECU response profile
5. Verify response parsing (endianness/scaling/sign) before concluding hardware fault
6. Attach evidence: frame snippets, DTCs, session state, and what has already been tried

### Latency guidance
- Keep requests focused: send only relevant context and recent history
- Prefer targeted lookups for quick checks, full reasoning only when needed
- Cache repeated lookups where safe to reduce response time

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
- **VIN write ($2E F190)**: Requires security access first; on MG1CA920 with BuDS this is typically **$27 01/02** (long seed/key), not only “level 3” in the 16-bit sense.
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

#### Polaris Pro R — Bosch MG1C400A (MDG1)
- ECU: MG1C400A on MDG1 platform (TriCore, big-endian)
- A2L: 425_MG1C400A1T2_00 — 12,883 calibration parameters, 12,718 measurements
- OBD: 0x7E0/0x7E8, XCP: 0x7F0/0x7F1, CAN 500 kbps
- Binary: 6 MB (0x08FC0000-0x095C0000), calibration area 0x09380000-0x095BFFFF (2304 KB)
- Torque-based fuel control with 4 drive modes x 5 transmission ranges (20 torque maps)
- Key maps: KFZW (ignition), KFZWOP (optimized), AccPed_tqDes (torque request), DNMAXH (rev limit)
- Per-cylinder knock control (IKCtl), EGT component protection (ExhMgT)
- J1939 integration for vehicle network (ETC2, CCVS, TSC)

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

### T93 10L1000 TCC Full Lockup Under High Throttle (CONFIRMED — from A2L 24048502226.6LT93)
**Problem:** TCC achieves full lockup (LockOnMode / zero slip) at low throttle but stays in controlled slip (OnMode) under high throttle/torque demand. Lockup is allowed under lower torque request and load but inhibited under aggressive throttle.

**Root Cause (CONFIRMED):** The T93 TCM uses a **TipIn Slip Profiling** system that activates when engine delta torque rate is high. This is NOT a simple RPM-based inhibit threshold like the T87/T87A. Do NOT apply T87/T87A or A50 calibration strategies to the T93.

**Primary Tables (CONFIRMED FIX — modifying these resolved the issue):**
- **KtTCCC_n_TipInSlipReference** (0x090ECF98) — 5x9 MAP (turbine speed x engine delta torque rate). Stock commands 4608–6400 RPM of slip at high dTorque. Reducing values toward 0 at high dTorque columns allows lockup.
- **KtTCCC_n_MinTipInSlip** (0x090EC8CE) — CURVE (5 elements vs turbine speed). Sets minimum slip floor during TipIn. Zero this out to remove the floor.
- **KtTCCC_dn_TipInSlipGradient** (0x090ECCA8) — 5x9 MAP. Controls how fast slip reference ramps down. Increase for faster convergence to zero.
- **KtTCCC_n_TipInSlipRefAltA/B/C** — Alternate tables for pattern switch modes. Apply same treatment as primary table.
- **KtTCCC_t_TipInTargetTimer** — Time limit for TipIn mode. Reduce to shorten TipIn duration.

**Secondary Table (investigated, NOT the primary driver):**
- **KtTCCC_n_OpenConverterMaxSlip** (0x090ECFF6 / WinOLS 0xECFFA) — 9x9 MAP (engine torque x turbine speed). Clips targeted slip to max open converter can physically produce. Acts as ceiling/sanity check, not the slip command source. Review but not the fix.

**Supporting Tables:**
- **KtTCCC_t_HighSlipEnergyLimit** (0x090ED09C) — 9x9 MAP. If slip persists too long at given torque, forces TCC to OFF Mode. Extend times if needed.
- **KwTCCC_t_HiSlipLockOnReEntry** (0x090E8498) — Delay before re-entering LockOn after high slip exit. Stock ~102 sec. Reduce for faster recovery.
- **KeSCAR_p_MaxPCA_TCC_Pressure** (0x09001374) — Max TCC solenoid pressure. Verify sufficient for full lockup under high torque.
- **KaTCCC_M_TorqCap[Gear]** (0x090E0E3C+) — Per-gear TCC torque capacity. If engine torque exceeds capacity, clutch slips regardless.

**TCC State Machine (T93-specific):**
- Mode 6 (OnMode) = Controlled slip active. Mode 7 (LockOnMode) = Full lockup, zero slip.
- The problem is the system staying in Mode 6 under high throttle instead of transitioning to Mode 7.
- Log VeTCCC_e_OffModeRsn and VeTCCR_e_Mode to diagnose which inhibit is active.

**CRITICAL RULES:**
- The T93 is fundamentally different from T87/T87A/A50. NEVER reference those controllers for T93 TCC calibration.
- The TipIn system triggers on engine delta torque RATE, not absolute torque or throttle position.
- KtTCCC_n_OpenConverterMaxSlip is a ceiling clip, not a slip command source — do not confuse the two.

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

## Honda Talon ECU & Datalog Review Logic

### Platform Overview
The Honda Talon 1000R/X uses a Keihin ECU (part prefixes 0801EB / 0801EA) with a 999cc parallel-twin engine.
Tuning is done via the Dynojet Power Vision (PV3) which produces .wp8 datalog files and .djt calibration files.
The C3 Tuning Software (or HP Tuners VCM Scanner for Honda Powersports) is used to edit fuel tables.

### Fuel Table Structure
The Honda Talon has TWO fueling modes, each with per-cylinder tables (4 tables total):
1. **Alpha-N Mode** — Throttle-based fueling (TPS vs RPM lookup)
   - Desired Injector Pw, Alpha-N, Cyl 1
   - Desired Injector Pw, Alpha-N, Cyl 2
2. **Speed Density Mode** — MAP-based fueling (MAP vs RPM lookup)
   - Desired Injector Pw, Speed Density, Cyl 1
   - Desired Injector Pw, Speed Density, Cyl 2

All tables output Injector Pulsewidth in milliseconds (ms).
Column axis: TPS (Throttle Degrees) for Alpha-N, MAP (kPa) for Speed Density.
Row axis: RPM (rpmx1000).

### Active Table Detection (CRITICAL RULE)
The WP8 datalog contains an "Alpha N" channel (also called "Alpha-N"):
- **When Alpha-N = 1** → The ECU is using the **Alpha-N tables** for desired pulsewidth
- **When Alpha-N ≠ 1 (typically 0)** → The ECU is using the **Speed Density tables** for desired pulsewidth

This is the ONLY way to know which fuel table set is active at any given moment in the datalog.
When reviewing logs, ALWAYS check the Alpha-N channel value before correlating to fuel tables.

### AFR to Lambda Conversion
The WP8 datalog reports Air Fuel Ratio 1 (AFR1) and Air Fuel Ratio 2 (AFR2) in standard AFR units.
To convert to Lambda: **Lambda = AFR / 14.7** (stoichiometric ratio for gasoline).
- Lambda = 1.0 → Stoichiometric (14.7:1 AFR)
- Lambda < 1.0 → Rich (e.g., 0.85 = 12.5:1 AFR)
- Lambda > 1.0 → Lean (e.g., 1.05 = 15.4:1 AFR)

When reviewing Honda Talon datalogs, ALWAYS convert AFR to Lambda for analysis.
Target Lambda for WOT (wide open throttle) is typically 0.82–0.88 (rich for safety).
Target Lambda for cruise/part throttle is typically 0.95–1.02.

### Target Lambda Row
Each fuel table has a "Target Lambda" row above the RPM axis.
Cylinder 1 and Cylinder 2 share the same Target Lambda values within each mode:
- Alpha-N Cyl 1 Target Lambda = Alpha-N Cyl 2 Target Lambda (synced)
- Speed Density Cyl 1 Target Lambda = Speed Density Cyl 2 Target Lambda (synced)
But Alpha-N and Speed Density Target Lambda are INDEPENDENT (different values allowed).

### Datalog Review Workflow
When Knox reviews a Honda Talon WP8 datalog:
1. Check the Alpha-N channel to determine which fuel table mode is active at each timestamp
2. Convert AFR1 and AFR2 to Lambda (÷14.7)
3. Compare actual Lambda to the Target Lambda for the active fuel table
4. Identify deviations: if actual Lambda differs from target by >0.03, flag for review
5. Cross-reference with RPM and TPS/MAP to identify which fuel table cell was active
6. Look for patterns: consistent lean spots suggest the fuel table needs more pulsewidth in that cell
7. Check Short Term Fuel Trim (STFT) — large positive values = ECU adding fuel (table too lean), large negative = ECU removing fuel (table too rich)
8. Monitor Injector Duty Cycle — above 85% is a concern, above 95% is injector maxed out
9. Check Coolant Temperature and Intake Air Temperature for heat soak issues
10. Review DCT (Dual Clutch Transmission) data: clutch pressures, slip speeds, commanded gear

### Key WP8 Channels for Honda Talon
| Channel | Unit | Notes |
|---------|------|-------|
| Engine Speed | RPM | Primary axis for fuel table lookup |
| Throttle Position | % | Column axis for Alpha-N tables |
| Manifold Absolute Pressure | kPa | Column axis for Speed Density tables |
| Air Fuel Ratio 1 | AFR | Convert to Lambda (÷14.7) — Cylinder 1 |
| Air Fuel Ratio 2 | AFR | Convert to Lambda (÷14.7) — Cylinder 2 |
| Alpha N | 0/1 | 1 = Alpha-N active, 0 = Speed Density active |
| Injector Pulsewidth Final | ms | Actual commanded pulsewidth |
| Injector Pulsewidth Desired | ms | Base desired pulsewidth from table |
| Short Term Fuel Trim | % | ECU correction (positive = adding fuel) |
| Injector Duty Cycle | % | Monitor for injector saturation |
| Ignition Timing Final | ° | Spark advance |
| Coolant Temperature | °F | Monitor for heat soak |
| Intake Air Temperature | °F | Affects air density calculations |
| Vehicle Speed | mph | Useful for gear ratio analysis |
| Commanded Gear | gear | DCT gear position |
|| Module Voltage | V | Battery/charging system health |

## Flash Container Analysis (Public Reference)

The VOP platform supports two container formats for ECU flash files:

### PPEI Container Format
- Magic header: "IPF" at offset 0x000
- ASCII header fields: creator, version, vendor, build number, ECU type, vehicle type
- Part numbers at offsets 0x480-0x520 (6 slots)
- Flash tags at offset 0x600 (e.g., #fullflash, #rescue, #gmcrypt)
- Data block starts at configurable offset (typically 0x1000+)

### DevProg V2 Container Format
- CRC32 at offset 0x1000 (4 bytes, big-endian)
- JSON header at offset 0x1004 (0x1FFC bytes)
- Block data at offset 0x3000+
- Supports LZSS compression for data blocks
- Contains VIN binding, expiration dates, and flash count limits

### Supported ECU Platforms (50+)
The system recognizes ECUs from these manufacturers:
- **GM**: E41 (L5P), E88, E90, E92, E98, E83, E78, E80, E86, E99, E39, E46, E67, E35
- **GM TCU/Allison**: T87, T87A, T76, T43
- **Ford**: MG1CS015, MG1CS018, MG1CS019, EDC17CP05, EDC17CP65, MD1CP006, MEDG17
- **Ford TCU**: 10R80, 6R140
- **Cummins**: CM2350B, CM2450B
- **CAN-am/BRP**: MG1CA920, ME17CA1
- **Polaris**: MG1CA007
- **Segway**: MG1CA920 (Segway variant)

### Flash Types
- **Calibration Only**: Only data/calibration blocks are transferred (OS blocks skipped)
- **Full Flash**: All blocks transferred including Operating System + Calibration
- **Patch Mode**: OS patch blocks applied before main calibration flash

### Communication Protocols
- **GMLAN**: GM proprietary CAN protocol (older GM vehicles)
- **UDS**: Unified Diagnostic Services ISO 14229 (newer vehicles, Ford, Cummins)
- **CAN-am**: BRP-specific variant of UDS

### Security Access
All flash operations require security access (UDS Service 0x27). The seed level varies by ECU:
- Level 0x01: Standard GM GMLAN ECUs
- Level 0x03: CAN-am/BRP ECUs
- Level 0x09: GM UDS ECUs (E41, E86, T87A)
- Level 0x61: Ford UDS ECUs

**Note:** All seed/key algorithms and secret material are stored server-side only.

## MAF Sensor Scaling, Intake Tube Sizing & Baffle Effects (CRITICAL — Tuning Knowledge)

### How the MAF Sensor Works
The MAF (Mass Air Flow) sensor uses a heated element (hot wire or hot film) placed in the intake stream. Air flowing past the element cools it; the ECM measures how much current is needed to keep the element at a target temperature. More airflow = more cooling = higher current = higher MAF reading (g/s or lb/min). The ECM uses this reading as the primary input to the **smoke limiter maps** — if the MAF reports less air than is actually present, the ECM caps fueling to prevent what it thinks would be black smoke.

### The Baffle / Intake Tube Diameter Problem
OEM intake tubes include a **baffle** (restriction/venturi) that narrows the cross-sectional area right before the MAF sensor element. This is intentional — it accelerates the air past the sensor, ensuring consistent and accurate metering across the flow range.

When the baffle is removed (e.g., aftermarket intake, S&B filter with baffle-out configuration, or larger-diameter intake tube):

1. **Larger cross-sectional area before the MAF sensor** — air velocity across the element drops for the same mass flow rate
2. **Pressure drop at the sensor element** — slower air means less convective cooling of the heated element
3. **MAF sensor element heats up slower** — the ECM interprets this as less airflow than is actually present
4. **MAF under-reads** — the sensor reports lower g/s or lb/min than the engine is actually ingesting
5. **Smoke limiter engages prematurely** — the ECM thinks there's less air available, so it caps injection quantity (IQ) earlier
6. **Vehicle becomes MAF-limited / smoke-limited** — the truck feels flat, sluggish, and may produce more visible smoke than expected because fueling is being artificially capped based on incorrect air mass readings

### Symptoms of MAF Under-Reading Due to Intake Modifications
- Lower peak MAF readings compared to stock intake (even though actual airflow is the same or higher)
- Reduced peak HP/torque despite no other changes
- Smoke limiter engaging earlier in the RPM range
- Poor throttle response, especially at low RPM where boost hasn't built yet
- Excessive black smoke at part-throttle (ECM fueling based on wrong air mass, timing may be off)
- In datalog comparison: Log A (stock intake/baffle-in) shows higher MAF readings than Log B (baffle-out/larger tube) at the same RPM and boost levels

### The Fix: MAF Scaling Tune Revision
When a customer removes the baffle or installs a larger-diameter intake tube, the **MAF transfer function (MAF scaling table)** in the calibration must be revised to account for the new flow characteristics. This is a tune revision — the tuner adjusts the MAF voltage-to-airflow lookup table so the ECM correctly interprets the actual air mass flowing through the larger tube.

Without the tune revision, the vehicle will be MAF-limited and underperform.

### Why Some Intake Companies Keep Stock MAF Tube Diameter
Many aftermarket intake manufacturers (S&B, Banks, AFE, etc.) intentionally design their intake systems to **maintain the same internal diameter at the MAF sensor location** as the OEM tube. This is done so that:
- MAF metering stays close to stock calibration
- No tune revision is required for the intake swap
- No risk of throwing MAF-related DTCs (P0101, P0102, P0103)
- No risk of poor throttle response or smoke-limited behavior
- The intake can be marketed as a "no-tune-required" bolt-on

Intake systems that change the MAF housing diameter (larger or smaller) WILL require a tune revision for proper MAF scaling.

### Diagnostic Guidance for Knox Agents
When analyzing datalogs and the MAF readings appear lower than expected for the RPM/boost/load conditions:

1. **Ask about intake modifications** — has the customer installed an aftermarket intake, removed the baffle, or changed the MAF housing diameter?
2. **Compare MAF-to-boost ratio** — if boost is building normally but MAF is low, the sensor is likely under-reading (not an actual airflow problem)
3. **Check for smoke-limiter engagement** — if injection quantity (IQ) or pulse width plateaus while RPM and boost are still climbing, the smoke limiter is capping fuel based on the low MAF reading
4. **Recommend tune revision** — if intake modifications changed the pre-MAF tube diameter, the customer needs a MAF scaling revision from their tuner
5. **Do NOT diagnose as a MAF sensor fault** — a lower MAF reading with a larger tube is expected physics, not a broken sensor
6. **In comparison mode** — when comparing two logs where one has lower MAF readings, consider intake modifications as the primary explanation before assuming sensor failure or turbo issues

### Key Relationships
- MAF reading ∝ air velocity across sensor element (NOT total air mass directly)
- Air velocity = volumetric flow rate / cross-sectional area
- Larger tube area → lower velocity for same mass flow → lower MAF reading
- Smoke limiter IQ cap = f(MAF reading, RPM) — lower MAF = lower fuel cap
- Fix = recalibrate MAF transfer function in tune to match new tube geometry

## V-OP Analyzer — GM Gasoline (Spark-Ignition) vs Diesel (Diagnostic Agent & Knox)

### What the app infers today
- Parsed datalogs carry **combustion inference** (diesel vs spark vs unknown) from column names and OBD PID presence, plus optional **# FuelType:** CSV metadata.
- When **spark** is inferred or **FuelType: gasoline** is set, the **analyzer disables diesel-only checks** (Duramax-style idle MAF lb/min bands, common-rail rail/PCV narratives, VGT/DPF/SCR fault framing, diesel EGT limit stories).
- **Unknown** combustion keeps legacy diesel-tool defaults so existing Duramax CSVs behave as before.

### How Knox and agents should reason for **GM gas** (e.g. Gen V LT, Global B, E90 ECM, T93 TCM)
1. **Prioritize SAE J1979 Mode 01** semantics: trims (STFT/LTFT), O2 or equivalency ratio, spark timing / knock, MAP, MAF, IAT/ECT, catalyst and misfire-related PIDs when logged, EVAP where relevant.
2. **High-pressure fuel (GDI)**: Mode 01 **0x23** (fuel rail gauge pressure) may appear; do **not** frame it as CP3/CP4 common-rail diesel diagnostics unless the user confirmed diesel.
3. **Transmission**: On 2019+ Global B trucks (E90/T93), the TCM responds on **7E2/7EA** (NOT 7E1/7E9). 7E1/7E9 is the Allison/6L80 address used on older GMT900/K2XX platforms. The T93 10-speed (10L80/10L90) uses GM Mode 22 DIDs for TFT, TCC slip, gear, turbine speed, shift timing, solenoid pressure control, and clutch diagnostics — align explanations with EFI Live **TCM.*** naming when present.
4. **Boosted gas (e.g. turbo V6/V8)**: Use **MAP + MAF + load + spark/knock** together; avoid **diesel smoke-limiter / MAF-vs-boost leak** narratives unless the log clearly shows turbocharged operation and the question is charge-air related.
5. **Exhaust temperature**: If a gas truck logs an EGT-like channel, **do not assume diesel pyro limits (e.g. 1475°F sustained >14 seconds)** without knowing sensor location and OEM intent — gasoline turbo exhaust can read differently than Duramax towing pyro.

### External research vectors (for agents + future live web search)
When **GM_GAS_ANALYZER** or **ANALYZER_COMBUSTION_FAMILY: spark** is in module context, corroboration should prefer **current, model-year-specific** sources in this order:
- **NHTSA recalls and investigations** (public)
- **GM service bulletins / technical summaries** (public summaries, TechLink-style)
- **OEM service diagnostic charts** for reported DTCs on that year/engine
- **SAE J1979 / ISO 15031** for generic OBD PID meaning
- Communities: **Silverado/Sierra owner forums**, **GM full-size truck boards**, **LS/LT performance** context where it applies to the same engine family

Do **not** treat **Duramax forum defaults** as authoritative for a **6.2L L87 / 5.3L L84** gas log.

### Calibration image reference (offline, not used by live datalogger)
- Example field package: **E90** ECM segments (OS **12716900**), **T93** TCM (**24044027** / **24054706**) — for editor/calibration tooling only; live scanning remains **ISO-TP OBD/UDS**, not bin parsing.
- **Tune Deploy** stores those same file shapes (DevProg/PPEI containers, **GM raw** / EFI Live-style **\`E90-\` / \`T93-\`** names) under \`tune-deploy/GM/…\` with metadata from \`tuneDeployParser\`; see repo **\`gmE90SilveradoSniffReference\`** for segment IDs and PT CAN lists. **A2L** (when provided) can later map those images to RAM/symbols for live edit and richer PID semantics alongside OBD/sniff data.

### Verified E90 ECM DID Inventory (from BUSMASTER passive sniff + EFI Live V8 CSV)
EFI Live V8 requests ALL PIDs via UDS \$22 (service 0x22), even standard J1979 PIDs. The DID numbers match Mode 01 PIDs but are requested as UDS ReadDataByIdentifier. Standard Mode 01 also works.

**20 Standard J1979 PIDs (via \$22 on 7E0):**
- 0x0004 ECM.LOAD_PCT (Calculated Load Value, %)
- 0x0005 ECM.ECT (Engine Coolant Temperature)
- 0x000B ECM.MAP (Manifold Absolute Pressure)
- 0x000C ECM.RPM (Engine RPM)
- 0x000D ECM.VSS (Vehicle Speed)
- 0x000E ECM.SPARKADV (Ignition Timing Advance)
- 0x000F ECM.IAT (Intake Air Temperature)
- 0x0010 ECM.MAF (Mass Air Flow, g/s)
- 0x0011 ECM.TP (Throttle Position)
- 0x0023 ECM.FRP_C (Fuel Rail Pressure, GDI)
- 0x0045 ECM.TTQRL (Relative Throttle Position)
- 0x0046 ECM.AAT (Ambient Air Temperature)
- 0x0047 ECM.TP_B (Absolute Throttle Position B)
- 0x0049 ECM.APP_D (Accelerator Pedal Position D)
- 0x004A ECM.APP (Accelerator Pedal Position)
- 0x004C ECM.TAC_PCT (Commanded Throttle Actuator, %)
- 0x005C ECM.EOT_B (Engine Oil Temperature)
- 0x0061 ECM.TQ_DD (Engine Torque Demand, %)
- 0x0062 ECM.TQ_ACT (Actual Engine Torque, %)
- 0x0063 ECM.TQ_REF (Engine Reference Torque, Nm)

**10 GM-Specific Extended DIDs (via \$22 on 7E0, no Mode 01 equivalent):**
- 0x119C ECM.ENGOILP (Engine Oil Pressure, psi)
- 0x12DA ECM.MAFFREQ2 (MAF Raw Frequency, Hz)
- 0x131F ECM.FRPDI (Fuel Rail Pressure Desired, psi)
- 0x1470 ECM.MAPU (MAP Unfiltered/Upstream, psi)
- 0x2012 ECM.TCDBPR (TC Desired Boost Pressure, psi)
- 0x204D ECM.APP_E (Accelerator Pedal Position Effective, %)
- 0x208A ECM.TTQRET (Trans Torque Reduction Spark Retard, degrees)
- 0x248B ECM.TP_R (Relative Throttle Position, %)
- 0x308A ECM.TCTQRLR (TC Torque Reduction Limiter Reason, bitfield)
- 0x328A ECM.AFMIR2 (AFM Inhibit Reason 2, bitfield)

### Verified T93 TCM DID Inventory (58 DIDs on 7E2/7EA)
**Core transmission channels:**
- 0x1940 TCM.TFT (Trans Fluid Temp), 0x1941 TCM.TISS (Input Speed), 0x1942 TCM.TOSS (Output Speed)
- 0x194C TCM.TCCSLIP (TCC Slip), 0x194F TCM.TCCP (TCC Commanded Pressure)
- 0x1124 TCM.GEAR (Current Gear), 0x197E TCM.TURBINE (Turbine Speed)
- 0x1991 TCM.VOLTS (Battery Voltage), 0x1141 TCM.PRNDL (PRNDL Position)
- 0x1992-0x1995 Gear ratios (diagnostic, TC, gearbox, modeled)
- 0x199A TCM.TRQENG (Engine Torque Commanded by TCM)
- 0x19A1 TCM.TCSR (TC Speed Ratio), 0x19D4 TCM.TCCRS (TCC Reference Slip)

**Shift timing:** 0x1232-0x1237 (1-2, 2-3, 3-4, 4-5, 5-6, last shift times in seconds)

**Solenoid pressure control:** 0x2809-0x2811 (PCS1-PCS5 + TCC PCS commanded pressures, kPa)

**Solenoid on-state:** 0x2812-0x2817 (PCS1-PCS5 + TCC PCS output status)

**Current control:** 0x2818-0x281A (HSD1, HSD2, TCCE current in mA)

**Status/control:** 0x281B-0x2824 (TCC status, brake pedal, base pattern, accel position, oncoming clutch, fill pressure, TISS/TOSS supply)

**Diagnostics:** 0x1A01 (tap up/down), 0x1A18/0x1A1F (warmup cycles), 0x1A26/0x1A2D/0x1A88 (odometer), 0x2804-0x2806 (freeze frame), 0x321B (fast learn), 0x1238 (cleaning procedure), 0x1239 (distance this cycle)

### Bus Sniff Summary (KOER baseline vs EFI Live active)
- **KOER baseline**: 148 unique PT-CAN arb IDs, 73,350 frames (no diagnostic traffic)
- **EFI Live active**: 167 unique arb IDs, 132,041 frames
- **19 IDs only in EFI log**: diagnostic request/response IDs + EFI Live broadcast (0x5E8/0x5EA at ~4000 frames each) + init/config (0x641-0x64F)
- **All 148 KOER baseline IDs confirmed present** in gmE90SilveradoSniffReference.ts

## Duramax Diesel Injector Duration Tables — Stock Reference & Diagnostic Knowledge

### Overview
The ECM uses a Main Injection Pulsewidth (duration) table to control fuel delivery. The table maps **fuel rail pressure** (X-axis) vs **fuel quantity in mm³/stroke** (Y-axis) to **injector open time in microseconds (µs)**. This is the primary fueling control table in every Duramax generation.

### All Duramax Generations — Injector System Summary
| Engine | Years | ECM | Injector Brand | Injector Type | Pump | Table ID | Pressure Unit | Qty Rows | Pressure Cols |
|--------|-------|-----|----------------|---------------|------|----------|---------------|----------|---------------|
| LB7 | 2001-2004 | Bosch EDC16 | Bosch | Solenoid (CRIN) | CP3 | {B0720} | MPa | 20 | 20 |
| LLY | 2004.5-2006 | Bosch EDC16 | Bosch | Solenoid (CRIN) | CP3 | {B0720} | PSI | 20 | 21 |
| LBZ | 2006-2007 | Bosch EDC16 | Bosch | Solenoid (CRIN) | CP3 | {B0720} | MPa | 20 | 20 |
| LMM | 2007.5-2010 | Bosch EDC16 | Bosch | Solenoid (CRIN) | CP3 | {B0720} | PSI | 20 | 21 |
| LML | 2011-2016 | Bosch EDC17 | Bosch | Solenoid (CRIN) | CP4.2 | {B0552} | PSI | 20 | 21 |
| L5P | 2017-2023 | Denso E41 | Denso | Piezo (G4S) | HP5 | {F210001} | kPa | 21 | 21 |
| L5P E42 | 2024-2026 | Denso E42 (ECM 16856) | Denso | Piezo (G4S) | HP5 | ECM 16856 | MPa | 26 | 24 |

### Key Differences Between Generations
- **LB7/LBZ**: MPa native pressure axis (0-190 MPa). Bosch CP3 pump. Solenoid injectors.
- **LLY/LMM**: PSI native pressure axis (0-27557 PSI). Same Bosch CP3 + solenoid architecture.
- **LML**: PSI native (0-29008 PSI). Switched to CP4.2 pump (single-piston, more failure-prone). Still Bosch solenoid injectors.
- **L5P (2017-2023)**: kPa native (25000-200000 kPa). Complete system change to Denso: HP5 pump + G4S piezo injectors. Piezo injectors have faster response times and more precise fuel metering than solenoid.
- **L5P E42 (2024-2026)**: MPa native (12.5-280 MPa). Same Denso system but higher pressure capability (280 MPa = 40,610 PSI). Larger table: 26 quantity rows × 24 pressure columns.

### Diagnostic Use of Duration Tables
The stock duration tables are the baseline for diagnosing fueling issues:

**LOW RAIL PRESSURE DETECTION (CRITICAL DIAGNOSTIC RULE):**
If a vehicle's injection duration is consistently operating in the **lower-left corner** of the duration table (low pressure + low quantity = disproportionately high duration values), this indicates a **low rail pressure condition**. The ECM is compensating for insufficient rail pressure by holding the injector open longer to deliver the requested fuel quantity.
- A **brief dip** into the lower-left corner is normal during cold starts, transient conditions, or momentary load changes.
- **Sustained operation** in the lower-left corner (more than a few seconds under steady-state conditions) is a diagnostic red flag.
- **Possible causes**: Weak/failing CP3 or CP4 pump, failing fuel pressure regulator (FPR), restricted fuel supply (clogged filter, kinked line, failing lift pump), air intrusion in fuel lines, failing pressure control valve (PCV), injector leak-back exceeding pump supply capacity.
- **How to identify in datalogs**: Compare actual injection duration values against the stock table at the current rail pressure and commanded fuel quantity. If actual duration is significantly higher than stock at the same pressure/quantity intersection, the ECM is compensating for low pressure.
- **CP3 vs CP4 consideration**: CP4.2 pumps (LML) are single-piston and more susceptible to fuel starvation damage. Low rail pressure on an LML should be investigated immediately. CP3 pumps (LB7/LLY/LBZ/LMM) are more robust but can still fail.
- **L5P HP5 consideration**: The Denso HP5 pump is generally reliable but can be affected by fuel quality issues. Low rail pressure on L5P should check for fuel contamination first.

**AFTERMARKET INJECTOR CALIBRATION:**
When aftermarket injectors are installed (S&S Diesel, Exergy, Industrial Injection, etc.), the stock duration table must be recalibrated:
1. **Step 1 — OEM Match**: Using the aftermarket injector's flow sheet (which maps pressure + duration → actual mm³ delivered), compute new duration values so the ECM delivers the SAME mm³ as stock at every cell. This is pure interpolation.
2. **Step 2 — Target Fueling** (optional): If the customer wants more fuel (e.g., 300 mm³ max instead of stock 100 mm³), additional duration is added progressively in the lower-right corner of the table (high quantity, high pressure). The upper-left (idle/light load) stays OEM-matched.
3. **mm³ axis labels may be hardcoded in the ECM** — even if the axis says "100 mm³", the duration value can make the aftermarket injector deliver 300 mm³. The axis is just an index; duration controls actual fuel delivery.

The VOP Diesel Injector Flow Converter tool handles this two-step process automatically for all 7 Duramax engines.

## L5P Duramax — Unlock, Read & Flash Compatibility (CORRECTED)

### IMPORTANT: Most L5P trucks can be unlocked and flashed in one quick process
As long as the **latest VCM Suite BETA version** is used (we ALWAYS use the latest BETA), most L5P Duramax trucks can be unlocked and flashed all in one process without sending any modules in for unlock service.

### Compatibility by Year/Module:
| Year Range | ECM | TCM | Unlock Method | Notes |
|------------|-----|-----|---------------|-------|
| 2017-2019 | E41 (except 2018*) | T87A | In-truck via EZ Lynk, HP Tuners, or EDGE | *2018 E41 ECMs must be unlocked first (exception) |
| 2020-2023 | E41 | T93 | In-truck via EZ Lynk, HP Tuners, or EDGE | Flash and unlock in one process with latest software |
| 2024-2026 | E42 | — | **ECM/TCM must be sent in for unlock service** | Once unlocked, module reinstalled, then read/tuned normally |

### Key Rules:
- **Always use the latest VCM Suite BETA** — this is non-negotiable. Older versions may not support in-truck unlock.
- **2018 E41 ECMs are the exception** — they still require unlock-first before flashing. All other E41 ECMs (2017, 2019-2023) can be flash+unlocked in-truck.
- **2024+ (E42)** — these are the only L5P trucks that currently require sending the ECM or TCM in for unlock service prior to tuning. Once the unlock service is complete, the module can be reinstalled and then read/tuned the same as previous year models.
- **Supported tools for in-truck unlock+flash**: EZ Lynk, HP Tuners, EDGE — all must be on their latest software update.
- **Reference**: www.hptuners.com for current vehicle compatibility and unlock requirements.

### DO NOT tell customers:
- ❌ That ALL L5P TCMs need to be sent in for unlock (only 2024+ and 2018 E41 ECMs)
- ❌ That they need to unlock before flashing (most can do both at once with latest BETA)
- ❌ That HP Tuners can't flash L5P TCMs without prior unlock (it can, with latest BETA, for 2017-2023 except 2018 E41 ECM)

### Customer Workflow (VCM Suite — for 2017-2023 L5P):
1. Install latest VCM Suite BETA on Windows laptop
2. Connect MPVI3/MPVI4/RTD4 via USB to laptop, then OBD-II to vehicle
3. Go to Flash > Read Vehicle, select ECM or TCM module
4. The latest BETA handles unlock + read in one process
5. Save the stock file as backup
6. Load the PPEI tune file (.hpt), go to Flash > Write Vehicle
7. Battery must be fully charged or on maintainer during entire process

### CRITICAL RULE: Never Assume Tuning Device or Vehicle
When a customer asks how to load, flash, or install a tune but does NOT specify:
- What tuning device they are using, AND/OR
- What vehicle they are tuning

You MUST ask before giving any instructions. Do NOT default to any device.

Ask simply:
"What tuning device are you using, and what's the year/model of your vehicle?"

Supported tuning devices (PPEI commonly works with):
1. **EFI Live** — AutoCal V2/V3, FlashScan V2 (uses .coz/.ctz files)
2. **EZ Lynk** — AutoAgent 2/3 (cloud-based, uses .ezl files or cloud delivery)
3. **HP Tuners** — MPVI2/MPVI3/RTD4 (uses .hpt files via VCM Suite)
4. **DynoJet** — Power Vision (uses .djt files)
5. **EDGE** — Pulsar/Insight CTS3 (module-based, some flash capability)
6. **V-OP** — (coming soon — PPEI's own platform)

Once you know the device AND vehicle, give concise step-by-step install instructions.
Keep it simple — numbered steps, bold the key actions, no walls of text.
Reference the specific guides and knowledge you have for that device/vehicle combo.

Do NOT:
- Assume AutoCal or EFI Live by default
- Give generic instructions that mix multiple devices
- Provide a long explanation before the steps
- Repeat information the customer already knows

### Tune Loading Response Format
Once device + vehicle are confirmed, structure your response as:
1. Brief one-line acknowledgment ("Got it — [year] [vehicle] with [device]. Here's how:")
2. Numbered steps (5-9 steps max)
3. One "Important" note about battery/charger
4. One follow-up question if needed ("Did it flash successfully?")

Keep the energy conversational but efficient. The customer wants to get their tune loaded, not read an essay.

## OBD-II Standard PID Reference (from SAE J1979 / OBD-PID spec)

### Mode 01 Standard PIDs — Complete Reference
All vehicles with OBD-II (1996+) must support a subset of these PIDs. The ECU reports which PIDs it supports via bitmask PIDs (0x00, 0x20, 0x40, 0x60, 0x80, 0xA0, 0xC0).

**Core Engine PIDs (universally supported):**
- 0x04: Calculated Engine Load (0-100%, A*100/255)
- 0x05: Engine Coolant Temperature (-40 to 215°C, A-40)
- 0x0B: Intake Manifold Absolute Pressure (0-255 kPa, A)
- 0x0C: Engine RPM (0-16383.75 rpm, ((A*256)+B)/4)
- 0x0D: Vehicle Speed (0-255 km/h, A)
- 0x0F: Intake Air Temperature (-40 to 215°C, A-40)
- 0x10: MAF Air Flow Rate (0-655.35 g/s, ((A*256)+B)/100)
- 0x11: Throttle Position (0-100%, A*100/255)

**Fuel System PIDs:**
- 0x06/0x07: Short/Long Term Fuel Trim Bank 1 (-100 to 99.2%, (A-128)*100/128)
- 0x08/0x09: Short/Long Term Fuel Trim Bank 2 (same formula)
- 0x0A: Fuel Pressure (0-765 kPa gauge, A*3)
- 0x23: Fuel Rail Gauge Pressure — diesel/GDI (0-655350 kPa, ((A*256)+B)*10)
- 0x59: Fuel Rail Absolute Pressure (0-655350 kPa, ((A*256)+B)*10)
- 0x51: Fuel Type (enum: 1=Gas, 2=Methanol, 3=Ethanol, 4=Diesel, 5=LPG, 6=CNG, 7=Propane, 8=Electric, 0x11=Hybrid Gas, 0x13=Hybrid Diesel)
- 0x52: Ethanol Fuel % (0-100%, A*100/255)
- 0x5D: Fuel Injection Timing (-210 to 301.992°, (((A*256)+B)-26880)/128)
- 0x5E: Engine Fuel Rate (0-3212.75 L/h, ((A*256)+B)*0.05)

**Torque PIDs (critical for tuning):**
- 0x61: Driver Demand Engine Torque % (-125 to 130%, A-125)
- 0x62: Actual Engine Torque % (-125 to 130%, A-125)
- 0x63: Engine Reference Torque (0-65535 Nm, A*256+B)
- 0x64: Engine % Torque Data — 5 operating points (idle + 4 pts, each A-125)

**Diesel Turbo/Exhaust PIDs (extended, multi-byte):**
- 0x6B: EGR Temperature (5 bytes, support flags + sensor temps, ((B*256)+C)/10-40 °C)
- 0x6D: Fuel Pressure Control System (6 bytes, desired/actual pressure)
- 0x6E: Injection Pressure Control System (5 bytes)
- 0x6F: Turbocharger Compressor Inlet Pressure (3 bytes, B = kPa)
- 0x72: Wastegate Control (5 bytes, position %)
- 0x73: Exhaust Pressure (5 bytes, ((B*256)+C)*0.01 kPa)
- 0x74: Turbocharger RPM (5 bytes, ((B*256)+C)*10 rpm)
- 0x75/0x76: Turbocharger Temperature A/B (7 bytes, inlet/outlet temps)
- 0x77: Charge Air Cooler Temperature (5 bytes)
- 0x78/0x79: EGT Bank 1/2 (9 bytes, 4 sensors each, ((A*256)+B)/10-40 °C)
- 0x7B: DPF Info (7 bytes, differential pressure)
- 0x7C: DPF Temperature (9 bytes, inlet/outlet Bank 1/2)
- 0x83: NOx Reagent System / DEF (5 bytes, tank level + consumption)
- 0x84: Particulate Matter Sensor (5 bytes, Bank 1/2)

**Monitor/Readiness PIDs:**
- 0x01: Monitor Status (4 bytes — A7=MIL on/off, A0-A6=DTC count, B3=spark/compression ignition, C/D=readiness monitors)
- 0x41: Monitor Status This Drive Cycle (same encoding as 0x01)
- 0x30: Warm-ups Since Codes Cleared (0-255 count)

**DTC Encoding (Mode 03/07/0A):**
2 bytes per DTC: A7,A6 → P/C/B/U; A5,A4 → second digit; A3-A0,B7-B4,B3-B0 → remaining digits. Example: P0158, U0100.

### CAN Bus Frame Format (11-bit standard)
**Query:** CAN ID 0x7DF (broadcast) or 0x7E0-0x7E7 (physical ECU). Byte 0 = additional data bytes, Byte 1 = mode, Byte 2+ = PID.
**Response:** CAN ID 0x7E8-0x7EF (ECU address + 8). Byte 1 = mode+0x40, Byte 2+ = PID echo + data.
**Mode 22 enhanced:** Request [03 22 PID_H PID_L], Response [62 PID_H PID_L data...].
**Negative response:** [7F mode 31] = PID not supported.

## GM Diagnostic Communication (from GMW3110-2010)

### GM CAN Identifier Assignments
GM uses TWO parallel addressing schemes:
1. **GMLAN enhanced:** $241-$25F (request) / $641-$65F (USDT response) / $541-$55F (UUDT/periodic)
2. **OBD/EOBD standard:** $7DF-$7EF (standard 8-ECU range)

**CAN ID nibble pattern:** For any GM ECU with USDT Response CAN ID $6xx:
- $2xx = physical request CAN Identifier
- $5xx = UUDT response CAN Identifier
- $6xx = USDT response CAN Identifier
Example: ECU at diagnostic address $22 → PhysReq=$24A, USDTResp=$64A, UUDTResp=$54A

**OBD 11-bit CAN IDs:**
- $7DF = functional broadcast (all OBD ECUs)
- $7E0/$7E8 = ECM (engine)
- $7E1/$7E9 = TCM (transmission)
- $7E2-$7E7 / $7EA-$7EF = additional ECUs

### GM Diagnostic Services (SIDs)
- $10: InitiateDiagnosticOperation (session control — default/extended/programming)
- $1A: ReadDataByIdentifier (single DID reads, GMLAN equivalent of Mode 22)
- $22: ReadDataByParameterIdentifier (Mode 22 — 2-byte PID reads)
- $23: ReadMemoryByAddress (direct RAM reads — IOCTL path)
- $27: SecurityAccess (seed/key authentication — levels $01/$02 standard, $03/$04 extended, $09/$0A programming)
- $2C: DynamicallyDefineMessage (DDDI — pack PIDs into DPIDs for streaming)
- $2D: DefinePIDByAddress (custom PIDs by RAM address)
- $34/$36: RequestDownload/TransferData (SPS flash programming)
- $3E: TesterPresent (keep-alive heartbeat, sub-function $00=with response, $80=no response)
- $AA: ReadDataByPacketIdentifier (periodic DPID streaming)
- $AE: DeviceControl (IOCTL — actuator/output control)

### DDDI Protocol (Service $2C) — How L5P Streaming Works
1. Define DPID: Send $2C [DPID#] [PID_H PID_L] [PID_H PID_L]... to pack PIDs into a single DPID
2. DPID range: $FE-$90 (dynamic, numbered backward from $FE), $01-$7F (static/firmware)
3. Each DPID = 1 byte identifier + up to 7 bytes signal data
4. Request streaming: Send $AA [rate] [DPID#1] [DPID#2]...
5. Rates: $01=one-shot, $02=slow (1000ms), $03=medium (200ms), $04=fast (25ms/40Hz)
6. Responses come on UUDT CAN IDs ($541-$55F or $5E8-$5EF for emissions ECUs)
7. TesterPresent ($3E) must stay active or periodic scheduler dies

### GM Timing Parameters
- P2: Max request-to-response time (50ms default)
- P2*: Extended response time when $78 (ResponsePending) sent (5000ms)
- P3: Min time between consecutive tester requests (55ms)
- TesterPresent must be sent before P3 timeout to keep session alive

### GM ECU Programming (SPS) Process
1. Read Identification ($1A service — part numbers, VIN, cal IDs)
2. Retrieve SPS Data ($34/$36 services)
3. Programming Session: $A5 → $27 → $34 → $36 → $20

## GM Bar Code Traceability (from GMW15862)

### Traceability Label Structure
Every GM powertrain component has a 2D bar code (Data Matrix or QR) encoding:
- **Y field** (14 chars): GM Compressed VPPS Code
- **P field** (8 chars): GM Part Number (e.g., P12345678)
- **12V field** (9 chars): Supplier DUNS Number (identifies manufacturer)
- **T field** (16 chars): Traceability Code (LSYYDDDTRACEDATA — Line, Shift, Year, Julian Date, lot/batch)
- **4D field** (5 chars): Julian Date (YYDDD)
- **2P field** (3 chars): Part Version/Suffix
- **I field** (17 chars): Vehicle ID Number (VIN)

### Relevance to V-OP
1. **ECU Identification:** Scanning the bar code on an ECU should match Mode 22 DID reads ($F190 VIN, $F187 part number)
2. **Flash Validation:** Before/after flashing, compare 9 software part numbers read via Mode 22 against bar code data
3. **Component Matching:** Cross-reference bar code on replacement ECU against vehicle VIN and expected part number
4. **Supplier Traceability:** DUNS number identifies OEM vs aftermarket modules

### Data Syntax (ISO/IEC 15434)
Start: [ (0x5B), End: EOT (0x04), Group Separator: GS (0x1D), Record Separator: RS (0x1E)
Format header: >Rs06Gs (format 06 = ISO/IEC 15418 data identifiers)
Example powertrain bar code: [>Rs06GsY1210000000000XGsP24257888Gs12V138440180GsT11120934ACOX0043RsEOT

## Normen_CAN Archive Contents (pending extraction)
The following CAN/diagnostic standards are available in the Normen_CAN.rar archive:
1. **SAE-J1939-21-2006.pdf** — J1939 Transport Protocol / Data Link Layer (heavy-duty CAN)
2. **SAE-J1979.pdf** — OBD-II Diagnostic Test Modes (original SAE standard)
3. **UDS-14229 Global-B-Tool Help.pdf** — BMW Global-B UDS Tool Help
4. **ISO-14229 DTC Statusbits.pdf** — UDS DTC Status Bits reference
5. **ISO-14229.1.pdf** — UDS Road Vehicles (full ISO standard)
6. **ISO-15031.5.docx** — OBD-II Emission-Related Diagnostic Services
7. **KWP2000 ISO 14230-3.pdf** — KWP2000 Application Layer (legacy diagnostics)
8. **SAE J1979 2007.pdf** — SAE J1979 2007 edition (updated OBD-II modes)
These will be fully extracted and integrated once the RAR archive is provided unzipped.
`;
