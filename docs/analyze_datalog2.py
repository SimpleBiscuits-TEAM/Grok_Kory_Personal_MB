import csv

filepath = '/home/ubuntu/upload/datalog_2026-04-22T21-04-04-587Z.csv'

# Skip comment lines, get headers and data
lines = []
with open(filepath, 'r') as f:
    for line in f:
        if not line.startswith('#'):
            lines.append(line)

reader = csv.DictReader(lines)
rows = list(reader)
print(f"Total rows: {len(rows)}\n")

# Focus on the new diesel Mode 22 PIDs and their values
# Expected HPT idle values from IntelliSpy correlation:
expected = {
    'RPM (RPM)': ('~600-700', 'Mode 01'),
    'MAF (lb/min)': ('~4-8', 'Mode 01'),
    'ECT (°F)': ('~183', 'Mode 01 0x05'),
    'BOOST (PSI)': ('~-0.2 to 0', 'Mode 01 0x0B'),
    'FRP (PSI)': ('~4700-5000', 'Mode 22 0x1141'),
    'FUEL_LVL (gal)': ('~31', 'Mode 22 0x1141 — WRONG: showing 142'),
    'INJ_TMG_SAE (°BTDC)': ('~-1.2', 'Mode 22 — was 0x05xx, now what?'),
    'TQ_ACT (%)': ('~12-15', 'Mode 01 0x62'),
    'TQ_REF (lb·ft)': ('~1243', 'Mode 01 0x63'),
    'FRP_ACT2 (PSI)': ('~4700', 'Mode 22 0x328A'),
    'THRTL_CMD (%)': ('~100 at idle?', 'Mode 22'),
    'ECT_DSL (°F)': ('~176', 'Mode 22 0x13C8'),
    'DPF_REGEN_PCT (%)': ('~-4', 'Mode 22 0x32A8 — WRONG: showing 100'),
    'BARO_DSL (PSI)': ('~14.7', 'Mode 22 0x308A — WRONG: showing 17-23'),
    'EGT_EXT (°F)': ('~300-400', 'Mode 22 — WRONG: showing 7332'),
    'NOX_CONC (ppm)': ('low at idle', 'Mode 22 — showing 2081'),
    'EXH_PRESS (PSI)': ('~4-5', 'Mode 22'),
    'DPM (mg/m³)': ('low', 'Mode 22'),
}

# Print all columns with their values
print(f"{'Column':<30} {'Non-empty':<8} {'Min':<15} {'Max':<15} {'Avg':<15} {'Expected':<20} {'Status'}")
print("-" * 130)

for col in reader.fieldnames:
    if col == 'timestamp':
        continue
    values = [r[col] for r in rows if r[col] and r[col].strip()]
    non_empty = len(values)
    
    if non_empty == 0:
        exp = expected.get(col, ('?', ''))
        print(f"{col:<30} {'0/' + str(len(rows)):<8} {'EMPTY':<15} {'EMPTY':<15} {'EMPTY':<15} {exp[0]:<20} DEAD")
        continue
    
    try:
        nums = [float(v) for v in values]
        mn = min(nums)
        mx = max(nums)
        avg = sum(nums) / len(nums)
        exp = expected.get(col, ('?', ''))
        
        # Flag issues
        status = ''
        if all(v == 0 for v in nums):
            status = 'ALL ZEROS'
        elif mn == mx:
            status = f'CONSTANT'
        else:
            status = 'OK'
        
        print(f"{col:<30} {str(non_empty) + '/' + str(len(rows)):<8} {mn:<15.4f} {mx:<15.4f} {avg:<15.4f} {exp[0]:<20} {status}")
    except:
        exp = expected.get(col, ('?', ''))
        print(f"{col:<30} {str(non_empty) + '/' + str(len(rows)):<8} {'non-num':<15} {'non-num':<15} {'non-num':<15} {exp[0]:<20} non-numeric")

# Now specifically check the new diesel PIDs we added
print("\n\n=== SPECIFIC DIESEL PID ANALYSIS ===\n")

# Check which columns have data vs empty
diesel_pids = [
    ('FP_SAE', '0x208A', 'Fuel Pressure SAE'),
    ('INJ_TMG', '0x12DA', 'Injection Timing'),
    ('IPW_1', '0x20AC', 'Injector Pulse Width 1'),
    ('IBR_1', '0x20B4', 'Injection Balance Rate 1'),
    ('AAT_DSL', '0x232C', 'Ambient Air Temp'),
    ('ECT_DSL', '0x13C8', 'Engine Coolant Temp'),
    ('IAT_DSL', '0x114D', 'Intake Air Temp'),
    ('TP_A', '0x1543', 'Throttle Position A'),
    ('TP_B', '0x1540', 'Throttle Position B'),
    ('EGR_PNTL', '0x1502', 'EGR Pintle Position'),
    ('NOX_1', '0x11F8', 'NOx Sensor 1'),
    ('NOX_2', '0x11FA', 'NOx Sensor 2'),
    ('MAIN_FUEL_RATE', '0x20E3', 'Main Fuel Rate'),
    ('DPF_REGEN_PCT', '0x32A8', 'DPF Regen Percent'),
    ('BARO_DSL', '0x308A', 'Barometric Pressure'),
    ('EGT_EXT', '?', 'Exhaust Gas Temp'),
    ('NOX_CONC', '?', 'NOx Concentration'),
    ('EXH_PRESS', '?', 'Exhaust Pressure'),
    ('DPM', '?', 'Diesel Particulate'),
    ('FUEL_LVL', '0x1141', 'Fuel Level'),
    ('FRP', '0x1141', 'Fuel Rail Pressure'),
    ('FRP_ACT2', '0x328A', 'Fuel Rail Pressure 2'),
]

for name, did, desc in diesel_pids:
    # Find matching column
    matches = [c for c in reader.fieldnames if c.startswith(name)]
    if not matches:
        print(f"  {name:<20} {did:<10} NOT IN LOG")
        continue
    for col in matches:
        values = [r[col] for r in rows if r[col] and r[col].strip()]
        if not values:
            print(f"  {col:<30} {did:<10} EMPTY (0/{len(rows)} rows)")
        else:
            try:
                nums = [float(v) for v in values]
                print(f"  {col:<30} {did:<10} {len(values)}/{len(rows)} rows  range=[{min(nums):.4f}, {max(nums):.4f}]  avg={sum(nums)/len(nums):.4f}")
            except:
                print(f"  {col:<30} {did:<10} {len(values)}/{len(rows)} rows  non-numeric")
