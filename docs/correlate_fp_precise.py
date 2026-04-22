"""
Precise time-aligned correlation between periodic frame bytes and HPT fuel pressure values.

From the fuel pressure capture:
- FE frames: [FE 42 XX YY ZZ 0C BB 88] — 7 data bytes, byte 1 always 0x42
- FD frames: [FD 42 XX YY ZZ 00 00 00] — 4 meaningful bytes, byte 1 always 0x42

HPT channels:
- Fuel Pressure (SAE) = low feed pressure (~59 PSI)
- Fuel Pressure = high rail pressure (~4712 PSI)  
- Desired Fuel Pressure = desired rail pressure (~4710 PSI)

Byte 1 = 0x42 always (constant, maybe a status byte)
FD bytes 2-4 vary widely (0-65497 as 16-bit)
FE bytes 2-4 same range, bytes 5-7 also vary

Hypothesis: 
- FD carries Desired Fuel Pressure in bytes 2-4
- FE carries Fuel Pressure (actual) in bytes 2-4, and FP_SAE in bytes 5-7
- Or: bytes [2:4] = one value, bytes [4:6] = another

Let me do time-aligned correlation.
"""
import csv
from collections import defaultdict

# Parse periodic frames
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

# Separate FE and FD
fe_frames = [(t, d) for t, d in periodic if d[0] == 0xFE]
fd_frames = [(t, d) for t, d in periodic if d[0] == 0xFD]

# Parse HPT data
hpt_data = []
with open('/home/ubuntu/upload/fuelpressurepidsonlyhptsniff.csv') as f:
    lines = f.readlines()
    header_idx = None
    for i, line in enumerate(lines):
        if 'Fuel Pressure (SAE)' in line:
            header_idx = i
            break
    
    if header_idx is not None:
        headers = [h.strip().strip('"') for h in lines[header_idx].split(',')]
        for j in range(header_idx + 1, len(lines)):
            vals = lines[j].strip().split(',')
            if len(vals) >= len(headers):
                try:
                    row = {}
                    for k, h in enumerate(headers):
                        try:
                            row[h] = float(vals[k].strip().strip('"'))
                        except:
                            row[h] = vals[k].strip().strip('"')
                    if isinstance(row.get('Offset'), (int, float)):
                        hpt_data.append(row)
                except:
                    pass

print(f"FE frames: {len(fe_frames)}")
print(f"FD frames: {len(fd_frames)}")
print(f"HPT rows: {len(hpt_data)}")

# Normalize timestamps — both start from their respective t=0
# Periodic frames start at ~14828.335
# HPT data starts at offset 0.061
periodic_t0 = periodic[0][0]
hpt_t0 = hpt_data[0]['Offset']

print(f"\nPeriodic t0: {periodic_t0:.3f}")
print(f"HPT t0: {hpt_t0:.3f}")

# For each FE frame, find the closest HPT row by relative time
print("\n" + "=" * 80)
print("FE FRAME CORRELATION (first 30)")
print("=" * 80)
print(f"{'Rel_T':>8} | {'b2':>4} {'b3':>4} {'b4':>4} {'b5':>4} {'b6':>4} {'b7':>4} | {'b23':>6} {'b34':>6} {'b56':>6} {'b67':>6} | {'HPT_FP':>10} {'HPT_FP_DES':>10} {'HPT_FP_SAE':>10}")

for i, (t, d) in enumerate(fe_frames[:30]):
    rel_t = t - periodic_t0
    
    # Find closest HPT row
    best_hpt = None
    best_dt = float('inf')
    for row in hpt_data:
        dt = abs((row['Offset'] - hpt_t0) - rel_t)
        if dt < best_dt:
            best_dt = dt
            best_hpt = row
    
    b2, b3, b4, b5, b6, b7 = d[2], d[3], d[4], d[5], d[6], d[7]
    b23 = (b2 << 8) | b3
    b34 = (b3 << 8) | b4
    b56 = (b5 << 8) | b6
    b67 = (b6 << 8) | b7

    fp = best_hpt['Fuel Pressure'] if best_hpt else 0
    fp_des = best_hpt['Desired Fuel Pressure'] if best_hpt else 0
    fp_sae = best_hpt['Fuel Pressure (SAE)'] if best_hpt else 0
    
    print(f"{rel_t:8.3f} | {b2:4} {b3:4} {b4:4} {b5:4} {b6:4} {b7:4} | {b23:6} {b34:6} {b56:6} {b67:6} | {fp:10.2f} {fp_des:10.2f} {fp_sae:10.2f}")

# Now try to find the scale factor
print("\n" + "=" * 80)
print("SCALE FACTOR ANALYSIS")
print("=" * 80)

# For FE frames, try different byte combinations against HPT values
for byte_combo_name, get_raw in [
    ("FE b23", lambda d: (d[2] << 8) | d[3]),
    ("FE b34", lambda d: (d[3] << 8) | d[4]),
    ("FE b56", lambda d: (d[5] << 8) | d[6]),
    ("FE b67", lambda d: (d[6] << 8) | d[7]),
    ("FE b2", lambda d: d[2]),
    ("FE b5", lambda d: d[5]),
    ("FE b6", lambda d: d[6]),
    ("FE b7", lambda d: d[7]),
]:
    ratios_fp = []
    ratios_fp_des = []
    ratios_fp_sae = []
    
    for t, d in fe_frames:
        rel_t = t - periodic_t0
        raw = get_raw(d)
        if raw == 0:
            continue
        
        best_hpt = None
        best_dt = float('inf')
        for row in hpt_data:
            dt = abs((row['Offset'] - hpt_t0) - rel_t)
            if dt < best_dt:
                best_dt = dt
                best_hpt = row
        
        if best_hpt and best_dt < 0.1:
            fp = best_hpt['Fuel Pressure']
            fp_des = best_hpt['Desired Fuel Pressure']
            fp_sae = best_hpt['Fuel Pressure (SAE)']
            
            ratios_fp.append(fp / raw)
            ratios_fp_des.append(fp_des / raw)
            ratios_fp_sae.append(fp_sae / raw)
    
    if ratios_fp:
        import statistics
        fp_mean = statistics.mean(ratios_fp)
        fp_std = statistics.stdev(ratios_fp) if len(ratios_fp) > 1 else 0
        des_mean = statistics.mean(ratios_fp_des)
        des_std = statistics.stdev(ratios_fp_des) if len(ratios_fp_des) > 1 else 0
        sae_mean = statistics.mean(ratios_fp_sae)
        sae_std = statistics.stdev(ratios_fp_sae) if len(ratios_fp_sae) > 1 else 0
        
        print(f"\n{byte_combo_name}:")
        print(f"  FP:     scale={fp_mean:.6f} std={fp_std:.6f} cv={fp_std/fp_mean*100:.2f}%")
        print(f"  FP_DES: scale={des_mean:.6f} std={des_std:.6f} cv={des_std/des_mean*100:.2f}%")
        print(f"  FP_SAE: scale={sae_mean:.6f} std={sae_std:.6f} cv={sae_std/sae_mean*100:.2f}%")

# Same for FD frames
print("\n--- FD FRAMES ---")
for byte_combo_name, get_raw in [
    ("FD b23", lambda d: (d[2] << 8) | d[3]),
    ("FD b34", lambda d: (d[3] << 8) | d[4]),
    ("FD b2", lambda d: d[2]),
]:
    ratios_fp = []
    ratios_fp_des = []
    ratios_fp_sae = []
    
    for t, d in fd_frames:
        rel_t = t - periodic_t0
        raw = get_raw(d)
        if raw == 0:
            continue
        
        best_hpt = None
        best_dt = float('inf')
        for row in hpt_data:
            dt = abs((row['Offset'] - hpt_t0) - rel_t)
            if dt < best_dt:
                best_dt = dt
                best_hpt = row
        
        if best_hpt and best_dt < 0.1:
            fp = best_hpt['Fuel Pressure']
            fp_des = best_hpt['Desired Fuel Pressure']
            fp_sae = best_hpt['Fuel Pressure (SAE)']
            
            ratios_fp.append(fp / raw)
            ratios_fp_des.append(fp_des / raw)
            ratios_fp_sae.append(fp_sae / raw)
    
    if ratios_fp:
        fp_mean = statistics.mean(ratios_fp)
        fp_std = statistics.stdev(ratios_fp) if len(ratios_fp) > 1 else 0
        des_mean = statistics.mean(ratios_fp_des)
        des_std = statistics.stdev(ratios_fp_des) if len(ratios_fp_des) > 1 else 0
        sae_mean = statistics.mean(ratios_fp_sae)
        sae_std = statistics.stdev(ratios_fp_sae) if len(ratios_fp_sae) > 1 else 0
        
        print(f"\n{byte_combo_name}:")
        print(f"  FP:     scale={fp_mean:.6f} std={fp_std:.6f} cv={fp_std/fp_mean*100:.2f}%")
        print(f"  FP_DES: scale={des_mean:.6f} std={des_std:.6f} cv={des_std/des_mean*100:.2f}%")
        print(f"  FP_SAE: scale={sae_mean:.6f} std={sae_std:.6f} cv={sae_std/sae_mean*100:.2f}%")
