# OBDLink Log Format Analysis

## File: Log009_(2024_2GC4YREY5R1194989_STANDARD_25_Hz_1.10.0).csv

## 4-Row Header Structure:
- Row 0: Full PID names (e.g., "Engine RPM", "Vehicle Speed", "Fuel Rail Pressure")
- Row 1: Hex PID codes (e.g., "0x0003", "0x000D", "0x0145")
- Row 2: Short names (e.g., "RPM", "SPEED", "FRP")
- Row 3: Units (e.g., "S", "MPH", "PSIA", "°F", "%")
- Row 4+: Data rows

## Detection Pattern:
- First column is "TIME" (not "Offset")
- Row 1 starts with hex codes like "0x0101,0x0003,..."
- Row 2 has short names like "TIME,RPM,SPEED,..."
- Row 3 has units like "S,,MPH,PSIA,..."

## Key PIDs in this log (80 columns):
TIME, Engine RPM, Vehicle Speed, Ambient Air Pressure, Ambient Air Temp,
Engine Coolant Temp, Engine Oil Temp, Fuel Tank Level, Injection Timing Advance,
Calculated Engine Load, Mass Air Flow, ECU Battery Voltage, Air Fuel Ratio Commanded,
DPF Delta Press, Fuel Flow Rate, Throttle Commanded, Throttle Position,
Turbo Vane Command, Turbo Vane Position, Lift Pump Fuel Pressure,
Catalyst Temp Bank 1 Sensor 1, Catalyst Temp Bank 1 Sensor 2,
Absolute Engine Load, Backlight Percentage, Accelerator Pedal D, Accelerator Pedal E,
Torque % Commanded, Torque % Actual, Engine Reference Torque,
IAT Bank 1 Sensor 1/2/3, EGR Temp Bank1 Sensor 1/2,
FRP Commanded, Fuel Rail Pressure, Fuel Rail Temp A,
MAP Commanded, Manifold Pressure A, CAC Temp Bank 1 Sensor 1/2,
Exh Temp Bank 1 Sensor 1-5, DPF Outlet Press Bank 1,
Manifold Absolute Pressure A, Engine Friction % Torque, B-Bus Battery Voltage,
Engine Exhaust Flow Rate, Cylinder Fuel Rate, Current Date, Current Time,
Dpf Regen Status, DTC Status, Engine Run Time,
NOX Bank 1 Sensor 1/2, DPF Regen Trigger, Dist Traveled While MIL Active,
Warmups Since DTCS Cleared, Distance Since DTCS Cleared,
EGR Duty Cycle Commanded/Actual/Error, Total Engine Run Time, Idle Run Time,
AVG DEF Commanded, DEF Fluid Level, DEF Fluid Level Low, SCR Inducement State,
Avg Time Between DPF Regen, Avg Distance Between DPF Regen,
DEF Concentration, DEF Tank Temperature, DEF Tank Level,
NOX Corrected Bank 1 Sensor 1/2, FLAG

## Short Name Mapping Needed:
RPM -> rpm, SPEED -> vehicleSpeed, ECT -> coolantTemp, EOT -> oilTemp,
MAF -> maf (LB/M), FRP -> railPressureActual, FRPCMD -> railPressureDesired,
MAPA -> boost (PSIA), THRT-P -> throttlePosition, VTPOS -> turboVanePosition,
VTCMD -> turboVaneDesired, EGT11-EGT15 -> exhaustGasTemp, TORQUE -> torquePercent,
TRQREF -> maxTorque (FT-LB), BATT -> voltage, LOAD -> load,
CYLR -> fuelQuantity (MG/STROKE), FUELR -> fuelRate (GPH),
REGEN -> dpfRegenStatus, EGRCMD/EGRACT -> egrDutyCycle,
DEFLVL -> defLevel, DPFDP1 -> dpfDeltaPressure

## Units are already imperial (°F, PSIA, MPH, LB/M, GPH, FT-LB)
## Some values are clearly invalid: -1740.6°F for CAT11, -531.7°F for EGT sensors
## 65535 for NOX sensors = not available/saturated
