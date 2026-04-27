#!/usr/bin/env python3
"""
Decode HPT DID responses from IntelliSpy capture and correlate with HPT channel values.
HPT idle values from the CSV:
  RPM: 600.5
  MAF: 4.099 lb/min
  MAP: -0.145 PSI (gauge)
  APP: 0%
  Turbo B Vane: (empty)
  Turbo A Vane: (empty)
  Desired Turbo Vane: 63.53%
  Cmd Turbo B Vane: (empty)
  Fuel Pressure (SAE): 60.05 PSI
  Fuel Rail Pressure (SAE): 4739.83 PSI
  Cyl 1 Inj Timing: -1°
  Main Fuel Rate: 7 mm³
  Turbo Vane Position: 63.14%
  NOX Sensor 1: 0 ppm
  Inj Pulse Width Cyl 1: 1.308 ms
  Boost/Vacuum: 0.099 PSI
  Fuel Inj Timing (SAE): -1.109°
  NOX Sensor 2: 0 ppm
  TCC Line Pressure: 0 PSI
  MAP A Hi Res: 72.52 PSI (absolute? or kPa?)
  PCS 1 Cmd: 0 PSI
  PCS 2 Cmd: 232.06 PSI
  CAC Temp B2S1: 22.125°F? (seems wrong, probably °C)
  Desired Boost: 14.50 PSI (absolute)
  Desired FRP: 4705.02 PSI
  Trans Current Gear: 0
  CAC Temp B1S1: (empty)
  VSS: 0 MPH
  VPWR: 14.3V
  DPF Outlet Pressure: 100 (units?)
  EGR Pintle: 5%
  EGR Sensor: 20V?
  Inj Pulse Mode: Pilot & Main
  Cmd EGR A-D: (empty)
  DPF Regen %: -4%
  DPF Delta Pressure: (empty)
  DPF Inlet Pressure: (empty)
  IAT: 116.6°F
  ECT: 183.2°F
  Fuel Tank Level: 31.22 gal
  BARO: 14.79 PSI
  Max EQ Ratio: 20
  AAT: 84.2°F
"""

# DID responses from first polling cycle (timestamp ~9685s)
responses = [
    # DID,   raw_bytes,  raw_value
    (0x20AC, [0x05, 0x24], 0x0524),  # 1316
    (0x20AD, [0x04, 0xEA], 0x04EA),  # 1258
    (0x20AE, [0x04, 0xCE], 0x04CE),  # 1230
    (0x20AF, [0x05, 0x1B], 0x051B),  # 1307
    (0x1206, [0x00], 0x00),
    (0x1205, [0x00], 0x00),
    (0x1207, [0x00], 0x00),
    (0x1208, [0x00], 0x00),
    (0x1201, [0x00, 0x00], 0x0000),
    (0x1202, [0x00, 0x00], 0x0000),
    (0x1203, [0x00, 0x00], 0x0000),
    (0x1204, [0x00, 0x00], 0x0000),
    (0x1200, [0x00], 0x00),
    (0x12DA, [0x0F, 0x0B], 0x0F0B),  # 3851
    (0x1152, [0xFF], 0xFF),  # 255
    (0x114B, [0xFF], 0xFF),  # 255
    (0x11A1, [0x31, 0x3D], 0x313D),  # 12605
    (0x1470, [0x00], 0x00),
    (0x1543, [0xA1], 0xA1),  # 161
    (0x1540, [0xA2], 0xA2),  # 162
    (0x2006, [0x5C], 0x5C),  # 92
    (0x2005, [0x59], 0x59),  # 89
    (0x2007, [0xD1], 0xD1),  # 209
    (0x232C, [0x45], 0x45),  # 69
    (0x131F, [0x00, 0x00], 0x0000),
    (0x1155, [0x3D], 0x3D),  # 61
    (0x11C9, [0x4B], 0x4B),  # 75
    (0x2000, [0x41], 0x41),  # 65
    (0x208A, [0x0C, 0x8E], 0x0C8E),  # 3214
    (0x20B4, [0xFF, 0xF6], 0xFFF6),  # 65526 (signed: -10)
    (0x20B5, [0xFF, 0xF6], 0xFFF6),
    (0x20B6, [0xFF, 0xF6], 0xFFF6),
    (0x20B7, [0xFF, 0xF6], 0xFFF6),
    (0x328A, [0x27, 0x10], 0x2710),  # 10000
    (0x32A8, [0xFC], 0xFC),  # 252 (signed: -4)
    (0x32A9, [0x00], 0x00),
    (0x1141, [0x8F], 0x8F),  # 143
    (0x114D, [0x65], 0x65),  # 101
    (0x13C8, [0xB9], 0xB9),  # 185
    (0x12B4, [0x00], 0x00),
    (0x12B5, [0x00], 0x00),
    (0x12BD, [0x30], 0x30),  # 48
    (0x12BC, [0x18], 0x18),  # 24
    (0x1154, [0x7D], 0x7D),  # 125
    (0x116F, [0x73], 0x73),  # 115
    (0x13B5, [0x00, 0x97], 0x0097),  # 151
    (0x130F, [0x06], 0x06),
    (0x2001, [0x00], 0x00),
    (0x1337, [0x8A, 0xCF], 0x8ACF),  # 35535
    (0x115E, [0xC7], 0xC7),  # 199
    (0x115D, [0x95], 0x95),  # 149
    (0x115F, [0x00], 0x00),
    (0x12F5, [0x06, 0x65], 0x0665),  # 1637
    (0x130E, [0x06, 0x65], 0x0665),  # 1637
    (0x1232, [0x21], 0x21),  # 33
    (0x1233, [0xFF], 0xFF),  # 255
    (0x1234, [0x0A, 0x04], 0x0A04),  # 2564
    (0x1235, [0x02, 0x50], 0x0250),  # 592
    (0x1236, [0x02, 0x50], 0x0250),  # 592
]

# Now correlate with HPT values
print("=== DID → HPT Channel Correlation ===\n")

# Known correlations from our existing PIDs:
# 0x1141 = Fuel Tank Level → raw 0x8F = 143, HPT shows 31.22 gal
#   143 * 0.2275 = 32.53 (our formula, close but not exact)
#   143 / 255 * 100 = 56.08% (not matching)
#   Actually HPT shows 31.22 gal. If tank is 36 gal: 31.22/36 = 86.7%
#   143/255 = 56.08% → 56.08% * 36 = 20.2 gal (wrong)
#   143 * 0.2275 = 32.53 gal (close to 31.22)
#   Hmm, maybe 143 * 0.21835 = 31.22? → 31.22/143 = 0.21832
print(f"0x1141 (FUEL_LVL): raw=143, HPT=31.22 gal")
print(f"  143 * 0.2275 = {143 * 0.2275:.2f} (our formula)")
print(f"  31.22 / 143 = {31.22/143:.5f} (exact scale)")
print()

# 0x328A = raw 0x2710 = 10000, HPT "Fuel Rail Pressure (SAE)" = 4739.83 PSI
#   10000 * 0.47398 = 4739.8 → scale = 0.47398
#   Actually: FRP in kPa = 10000 * 3.2661 = 32661 kPa → /6.89476 = 4737.6 PSI (close!)
#   Or: 10000 * 0.0078125 = 78.125 MPa → 78.125 * 145.038 / 10 = ... no
#   10000 / 10 * 6.89476 = 6894.76 (wrong)
#   10000 * 0.4739 = 4739 PSI → direct PSI scale = 0.4739
#   But that's weird. Let me check: 10000 * 0.03125 = 312.5 bar → 312.5 * 14.5038 = 4532 (not quite)
#   10000 * 0.032661 = 326.61 bar → 326.61 * 14.5038 = 4737.6 PSI (very close!)
print(f"0x328A (FRP): raw=10000, HPT=4739.83 PSI")
print(f"  10000 * 0.032661 bar = {10000 * 0.032661:.1f} bar → {10000 * 0.032661 * 14.5038:.1f} PSI")
print(f"  10000 * 0.47398 = {10000 * 0.47398:.1f} PSI (direct)")
print()

# 0x208A = raw 0x0C8E = 3214
# HPT "Fuel Pressure (SAE)" = 60.05 PSI? Or "Fuel Rail Pressure" = 4739?
# 3214 * 0.01868 = 60.0 PSI → that's "Fuel Pressure (SAE)"!
print(f"0x208A: raw=3214, HPT Fuel Pressure (SAE)=60.05 PSI?")
print(f"  3214 * 0.01868 = {3214 * 0.01868:.2f} PSI")
print(f"  3214 * 0.125 = {3214 * 0.125:.1f} kPa → {3214 * 0.125 * 0.145038:.2f} PSI")
print()

# 0x32A8 = raw 0xFC = 252 (or signed -4)
# HPT "DPF Regen Percentage" = -4%
# signed: -4 → matches!
print(f"0x32A8 (DPF_REGEN): raw=252 (signed -4), HPT=-4%")
print()

# 0x11A1 = raw 0x313D = 12605
# We already have this: Barometric Pressure
# 12605 * 0.001175 = 14.81 PSI → close to HPT 14.79 PSI!
print(f"0x11A1 (BARO): raw=12605, HPT=14.79 PSI")
print(f"  12605 * 0.001175 = {12605 * 0.001175:.2f} PSI")
print()

# 0x20AC-0x20AF: raw 1316, 1258, 1230, 1307
# These could be injector balance rates or cylinder-specific data
# HPT has "PCS 1/2/3 Cmd Pressure" and other cylinder data
# 0x20AC = 1316, 0x20AD = 1258, 0x20AE = 1230, 0x20AF = 1307
# If these are IBR: 1316 * scale = ~0.2 mm³? → scale = 0.000152 (unlikely)
# Or if pressure: 1316 * 0.01 = 13.16 bar = 190.8 PSI (not matching)
print(f"0x20AC-AF: raw values {1316}, {1258}, {1230}, {1307}")
print(f"  Could be injector pulse widths? 1316*0.001 = {1316*0.001:.3f} ms (HPT shows 1.308 ms)")
print(f"  1316 * 0.001 = {1316*0.001:.3f} → MATCH for Inj Pulse Width!")
print()

# 0x2006 = raw 0x5C = 92
# HPT has various channels... 92 could be:
# Turbo Vane Position = 63.14% → 92/255*100 = 36.1% (no)
# 92 * 0.392 = 36.1% (no)
# 92 * 0.6863 = 63.14% → yes! Or 92/255*175 = 63.1%
print(f"0x2006: raw=92")
print(f"  92 * 0.392 = {92*0.392:.1f}%")
print(f"  92 / 255 * 100 = {92/255*100:.1f}%")
print()

# 0x1543 = raw 0xA1 = 161
# 0x1540 = raw 0xA2 = 162
# HPT "Diesel Throttle Position A" = (empty), "Diesel Throttle Position B" = (empty)
# Or "Diesel Commanded Throttle A/B"
print(f"0x1543: raw=161, 0x1540: raw=162")
print(f"  161/255*100 = {161/255*100:.1f}%")
print()

# 0x114D = raw 0x65 = 101
# HPT "IAT" = 116.6°F → (101-40)*9/5+32 = 61*1.8+32 = 109.8+32 = 141.8°F (wrong)
# Or 101*0.5 = 50.5°C → 50.5*1.8+32 = 122.9°F (close but not 116.6)
# Or (101-40) = 61°C → 61*1.8+32 = 141.8°F (no)
# 116.6°F = 47°C → 47+40 = 87 (not 101)
# 116.6°F = (116.6-32)/1.8 = 47°C → raw should be 47+40=87 for standard OBD
# But raw is 101... 101-54 = 47? 101*0.466 = 47.1°C → 47.1*1.8+32 = 116.8°F ≈ 116.6°F!
# Scale: 101 * 0.46535 = 47°C
print(f"0x114D: raw=101, HPT IAT=116.6°F (47°C)")
print(f"  (101-40)*1.8+32 = {(101-40)*1.8+32:.1f}°F")
print(f"  101*0.46535 = {101*0.46535:.1f}°C → {101*0.46535*1.8+32:.1f}°F")
print()

# 0x13C8 = raw 0xB9 = 185
# HPT "ECT" = 183.2°F → (183.2-32)/1.8 = 84°C
# 185 * 0.4541 = 84.0°C → 84*1.8+32 = 183.2°F → MATCH!
# Or: (185-40) = 145°C → no
# Actually: 185 * 0.454 = 84.0°C
print(f"0x13C8: raw=185, HPT ECT=183.2°F (84°C)")
print(f"  185 * 0.454 = {185*0.454:.1f}°C → {185*0.454*1.8+32:.1f}°F")
print()

# Let me check: is 0x13C8 the same as our 0x1109 (ECT)?
# Our 0x1109 has formula: (a - 40) → that gives 185-40 = 145°C = 293°F (wrong!)
# So either 0x1109 is wrong or 0x13C8 uses a different formula
# HPT reads 0x13C8 for ECT, not 0x1109!

print("=== KEY FINDING ===")
print("HPT reads DIFFERENT DIDs than our 0x05xx range!")
print("The 0x05xx DIDs are NOT valid on the L5P E41 ECU.")
print("We need to replace them with the correct HPT DIDs.")
print()
print("Next step: Map all 68 missing HPT DIDs to channel names")
print("by correlating raw values with HPT channel values at idle.")
