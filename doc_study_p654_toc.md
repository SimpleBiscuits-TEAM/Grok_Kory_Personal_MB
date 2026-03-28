# P654 Software Documentation - Table of Contents Analysis
## Document: EDC17 | P_654.1303.030.0 | 2011-05-20 | Bosch/GM
## Total Pages: 10,262 (!!!)

This is the **complete Bosch EDC17 software documentation for the Duramax diesel** (P654 variant = LML/LGH era).
It documents EVERY software module in the ECM with full control logic, calibration parameters, and signal flow.

## Major Sections (from TOC):

### I. [MEDC] Engine Control Devices Software (p.59)

### 1. [ASW] Application Software (p.95)

#### 1.1 Vehicle Functions (p.97)
- **CoVeh** - Vehicle Coordinator (torque, lead torque, speed coordination) p.98-133
- **VehMot** - Vehicle Motion (drag torque calc, motion coordination, speed) p.134-197
  - Includes steering assist pump, propulsion, differential, stability intervention
- **VMD** - Vehicle Motion Demand (brake pedal, accelerator pedal, cruise control) p.198-343
  - Cruise control state machines, longitudinal limiter, adaptive cruise
  - **Wheel Slip SetPoint** and reduced engine speed for wheel slip p.344
- **PT** - Powertrain (p.348)
  - **Drive train clutch curve** p.371
  - **Powertrain Coordinator** (set point torque, lead torque, speed, thermal, loss, operating point) p.374-470
  - **Powertrain Order Distributor** (task distribution - set point, lead, speed, compensation) p.401-406
  - **Powertrain Stability Intervention** p.408
  - **Gearbox** (type info, gear info, torque loss, grip detection, torque reduction, protection, engine speed interface, additions) p.408-442
  - **Power Take-Off** (converter grip states, torque load calc, torque reserve, torque ratio) p.447-470
- **ESS** - Electrical Supply System (p.488)
  - Battery, alternator demand
- **BdInt** - Body and Interior (p.505) - airbag post-collision
- **TS** - Thermal System (p.510)
  - Thermal coordinator, cabin thermal management, A/C, water heater, engine thermal management
  - **Electrical Thermostat** diagnosis and control p.581-611
  - **Engine Fans** control p.612-659
- **GlbDa** - Global Data (set data, total distance, torque demand) p.661-676

#### 1.2 Engine (p.677)
- **CoEng** - Coordinator Engine (shut-off, start engine calc, start control, engine related requirements) p.679-693
- **CoEOM** - Operating Mode (mode co-ordination, switchover, config, time-sync, angle-sync, ramp calc, library, axis points) p.694-728
- **CoTemp** - Temperature Coordinator (air/coolant setpoint calcs) p.730-732
- **ETS** - Engine Torque Structure (p.734)
  - **Minimum limiting torque** p.738
  - **Engine torque coordination** p.745
  - **Engine Demand / Limiting torque** p.753
  - **Engine Protection** (overspeed, mechanics, over-heating, torque limitation, flywheel shutoff) p.760-784
  - **Turbo (VNT) Protection due to Low Oil Pressure** p.785
  - **Engine Request** (smoke limit, injector limiting, full load increase, torque requirements) p.789-797
  - **Active Surge Damper** (disturbance controller, reference filter, governor) p.798-827
  - **Engine Torque Structure Path** p.829
  - **Path Lead / Path Set** (engine torque calc, over-run coordination) p.830-841
  - **Speed Governor** (torque and engine-speed interface) p.845
  - **Engine-Interval-Speed Governor** (select parameter, governor core) p.857-870

## Key Takeaways for Our Tool:
1. **Complete torque path documentation** - We can trace exactly how driver demand becomes injector pulsewidth
2. **Engine protection logic** - Overspeed, overheating, turbo protection thresholds are all documented
3. **Gearbox/converter interaction** - Full torque converter model with grip states, load calc, torque reserve
4. **Active Surge Damper** - The anti-surge control logic (important for tuning)
5. **Speed governor** - How the ECM limits speed and RPM
6. **Thermal management** - Complete cooling system control logic
7. **Operating modes** - How the ECM switches between combustion modes (normal, regen, etc.)

## Still need to examine (pages 870-10262):
- Fuel injection system (rail pressure, injector control, pilot/main/post injection)
- Air system (turbo/VGT control, EGR, intake throttle)
- Exhaust aftertreatment (DPF, SCR, DEF dosing, NOx sensors)
- Diagnostic system (OBD monitors, DTC logic, freeze frames)
- Communication (CAN, UDS, security access)
