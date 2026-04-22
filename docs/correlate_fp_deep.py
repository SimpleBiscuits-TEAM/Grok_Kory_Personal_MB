"""
Deep correlation: try all possible byte combinations from FE and FD frames
against HPT fuel pressure values. Include 3-byte combos and signed interpretations.

Key observation: FE byte 7 * 34.38 ≈ FP_ACT with 0.99% CV but only 6 discrete values.
The actual FP must be in a wider field. 

Looking at the raw data again:
FE: [FE 42 XX YY ZZ 0C BB 88]
     b0  b1 b2 b3 b4 b5 b6 b7

b1 = 0x42 = 66 (always constant)
b5 = 12-32 (range 20)
b6 = 5-253 (range 248) 
b7 = 135-141 (range 6)

For FP_ACT ≈ 4712 PSI:
  b7 * 34.38 = 4712 → b7 is the MSB of a multi-byte value
  b6 varies 5-253 → b6 is the LSB
  So FP_ACT = (b7 << 8 | b6) * scale?
  (136 << 8 | 180) = 34996, * 0.1347 = 4714 ✓
  
Wait, let me try b76 (b7 as high byte, b6 as low byte):
  (137 << 8) | 181 = 35253
  35253 * 0.1337 = 4713 ✓
  
Or maybe it's a 24-bit value: (b5 << 16) | (b6 << 8) | b7
  (12 << 16) | (181 << 8) | 137 = 832905
  832905 * 0.00566 = 4714 ✓

Let me test all these systematically.
"""
import csv
import statistics

def parse_frames(filepath):
    frames = []
    with open(filepath) as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                arb_id = int(row.get('ArbID', '0'))
                timestamp = float(row.get('Timestamp', 0))
                data_hex = row.get('Data_Hex', '').strip('"')
                data_bytes = [int(b, 16) for b in data_hex.split() if b]
                frames.append((timestamp, arb_id, data_bytes))
            except:
                pass
    return frames

frames = parse_frames('/home/ubuntu/upload/intellispy_capture_2026-04-22T21-17-02-277Z.csv')
periodic = [(t, d) for t, aid, d in frames if aid == 0x5E8]
fe_frames = [(t, d) for t, d in periodic if d[0] == 0xFE]
fd_frames = [(t, d) for t, d in periodic if d[0] == 0xFD]

# Parse HPT
hpt_data = []
with open('/home/ubuntu/upload/fuelpressurepidsonlyhptsniff.csv') as f:
    lines = f.readlines()
    for i, line in enumerate(lines):
        if 'Fuel Pressure (SAE)' in line:
            headers = [h.strip().strip('"') for h in line.split(',')]
            for j in range(i + 1, len(lines)):
                vals = lines[j].strip().split(',')
                if len(vals) >= len(headers):
                    try:
                        row = {}
                        for k, h in enumerate(headers):
                            try: row[h] = float(vals[k].strip().strip('"'))
                            except: row[h] = vals[k].strip().strip('"')
                        if isinstance(row.get('Offset'), (int, float)):
                            hpt_data.append(row)
                    except: pass
            break

periodic_t0 = periodic[0][0]
hpt_t0 = hpt_data[0]['Offset']

def find_closest_hpt(rel_t, max_dt=0.05):
    best = None
    best_dt = float('inf')
    for row in hpt_data:
        dt = abs((row['Offset'] - hpt_t0) - rel_t)
        if dt < best_dt:
            best_dt = dt
            best = row
    return best if best_dt < max_dt else None

# Test all byte combinations for FE frames
print("=" * 80)
print("FE FRAME — ALL BYTE COMBINATIONS vs HPT Fuel Pressure")
print("=" * 80)

combos = {
    # 2-byte big-endian
    "b23_BE": lambda d: (d[2] << 8) | d[3],
    "b34_BE": lambda d: (d[3] << 8) | d[4],
    "b45_BE": lambda d: (d[4] << 8) | d[5],
    "b56_BE": lambda d: (d[5] << 8) | d[6],
    "b67_BE": lambda d: (d[6] << 8) | d[7],
    # 2-byte little-endian
    "b23_LE": lambda d: (d[3] << 8) | d[2],
    "b34_LE": lambda d: (d[4] << 8) | d[3],
    "b45_LE": lambda d: (d[5] << 8) | d[4],
    "b56_LE": lambda d: (d[6] << 8) | d[5],
    "b67_LE": lambda d: (d[7] << 8) | d[6],
    # 3-byte big-endian
    "b234_BE": lambda d: (d[2] << 16) | (d[3] << 8) | d[4],
    "b345_BE": lambda d: (d[3] << 16) | (d[4] << 8) | d[5],
    "b456_BE": lambda d: (d[4] << 16) | (d[5] << 8) | d[6],
    "b567_BE": lambda d: (d[5] << 16) | (d[6] << 8) | d[7],
    # 3-byte little-endian
    "b234_LE": lambda d: (d[4] << 16) | (d[3] << 8) | d[2],
    "b345_LE": lambda d: (d[5] << 16) | (d[4] << 8) | d[3],
    "b456_LE": lambda d: (d[6] << 16) | (d[5] << 8) | d[4],
    "b567_LE": lambda d: (d[7] << 16) | (d[6] << 8) | d[5],
}

results = []
for name, get_raw in combos.items():
    for hpt_col in ['Fuel Pressure', 'Desired Fuel Pressure', 'Fuel Pressure (SAE)']:
        ratios = []
        for t, d in fe_frames:
            rel_t = t - periodic_t0
            raw = get_raw(d)
            if raw == 0: continue
            hpt = find_closest_hpt(rel_t)
            if hpt:
                ratios.append(hpt[hpt_col] / raw)
        
        if len(ratios) > 10:
            mean = statistics.mean(ratios)
            std = statistics.stdev(ratios)
            cv = std / abs(mean) * 100 if mean != 0 else 999
            results.append((cv, name, hpt_col, mean, std, len(ratios)))

# Sort by CV (best fit first)
results.sort()
print(f"\nTop 20 best fits (lowest CV):")
print(f"{'CV%':>8} | {'Combo':>12} | {'HPT Channel':>25} | {'Scale':>12} | {'N':>4}")
for cv, name, col, mean, std, n in results[:20]:
    print(f"{cv:8.2f} | {name:>12} | {col:>25} | {mean:12.6f} | {n:4}")

# Now do the same for FD frames
print("\n" + "=" * 80)
print("FD FRAME — ALL BYTE COMBINATIONS vs HPT Fuel Pressure")
print("=" * 80)

fd_combos = {
    "b23_BE": lambda d: (d[2] << 8) | d[3],
    "b34_BE": lambda d: (d[3] << 8) | d[4],
    "b23_LE": lambda d: (d[3] << 8) | d[2],
    "b34_LE": lambda d: (d[4] << 8) | d[3],
    "b234_BE": lambda d: (d[2] << 16) | (d[3] << 8) | d[4],
    "b234_LE": lambda d: (d[4] << 16) | (d[3] << 8) | d[2],
}

fd_results = []
for name, get_raw in fd_combos.items():
    for hpt_col in ['Fuel Pressure', 'Desired Fuel Pressure', 'Fuel Pressure (SAE)']:
        ratios = []
        for t, d in fd_frames:
            rel_t = t - periodic_t0
            raw = get_raw(d)
            if raw == 0: continue
            hpt = find_closest_hpt(rel_t)
            if hpt:
                ratios.append(hpt[hpt_col] / raw)
        
        if len(ratios) > 10:
            mean = statistics.mean(ratios)
            std = statistics.stdev(ratios)
            cv = std / abs(mean) * 100 if mean != 0 else 999
            fd_results.append((cv, name, hpt_col, mean, std, len(ratios)))

fd_results.sort()
print(f"\nTop 15 best fits (lowest CV):")
print(f"{'CV%':>8} | {'Combo':>12} | {'HPT Channel':>25} | {'Scale':>12} | {'N':>4}")
for cv, name, col, mean, std, n in fd_results[:15]:
    print(f"{cv:8.2f} | {name:>12} | {col:>25} | {mean:12.6f} | {n:4}")

# Now check: does FE carry FP_ACT and FD carry FP_DES?
# Or does FE carry both FP_ACT and FP_SAE?
print("\n" + "=" * 80)
print("BEST MAPPING HYPOTHESIS")
print("=" * 80)

# Print the best match for each HPT channel
for col in ['Fuel Pressure', 'Desired Fuel Pressure', 'Fuel Pressure (SAE)']:
    fe_best = [(cv, n, c, m) for cv, n, c, m, s, cnt in results if c == col]
    fd_best = [(cv, n, c, m) for cv, n, c, m, s, cnt in fd_results if c == col]
    
    print(f"\n{col}:")
    if fe_best:
        cv, name, _, scale = fe_best[0]
        print(f"  FE best: {name} * {scale:.6f} (CV={cv:.2f}%)")
    if fd_best:
        cv, name, _, scale = fd_best[0]
        print(f"  FD best: {name} * {scale:.6f} (CV={cv:.2f}%)")
