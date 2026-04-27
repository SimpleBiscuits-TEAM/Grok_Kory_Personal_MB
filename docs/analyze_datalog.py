import csv
import sys

# Read the datalog CSV
filepath = '/home/ubuntu/upload/datalog_2026-04-22T21-04-04-587Z.csv'

# Skip comment lines
lines = []
with open(filepath, 'r') as f:
    for line in f:
        if not line.startswith('#'):
            lines.append(line)

# Parse CSV
reader = csv.DictReader(lines)
headers = reader.fieldnames
print(f"Total columns: {len(headers)}")
print()

# Collect data
rows = list(reader)
print(f"Total data rows: {len(rows)}")
print()

# Analyze each column
print(f"{'Column':<30} {'Non-empty':<10} {'Sample Values':<60} {'Issue?'}")
print("-" * 120)

for col in headers:
    values = [r[col] for r in rows if r[col] and r[col].strip()]
    non_empty = len(values)
    
    if non_empty == 0:
        sample = "ALL EMPTY"
        issue = "DEAD"
    else:
        # Get unique non-empty values (first 5)
        unique = list(set(values[:min(50, len(values))]))[:5]
        sample = ", ".join(unique[:3])
        if len(sample) > 55:
            sample = sample[:55] + "..."
        
        # Check for suspicious values
        try:
            nums = [float(v) for v in values[:50] if v]
            avg = sum(nums) / len(nums) if nums else 0
            mn = min(nums) if nums else 0
            mx = max(nums) if nums else 0
            
            if all(v == 0 for v in nums):
                issue = "ALL ZEROS"
            elif mn == mx:
                issue = f"CONSTANT={mn}"
            else:
                issue = f"range [{mn:.2f}, {mx:.2f}] avg={avg:.2f}"
        except:
            issue = "non-numeric"
    
    pct = f"{non_empty}/{len(rows)}"
    print(f"{col:<30} {pct:<10} {sample:<60} {issue}")
