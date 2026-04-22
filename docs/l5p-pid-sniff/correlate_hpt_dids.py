#!/usr/bin/env python3
"""
Correlate HPT DID responses with HPT channel values at idle.
Uses IntelliSpy capture + HPT CSV to map DID → channel name → formula.
"""
import csv, struct

# HPT idle values from first data row of newl5psnigglog.csv
# Format: (channel_name, value, unit, hpt_channel_id)
hpt_channels = [
    ("Engine RPM (SAE)", 600.5, "rpm", 12),
    ("Mass Airflow (SAE)", 4.0993, "lb/min", 16),
    ("Manifold Absolute Pressure", -0.1450, "psi", 2331),
    ("Accelerator Pedal Position", 0, "%", 2114),
    ("Turbo B Vane Position (SAE)", None, "%", 432),
    ("Turbo A Vane Position (SAE)", None, "%", 431),
    ("Desired Turbo Vane Position", 63.5294, "%", 2365),
    ("Commanded Turbo B Vane Position (SAE)", None, "%", 430),
    ("Fuel Pressure (SAE)", 60.0457, "psi", 10),
    ("Fuel Rail Pressure (SAE)", 4739.8335, "psi", 35),
    ("Cyl 1 Inj Timing", -1, "°", 6522),
    ("Main Fuel Rate", 7, "mm³", 6231),
    ("Turbo Vane Position", 63.1373, "%", 2366),
    ("NOX Sensor 1 NOX Concentration", 0, "ppm", 6732),
    ("Injector Pulse Width Cyl 1", 1.3085, "ms", 6202),
    ("Boost/Vacuum", 0.0986, "psi", 2348),
    ("Fuel Injection Timing (SAE)", -1.1094, "°", 93),
    ("NOX Sensor 2 NOX Concentration", 0, "ppm", 6733),
    ("TCC Line Pressure", 0, "psi", 4340),
    ("Intake MAP A (SAE) Hi Res", 72.5189, "psi", 771),  # This is kPa! 72.5 kPa = 10.52 PSI
    ("PCS 1 Cmd Pressure", 0, "psi", 4212),
    ("PCS 2 Cmd Pressure", 232.0604, "psi", 4213),
    ("PCS 3 Cmd Pressure", None, "psi", 4214),
    ("Commanded Turbo A Vane Position (SAE)", None, "%", 429),
    ("Diesel Commanded Throttle B (SAE)", None, "%", 410),
    ("Diesel Throttle Position A (SAE)", None, "%", 405),
    ("Diesel Throttle Position B (SAE)", None, "%", 406),
    ("Diesel Commanded Throttle A (SAE)", None, "%", 409),
    ("TCC Slip", 22.125, "rpm", 4311),
    ("Charge Air Cooler Temp B2S1 (SAE)", None, "°F", 421),
    ("Charge Air Cooler Temp B2S2 (SAE)", None, "°F", 422),
    ("Charge Air Cooler Temp B1S2 (SAE)", None, "°F", 420),
    ("Desired Boost", 14.5038, "psi", 2360),
    ("Desired Fuel Pressure", 4705.0244, "psi", 6501),
    ("Trans Current Gear", 0, "", 4120),
    ("Charge Air Cooler Temp B1S1 (SAE)", None, "°F", 419),
    ("Vehicle Speed (SAE)", 0, "mph", 13),
    ("Control Module Voltage", 14.3, "V", 2100),
    ("DPF Outlet Pressure B1 (SAE)", 100, "psi", 443),  # Probably kPa
    ("EGR Pintle Position", 5, "%", 2810),
    ("EGR Sensor", 20, "V", 2811),  # Probably %
    ("EGR Cooler Bypass Learned Min", None, "%", 6566),
    ("Injector Pulse Mode", None, "", 16201),
    ("Commanded EGR A (SAE)", None, "%", 435),
    ("Commanded EGR B (SAE)", None, "%", 436),
    ("Actual EGR A (SAE)", None, "%", 437),
    ("Actual EGR B (SAE)", None, "%", 438),
    ("DPF Regen Percentage (SAE)", -4, "%", 669),
    ("EGR Actuator Duty Cycle", None, "%", 6570),
    ("DPF Delta Pressure B1 (SAE)", None, "psi", 441),
    ("DPF Inlet Pressure B1 (SAE)", None, "psi", 442),
    ("Intake Air Temp (SAE)", 116.6, "°F", 15),
    ("Engine Coolant Temp (SAE)", 183.2, "°F", 5),
    ("Fuel Tank Level", 31.2177, "gal", 6402),
    ("Barometric Pressure (SAE)", 14.7938, "psi", 51),
    ("Maximum Value For EQ Ratio (SAE)", 20, "", 609),
    ("Ambient Air Temp", 84.2, "°F", 2125),
]

# DID responses from IntelliSpy first polling cycle
# Format: (DID, raw_bytes_hex, data_length)
did_responses = {
    0x20AC: (0x0524, 2),  # 1316
    0x20AD: (0x04EA, 2),  # 1258
    0x20AE: (0x04CE, 2),  # 1230
    0x20AF: (0x051B, 2),  # 1307
    0x1206: (0x00, 1),
    0x1205: (0x00, 1),
    0x1207: (0x00, 1),
    0x1208: (0x00, 1),
    0x1201: (0x0000, 2),
    0x1202: (0x0000, 2),
    0x1203: (0x0000, 2),
    0x1204: (0x0000, 2),
    0x1200: (0x00, 1),
    0x12DA: (0x0F0B, 2),  # 3851
    0x1152: (0xFF, 1),    # 255
    0x114B: (0xFF, 1),    # 255
    0x11A1: (0x313D, 2),  # 12605
    0x1470: (0x00, 1),
    0x1543: (0xA1, 1),    # 161
    0x1540: (0xA2, 1),    # 162
    0x2006: (0x5C, 1),    # 92
    0x2005: (0x59, 1),    # 89
    0x2007: (0xD1, 1),    # 209
    0x232C: (0x45, 1),    # 69
    0x131F: (0x0000, 2),
    0x1155: (0x3D, 1),    # 61
    0x11C9: (0x4B, 1),    # 75
    0x2000: (0x41, 1),    # 65
    0x208A: (0x0C8E, 2),  # 3214
    0x20B4: (0xFFF6, 2),  # 65526 (signed: -10)
    0x20B5: (0xFFF6, 2),
    0x20B6: (0xFFF6, 2),
    0x20B7: (0xFFF6, 2),
    0x328A: (0x2710, 2),  # 10000
    0x32A8: (0xFC, 1),    # 252 (signed: -4)
    0x32A9: (0x00, 1),
    0x1141: (0x8F, 1),    # 143
    0x114D: (0x65, 1),    # 101
    0x13C8: (0xB9, 1),    # 185
    0x12B4: (0x00, 1),
    0x12B5: (0x00, 1),
    0x12BD: (0x30, 1),    # 48
    0x12BC: (0x18, 1),    # 24
    0x1154: (0x7D, 1),    # 125
    0x116F: (0x73, 1),    # 115
    0x13B5: (0x0097, 2),  # 151
    0x130F: (0x06, 1),
    0x2001: (0x00, 1),
    0x1337: (0x8ACF, 2),  # 35535
    0x115E: (0xC7, 1),    # 199
    0x115D: (0x95, 1),    # 149
    0x115F: (0x00, 1),
    0x12F5: (0x0665, 2),  # 1637
    0x130E: (0x0665, 2),  # 1637
    0x1232: (0x21, 1),    # 33
    0x1233: (0xFF, 1),    # 255
    0x1234: (0x0A04, 2),  # 2564
    0x1235: (0x0250, 2),  # 592
    0x1236: (0x0250, 2),  # 592
}

def signed16(v):
    return v - 65536 if v > 32767 else v

def signed8(v):
    return v - 256 if v > 127 else v

print("=" * 80)
print("HPT DID → CHANNEL CORRELATION")
print("=" * 80)

# Known confirmed mappings
confirmed = {
    # Already in our PID list and working:
    0x11A1: ("BARO_DSL", "Barometric Pressure", "PSI", 2, lambda r: r * 0.001175, 14.81),
    0x328A: ("FRP_DES", "Desired Fuel Rail Pressure", "PSI", 2, lambda r: r * 0.47398, 4739.8),
    0x1141: ("FUEL_LVL", "Fuel Tank Level", "gal", 1, lambda r: r * 0.21832, 31.22),
    0x32A8: ("DPF_REGEN", "DPF Regen Percentage", "%", 1, lambda r: signed8(r), -4),
    
    # New mappings from correlation:
    0x208A: ("FP_SAE", "Fuel Pressure (SAE)", "PSI", 2, lambda r: r * 0.01868, 60.05),
    0x20AC: ("IPW_1", "Injector Pulse Width Cyl 1", "ms", 2, lambda r: r * 0.001, 1.316),
    0x20AD: ("IPW_2", "Injector Pulse Width Cyl 2", "ms", 2, lambda r: r * 0.001, 1.258),
    0x20AE: ("IPW_3", "Injector Pulse Width Cyl 3", "ms", 2, lambda r: r * 0.001, 1.230),
    0x20AF: ("IPW_4", "Injector Pulse Width Cyl 4", "ms", 2, lambda r: r * 0.001, 1.307),
    0x114D: ("IAT_DSL", "Intake Air Temp", "°F", 1, lambda r: r * 0.46535 * 1.8 + 32, 116.6),
    0x13C8: ("ECT_DSL", "Engine Coolant Temp", "°F", 1, lambda r: r * 0.454 * 1.8 + 32, 183.2),
}

# Try to figure out more mappings
print("\n--- ATTEMPTING AUTO-CORRELATION ---\n")

for did, (raw, nbytes) in sorted(did_responses.items()):
    if did in confirmed:
        short, name, unit, _, formula, expected = confirmed[did]
        actual = formula(raw)
        print(f"✅ 0x{did:04X}: {short:12s} raw={raw:6d} → {actual:10.2f} {unit:6s} (HPT: {expected})")
        continue
    
    # Try to match with HPT channels
    best_match = None
    best_error = 999999
    
    for ch_name, ch_val, ch_unit, ch_id in hpt_channels:
        if ch_val is None or ch_val == 0:
            continue
        if raw == 0:
            continue
        
        # Try various formulas
        candidates = []
        # Direct: raw * scale = value
        scale = ch_val / raw
        candidates.append((f"a * {scale:.6f}", abs(ch_val - raw * scale)))
        
        # Signed
        if nbytes == 2:
            sraw = signed16(raw)
            if sraw != 0:
                scale_s = ch_val / sraw
                candidates.append((f"signed(a) * {scale_s:.6f}", abs(ch_val - sraw * scale_s)))
        elif nbytes == 1:
            sraw = signed8(raw)
            if sraw != 0:
                scale_s = ch_val / sraw
                candidates.append((f"signed(a) * {scale_s:.6f}", abs(ch_val - sraw * scale_s)))
        
        # Offset: (raw - offset) * scale
        # Common: (a - 40) for temp
        if "Temp" in ch_name or "°F" in ch_unit:
            temp_c = (ch_val - 32) / 1.8
            offset = raw - temp_c
            if abs(offset - 40) < 2:
                candidates.append((f"(a - 40)°C→°F", abs(ch_val - ((raw - 40) * 1.8 + 32))))
        
        for formula_str, error in candidates:
            if error < best_error and error < abs(ch_val) * 0.02:  # Within 2%
                best_error = error
                best_match = (ch_name, ch_val, ch_unit, formula_str, error)
    
    if best_match:
        ch_name, ch_val, ch_unit, formula_str, error = best_match
        print(f"🔍 0x{did:04X}: raw={raw:6d} → {ch_name:45s} = {ch_val:10.4f} {ch_unit:6s} ({formula_str})")
    else:
        print(f"❓ 0x{did:04X}: raw={raw:6d} (no match found)")

# Now print the DIDs HPT reads that we DON'T have responses for in first cycle
print("\n\n--- HPT DIDs NOT IN FIRST POLLING CYCLE (need more data) ---")
hpt_dids_all = [0x1131, 0x1135, 0x114D, 0x1152, 0x1154, 0x1158, 0x115C, 0x115D, 0x115E, 0x116F, 0x11BB, 0x11EB, 0x11F8, 0x11FA, 0x1200, 0x1202, 0x1206, 0x1208, 0x1232, 0x1233, 0x1234, 0x1237, 0x1238, 0x1239, 0x12BD, 0x12DA, 0x130E, 0x131D, 0x131F, 0x1337, 0x13B5, 0x13C8, 0x1502, 0x150D, 0x1540, 0x1543, 0x1561, 0x1677, 0x169C, 0x1942, 0x2000, 0x2002, 0x2006, 0x201B, 0x201E, 0x2022, 0x2024, 0x204C, 0x2070, 0x2083, 0x2084, 0x2085, 0x208B, 0x20AC, 0x20AF, 0x20B2, 0x20B4, 0x20B6, 0x20B8, 0x20BA, 0x20BC, 0x20DE, 0x20E2, 0x20E3, 0x232C, 0x2331, 0x2428, 0x2434, 0x2437, 0x244E, 0x244F, 0x247C, 0x2489, 0x24A0, 0x303B, 0x3088, 0x308A, 0x30BD, 0x30BF, 0x30C1, 0x30CA, 0x30D5, 0x30DD, 0x30DE, 0x321B, 0x3298, 0x32A8, 0x90D6]
for did in sorted(hpt_dids_all):
    if did not in did_responses:
        print(f"  0x{did:04X} - no response captured in first cycle")
