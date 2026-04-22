#!/usr/bin/env python3
"""Analyze the datalog from the TesterPresent test run — focus on fuel pressure."""
import csv

# Skip comment lines
data_lines = []
with open('/home/ubuntu/upload/datalog_2026-04-22T21-51-25-414Z.csv') as f:
    for line in f:
        if not line.startswith('#'):
            data_lines.append(line)

reader = csv.DictReader(data_lines)
rows = list(reader)
print(f"Total rows: {len(rows)}")

headers = list(rows[0].keys()) if rows else []

# Focus on fuel pressure columns
fp_cols = [h for h in headers if any(k in h.upper() for k in ['FP', 'FRP', 'FUEL', 'PRESS', 'BARO'])]
print(f"\nFuel pressure columns: {fp_cols}")

for col in fp_cols:
    vals = []
    empty_count = 0
    for i, r in enumerate(rows):
        v = r[col].strip()
        if v:
            try:
                vals.append((i, float(v)))
            except:
                pass
        else:
            empty_count += 1
    
    if vals:
        unique = len(set(f'{v:.4f}' for _, v in vals))
        readings = [v for _, v in vals]
        print(f"\n  {col}:")
        print(f"    Readings: {len(vals)}/{len(rows)} ({empty_count} empty)")
        print(f"    Range: [{min(readings):.4f} - {max(readings):.4f}]")
        print(f"    Unique values: {unique}")
        
        # Show first 10 and last 10 readings with their row indices
        print(f"    First 10:")
        for idx, v in vals[:10]:
            elapsed = rows[idx].get('Elapsed (s)', '?')
            print(f"      row {idx:4d} t={elapsed:>8s}s  val={v:.4f}")
        if len(vals) > 20:
            print(f"    Last 10:")
            for idx, v in vals[-10:]:
                elapsed = rows[idx].get('Elapsed (s)', '?')
                print(f"      row {idx:4d} t={elapsed:>8s}s  val={v:.4f}")
        
        # Check for gaps (consecutive empty rows)
        populated_indices = [i for i, _ in vals]
        if len(populated_indices) > 1:
            gaps = []
            for j in range(1, len(populated_indices)):
                gap = populated_indices[j] - populated_indices[j-1]
                if gap > 2:
                    gaps.append((populated_indices[j-1], populated_indices[j], gap))
            if gaps:
                print(f"    Gaps (>2 rows empty):")
                for start, end, size in gaps[:10]:
                    print(f"      rows {start}-{end}: {size} rows gap")
    else:
        print(f"\n  {col}: COMPLETELY EMPTY")

# Also check Mode 01 standard PIDs that should be working
print("\n\n=== STANDARD PIDs STATUS ===")
std_cols = ['LOAD (%)', 'ECT (°F)', 'MAP (PSI)', 'RPM (rpm)', 'VSS (MPH)', 'MAF (lb/min)']
for col in std_cols:
    if col in headers:
        vals = [float(r[col]) for r in rows if r[col].strip()]
        if vals:
            unique = len(set(f'{v:.2f}' for v in vals))
            print(f"  {col}: {len(vals)} readings, [{min(vals):.2f} - {max(vals):.2f}], unique={unique}")

# Check ALL columns for working vs stuck vs dead
print("\n\n=== FULL COLUMN STATUS ===")
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
    if not vals:
        status = "DEAD"
    elif len(vals) < len(rows) * 0.1:
        status = f"SPARSE ({len(vals)} readings)"
    else:
        unique = len(set(f'{v:.4f}' for v in vals))
        if unique <= 1:
            status = f"STUCK at {vals[0]:.4f} ({len(vals)} readings)"
        elif unique <= 3:
            status = f"BARELY ({len(vals)} readings, {unique} unique)"
        else:
            status = f"WORKING ({len(vals)} readings, {unique} unique, [{min(vals):.2f}-{max(vals):.2f}])"
    print(f"  {col:30s}: {status}")
