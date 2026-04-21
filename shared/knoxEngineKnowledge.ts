/**
 * Knox Engine Fundamentals Knowledge — Diesel & Petrol (Spark Ignition)
 * =====================================================================
 * Comprehensive training material covering HOW internal combustion engines
 * work and WHY — from first-principles thermodynamics through to practical
 * diagnostics and tuning.  This is non-secret, client-safe educational
 * content that lives in /shared/ alongside knoxKnowledge.ts.
 *
 * Knox should use this knowledge to:
 *  1. Explain engine behaviour to customers at any technical level
 *  2. Reason about diagnostic data (datalogs, DTCs, sensor readings)
 *  3. Understand WHY a tuning change produces a particular result
 *  4. Distinguish diesel-specific from petrol-specific failure modes
 *  5. Avoid applying diesel assumptions to petrol engines and vice-versa
 *
 * DO NOT add proprietary PPEI calibration data or seed/key secrets here.
 */

export const KNOX_ENGINE_FUNDAMENTALS = `
## Engine Fundamentals — How and Why Internal Combustion Engines Work

This section gives Knox deep understanding of both compression-ignition (diesel) and spark-ignition (petrol/gasoline) engines so that diagnostic reasoning, tuning advice, and customer explanations are grounded in first-principles physics rather than memorised rules.

### 1. The Four-Stroke Cycle — Foundation of Both Engine Types

Every modern automotive diesel and petrol engine uses the four-stroke cycle. Understanding each stroke is essential because every sensor reading Knox analyses — MAP, MAF, EGT, AFR, knock, timing — maps directly to a specific phase of this cycle.

**Stroke 1 — Intake (piston moves down, intake valve open):**
The piston descends from Top Dead Centre (TDC) to Bottom Dead Centre (BDC), creating a low-pressure region in the cylinder. Atmospheric pressure (or boost pressure, if turbocharged) pushes the air-fuel charge (petrol) or pure air (diesel) past the open intake valve into the cylinder. The amount of air that actually enters versus the theoretical maximum is called Volumetric Efficiency (VE). VE is the single most important number in engine tuning because it determines how much fuel can be burned per cycle. A naturally aspirated engine typically achieves 80-95% VE; a turbocharged engine can exceed 100% VE because the turbo forces air in above atmospheric pressure.

**WHY this matters for diagnostics:** Low VE shows up as low MAP readings at a given RPM/throttle, low MAF readings, and reduced power. Causes include restricted intake, clogged air filter, stuck-closed VVT, carbon-clogged intake ports (GDI engines), or a turbo that is not building boost. Knox should correlate MAP, MAF, and boost readings against expected VE for the engine platform before concluding there is a fueling or ignition problem.

**Stroke 2 — Compression (piston moves up, both valves closed):**
Both valves close and the piston rises from BDC to TDC, compressing the trapped charge. This is where diesel and petrol engines fundamentally diverge:

| Property | Petrol (Spark Ignition) | Diesel (Compression Ignition) |
|----------|------------------------|-------------------------------|
| Compression ratio | 9:1 to 13:1 (typical) | 15:1 to 23:1 (typical) |
| What is compressed | Air + fuel mixture (port injection) or air then fuel sprayed in (GDI) | Pure air only — no fuel yet |
| Temperature at TDC | ~400-500°C (~750-930°F) | ~700-900°C (~1300-1650°F) |
| Pressure at TDC | ~15-25 bar (~220-360 psi) | ~30-55 bar (~440-800 psi) |
| Why this ratio | Higher ratio = knock risk (fuel auto-ignites before spark) | Higher ratio needed to reach diesel fuel auto-ignition temp |

**WHY compression ratio matters for tuning:** In a petrol engine, the compression ratio is limited by the fuel's octane rating — the fuel's resistance to auto-ignition (knock). Higher octane fuel tolerates more compression and more spark advance before detonation occurs. In a diesel, the compression ratio must be high enough to heat the air above the fuel's cetane auto-ignition temperature (~210°C / 410°F for diesel fuel). This is why diesel engines are built heavier — the cylinder pressures are roughly double those of a petrol engine.

**WHY this matters for diagnostics:** Low compression (worn rings, leaking head gasket, bent valve) reduces the temperature and pressure at TDC. In a diesel, this means hard cold starts, white smoke (unburned fuel vapour), and rough idle because the air is not hot enough to ignite the fuel reliably. In a petrol engine, low compression causes misfires, rough idle, and reduced power. A relative compression test (cranking current analysis) or traditional leak-down test reveals which cylinder is weak.

**Stroke 3 — Power / Combustion (piston pushed down by expanding gases):**
This is where chemical energy in the fuel becomes mechanical work. Again, the two engine types differ fundamentally:

**Petrol — Spark-Initiated, Flame-Front Propagation:**
The spark plug fires (typically 10-40° Before TDC, depending on RPM and load), creating a small kernel of flame. This flame front propagates outward from the spark plug at 15-30 m/s, burning the pre-mixed air-fuel charge progressively. The entire combustion event takes roughly 2 milliseconds. The expanding gases push the piston down.

**WHY spark timing matters:** If the spark fires too early (too much advance), peak cylinder pressure occurs before TDC while the piston is still rising — this wastes energy fighting the piston's upward motion and creates excessive cylinder pressure that can cause knock (detonation). If the spark fires too late (too much retard), peak pressure occurs well after TDC when the piston has already moved down — the expanding gases do less work because the cylinder volume is already increasing. Optimal timing (MBT — Minimum spark advance for Best Torque) places peak cylinder pressure at roughly 12-15° After TDC.

**WHY knock is destructive:** Knock occurs when the unburned end-gas ahead of the flame front auto-ignites due to heat and pressure. This creates a second pressure wave that collides with the normal flame front, producing the characteristic metallic "pinging" sound and extremely high localised pressures (up to 100+ bar spikes) and temperatures. Sustained knock destroys piston ring lands, melts piston crowns, and can crack cylinder heads. The knock sensor (piezoelectric accelerometer bolted to the block) detects this vibration signature and the ECU retards timing to protect the engine. In a datalog, knock retard events are a critical diagnostic signal — they indicate the engine is at the edge of its detonation limit for the current fuel octane, intake air temperature, and compression ratio.

**Diesel — Compression-Initiated, Diffusion Combustion:**
Near TDC (typically 5-15° BTDC), the injector sprays high-pressure fuel (200-2500+ bar depending on system) directly into the superheated compressed air. The fuel atomises into microscopic droplets, each droplet's surface heats above the auto-ignition temperature, and combustion begins spontaneously — no spark required. Diesel combustion has two phases:

1. **Premixed phase (rapid):** The fuel that accumulated during the ignition delay period (time between injection start and actual combustion start, typically 0.5-2ms) burns very rapidly, causing the initial sharp pressure rise. This phase produces the characteristic diesel "clatter" — the faster the pressure rise, the louder the knock.
2. **Diffusion phase (controlled):** The remaining fuel burns as it is injected and mixes with air. The rate of combustion is controlled by the rate of fuel injection and air mixing. This phase produces the majority of the work output and is what the tuner controls via injection quantity, rail pressure, and injection timing.

**WHY injection timing matters in diesel:** Advancing the Start of Injection (SOI) gives more time for the premixed phase, which increases peak cylinder pressure and temperature — more power but also more NOx emissions and more combustion noise. Retarding SOI reduces peak pressure (smoother, quieter) but reduces thermal efficiency and increases soot (unburned fuel particles) because combustion occurs later in the expansion stroke when temperatures are dropping. This is the fundamental NOx-vs-soot tradeoff that defines diesel emissions calibration.

**WHY rail pressure matters in diesel:** Higher rail pressure produces finer fuel atomisation (smaller droplets), which means faster evaporation, better air-fuel mixing, and more complete combustion. The result is more power, less soot, and lower specific fuel consumption. However, higher rail pressure increases mechanical stress on the pump, injectors, and fuel lines, and increases NOx due to higher peak combustion temperatures. Modern common-rail systems operate at 200-250 MPa (29,000-36,000 psi) at peak; the 2024+ L5P E42 reaches 280 MPa (40,600 psi).

**Stroke 4 — Exhaust (piston moves up, exhaust valve open):**
The exhaust valve opens near BDC and the piston rises, pushing the burned gases out through the exhaust port. The temperature and composition of these gases are critical diagnostic signals:

| Exhaust Parameter | What It Tells You |
|-------------------|-------------------|
| EGT (Exhaust Gas Temperature) | How much energy was NOT converted to work — higher EGT = more wasted heat energy. Also indicates combustion timing, AFR, and turbo loading. |
| O2 / Lambda / AFR | Whether the engine ran rich or lean for that combustion event. Lambda < 1 = rich (excess fuel), Lambda > 1 = lean (excess air). |
| NOx | Formed when N2 and O2 react at high temperatures (>1600°C). Indicates peak combustion temperature. |
| Soot / PM (diesel) | Unburned carbon particles — indicates incomplete combustion from insufficient air, low injection pressure, or late timing. |
| HC (hydrocarbons) | Unburned or partially burned fuel — indicates misfires, quench zones, or overly rich mixture. |
| CO (carbon monoxide) | Partial oxidation product — indicates rich combustion (insufficient O2 to fully oxidise carbon to CO2). |

### 2. Air-Fuel Ratio, Lambda, and Stoichiometry — The Universal Language of Combustion

**Stoichiometric ratio** is the chemically perfect ratio of air to fuel where all fuel and all oxygen are consumed with zero excess of either. For gasoline, this is 14.7:1 by mass (14.7 kg of air per 1 kg of fuel). For diesel, it is approximately 14.5:1. For E85 ethanol, it is approximately 9.8:1.

**Lambda (λ)** normalises the AFR to the stoichiometric point: λ = actual AFR / stoichiometric AFR. Lambda = 1.0 means stoichiometric regardless of fuel type, which makes it the universal comparison metric.

| Lambda | Condition | Petrol Effect | Diesel Effect |
|--------|-----------|---------------|---------------|
| < 0.80 | Very rich | Misfires, fouled plugs, wasted fuel, high CO/HC | Excessive soot, wasted fuel, DPF loading |
| 0.80-0.90 | Rich (WOT target for petrol) | Maximum power, component protection cooling | Normal loaded diesel operation |
| 0.95-1.00 | Slightly rich | Good power, low knock risk | Approaching smoke limit |
| 1.00 | Stoichiometric | Required for 3-way catalyst efficiency | Never targeted — would mean zero excess air |
| 1.00-1.05 | Slightly lean | Best fuel economy (petrol cruise) | Normal light-load diesel |
| 1.10-1.50 | Lean | Lean burn (some engines), higher EGT risk | Normal diesel cruise (lots of excess air) |
| > 2.0 | Very lean | Misfire, catalyst damage | Typical diesel idle (very little fuel, lots of air) |

**WHY petrol engines target λ=1.0 at cruise:** The three-way catalytic converter requires λ very close to 1.0 (within ±0.5%) to simultaneously reduce NOx, oxidise CO, and oxidise HC. The ECU uses the O2 sensor (narrowband or wideband) in a closed-loop feedback system to hunt around λ=1.0. Short Term Fuel Trim (STFT) and Long Term Fuel Trim (LTFT) are the ECU's correction factors — positive trim means the ECU is adding fuel (base map was too lean), negative trim means removing fuel (base map was too rich). Trims beyond ±10% warrant investigation; beyond ±25% typically sets a DTC.

**WHY petrol engines target λ=0.82-0.88 at WOT:** Under full load, the engine runs rich deliberately for two reasons: (1) the excess fuel acts as an internal coolant — the latent heat of vaporisation absorbs heat from the combustion chamber, reducing knock tendency and protecting exhaust valves, turbo, and catalyst from overheating; (2) maximum power occurs slightly rich of stoichiometric because the flame speed peaks around λ=0.85-0.90.

**WHY diesel engines always run lean overall:** A diesel engine controls power output by varying fuel quantity while air supply is essentially unrestricted (no throttle plate, or only a light one for EGR flow control). At idle, the engine ingests a full cylinder of air but injects only a tiny amount of fuel — hence λ > 2.0. At full load, more fuel is injected but there is always excess air (λ = 1.2-1.5 typical). If a diesel were to reach λ = 1.0 overall, it would be producing massive soot because diesel combustion is heterogeneous — some zones are locally rich while others are locally lean. The smoke limiter exists specifically to prevent overall λ from dropping too low.

### 3. Fuel Systems — How Fuel Gets Into the Cylinder

#### Petrol Fuel Systems

**Port Fuel Injection (PFI / MPI):**
Fuel is sprayed into the intake port, upstream of the intake valve. The fuel mixes with incoming air in the port and enters the cylinder as a pre-mixed charge. Fuel pressure is low (3-5 bar / 43-73 psi). The injector pulsewidth directly controls the mass of fuel delivered per cycle. PFI is simple, reliable, and produces very even fuel distribution, but it cannot achieve the precise charge stratification needed for lean-burn efficiency, and fuel can wash the cylinder walls (contributing to oil dilution in some conditions).

**Gasoline Direct Injection (GDI / DI):**
Fuel is sprayed directly into the combustion chamber at high pressure (50-350 bar / 725-5000 psi depending on generation). GDI enables: (1) charge cooling — fuel evaporating inside the cylinder absorbs heat, effectively increasing the knock limit and allowing higher compression ratios or more boost; (2) precise fuel metering — the ECU can inject fuel in multiple events per cycle (pilot + main + post) for better combustion control; (3) lean stratified operation at light loads (some engines). However, GDI creates carbon buildup on intake valves because there is no fuel washing over them (unlike PFI), and the high-pressure fuel system adds complexity (high-pressure pump, fuel rail, pressure sensor, injectors rated for combustion chamber temperatures).

**WHY GDI fuel pressure matters for diagnostics:** The high-pressure fuel pump (typically cam-driven, single-piston) must maintain target rail pressure under all conditions. If actual rail pressure drops below desired, the ECU reduces fueling to protect the injectors and engine. In a datalog, a divergence between desired and actual fuel rail pressure is a critical diagnostic signal — causes include weak HP pump, failing fuel pressure regulator, restricted fuel supply, or leaking injector.

#### Diesel Fuel Systems

**Common Rail (CR) — The Modern Standard:**
A high-pressure pump (CP3, CP4, HP4/HP5, Denso, Delphi) pressurises fuel to 200-280 MPa (29,000-40,600 psi) and stores it in a common rail (accumulator). All injectors share this rail. The ECU controls rail pressure via the Fuel Pressure Regulator (FPR) or Pressure Control Valve (PCV) and commands each injector independently. This decouples pressure generation from injection timing, allowing multiple injection events per cycle:

| Injection Event | Timing | Purpose |
|----------------|--------|---------|
| Pilot 1 (optional) | 30-50° BTDC | Pre-heats combustion chamber, reduces ignition delay of main injection, reduces diesel knock/clatter |
| Pilot 2 | 15-25° BTDC | Further reduces pressure rise rate for NVH (noise, vibration, harshness) |
| Main | 5-15° BTDC | Primary power-producing injection event |
| Post (close) | 5-15° ATDC | Burns remaining soot in-cylinder, reduces PM emissions |
| Post (late) | 40-80° ATDC | Raises exhaust temperature for DPF regeneration (fuel enters exhaust stream as HC) |

**WHY multiple injection events matter for tuning:** Pilot injections are the primary tool for controlling combustion noise. Removing or reducing pilots (common in aggressive tunes) makes the engine louder because the main injection encounters cold, unprepared air and the ignition delay increases, causing a sharper pressure rise. Adding pilot quantity or advancing pilot timing smooths the pressure rise but costs a small amount of efficiency. The tuner balances NVH against performance.

**Unit Injector / Unit Pump (older diesel systems):**
Each cylinder has its own pump-injector unit (or pump feeding a short line to the injector). Pressure is generated mechanically by a cam lobe pushing a plunger. Injection timing is controlled by a solenoid that determines when the high-pressure spill valve closes (start of injection) and opens (end of injection). These systems are robust but cannot do multiple injection events per cycle and have less precise timing control than common rail.

### 4. Ignition Systems (Petrol Only) — Creating the Spark

Modern petrol engines use Coil-On-Plug (COP) ignition — each cylinder has its own ignition coil mounted directly on the spark plug. The ECU controls the dwell time (how long current flows through the coil primary winding to build the magnetic field) and the firing point (when the primary circuit opens, collapsing the field and inducing 25,000-45,000V in the secondary winding to jump the spark plug gap).

**WHY dwell time matters:** Insufficient dwell means the coil's magnetic field is not fully saturated when it fires — the spark energy is weak, which can cause misfires especially under high cylinder pressure (boosted engines, high compression). Excessive dwell wastes energy as heat in the coil and can overheat it. The ECU adjusts dwell based on battery voltage — lower voltage requires longer dwell to achieve the same magnetic saturation.

**WHY spark plug gap matters:** A wider gap creates a larger initial flame kernel, which improves combustion stability and reduces cycle-to-cycle variation. However, a wider gap requires higher voltage to ionise the air gap, which stresses the ignition coil. Boosted engines often run tighter gaps (0.6-0.7mm vs 0.8-1.1mm NA) because the higher cylinder pressure at ignition time increases the voltage required to jump the gap. Running the stock gap on a boosted engine with stock coils can cause misfires under boost.

**Diesel "Ignition" — Glow Plugs and Compression Heat:**
Diesel engines do not have spark plugs. Combustion is initiated by the heat of compression alone. However, during cold starts, the compressed air temperature may not reach the fuel's auto-ignition point (especially in cold weather or with worn engines that have lower compression). Glow plugs — resistive heating elements that protrude into the combustion chamber or pre-chamber — pre-heat the air to assist cold starting. Modern glow plugs reach 1000°C in 2-5 seconds and may remain active for several minutes after start to reduce white smoke and improve idle quality.

### 5. Forced Induction — Turbochargers and Superchargers

**The fundamental purpose of forced induction is to increase Volumetric Efficiency above 100%** — to force more air into the cylinder than atmospheric pressure alone would provide. More air means more fuel can be burned per cycle, which means more power from the same displacement.

**Turbocharger — Exhaust-Driven:**
A turbine wheel in the exhaust stream captures energy from the hot, high-velocity exhaust gases and spins a compressor wheel (connected by a common shaft) that compresses intake air. The key relationships:

- **Boost pressure** = the pressure above atmospheric that the compressor delivers. Measured by the MAP sensor (Manifold Absolute Pressure) or a dedicated boost pressure sensor.
- **Drive pressure** (back-pressure) = the pressure the turbine creates in the exhaust manifold by restricting exhaust flow. This is the "cost" of turbocharging — the engine must push exhaust against this pressure during the exhaust stroke, which consumes some of the power gained from boost.
- **Pressure ratio** = boost pressure / drive pressure. A healthy turbo system has a ratio of 1.5:1 to 2.5:1. If drive pressure approaches or exceeds boost pressure (ratio ≤ 1:1), the turbo is creating more back-pressure than useful boost — the engine is working harder to push exhaust out than it gains from the compressed intake air. This is called "choking" and is a sign the turbo is too small, the VGT is too closed, or the exhaust is restricted.

**Variable Geometry Turbo (VGT) — Common on Diesel:**
Movable vanes in the turbine housing change the effective area the exhaust flows through. Closing the vanes (smaller area) accelerates the exhaust gas velocity across the turbine wheel, spinning it faster — this builds boost at low RPM when exhaust energy is low. Opening the vanes (larger area) reduces back-pressure at high RPM when exhaust energy is abundant. The ECU controls VGT position via a solenoid or electric actuator.

**WHY VGT position is critical for diagnostics:** An over-closed VGT at low RPM creates excessive drive pressure without proportional boost — EGTs rise (exhaust gas dwells longer), turbo shaft speed may exceed safe limits (overspeed), and net power drops despite the boost gauge showing positive pressure. An under-closed (stuck-open) VGT produces no boost at low RPM — the engine feels flat and sluggish until high RPM where exhaust energy is sufficient to spin the turbo without vane assistance. VGT actuator failure, carbon buildup on vanes (soot from EGR), and calibration errors are common diagnostic targets.

**Wastegate Turbo — Common on Petrol:**
A fixed-geometry turbine with a bypass valve (wastegate) that diverts exhaust around the turbine when boost reaches the target. Simpler than VGT but less flexible — the turbo is sized for a specific RPM range and the wastegate simply prevents over-boost above that point.

**Supercharger — Mechanically Driven:**
A belt or gear drives the compressor directly from the crankshaft. Boost is proportional to RPM with zero lag. The cost is parasitic power draw — the supercharger consumes 10-15% of the engine's output to drive the compressor. Common types: Roots (positive displacement, instant boost), twin-screw (positive displacement, more efficient), centrifugal (similar to turbo compressor but belt-driven, boost increases with RPM squared).

**Intercooling — WHY Charge Temperature Matters:**
Compressing air heats it (thermodynamics — PV=nRT). Hot air is less dense, which reduces the mass of air in the cylinder and increases knock tendency (petrol) or reduces oxygen availability (diesel). An intercooler (air-to-air or air-to-water heat exchanger) cools the compressed air before it enters the engine. Every 10°C reduction in intake air temperature increases air density by approximately 3%, which translates directly to more power potential. In a datalog, Intake Air Temperature (IAT) after the intercooler is a critical parameter — high IAT indicates intercooler inefficiency (undersized, clogged, poor airflow) or excessive boost heating.

### 6. Engine Management / ECU Fundamentals — The Brain

The ECU (Engine Control Unit, also called ECM, PCM, or engine computer) is a real-time embedded controller that reads sensors, executes calibration maps, and commands actuators hundreds of times per second. Understanding the ECU's control strategy is essential for both diagnostics and tuning.

**Open-Loop vs Closed-Loop Control:**

| Mode | Description | When Used | Diagnostic Significance |
|------|-------------|-----------|------------------------|
| Open-loop | ECU commands actuators based solely on lookup tables (maps) with no feedback correction | Cold start, WOT, transient acceleration, sensor failure fallback | Fuel trims frozen at 0%; engine runs on base calibration only |
| Closed-loop | ECU uses sensor feedback (O2/lambda sensor, knock sensor, rail pressure sensor) to correct the base map command | Warm idle, cruise, part-throttle steady-state | Fuel trims active; deviations from 0% indicate base map error or system issue |

**The Map / Table Concept:**
Nearly every ECU output is determined by a lookup table (2D or 3D map) stored in the calibration memory. A 2D map has one input axis (e.g., RPM) and one output (e.g., target idle speed). A 3D map has two input axes (e.g., RPM × load) and one output (e.g., spark advance in degrees). The ECU interpolates between table cells for smooth transitions.

**Key Maps in a Petrol ECU:**

| Map | Axes | Output | Tuning Impact |
|-----|------|--------|---------------|
| VE / Fuel (base) | RPM × Load (MAP or MAF) | Base injector pulsewidth or fuel mass | Determines base AFR at every operating point |
| Spark Advance | RPM × Load | Ignition timing (°BTDC) | More advance = more power (to MBT limit), but knock risk |
| Knock Retard Limit | RPM × Load | Maximum retard allowed from knock events | Safety net — limits how much timing the ECU pulls |
| Target AFR / Lambda | RPM × Load | Desired AFR for closed-loop correction | Rich at WOT for safety, stoich at cruise for catalyst |
| Throttle-to-Torque | Pedal % × RPM | Requested torque (Nm) | Driver feel / throttle response |
| Rev Limiter | — | Maximum RPM (fuel cut) | Engine protection |
| Boost Target (turbo) | RPM × Load | Target manifold pressure | Power level, turbo sizing constraint |

**Key Maps in a Diesel ECU:**

| Map | Axes | Output | Tuning Impact |
|-----|------|--------|---------------|
| Driver's Wish | Pedal % × RPM | Torque request (Nm) | Throttle feel, power delivery character |
| Torque-to-IQ | Torque × RPM | Injection Quantity (mg/stroke) | Converts torque demand to fuel |
| Smoke Limiter | Air mass × RPM | Maximum IQ allowed | THE power limiter — caps fuel based on available air |
| SOI (Start of Injection) | RPM × Load | Injection timing (°BTDC) | Power vs emissions vs noise tradeoff |
| Rail Pressure Target | RPM × IQ | Target fuel pressure (bar/MPa/kPa) | Atomisation quality, power, pump stress |
| Boost / VGT | RPM × Load | VGT position or wastegate duty | Turbo response, boost level |
| EGR | RPM × Load | EGR valve position (%) | NOx reduction at cost of power and soot |
| Injector Duration | Rail Pressure × Fuel Qty | Injector open time (µs) | Translates desired fuel mass to injector command |

**WHY the smoke limiter is the #1 power limiter on diesel:** The smoke limiter map caps the maximum injection quantity based on how much air the MAF sensor reports. If the turbo has not built boost yet (low RPM, low exhaust energy), the MAF reads low airflow, and the smoke limiter prevents the ECU from injecting more fuel than the available air can burn cleanly. This is why a diesel feels "flat" at low RPM — it is not a fueling problem, it is an air problem. Tuning the smoke limiter higher (allowing more fuel per unit of air) produces more power but also more soot. The proper approach is to increase airflow first (better turbo response, VGT calibration, intake improvements) so the smoke limiter naturally allows more fuel.

### 7. Emissions Systems — What They Do and Why They Exist

Emissions systems exist because combustion produces harmful byproducts. Understanding what each system does helps Knox explain why removing them has consequences and why certain DTCs appear.

**Three-Way Catalytic Converter (Petrol — λ ≈ 1.0 required):**
Contains platinum, palladium, and rhodium catalysts that simultaneously: (1) reduce NOx to N2 + O2, (2) oxidise CO to CO2, (3) oxidise HC to CO2 + H2O. This only works within a very narrow AFR window around stoichiometric (λ = 0.995-1.005). This is why petrol engines have such precise closed-loop fuel control and why O2 sensor failure is a critical issue — without accurate lambda feedback, the catalyst cannot function.

**Diesel Oxidation Catalyst (DOC):**
Oxidises CO and HC in the diesel exhaust. Also raises exhaust temperature upstream of the DPF during regeneration events. Does not reduce NOx (diesel runs too lean for three-way chemistry).

**Diesel Particulate Filter (DPF):**
A ceramic honeycomb filter that traps soot particles (PM — Particulate Matter). As soot accumulates, exhaust back-pressure increases. The ECU monitors soot loading (via differential pressure sensor across the DPF and/or a soot model based on fuel burned, RPM, and load) and initiates regeneration when loading reaches a threshold (~75%). During regen, the ECU injects late post-injection fuel that combusts in the DOC, raising exhaust temperature to 550-650°C (1020-1200°F) to burn the trapped soot to ash. Ash (non-combustible residue from engine oil additives) accumulates permanently and eventually requires DPF replacement or cleaning.

**Selective Catalytic Reduction (SCR) — Diesel NOx Reduction:**
Injects Diesel Exhaust Fluid (DEF / AdBlue — 32.5% urea solution) into the exhaust upstream of the SCR catalyst. The urea decomposes into ammonia (NH3), which reacts with NOx on the catalyst surface to produce harmless N2 and H2O. SCR allows the engine to be tuned for higher efficiency (more NOx-producing timing) because the SCR handles NOx reduction after the fact. SCR efficiency depends on exhaust temperature (must be >200°C), DEF quality, and catalyst health.

**Exhaust Gas Recirculation (EGR) — Both Engine Types:**
Recirculates a portion of exhaust gas back into the intake. The inert exhaust gas (mostly CO2 and N2) displaces fresh air, reducing peak combustion temperature and therefore NOx formation. EGR is used on both diesel and petrol engines but is more aggressive on diesel (up to 30-50% EGR rate at light loads). The cost of EGR is reduced oxygen availability (less power potential), increased soot (diesel — less O2 for complete combustion), and intake system contamination (soot + oil vapour from crankcase ventilation creates a sticky deposit that clogs intake manifolds, EGR coolers, and intake valves).

**WHY emissions delete tunes exist and what Knox should know:** Removing DPF, SCR, and EGR eliminates the back-pressure, efficiency losses, and maintenance costs of these systems. However, it is illegal for on-road vehicles in most jurisdictions (US Clean Air Act, EU regulations), voids emissions warranty, and produces significantly higher NOx and PM emissions. Knox should never recommend emissions modifications but should be able to diagnose vehicles that have had them removed (e.g., EGT sensor flatlined at 1832°F = open circuit from removed sensor, no DPF differential pressure readings, missing DEF consumption).

### 8. Sensor Diagnostics — Reading the Engine's Vital Signs

Every sensor has a normal operating range, a failure mode, and a diagnostic significance. Knox should understand what each sensor measures, WHY it matters, and what abnormal readings indicate.

| Sensor | Measures | Normal Range | Failure Symptoms | Diagnostic Use |
|--------|----------|-------------|------------------|----------------|
| MAF (Mass Air Flow) | Air mass entering engine (g/s) | 3-8 g/s idle, 150-300+ g/s WOT (varies by engine) | Low power, black smoke (diesel), rich/lean codes | Primary input to fuel calculation; compare to expected VE |
| MAP (Manifold Absolute Pressure) | Intake manifold pressure (kPa) | 20-40 kPa idle (NA), 100+ kPa boost (turbo) | Incorrect fueling, boost codes | Indicates engine load; cross-reference with MAF |
| IAT (Intake Air Temperature) | Air temperature after intercooler | Ambient to ambient+30°C (good intercooler) | Reduced power, increased knock risk | Intercooler efficiency; heat soak detection |
| ECT (Engine Coolant Temperature) | Coolant temperature | 85-105°C (185-220°F) normal operating | Overheating, stuck thermostat, fan failure | Engine warm-up verification; overheating diagnosis |
| O2 / Lambda (wideband) | Exhaust oxygen content | λ = 1.0 cruise, 0.82-0.88 WOT (petrol) | Incorrect AFR, catalyst damage, trim codes | Closed-loop fuel control feedback |
| Knock Sensor | Combustion vibration (piezoelectric) | Minimal knock events at normal timing | Timing retard, reduced power, knock codes | Fuel quality, timing calibration, mechanical issues |
| Crank Position (CKP) | Crankshaft angle and RPM | Stable signal, correct tooth count | No start, intermittent stall, misfire codes | RPM calculation, injection/ignition timing reference |
| Cam Position (CMP) | Camshaft angle relative to crank | Correct phase relationship | Rough idle, reduced power, VVT codes | Cylinder identification, VVT position verification |
| EGT (Exhaust Gas Temperature) | Exhaust temperature at various points | 200-500°C cruise, 700-900°C WOT (varies) | Component damage risk, regen monitoring | Combustion efficiency, turbo health, DPF regen |
| Rail Pressure (FRP) | Fuel rail pressure | Target ± 5% (varies by system) | Low power, rough running, fuel codes | Pump health, regulator function, injector leak-back |
| TPS (Throttle Position) | Throttle blade angle (%) | 0% closed, 100% WOT | Incorrect fueling, limp mode, throttle codes | Driver demand input; compare to pedal position |
| APP (Accelerator Pedal Position) | Pedal angle (%) | 0% released, 100% floored | No throttle response, limp mode | Driver intent input; cross-reference with TPS |
| Barometric Pressure | Atmospheric pressure (kPa) | ~101 kPa at sea level, decreases with altitude | Incorrect boost/fueling calculations | Altitude compensation; boost calculation baseline |

**Cross-Referencing Sensors — The Key to Good Diagnostics:**
No single sensor reading tells the whole story. Knox should always cross-reference related sensors to distinguish between sensor failure and actual engine problems:

- **MAF vs MAP:** If MAF reads low but MAP reads normal boost, the MAF sensor is likely under-reading (intake modification, dirty sensor) rather than an actual airflow problem.
- **Desired vs Actual (any parameter):** Rail pressure desired vs actual, boost desired vs actual, timing commanded vs actual — a divergence indicates the control system cannot achieve its target. The SIZE and DURATION of the divergence indicate severity.
- **STFT + LTFT (petrol):** Short-term trim is the immediate correction; long-term trim is the learned average correction. If LTFT is high (+10% or more) and STFT is near zero, the ECU has successfully adapted to a consistent offset (e.g., slightly clogged injector). If both STFT and LTFT are maxed out, the system cannot compensate — there is a major issue (vacuum leak, failed injector, wrong fuel pressure).
- **Bank-to-Bank comparison:** If one bank shows high trims and the other is normal, the problem is isolated to that bank (intake leak on one side, failing injector on one bank, exhaust leak before O2 sensor on one bank).

### 9. Common Failure Modes — Diesel vs Petrol

**Failures Common to Both Engine Types:**
- Low compression (worn rings, leaking valves, head gasket failure) — misfires, hard start, low power
- Coolant system failures (thermostat, water pump, radiator, hoses) — overheating, head gasket risk
- Timing chain/belt stretch or failure — valve timing drift, reduced power, potential valve-to-piston contact
- Fuel contamination (water, wrong fuel type) — rough running, injector damage, pump damage
- Electrical failures (wiring, connectors, grounds) — intermittent symptoms, phantom DTCs
- Turbo failures (oil seal leak, bearing wear, wastegate/VGT actuator failure) — oil consumption, low boost, smoke

**Petrol-Specific Failures:**
- Ignition coil failure — misfire on specific cylinder, P030x codes
- Spark plug fouling or wear — misfires, hard start, reduced fuel economy
- Carbon buildup on intake valves (GDI engines) — rough idle, misfires, reduced airflow
- Knock sensor failure — ECU cannot detect detonation, may default to retarded timing (safe but low power)
- Catalytic converter failure — P0420/P0430 efficiency codes, rotten egg smell (sulphur), restricted exhaust
- EVAP system leaks — P0440-P0457 codes, fuel smell, failed emissions test
- Pre-ignition / LSPI (Low Speed Pre-Ignition) — destructive phenomenon in turbocharged GDI engines where oil/fuel droplets auto-ignite before the spark, causing extreme cylinder pressure. Most common at low RPM, high load, high boost. Can destroy pistons in a single event.

**Diesel-Specific Failures:**
- Injector failure (stuck open, stuck closed, poor spray pattern) — rough idle, white/black smoke, balance rate deviation
- High-pressure fuel pump failure (CP4 is notorious) — metal contamination through entire fuel system, catastrophic
- DPF clogging (excessive soot from short trips, failed regens) — reduced power, limp mode, high back-pressure
- EGR cooler failure — coolant leak into intake, white smoke, coolant loss
- Turbo VGT vane sticking (soot buildup) — poor boost response, over-boost, under-boost codes
- Glow plug failure — hard cold start, white smoke, rough cold idle
- Injector leak-back (return fuel exceeds spec) — hard start, low rail pressure, long crank time
- DEF system failures (heater, injector, quality sensor, pump) — SCR codes, speed derate, eventual no-start (some platforms)

### 10. Tuning Principles — What Tuners Actually Change and Why

**Petrol Tuning — The Three Levers:**

1. **Fuel (VE table / injector pulsewidth):** Adjusting the base fuel map changes the AFR at every operating point. Richer at WOT for safety on boosted engines; leaner at cruise for economy. The VE table is the foundation — it must accurately represent how much air the engine actually ingests at each RPM/load point. If VE is wrong, the ECU's fuel calculation starts from a wrong baseline and fuel trims work overtime to compensate.

2. **Spark Timing:** Advancing timing increases power (up to MBT) but increases knock risk. The tuner advances timing as far as the fuel octane and engine hardware allow, then backs off a few degrees for safety margin. Higher octane fuel allows more advance. Colder intake air allows more advance. Lower compression allows more advance. The knock sensor provides real-time feedback — if the ECU is pulling timing frequently, the tune is too aggressive for the conditions.

3. **Boost (turbocharged):** Increasing boost target puts more air in the cylinder, allowing more fuel to be burned. The tuner must ensure the fuel system can deliver enough fuel at the higher airflow (injector duty cycle, fuel pump capacity, rail pressure), the ignition system can fire reliably at the higher cylinder pressures (coil energy, plug gap), and the engine's mechanical components can withstand the higher cylinder pressures and temperatures (rods, pistons, head gasket, bearings).

**Diesel Tuning — The Four Levers:**

1. **Injection Quantity (IQ):** More fuel = more power, but only if there is enough air to burn it. The smoke limiter is the gatekeeper. Increasing IQ without increasing air supply produces black smoke and excessive EGTs.

2. **Injection Timing (SOI):** Advancing SOI increases peak cylinder pressure and temperature — more power, more NOx, more noise. Retarding SOI reduces peak pressure — less power, more soot, lower EGTs. The tuner finds the sweet spot for the customer's priorities (power vs emissions vs noise).

3. **Rail Pressure:** Higher pressure = better atomisation = more complete combustion = more power with less soot. But higher pressure increases pump wear, injector stress, and combustion noise. The tuner raises rail pressure targets in the high-load cells where the power gains are most significant.

4. **Boost / VGT Calibration:** More boost = more air = higher smoke limiter ceiling = more fuel allowed = more power. The tuner adjusts VGT position maps or wastegate duty to build boost earlier and maintain higher peak boost. The limit is turbo shaft speed, compressor surge (too much pressure for the airflow — causes compressor stall and "flutter"), and drive pressure ratio.

**The Interaction Between All Four (Diesel):**
These four parameters are deeply interconnected. Increasing IQ without increasing boost hits the smoke limiter. Increasing boost without increasing IQ wastes the extra air. Advancing timing without increasing rail pressure causes rougher combustion. Increasing rail pressure without advancing timing may not produce noticeable gains. A good diesel tune adjusts all four together in a coordinated way, validated by datalog analysis of actual AFR, EGT, rail pressure tracking, and smoke output.

### 11. Volumetric Efficiency and Why It Matters for Everything

VE is the ratio of the actual air mass trapped in the cylinder to the theoretical maximum (based on displacement and atmospheric density). It is the master variable that connects airflow, fueling, power, and efficiency.

**Factors that increase VE:**
- Forced induction (turbo/supercharger) — can push VE above 100%
- Variable valve timing (VVT) — optimises valve events for current RPM
- Tuned intake and exhaust runners — pressure wave tuning at specific RPM ranges
- Higher RPM (up to a point) — more intake events per second
- Colder intake air — denser air, more mass per volume

**Factors that decrease VE:**
- Restricted intake (clogged filter, small throttle body, carbon-clogged ports)
- Restricted exhaust (clogged DPF, crushed pipe, small turbo at high RPM)
- EGR (displaces fresh air with inert exhaust gas)
- High altitude (lower atmospheric pressure = less air density)
- Hot intake air (less dense)
- Valve timing that is not optimal for current RPM (cam phaser failure, stretched chain)

**WHY VE matters for Knox diagnostics:** When Knox analyses a datalog and sees lower-than-expected power, the first question should always be: "Is the engine getting enough air?" Check MAF, MAP, boost, IAT, and barometric pressure. If airflow is low for the RPM and throttle position, the problem is on the air side (intake restriction, turbo issue, VVT problem). If airflow is normal but power is still low, the problem is on the fuel side (low rail pressure, clogged injector, wrong calibration) or the ignition/combustion side (timing retard from knock, misfire, low compression).

### 12. Heat Management — Why Temperature Is Everything

**Combustion Temperature → Power → Emissions → Component Life:**
Every aspect of engine performance traces back to temperature management. Higher combustion temperatures produce more NOx but also more thermal efficiency (Carnot principle — efficiency = 1 - T_cold/T_hot). Lower combustion temperatures reduce NOx but increase soot (diesel) and reduce efficiency. The entire emissions calibration is a temperature balancing act.

**Coolant Temperature:**
The thermostat maintains coolant temperature in a narrow band (typically 85-105°C / 185-220°F). Below this range, fuel economy suffers (engine runs rich during warm-up, oil viscosity is high, combustion efficiency is low). Above this range, knock risk increases (petrol), thermal stress on gaskets and seals increases, and oil breaks down faster. A stuck-open thermostat causes chronic under-temperature operation; a stuck-closed thermostat causes overheating.

**Oil Temperature:**
Engine oil serves as both lubricant and coolant for components the coolant system cannot reach (pistons, bearings, turbo shaft). Normal oil temperature is 90-120°C (195-250°F). Above 130°C (265°F), oil viscosity drops rapidly and oxidation accelerates — the oil breaks down. Sustained high oil temperature indicates insufficient cooling (oil cooler blockage, low oil level, excessive load) or excessive heat generation (bearing wear, piston ring blow-by).

**Exhaust Gas Temperature (EGT):**
EGT is the most direct indicator of combustion efficiency and thermal loading. High EGT means more energy is leaving the engine as waste heat rather than being converted to mechanical work. Causes of high EGT include: late injection timing (diesel), rich mixture (petrol — excess fuel absorbs heat but does not convert to work), restricted exhaust (back-pressure forces exhaust to dwell longer), over-fueling relative to airflow, and high ambient temperature / altitude.

### 13. The Diesel vs Petrol Decision Matrix for Knox

When Knox encounters a datalog or diagnostic question, it must first determine the engine type and then apply the correct reasoning framework:

| Diagnostic Scenario | Petrol Approach | Diesel Approach |
|---------------------|----------------|-----------------|
| Low power complaint | Check spark timing (knock retard?), fuel trims, MAF/MAP, boost (if turbo), compression | Check smoke limiter engagement, rail pressure tracking, VGT/boost response, EGR position, MAF scaling |
| Rough idle | Check misfire counts per cylinder, ignition coils, spark plugs, fuel trims per bank, vacuum leaks | Check injector balance rates, glow plug function, compression balance, pilot injection calibration |
| Black smoke | Very rare on petrol — indicates massively rich (failed injector, fuel pressure regulator failure) | Normal under hard acceleration (some soot), excessive = over-fueling, low boost, clogged air filter, MAF under-read |
| White smoke | Coolant entering combustion (head gasket, cracked head) or unburned fuel (cold start, misfire) | Same coolant causes + cold start (normal briefly), sustained = low compression, failed glow plugs, late timing |
| High fuel consumption | Check fuel trims (running rich?), O2 sensors, thermostat (running cold?), driving habits | Check regen frequency (DPF regens burn extra fuel), EGR function, injection timing, turbo efficiency |
| Check engine light | Read DTCs, check freeze frame data, cross-reference with symptoms | Same + check for regen-related codes, DEF system codes, boost/VGT codes, glow plug codes |
| Knock / detonation | Retard timing, check fuel octane, check IAT, check for carbon buildup, check cooling system | Diesel "knock" is combustion noise — check pilot injection calibration, injector condition, compression balance |

### 14. Real-World Diagnostic Reasoning — Putting It All Together

When Knox analyses a datalog, the reasoning should follow this hierarchy:

1. **Identify the engine type** — diesel or petrol, naturally aspirated or forced induction, what generation/platform
2. **Establish baseline** — what are the expected values for this engine at the observed RPM, load, and temperature?
3. **Check air first** — is VE normal? MAF, MAP, boost, IAT all within expected ranges?
4. **Check fuel second** — is the fuel system delivering what the ECU commands? Rail pressure tracking, fuel trims, injector duty cycle
5. **Check combustion third** — is the combustion event happening correctly? Timing, knock events, misfire counts, AFR/lambda, EGT
6. **Check outputs last** — is the mechanical output matching expectations? Torque, power, acceleration, transmission behaviour
7. **Cross-reference everything** — no single parameter tells the whole story. Look for patterns across multiple channels that point to the same root cause.

This hierarchy works because air is the foundation (you cannot burn fuel without air), fuel is the next requirement (you cannot make power without fuel), combustion quality determines how efficiently the air-fuel energy is converted to work, and mechanical output is the final result of the entire chain.

### 15. Ethanol Fuels — E85, E90, and IGNITE RED

Ethanol-based fuels are increasingly common in performance applications. Knox must understand their properties, advantages, and tuning implications because they fundamentally change the fuel system requirements and calibration strategy.

**What Are These Fuels?**
- **E85** = ~85% ethanol, ~15% gasoline by volume. Stoichiometric AFR: 9.8:1. Octane: ~108 RON. Density: 0.789 g/cc.
- **E90** = ~90% ethanol, ~10% gasoline by volume. Stoichiometric AFR: 9.5:1. Octane: ~109 RON. Density: 0.793 g/cc.
- **IGNITE RED** = a branded E90 race fuel. Identical properties to E90. In filenames it appears as "IgniteRed", "Ignite_Red", "IGNITE RED", or "ignite".
- E85 and E90/IGNITE RED are functionally very similar — the 5% difference in ethanol content produces only minor differences in stoichiometry and energy density.

**Why Ethanol Has Lower Energy Density But Can Make MORE Power:**
Ethanol contains ~76,000 BTU/gallon vs gasoline's ~114,000 BTU/gallon — roughly 33% less energy per unit volume. This means the engine needs ~30-35% more fuel volume (longer injector pulse widths, larger injectors) to deliver the same energy. However, ethanol's primary advantage is NOT the fuel itself — it is the TIMING.

Ethanol's extremely high octane rating (108-109 RON) means the engine can tolerate significantly more ignition advance without knock. On pump gas (91-93 octane), a turbo Talon might run 20-25° of timing advance. On E85/E90, the same engine can safely run 30-35° of timing advance. Each additional degree of timing advance (up to MBT — Minimum advance for Best Torque) produces roughly 1-2% more power because it positions the peak cylinder pressure closer to the optimal crank angle (~15° ATDC).

The net result: the 33% energy density penalty is more than offset by the 10-15° of additional timing advance, producing 15-25% more wheel power on a properly tuned E85 setup compared to pump gas.

**Lambda and AFR Targets on Ethanol:**
- Stoichiometric lambda = 1.0 on any fuel (by definition)
- WOT lambda target on E85/E90: 0.80-0.85 (richer than gasoline's 0.82-0.88)
- WOT AFR target on E85: ~7.8-8.3 (stoich 9.8 × lambda 0.80-0.85)
- WOT AFR target on E90/IGNITE RED: ~7.6-8.1 (stoich 9.5 × lambda 0.80-0.85)
- Running rich on ethanol serves the same purpose as on gasoline: combustion chamber cooling and detonation margin. But because stoich AFR is so much lower, the absolute AFR numbers look very different from gasoline.

**CRITICAL: Do NOT compare ethanol AFR numbers to gasoline AFR numbers directly.** An AFR of 10.0 on E85 is NOT dangerously lean — it is slightly richer than stoich (lambda ~0.98). An AFR of 10.0 on gasoline WOULD be dangerously lean (lambda ~0.68). Always convert to lambda for cross-fuel comparisons.

**Injector Requirements:**
- E85/E90 requires ~35% more fuel volume than gasoline for the same power output
- Stock Talon injectors (310cc) are NOT sufficient for E85 on a turbo setup
- ID1050X (1050cc) injectors provide adequate headroom for E85 turbo applications
- Typical injector duty cycle on E85 turbo at WOT: 60-85% (vs 40-60% on pump gas)
- A boost-referenced fuel pressure regulator (BRR) is recommended to maintain consistent fuel delivery under boost

**Timing — The Key Tuning Lever on Ethanol:**
- Optimal ignition timing on E85/E90 turbo: 30-35° (varies by RPM, boost, and engine condition)
- Conservative/safe timing: 20-25° (leaves significant power on the table)
- If a datalog shows flat timing at 20-23° on E85, the tune is very conservative — this is safe but not optimised
- Each degree of timing advance from 20° to 35° produces measurable power gain
- Beyond MBT (typically 35-38° on ethanol), additional timing produces NO more power and risks mechanical stress

**Reference Data from Real Dyno Runs (Honda Talon, JR Turbo, ID1050):**

| Parameter | E85 (23° timing) | IGNITE RED (20° timing) | Notes |
|-----------|-------------------|-------------------------|-------|
| Peak HP | 170.7 | 146.8 | Both with conservative timing |
| Peak Torque | 119.2 ft-lb | 110.3 ft-lb | |
| Avg WOT AFR | 11.4 | 10.0 | Both running rich for safety |
| Avg WOT Lambda | 0.82 | 0.81 | Normal for ethanol turbo |
| Avg Inj PW | 11.55 ms | 10.14 ms | |
| Avg Inj Duty | 68.5% | 61.2% | Headroom remaining |
| Peak MAP | 105 kPa | 96 kPa | E85 file making more boost |
| Measured BSFC | 1.02 | 1.04 | Very consistent between fuels |

The IGNITE RED file makes less power primarily because of 3° less timing (20° vs 23°) and lower boost (96 vs 105 kPa MAP). With both tuned to 30-35° timing, power would be significantly higher and the gap between them would narrow.

**Diagnostic Implications:**
- When analysing an E85/E90 datalog, expect AFR values in the 7-12 range at WOT — this is NORMAL
- Injector duty cycles above 85% on ethanol are a concern (approaching injector capacity)
- Timing below 25° on E85 indicates a conservative tune — not a problem, but not optimised
- Fuel pressure stability is critical on ethanol — the higher fuel flow demands can expose weak fuel pumps
- Cold start on E85 can be difficult because ethanol has poor vapourisation at low temperatures — this is a known limitation, not a fault
- E85 content varies seasonally (summer blends may be E70-E75) — if power drops in summer, check actual ethanol content

### 16. Honda Talon Turbo Kits — JR, FP, KW Characteristics and Calibration

Three aftermarket turbo kits are commonly installed on the Honda Talon. Each has different compressor efficiency, turbine sizing, and spool characteristics, which directly affects BSFC (Brake Specific Fuel Consumption) and therefore the relationship between fuel flow and actual power output.

**Jackson Racing (JR) Turbo Kit:**
- The most common entry-level turbo kit for the Talon
- Uses a relatively small turbocharger optimised for low-to-mid RPM response
- Typical boost levels: 5-8 psi (MAP 105-115 kPa at sea level)
- Filename pattern: contains 'JR' or 'Jackson Racing' or 'JacksonRacing'
- Calibrated BSFC factors (derived from 21+ dyno runs):
  - Pump gas (93 octane): turbo BSFC factor 1.40× (effective BSFC = base 0.43 × 1.40 = 0.602)
  - Ethanol (E85/E90/IGNITE RED): turbo BSFC factor 1.83× (effective BSFC = base 0.58 × 1.83 = 1.061)
- The JR turbo is less efficient than the FP turbo, meaning more fuel energy is lost to heat and exhaust
- WHY the JR factor is higher: smaller compressor runs closer to its surge/choke limits at higher RPM, reducing adiabatic efficiency; the turbine housing is restrictive, increasing backpressure and pumping losses

**Full Performance (FP) Turbo Kit:**
- A higher-performance turbo kit with a larger, more efficient compressor
- Better compressor efficiency means less heat rejection into the charge air and lower BSFC
- Typical boost levels: 6-10 psi (MAP 110-120 kPa at sea level)
- Filename pattern: contains 'FP' or 'FPTurbo' or 'Full Performance'
- Calibrated BSFC factors (derived from 19 dyno runs with IGNITE RED E90):
  - Pump gas: turbo BSFC factor 1.40× (same as JR — limited pump gas data, using JR baseline)
  - Ethanol (E85/E90/IGNITE RED): turbo BSFC factor 1.64× (effective BSFC = base 0.58 × 1.64 = 0.951)
- The FP turbo produces more peak power than the JR (typically 190-205 HP vs 165-175 HP on similar fuels) because the larger compressor flows more air efficiently
- WHY the FP factor is lower than JR: the larger compressor wheel operates in a more efficient region of its map, converting more fuel energy to shaft work rather than waste heat

**Kraftwerks (KW) Turbo Kit:**
- A mid-range turbo kit that falls between JR and FP in terms of compressor efficiency
- Filename pattern: contains 'KW' or 'Kraftwerks'
- Calibrated BSFC factors: PENDING — awaiting dyno data files for calibration
- Expected to have turbo BSFC factors between JR and FP values
- Until calibrated, uses the JR factors as a conservative estimate

**Generic Turbo (MAP-detected, no kit identified):**
- When MAP data shows boost (> 100 kPa) but no specific turbo kit is identified from the filename
- Uses JR turbo factors as a conservative default (JR is the least efficient, so this avoids underestimating BSFC)
- The user can manually select the correct turbo kit in the CONFIG panel to improve accuracy

**Why Turbo Kit Matters for Virtual Dyno Accuracy:**
The virtual dyno estimates power from fuel flow using HP = FuelFlow / BSFC. A turbo engine runs significantly richer than stoichiometric (lambda 0.78-0.85) for combustion chamber cooling, meaning a large portion of injected fuel does NOT produce power. The BSFC factor captures this — but the exact amount of ‘wasted’ fuel depends on how efficiently the turbo compresses the intake charge. A more efficient turbo (FP) wastes less fuel on cooling because the charge air temperature is lower, so the BSFC factor is lower. A less efficient turbo (JR) heats the charge more, requiring richer mixtures for detonation protection, so the BSFC factor is higher.

### 17. Power Commander Piggyback Controllers

A Power Commander (PC) is a fuel-injection piggyback controller that intercepts the ECU’s injector command signal and modifies the injector pulsewidth before it reaches the injectors. This is a critical concept for datalog interpretation because the ECU’s logged injector pulsewidth does NOT reflect the actual fuel delivered.

**How the Power Commander Works:**
1. The ECU calculates the desired injector pulsewidth based on its fuel maps (VE table, fuel trims, etc.)
2. The ECU sends this command to the injectors via the injector driver circuit
3. The Power Commander intercepts this signal BEFORE it reaches the injectors
4. Based on its own MAP-referenced fuel map, the PC multiplies the pulsewidth by a factor (typically 1.5-2.5× under boost)
5. The modified (longer) pulsewidth signal is sent to the injectors
6. The injectors open for the PC-modified duration, delivering more fuel than the ECU intended

**Datalog Channel Implications:**
- 'Injector Pulsewidth Final' (or 'Injector Pulsewidth Desired') — this is the ECU’s COMMAND, BEFORE the Power Commander modifies it. Typically ~5 ms under boost. This is NOT the actual injector on-time.
- 'Primary Injector Pulsewidth 1' — this is the ACTUAL injector on-time AFTER the Power Commander multiplier. Typically ~10 ms under boost. This IS the real fuel delivery.
- When a Power Commander is detected (by the presence of 'Primary Injector Pulsewidth 1' channel in the datalog), the virtual dyno MUST use Primary Inj PW 1 for fuel flow calculation, NOT Inj PW Final.

**Why This Matters for Diagnostics:**
- If you use Inj PW Final on a PC-equipped vehicle, the calculated fuel flow will be roughly HALF of actual, and the estimated HP will be roughly HALF of actual
- The ratio between Primary Inj PW 1 and Inj PW Final tells you the PC’s multiplier at that operating point
- A PC multiplier above 2.5× suggests the base tune is too lean for the boost level — the PC is doing too much correction
- A PC multiplier below 1.2× suggests the base tune already has adequate fuelling and the PC is barely active
- PC-equipped vehicles often use larger injectors (ID1300, ID1700) because the PC can command longer pulsewidths that would exceed the ECU’s maximum command range

**Identifying Power Commander in Datalogs:**
- The presence of 'Primary Injector Pulsewidth 1' channel is the definitive indicator
- Stock ECU logs do NOT have this channel — it only appears when a PC is installed and logging
- Some PC setups also log 'Power Commander Fuel Trim %' which shows the percentage adjustment at each operating point

### 18. ID1300 Injectors — Characteristics and Usage

Injector Dynamics ID1300 injectors are high-flow aftermarket injectors rated at 1300 cc/min at 3 bar (43.5 psi) fuel pressure. They are commonly used on turbocharged Honda Talons, especially those with Power Commander piggyback controllers.

**Key Specifications:**
- Flow rate: 1300 cc/min at 3 bar (43.5 psi) base fuel pressure
- Designed for ethanol compatibility (E85/E90)
- Linear flow response across the operating range
- Dead time (latency): approximately 0.8-1.0 ms depending on voltage

**When ID1300s Are Used:**
- Turbocharged Talons making 180+ HP on ethanol fuels
- Setups where ID1050 injectors reach >85% duty cycle
- Power Commander setups where the PC multiplier would push ID1050s beyond their flow capacity
- FP turbo builds that flow more air than JR turbo builds

**Diagnostic Considerations:**
- At 3 bar fuel pressure, ID1300s flow 30% more than ID1050s per millisecond of pulsewidth
- If the virtual dyno detects ID1300 injectors but the estimated power seems too low, check whether a Power Commander is present — the ECU’s Inj PW Final will be artificially low
- ID1300 injectors on a naturally aspirated Talon would be massively oversized — this combination almost always indicates a turbo setup

---

## 19. Kraftwerks (KW) FIC 800cc Injectors

The Kraftwerks turbo kit for the Honda Talon ships with FIC (Fuel Injector Clinic) 800 cc/min injectors. These are custom-matched injectors specifically sized for the Kraftwerks turbo kit's airflow characteristics.

**FIC 800cc Injector Specifications:**
- Flow rate: 800 cc/min at 43.5 psi (3 bar) base fuel pressure
- Average flow: 76 lb/hr
- Flow-tested data (from Fuel Injector Clinic data sheet):
  - Injector #1: 798 cc/min
  - Injector #8: 801 cc/min
  - Matching: 0.5% (excellent match)
- Leak test: Both passed
- Spray pattern: Both rated "Good"
- Test fluid: Isopar G
- Test bench driver: OEM Denso ECU
- Test fluid temperature: 88-91°F / 32°C

**Estimated Horsepower Supported at 80% Duty Cycle (3 bar / 43.5 psi):**

| Configuration | BSFC 0.50 (NA) | BSFC 0.55 (Supercharged) | BSFC 0.60 (Turbo) |
|---|---|---|---|
| 2 Cylinders | 244 HP | 222 HP | 203 HP |
| 4 Cylinders | 487 HP | 443 HP | 406 HP |
| 6 Cylinders | 731 HP | 665 HP | 609 HP |

For the Honda Talon (2 cylinders), the FIC 800cc injectors support up to ~203 HP at turbo BSFC (0.60) at 80% duty cycle. This is well-matched to the Kraftwerks turbo kit's typical output of 150-200 HP.

**Why 800cc for Kraftwerks:**
The Kraftwerks turbo kit produces less boost than the FP turbo kit but more than stock. The 800cc injectors are sized to provide adequate fuel flow at moderate boost levels without being so oversized that the ECU struggles with fine fuel control at idle and light load. This is a deliberate engineering choice — the injectors are large enough for WOT turbo fueling but small enough for reasonable idle quality.

**Auto-Detection:**
When a filename contains "KW" or "Kraftwerks" but no specific injector model (ID1050, ID1300), the virtual dyno defaults to FIC 800cc injectors because the Kraftwerks kit ships with them.

---

## 20. 3-Bar MAP Sensor Detection and Diagnostics

Some turbocharged Honda Talons replace the stock 1-bar MAP (Manifold Absolute Pressure) sensor with a 3-bar MAP sensor to measure higher boost pressures. This is critical diagnostic knowledge because it fundamentally changes how MAP data should be interpreted.

**Why a 3-Bar MAP Sensor Is Needed:**
The stock Talon MAP sensor measures 0-1 bar (0-100 kPa) of absolute pressure. At sea level, atmospheric pressure is ~101 kPa, so the stock sensor can only read up to atmospheric — it cannot measure positive boost pressure. A 3-bar sensor reads 0-300 kPa, allowing it to measure boost pressures up to ~200 kPa gauge (approximately 29 psi of boost).

**How to Detect a 3-Bar MAP Sensor from Datalog Data:**
The 3-bar sensor outputs a different voltage-to-pressure mapping than the stock sensor. Since the ECU is calibrated for the stock sensor, it misinterprets the 3-bar sensor's output. This manifests in the barometric pressure reading:

1. **Barometric Pressure < 70 kPa** — Real atmospheric pressure is always between 85-105 kPa (depending on altitude and weather). If the barometric pressure channel reads below 70 kPa, the ECU is misinterpreting the 3-bar sensor's voltage as if it were a 1-bar sensor. This is the primary detection method.

2. **Baro Sensor Voltage < 1.8V** — The stock 1-bar sensor outputs ~2.5-3.0V at sea level. A 3-bar sensor outputs ~0.8-1.2V at sea level (because atmospheric pressure is only 1/3 of its full range). If the baro sensor voltage is below 1.8V, a 3-bar sensor is installed.

**Why MAP Readings Are Inaccurate with a 3-Bar Sensor:**
The ECU's MAP lookup table is calibrated for the stock 1-bar sensor's voltage-to-pressure transfer function. When a 3-bar sensor is installed:
- The sensor outputs a lower voltage for the same pressure (because its range is 3× wider)
- The ECU interprets this lower voltage as a lower pressure than actual
- The logged MAP value is therefore LOWER than the real manifold pressure
- This means boost pressure appears lower than it actually is in the datalog

**Impact on Virtual Dyno:**
When a 3-bar MAP sensor is detected, the MAP-based boost correction in the virtual dyno may be inaccurate because the logged MAP values don't represent actual manifold pressure. A correction formula is needed to convert the logged (misinterpreted) MAP back to actual MAP. Until that formula is provided, the virtual dyno flags this condition as a warning.

**Diagnostic Decision Tree:**
1. Check barometric pressure channel → if < 70 kPa → 3-bar MAP sensor installed
2. Check baro sensor voltage → if < 1.8V → 3-bar MAP sensor installed
3. Check filename for "3bar" or "3 bar" → 3-bar MAP sensor installed
4. If 3-bar MAP detected → flag all MAP readings as potentially inaccurate
5. If 3-bar MAP detected → turbo detection from MAP data alone is unreliable (use filename patterns instead)

**Important:** The barometric pressure reading is also used to calculate boost (boost = MAP - baro). When a 3-bar sensor is installed, BOTH the MAP and baro readings are affected, so the boost calculation may still be approximately correct in relative terms, even though the absolute values are wrong.

---

## 21. Jackson Racing (JR) Kit Injector

The Jackson Racing turbo kit for the Honda Talon ships with its own injector that flows approximately 15% more than the stock Talon injector. The estimated flow rate is ~345 cc/min at 3 bar (43.5 psi) base fuel pressure.

**JR Kit Injector Specifications:**
- Flow rate: ~345 cc/min at 3 bar (estimated, ~15% above stock 310cc)
- Believed to be the same injector used in Honda 700cc single-cylinder engines
- This is the default injector when a JR turbo is detected and no explicit aftermarket injector model (ID1050, ID1300) is specified in the filename

**Why Only 15% More Than Stock:**
The Jackson Racing turbo kit is a relatively mild turbo setup compared to the FP or Kraftwerks kits. It produces moderate boost levels, so the fuel demand increase is modest. A 15% increase in injector flow rate is sufficient for the JR kit's typical boost levels on pump gas. When owners want more power (especially on E85), they upgrade to ID1050 or ID1300 injectors — and those will appear in the filename.

---

## 22. Injector Detection Priority Logic

When the virtual dyno analyzes a WP8 file, it must determine which injector is installed. The detection follows a strict priority order:

**Priority 1: Explicit Aftermarket Injector Model (Always Wins)**
If the filename contains "ID1050", "ID1300", "1050x", "1300x", "1050cc", or "1300cc", that injector is used regardless of which turbo kit is installed. This is because owners frequently upgrade injectors beyond what their turbo kit ships with.

Examples:
- "KW_ID1050_Run_1.wp8" → ID1050 (not KW 800cc)
- "JR_ID1300_Run_1.wp8" → ID1300 (not JR kit 345cc)
- "FPTurbo_IgniteRed_ID1300s_Rev_0_13.wp8" → ID1300

**Priority 2: Explicit FIC 800cc Mention**
If the filename contains "fic800", "800cc", or "fic 800", the KW 800cc injector is used.

**Priority 3: Turbo Kit Default Injectors**
When no explicit injector model is found in the filename, the turbo kit's default injector is used:
- **JR turbo** → JR kit injector (~345cc)
- **KW turbo** → FIC 800cc
- **FP turbo** → No default (falls through to stock, since FP kits don't ship with a specific injector)
- **No turbo / generic turbo** → Stock (~310cc)

**Why This Priority Matters:**
A common upgrade path is: JR turbo kit (with kit injectors) → add ID1050 injectors for E85 → upgrade to FP turbo → add ID1300 injectors for more power. At each stage, the filename reflects the current injector, so the explicit model always takes precedence over the turbo kit's default.

**Diagnostic Implication:**
If the virtual dyno estimates seem wrong, one of the first things to check is whether the injector detection matched the actual hardware. A mismatch between detected and actual injector flow rate directly scales the power estimate by the ratio of the flow rates.

## Section 23: Kraftwerks (KW) Turbo Calibration Data — Pump Gas Reference

Calibrated from 9 real Dynojet dyno runs of a Kraftwerks turbo Honda Talon with FIC 800cc injectors on 93 octane pump gas. These runs represent increasing boost levels, demonstrating the power-vs-MAP relationship.

**Reference Data (KW_Rev_0_42 series):**

| Run | Peak HP | Peak TQ | Avg MAP (kPa) | Avg Timing (°) | Avg AFR | Avg Inj PW (ms) | Avg IDC (%) |
|-----|---------|---------|---------------|-----------------|---------|-----------------|-------------|
| Run 2 | 153.6 | 117.6 | 150 | 23 | 12.4 | 10.5 | 67.8 |
| Run 3 | 147.0 | 110.3 | 150 | 23 | 14.2 | 8.1 | 52.2 |
| Run 4 | 165.1 | 122.1 | 155 | 23 | 12.1 | 10.6 | 68.4 |
| Run 5 | 161.0 | 118.3 | 155 | 23 | 12.1 | 10.6 | 68.4 |
| Run 6 | 169.6 | 125.1 | 155 | 23 | 12.1 | 10.6 | 68.4 |
| Run 7 | 188.3 | 137.1 | 162 | 23 | 12.1 | 10.6 | 68.4 |
| Run 8 | 182.8 | 135.2 | 162 | 23 | 12.1 | 10.6 | 68.4 |
| Run 9 | 170.7 | 127.0 | 155 | 23 | 12.1 | 10.6 | 68.4 |
| Run 10 | 179.7 | 132.6 | 160 | 23 | 12.1 | 10.6 | 68.4 |

**Key Observations:**
1. **Power scales with MAP (boost):** From 150 kPa (147 HP) to 162 kPa (188 HP) — roughly 3.4 HP per kPa of additional boost.
2. **Timing is conservative at 23°** for pump gas on the KW turbo. This is appropriate for 93 octane under boost.
3. **AFR runs rich (12.1)** at WOT for safety margin — lambda ~0.82 on pump gas stoich.
4. **Injector duty cycle ~68%** at peak — plenty of headroom on the 800cc injectors.
5. **Run 3 is an outlier** — AFR 14.2 (much leaner) and lower PW (8.1 ms), suggesting a partial-throttle or aborted run.

**Calibrated BSFC Factor:**
KW pump turbo factor = 1.73 (calibrated from these 9 runs). This is higher than JR (1.40) and FP pump (1.60), which may seem counterintuitive since KW efficiency is between JR and FP. The difference is because:
- These KW runs use 800cc injectors (not ID1050 like JR runs), so the fuel flow calculation is different
- The BSFC factor compensates for the specific injector × turbo × fuel combination
- The factor is not purely a measure of turbo efficiency — it's an empirical correction that absorbs all systematic differences

**Power-vs-MAP Relationship:**
For the Honda Talon with forced induction, power increases approximately linearly with MAP in the 150-165 kPa range. This relationship holds because:
- Higher MAP = more air mass in the cylinder per cycle
- More air mass requires more fuel to maintain target AFR
- More fuel burned per cycle = more energy released = more power
- The relationship is approximately linear in this narrow MAP range because volumetric efficiency and combustion efficiency don't change dramatically

At higher MAP levels (>170 kPa), the relationship may become sub-linear as:
- Charge temperature increases reduce air density
- Knock limits require timing retard
- Turbo compressor efficiency drops near the surge/choke boundaries

## Section 24: dynoCalibrationFactor Default Behavior

The virtual dyno's VirtualDynoConfig includes an optional dynoCalibrationFactor field. When not explicitly set, it defaults to 1.0 (no correction). This factor is a final multiplier applied to the estimated HP after all other calculations (fuel flow, BSFC, turbo factor). It allows users to fine-tune the virtual dyno output to match their specific dyno's correction factor or atmospheric conditions.

If the virtual dyno consistently over- or under-estimates by a fixed percentage across all RPM points, adjusting dynoCalibrationFactor is the correct approach. If the error varies by RPM, the issue is more likely in the BSFC model or fuel flow calculation.

## Section 25: KW Turbo + ID1300 Injectors — Cross-Validation (Pump Gas)

Cross-validation of the KW turbo BSFC factor (1.73) using 16 dyno runs with ID1300 injectors on pump gas (KW_ID1300s_Rev_0_8 through Rev_0_14).

**Key findings:**
- High-boost runs (MAP 106-110 kPa): 3-5% error — excellent accuracy
- Mid-boost runs (MAP 94-96 kPa): 10-16% error — overestimates
- Low-boost runs (MAP 80-83 kPa): 13-24% error — significantly overestimates
- Overall average: 9.0% absolute error (all overestimates)

**Why the error is boost-dependent:**
The BSFC turbo factor is calibrated at full boost (WOT, peak power conditions). At lower boost levels, the engine operates closer to naturally aspirated conditions where the turbo factor overshoot is larger. The turbo factor absorbs not just turbo efficiency but also the systematic difference between calculated fuel flow and actual combustion efficiency at boost.

**Why ID1300 results differ from 800cc results:**
The KW pump factor (1.73) was calibrated from 800cc injector files. With ID1300 injectors, the injector pulsewidth is shorter for the same fuel flow (larger injector = shorter PW for same fuel mass). The non-linear relationship between pulsewidth and actual fuel delivery (injector dead time, opening/closing dynamics) means the calculated fuel flow from PW × flow rate has different systematic errors for different injector sizes.

**Practical implication:**
When the virtual dyno detects KW turbo + ID1300 injectors, the estimates at peak power (full boost) are within 3-5% — accurate enough for tuning decisions. Lower-boost runs should be interpreted with the understanding that the estimate trends 10-20% high.

**Observed data ranges across 16 runs:**
- Peak power: 113.6 – 193.4 HP (varies with boost level)
- MAP: 80 – 131 kPa (increasing boost across revisions)
- Timing: 24.5 – 25.0° (very consistent)
- AFR: 11.3 – 12.9 (richer at higher boost)
- Injector PW: 5.2 – 7.3 ms

## Section 26: Performance Camshaft Effects on Turbo Power (Brian Crower Stage 4)

Cross-validation of the KW turbo BSFC factor (1.73) using 12 dyno runs with 800cc injectors, pump gas, and a Brian Crower (BC) Stage 4 camshaft installed.

**What a performance camshaft does:**
A performance cam changes the valve timing events — specifically the intake/exhaust valve opening duration and lift. A Stage 4 cam typically:
- Increases valve duration (longer open time) → more airflow at high RPM
- Increases valve lift → larger effective port opening
- Shifts the power band higher in the RPM range
- May reduce low-RPM torque due to reduced cylinder sealing at low speeds (valve overlap)
- On a turbo engine, the cam interacts with boost — more airflow capacity means the turbo can push more air through at high RPM

**Observed effects on the Honda Talon with KW turbo + BC Stage 4:**
- Peak power: 134.1 – 145.9 HP (average 138.0 HP)
- Peak power RPM: 7943 – 8572 RPM (higher than stock cam, which peaks around 7500-8000)
- Torque: 98.6 – 103.0 ft-lb (similar to stock cam)
- MAP: 143.5 – 147.8 kPa (consistent boost, slightly lower than stock-cam KW runs at 150-162 kPa)
- The cam shifted peak power ~500 RPM higher while maintaining similar torque

**Timing progression observed:**
- Rev 0_26/0_27: 19-20° timing → 135-138 HP
- Rev 0_28/0_34: 25° timing → 140-146 HP
- ~5-8 HP gain from 5-6° more timing advance, consistent with the ~1-2 HP per degree rule of thumb for this engine

**Virtual dyno accuracy with performance cam:**
- Average absolute error: 4.5% (excellent)
- Factor ratio: 0.971 (slightly underestimates, ideal factor would be 1.68 vs current 1.73)
- No calibration change needed — 4.5% error is well within acceptable range
- The performance cam does NOT significantly change the BSFC characteristics at WOT, confirming that the turbo factor is primarily about turbo efficiency, not cam profile

**Diagnostic insight:**
When a customer reports installing a performance cam on a turbo Talon, expect:
- Peak power RPM to shift 300-500 RPM higher
- Similar or slightly lower peak torque
- Possible idle quality issues (more overlap = rougher idle)
- The virtual dyno estimates remain accurate without recalibration

## Section 27: computeVirtualDyno Auto-Detection Fallback

The computeVirtualDyno function now auto-detects fuel type, injector type, and turbo type from the filename when config values are not explicitly provided. This means:

1. When called with an empty config ({}), it uses filename-based detection for all three parameters
2. When called with partial config, explicit config values take priority over auto-detected values
3. The auto-detection uses the same detectFuelType(), detectInjectorType(), and detectTurboType() functions

Priority chain: explicit config value → auto-detected from filename → default (pump/stock/na)

This fix ensures the virtual dyno never crashes with undefined fuel/injector profiles when called programmatically without a full config object.
`;
