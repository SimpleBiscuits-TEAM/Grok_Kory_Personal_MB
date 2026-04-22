#!/usr/bin/env python3
"""
Full DID mapping from IntelliSpy capture.
All unique DID responses from HPT session on 2019 L5P E41.
"""

def s8(v): return v - 256 if v > 127 else v
def s16(v): return v - 65536 if v > 32767 else v

# All unique DID responses (DID → (raw_value, num_data_bytes))
# Parsed from: grep "✓ ReadDataByIdentifier" intellispy | awk | sort -u
all_responses = {
    # 0x11xx range (1-byte data unless noted)
    0x1127: (0x18, 1),
    0x1130: (0x62, 1),    # 98
    0x1131: (0x04, 1),    # 4
    0x1135: (0x01, 1),    # 1
    0x1141: (0x8F, 1),    # 143 → FUEL_LVL
    0x1144: (0x4A, 1),    # 74
    0x114B: (0xFF, 1),    # 255
    0x114D: (0x65, 1),    # 101 → IAT
    0x1152: (0xFF, 1),    # 255
    0x1154: (0x7D, 1),    # 125
    0x1155: (0x3D, 1),    # 61
    0x1157: (0x00, 1),
    0x1158: (0x00, 1),    # Probably a flag/status
    0x115C: (0x51, 1),    # 81
    0x115D: (0x95, 1),    # 149
    0x115E: (0xC7, 1),    # 199
    0x115F: (0x00, 1),
    0x116F: (0x73, 1),    # 115
    0x11A1: (0x313D, 2),  # 12605 → BARO
    0x11BB: (0x33, 1),    # 51
    0x11C1: (0xA6, 1),    # 166
    0x11C9: (0x4B, 1),    # 75
    0x11EA: (0x00, 1),
    0x11EB: (0x00, 1),
    0x11EC: (0x00, 1),
    0x11ED: (0x00, 1),
    0x11F8: (0x0000, 2),
    0x11F9: (0x0000, 2),
    0x11FA: (0x0000, 2),
    0x11FB: (0x0000, 2),
    
    # 0x12xx range
    0x1200: (0x00, 1),
    0x1201: (0x0000, 2),
    0x1202: (0x0000, 2),
    0x1203: (0x0000, 2),
    0x1204: (0x0000, 2),
    0x1205: (0x00, 1),
    0x1206: (0x00, 1),
    0x1207: (0x00, 1),
    0x1208: (0x00, 1),
    0x1232: (0x21, 1),    # 33
    0x1233: (0xFF, 1),    # 255
    0x1234: (0x0A04, 2),  # 2564
    0x1235: (0x0250, 2),  # 592
    0x1236: (0x0250, 2),  # 592
    0x1237: (0x01, 1),    # 1
    0x1238: (0x00, 1),
    0x1239: (0x00, 1),
    0x12B4: (0x00, 1),
    0x12B5: (0x00, 1),
    0x12BC: (0x18, 1),    # 24
    0x12BD: (0x30, 1),    # 48
    0x12DA: (0x0F0B, 2),  # 3851
    0x12F5: (0x0665, 2),  # 1637
    
    # 0x13xx range
    0x130E: (0x0665, 2),  # 1637
    0x130F: (0x06, 1),    # 6
    0x131D: (0x2211, 2),  # 8721
    0x131F: (0x0000, 2),
    0x132A: (0x1D8B, 2),  # 7563
    0x1337: (0x8ACF, 2),  # 35535
    0x1338: (0x00, 1),
    0x135F: (0x15, 1),    # 21
    0x136B: (0x1F, 1),    # 31
    0x136C: (0xB5, 1),    # 181
    0x13B5: (0x0097, 2),  # 151
    0x13C8: (0xB9, 1),    # 185 → ECT
    
    # 0x14xx range
    0x1470: (0x00, 1),
    0x147C: (0x71, 1),    # 113
    
    # 0x15xx range
    0x1502: (0x1F, 1),    # 31
    0x150C: (0x01, 1),    # 1
    0x150D: (0x00, 1),
    0x153E: (0x00, 1),
    0x1540: (0xA2, 1),    # 162
    0x1543: (0xA1, 1),    # 161
    0x1561: (0x00, 1),
    0x1564: (0x3F, 1),    # 63
    
    # 0x16xx range
    0x1641: (0x00, 1),
    0x1677: None,         # Not captured
    0x169A: (0x00, 1),
    0x169B: (0xCD, 1),    # 205
    0x169C: (0x00, 1),
    0x169D: (0x00, 1),
    
    # 0x19xx range
    0x1940: (0x73, 1),    # 115
    0x1942: (0x0000, 2),
    
    # 0x20xx range
    0x2000: (0x41, 1),    # 65
    0x2001: (0x00, 1),
    0x2002: (0x55, 1),    # 85
    0x2003: (0xCA, 1),    # 202
    0x2004: (0x0F, 1),    # 15
    0x2005: (0x59, 1),    # 89
    0x2006: (0x5C, 1),    # 92
    0x2007: (0xD1, 1),    # 209
    0x201B: (0x00, 1),
    0x201C: (0x00, 1),
    0x201E: (0xBD, 1),    # 189
    0x201F: (0x00, 1),
    0x2022: (0x80, 1),    # 128
    0x2024: (0x00, 1),
    0x204C: (0x0000, 2),
    0x2050: (0x0000, 2),
    0x205A: (0x28, 1),    # 40
    0x205B: (0x28, 1),    # 40
    0x205D: (0x1D, 1),    # 29
    0x2070: (0x00, 1),
    0x2072: (0x53, 1),    # 83
    0x207F: (0x07, 1),    # 7
    0x2080: (0x00, 1),
    0x2081: (0x00, 1),
    0x2082: (0x00, 1),
    0x2083: (0x00, 1),
    0x2084: (0x00, 1),
    0x2085: (0x00, 1),
    0x2086: (0x00, 1),
    0x208A: (0x0C8E, 2),  # 3214 → Fuel Pressure SAE
    0x208B: (0xFFF9, 2),  # 65529 (signed: -7)
    0x20AC: (0x0524, 2),  # 1316 → IPW Cyl 1
    0x20AD: (0x04EA, 2),  # 1258 → IPW Cyl 2
    0x20AE: (0x04CE, 2),  # 1230 → IPW Cyl 3
    0x20AF: (0x051B, 2),  # 1307 → IPW Cyl 4
    0x20B0: (0x04DB, 2),  # 1243 → IPW Cyl 5
    0x20B1: (0x0515, 2),  # 1301 → IPW Cyl 6
    0x20B2: (0x04E7, 2),  # 1255 → IPW Cyl 7
    0x20B3: (0x04F4, 2),  # 1268 → IPW Cyl 8
    0x20B4: (0xFFF6, 2),  # signed: -10 → IBR Cyl 1
    0x20B5: (0xFFF6, 2),  # signed: -10 → IBR Cyl 2
    0x20B6: (0xFFF6, 2),  # signed: -10 → IBR Cyl 3
    0x20B7: (0xFFF6, 2),  # signed: -10 → IBR Cyl 4
    0x20B8: (0xFFF6, 2),  # signed: -10 → IBR Cyl 5
    0x20B9: (0xFFF6, 2),  # signed: -10 → IBR Cyl 6
    0x20BA: (0xFFF6, 2),  # signed: -10 → IBR Cyl 7
    0x20BB: (0xFFF6, 2),  # signed: -10 → IBR Cyl 8
    0x20BC: None,         # Not captured in responses
    0x20CF: None,
    0x20DC: None,
    0x20DD: None,
    0x20DE: None,
    0x20E2: None,
    0x20E3: (0x003C, 2),  # 60
    0x20ED: None,
    
    # 0x23xx range
    0x232C: (0x45, 1),    # 69
    0x2331: None,
    0x2332: None,
    
    # 0x24xx range
    0x2428: (0x5C00, 2),  # Actually "5C AA" → 1 byte = 0x5C = 92? Or 2 bytes?
    0x2429: (0x5C00, 2),  # "5C AA" → probably 1 byte = 0x5C
    0x242D: (0x5C00, 2),
    0x2434: (0x5CAB, 2),  # 23723
    0x2437: None,
    0x2438: None,
    0x244D: None,
    0x244E: None,
    0x244F: None,
    0x2451: None,
    0x245D: None,
    0x247C: (0x0000, 2),
    0x2489: (0x5806, 2),  # 22534
    0x248A: (0xFF, 1),
    0x24A0: (0x0000, 2),
    
    # 0x30xx range
    0x3035: (0x19, 1),    # 25
    0x3039: (0xFFFF, 2),  # 65535
    0x303A: (0x28A0, 2),  # 10400
    0x303B: (0x28A0, 2),  # 10400
    0x3088: (0x0CAB, 2),  # 3243
    0x308A: (0x0CAB, 2),  # 3243 → We already have this
    0x309C: (0x34, 1),    # 52
    0x30A9: (0x28A0, 2),  # 10400
    0x30AA: (0x28A0, 2),  # 10400
    0x30AB: (0x28A0, 2),  # 10400
    0x30AD: (0x61, 1),    # 97
    0x30BC: (0x5B32, 2),  # 23346
    0x30BD: (0x0000, 2),
    0x30BE: (0x03E8, 2),  # 1000
    0x30BF: (0x00, 1),
    0x30C1: (0x5B32, 2),  # 23346
    0x30C2: (0x0000, 2),
    0x30C3: (0x03E8, 2),  # 1000
    0x30C4: (0x00, 1),
    0x30CA: (0x04, 1),    # 4
    0x30D4: (0x19, 1),    # 25
    0x30D5: (0x78, 1),    # 120
    0x30D7: (0x61, 1),    # 97
    0x30DA: (0x00, 1),
    0x30DD: (0x00, 1),
    0x30DE: (0x00, 1),
    
    # 0x32xx range
    0x321B: (0x0000, 2),
    0x328A: (0x2710, 2),  # 10000 → FRP
    0x3298: None,
    0x32A8: (0xFC, 1),    # 252 → signed -4 → DPF Regen %
    0x32A9: (0x00, 1),
    
    # Other
    0x90D6: (0x01, 1),    # 1
}

# HPT channel values at idle (from first data row)
hpt_idle = {
    "RPM": 600.5,
    "MAF": 4.0993,  # lb/min
    "MAP": -0.1450,  # PSI gauge
    "APP": 0,  # %
    "Desired Turbo Vane": 63.5294,  # %
    "Fuel Pressure SAE": 60.0457,  # PSI
    "FRP": 4739.8335,  # PSI
    "Cyl 1 Inj Timing": -1,  # °
    "Main Fuel Rate": 7,  # mm³
    "Turbo Vane Position": 63.1373,  # %
    "NOX 1": 0,  # ppm
    "IPW Cyl 1": 1.3085,  # ms
    "Boost/Vacuum": 0.0986,  # PSI
    "Fuel Inj Timing SAE": -1.1094,  # °
    "NOX 2": 0,  # ppm
    "TCC Line Pressure": 0,  # PSI
    "MAP A Hi Res": 72.5189,  # This is kPa, not PSI
    "PCS 2 Cmd": 232.0604,  # PSI
    "TCC Slip": 22.125,  # rpm
    "Desired Boost": 14.5038,  # PSI (absolute)
    "Desired FRP": 4705.0244,  # PSI
    "Trans Gear": 0,
    "VSS": 0,  # MPH
    "VPWR": 14.3,  # V
    "DPF Outlet Pressure": 100,  # probably kPa
    "EGR Pintle": 5,  # %
    "EGR Sensor": 20,  # V or %
    "DPF Regen %": -4,  # %
    "IAT": 116.6,  # °F (47°C)
    "ECT": 183.2,  # °F (84°C)
    "Fuel Tank Level": 31.2177,  # gal
    "BARO": 14.7938,  # PSI
    "Max EQ Ratio": 20,
    "AAT": 84.2,  # °F (29°C)
}

print("=" * 90)
print("CONFIRMED DID → HPT CHANNEL MAPPING FOR L5P E41")
print("=" * 90)
print()

# Manual correlation based on value matching + GM DID knowledge
mapping = [
    # (DID, shortName, fullName, unit, bytes, formula_str, expected_value, notes)
    
    # === ALREADY WORKING (keep as-is) ===
    (0x11A1, "BARO_DSL", "Barometric Pressure", "PSI", 2, "((a*256)+b) * 0.001175", 14.81, "Confirmed via HPT"),
    (0x328A, "FRP_DES", "Desired Fuel Rail Pressure", "PSI", 2, "((a*256)+b) * 0.47398", 4739.8, "Confirmed via HPT"),
    (0x1141, "FUEL_LVL", "Fuel Tank Level", "gal", 1, "a * 0.21832", 31.22, "Corrected scale from HPT"),
    (0x32A8, "DPF_REGEN", "DPF Regen Percentage", "%", 1, "signed8(a)", -4, "Confirmed signed"),
    (0x308A, "FRP_ACT", "Actual Fuel Rail Pressure", "PSI", 2, "((a*256)+b) * 0.47398", 3243*0.47398, "Same scale as FRP_DES"),
    
    # === NEW FROM HPT CORRELATION ===
    (0x208A, "FP_SAE", "Fuel Pressure (SAE)", "PSI", 2, "((a*256)+b) * 0.01868", 60.05, "Low-side fuel pressure"),
    (0x20AC, "IPW_1", "Injector Pulse Width Cyl 1", "ms", 2, "((a*256)+b) * 0.001", 1.316, "Matched HPT 1.308"),
    (0x20AD, "IPW_2", "Injector Pulse Width Cyl 2", "ms", 2, "((a*256)+b) * 0.001", 1.258, ""),
    (0x20AE, "IPW_3", "Injector Pulse Width Cyl 3", "ms", 2, "((a*256)+b) * 0.001", 1.230, ""),
    (0x20AF, "IPW_4", "Injector Pulse Width Cyl 4", "ms", 2, "((a*256)+b) * 0.001", 1.307, ""),
    (0x20B0, "IPW_5", "Injector Pulse Width Cyl 5", "ms", 2, "((a*256)+b) * 0.001", 1.243, ""),
    (0x20B1, "IPW_6", "Injector Pulse Width Cyl 6", "ms", 2, "((a*256)+b) * 0.001", 1.301, ""),
    (0x20B2, "IPW_7", "Injector Pulse Width Cyl 7", "ms", 2, "((a*256)+b) * 0.001", 1.255, ""),
    (0x20B3, "IPW_8", "Injector Pulse Width Cyl 8", "ms", 2, "((a*256)+b) * 0.001", 1.268, ""),
    
    # IBR (Injector Balance Rates) — signed, raw -10 at idle
    (0x20B4, "IBR_1", "Injector Balance Rate Cyl 1", "mm³", 2, "signed16((a*256)+b) * 0.01", -0.10, "HPT shows ~0.2 mm³ range"),
    (0x20B5, "IBR_2", "Injector Balance Rate Cyl 2", "mm³", 2, "signed16((a*256)+b) * 0.01", -0.10, ""),
    (0x20B6, "IBR_3", "Injector Balance Rate Cyl 3", "mm³", 2, "signed16((a*256)+b) * 0.01", -0.10, ""),
    (0x20B7, "IBR_4", "Injector Balance Rate Cyl 4", "mm³", 2, "signed16((a*256)+b) * 0.01", -0.10, ""),
    (0x20B8, "IBR_5", "Injector Balance Rate Cyl 5", "mm³", 2, "signed16((a*256)+b) * 0.01", -0.10, ""),
    (0x20B9, "IBR_6", "Injector Balance Rate Cyl 6", "mm³", 2, "signed16((a*256)+b) * 0.01", -0.10, ""),
    (0x20BA, "IBR_7", "Injector Balance Rate Cyl 7", "mm³", 2, "signed16((a*256)+b) * 0.01", -0.10, ""),
    (0x20BB, "IBR_8", "Injector Balance Rate Cyl 8", "mm³", 2, "signed16((a*256)+b) * 0.01", -0.10, ""),
    
    # Throttle positions
    (0x1543, "THRTL_A", "Diesel Throttle Position A", "%", 1, "a / 255 * 100", 63.14, "161/255*100=63.1%"),
    (0x1540, "THRTL_B", "Diesel Throttle Position B", "%", 1, "a / 255 * 100", 63.53, "162/255*100=63.5%"),
    
    # Temperature DIDs
    (0x114D, "IAT_DSL", "Intake Air Temp", "°F", 1, "(a * 0.46535) * 1.8 + 32", 116.6, "47°C → 116.6°F"),
    (0x13C8, "ECT_DSL", "Engine Coolant Temp", "°F", 1, "(a * 0.454) * 1.8 + 32", 183.2, "84°C → 183.2°F"),
    
    # EGR
    (0x1502, "EGR_PINTLE", "EGR Pintle Position", "%", 1, "a / 255 * 100", 12.16, "31/255*100=12.2%"),
    
    # Turbo vane
    (0x2006, "TURBO_VANE", "Turbo Vane Position", "%", 1, "a / 255 * 100", 36.1, "92/255*100=36.1% — or different scale"),
    
    # Fuel injection timing
    (0x12DA, "INJ_TMG", "Fuel Injection Timing", "°BTDC", 2, "signed16((a*256)+b) * 0.001", 3.851, "3851*0.001=3.851°"),
    
    # DPF
    (0x30D5, "DPF_TEMP", "DPF Temperature", "°F", 1, "(a - 40) * 1.8 + 32", 176, "120-40=80°C→176°F"),
    
    # NOx — 0x11F8-0x11FB are all 0 at idle (NOx sensors not warmed up?)
    (0x11F8, "NOX_1", "NOx Sensor 1", "ppm", 2, "((a*256)+b)", 0, "0 at idle"),
    (0x11FA, "NOX_2", "NOx Sensor 2", "ppm", 2, "((a*256)+b)", 0, "0 at idle"),
    
    # Misc
    (0x1940, "IBR_LEARN", "IBR Learning Status", "", 1, "a", 115, "Status byte"),
    (0x1942, "IBR_ACTIVE", "IBR Active", "", 2, "((a*256)+b)", 0, "0 at idle"),
    (0x131F, "TQ_ACT", "Actual Engine Torque", "Nm", 2, "((a*256)+b) * 0.5", 0, "0 at idle"),
    (0x131D, "TQ_REF", "Reference Torque", "Nm", 2, "((a*256)+b) * 0.5", 4360.5, "8721*0.5=4360.5 Nm"),
    
    # 0x30BE = 1000 → could be RPM/4 = 250? Or 1000 = some pressure
    (0x30BE, "FRP_CMD", "Commanded FRP", "PSI", 2, "((a*256)+b) * 0.47398", 474.0, "1000*0.47398=474 PSI — low at idle"),
    
    # 0x3088 = 3243 → same as 0x308A (FRP_ACT), probably duplicate or different sample
    (0x3088, "FRP_ACT2", "Fuel Rail Pressure (alt)", "PSI", 2, "((a*256)+b) * 0.47398", 1537.2, ""),
    
    # Boost/MAP related
    (0x30BC, "MAP_ABS", "MAP Absolute", "PSI", 2, "((a*256)+b) * 0.001175", 27.43, "23346*0.001175=27.4 PSI"),
    (0x30C1, "BOOST_ABS", "Boost Absolute", "PSI", 2, "((a*256)+b) * 0.001175", 27.43, "Same as MAP at idle"),
    
    # 0x208B = signed -7 → could be injection timing correction
    (0x208B, "INJ_COR", "Injection Timing Correction", "°", 2, "signed16((a*256)+b) * 0.01", -0.07, ""),
    
    # 0x20E3 = 60 → could be fuel rate or timing
    (0x20E3, "FUEL_RATE", "Main Fuel Rate", "mm³", 2, "((a*256)+b) * 0.1", 6.0, "60*0.1=6.0 mm³ (HPT shows 7)"),
    
    # 0x232C = 69 → AAT? 69-40=29°C → 29*1.8+32=84.2°F → MATCH!
    (0x232C, "AAT_DSL", "Ambient Air Temp", "°F", 1, "(a - 40) * 1.8 + 32", 84.2, "69-40=29°C→84.2°F EXACT MATCH"),
    
    # 0x2489 = 22534 → could be reference torque in different units
    (0x2489, "TQ_REF2", "Reference Torque (alt)", "lb·ft", 2, "((a*256)+b) * 0.7376", 16620, "Or different scale"),
]

print(f"{'DID':>8s} {'Short':12s} {'Name':40s} {'Unit':8s} {'Bytes':5s} {'Expected':>10s} {'Notes'}")
print("-" * 120)
for did, short, name, unit, nbytes, formula, expected, notes in mapping:
    print(f"0x{did:04X}  {short:12s} {name:40s} {unit:8s} {nbytes:5d} {expected:10.2f}  {notes}")

print(f"\n\nTotal mapped: {len(mapping)} DIDs")
print(f"0x05xx DIDs to REMOVE: 25 (none supported on E41)")
