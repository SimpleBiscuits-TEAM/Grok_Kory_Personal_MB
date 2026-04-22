#!/usr/bin/env python3
"""Analyze the datalog from the DDDI clear test run."""
import csv

# Skip comment lines
data_lines = []
with open('/home/ubuntu/upload/datalog_2026-04-22T21-34-08-058Z.csv') as f:
    for line in f:
        if not line.startswith('#'):
            data_lines.append(line)

reader = csv.DictReader(data_lines)
rows = list(reader)
print(f"Total rows: {len(rows)}")

headers = list(rows[0].keys()) if rows else []

# Categorize each column
working = []
partial = []
dead = []

for col in headers:
    if col.startswith('Timestamp') or col.startswith('Elapsed'):
        continue
    
    vals = []
    for r in rows:
        v = r[col].strip()
        if v:
            try:
                vals.append(float(v))
            except:
                pass
    
    if len(vals) == 0:
        dead.append(col)
    elif len(vals) < len(rows) * 0.3:
        # Check if values are changing
        unique = len(set(f'{v:.4f}' for v in vals))
        partial.append((col, len(vals), vals[0] if vals else 0, vals[-1] if vals else 0, unique))
    else:
        unique = len(set(f'{v:.4f}' for v in vals))
        mn, mx = min(vals), max(vals)
        working.append((col, len(vals), mn, mx, unique, vals[-1]))

print(f"\n=== WORKING ({len(working)} channels) ===")
for col, cnt, mn, mx, uniq, last in working:
    status = "CHANGING" if uniq > 3 else "STUCK" if uniq == 1 else "BARELY"
    print(f"  {col:20s}: {cnt:4d} readings, range [{mn:12.4f} - {mx:12.4f}], unique={uniq:4d} {status}")

print(f"\n=== PARTIAL ({len(partial)} channels) ===")
for col, cnt, first, last, uniq in partial:
    print(f"  {col:20s}: {cnt:4d} readings, first={first:12.4f}, last={last:12.4f}, unique={uniq}")

print(f"\n=== DEAD ({len(dead)} channels) ===")
for col in dead:
    print(f"  {col}")

# Check specifically the new HPT-verified DIDs
print("\n\n=== NEW HPT-VERIFIED DID STATUS ===")
new_dids = [
    'FP_SAE', 'INJ_TMG', 'FUEL_RATE', 'INJ_COR',
    'IPW_1', 'IPW_2', 'IPW_3', 'IPW_4', 'IPW_5', 'IPW_6', 'IPW_7', 'IPW_8',
    'IBR_1', 'IBR_2', 'IBR_3', 'IBR_4', 'IBR_5', 'IBR_6', 'IBR_7', 'IBR_8',
    'THRTL_A', 'THRTL_B', 'IAT_DSL', 'ECT_HPT', 'AAT_DSL',
    'EGR_PINTLE', 'NOX_1', 'NOX_2',
    'DPF_SOOT', 'DPF_DP', 'DPF_IN_T', 'DPF_OUT_T', 'DPF_REGEN',
    'DPF_REGEN_CT', 'DPF_DIST', 'DEF_LVL', 'DEF_TEMP', 'DEF_DOSE',
    'NOX_IN', 'NOX_OUT', 'SCR_TEMP', 'DEF_QUAL',
    'FRP_DES', 'FRP_ACT2', 'THRTL_CMD', 'ECT_DSL', 'DEF_LVL2',
    'DPF_REGEN_PCT', 'INJ_PAT', 'DPF_SOOT_PCT', 'BARO_DSL',
    'EGT_EXT', 'NOX_CONC', 'EXH_PRESS', 'NOX_O2', 'DPM', 'FUEL_LVL'
]

for name in new_dids:
    # Find matching column
    matching = [h for h in headers if name in h]
    if not matching:
        print(f"  {name:15s}: NOT IN LOG")
        continue
    col = matching[0]
    vals = []
    for r in rows:
        v = r[col].strip()
        if v:
            try:
                vals.append(float(v))
            except:
                pass
    if vals:
        unique = len(set(f'{v:.4f}' for v in vals))
        status = "✅ WORKING" if unique > 3 else "⚠️ STUCK" if unique == 1 else "⚠️ BARELY"
        print(f"  {name:15s}: {len(vals):4d} readings, [{min(vals):.2f} - {max(vals):.2f}], unique={unique} {status}")
    else:
        print(f"  {name:15s}: ❌ DEAD (0 readings)")
