# Powersports PID Research

## Polaris RZR (from AIM InfoTech document)
Source: https://support.aimshop.com/downloads/stockEcu/utv/polaris/Polaris_RZR_ECU_eng_101.pdf
Protocol: Manufacturer-specific CAN, Delphi 8-pin connector, pins G=CAN Low, H=CAN High
Models: RZR RS1, RZR XP 1000, RZR XP Turbo, RZR PRO

Channels available via "Polaris - RZR" protocol:
- RPM — Engine RPM
- VehicleSpeed — Vehicle speed
- ThrottlePosition — Throttle position sensor
- WaterTemperature — Water/coolant temperature
- IntakeAirTemp — Intake air temperature
- ChargeAirTemp — Charge air temperature (turbo models)
- EPSTemperature — Electronic power steer temperature
- ManifoldAirPressure — Manifold air pressure (MAP)
- BarometricPress — Barometric pressure
- BoostPressure — Boost pressure (turbo models)
- BrakeSwitch — Brake switch status
- Gear — Engaged gear
- EngineLoad — Engine load %
- FuelLevel — Fuel level
- FuelRate — Fuel rate
- FuelEconomy — Fuel economy
- AverageFuelEco — Average fuel economy
- EPSSteeringRate — Electronic power steer rate
- EPSInputForce — EPS input torque
- EPSOutputForce — EPS output torque
- EPSCurrent — EPS current
- EPSAlarm — EPS alarm
- FrontDriveActive — Front wheel drive (AWD) activation
- MIL — Malfunction indicator lamp
- BatteryVoltage — Battery voltage

## CAN-am / BRP (Rotax ECU)
Based on BuDS2 diagnostic software parameters and community RE:
- Engine RPM
- Vehicle Speed (GPS + wheel)
- Throttle Position
- Engine Coolant Temperature (ECT)
- Intake Air Temperature (IAT)
- Manifold Air Pressure (MAP)
- Fuel Pressure
- Oil Temperature
- Oil Pressure
- Battery Voltage
- DESS Key Status (authenticated/not)
- Gear Position
- CVT Belt Temperature (estimated)
- Exhaust Gas Temperature (turbo models)
- Boost Pressure (turbo models)
- Ambient Temperature
- Fuel Level
- Odometer
- Engine Hours

## Sea-Doo / BRP Marine (Rotax 4-TEC)
Based on BuDS2 and community data:
- Engine RPM
- Supercharger Boost Pressure (SC models: 13-19.5 PSI typical)
- Intercooler Temperature
- Exhaust Temperature
- Impeller RPM
- GPS Speed
- Engine Coolant Temperature
- Intake Air Temperature
- Oil Temperature
- Oil Pressure
- Fuel Level
- Battery Voltage
- Ride Plate Position
- Trim Position
- Engine Hours
- Ambient Temperature

## Kawasaki (motorcycle/ATV)
Based on OBD2 diagnostic adapter (6-pin CAN bus connector):
- Engine RPM
- Vehicle Speed
- Throttle Position
- Engine Coolant Temperature
- Intake Air Temperature
- Manifold Air Pressure
- Fuel Injection Duration
- Ignition Timing Advance
- Battery Voltage
- Gear Position
- Lean Angle (motorcycle models)
- Side Stand Switch
- Clutch Switch
- Neutral Switch
- Oil Pressure Switch
- Engine Load

## Polaris RZR V1 Additional Channels (from AIM doc page 5)
- SeatBelt — Seat belt status
- Odometer — Odometer reading
- OdometerTrip1 — Trip 1 odometer

Note: "not all data channels outlined in the ECU template are validated for each manufacture's model or variant; some of the outlined channels are model and year specific, and therefore may not be applicable."

## Polaris RZR V2 Protocol (RS3 models)
Same channels as V1 plus same ordering, supports newer RS3 models.
Channels: RPM, Gear, VehicleSpeed, ThrottlePosition, WaterTemperature, IntakeAirTemp, BrakeSwitch, ChargeAirTemp, EPSTemperature, ManifoldPressure, BarometricPress, BoostPressure, EngineLoad, FuelLevel, FuelRate, FuelEconomy, AverageFuelEco, etc.
