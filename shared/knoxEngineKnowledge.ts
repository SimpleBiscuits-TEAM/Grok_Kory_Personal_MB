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
`;
