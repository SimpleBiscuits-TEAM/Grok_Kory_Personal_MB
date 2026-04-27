#!/usr/bin/env python3
"""
Decode the DDDI periodic frames from the fuel-pressure-only IntelliSpy capture
and correlate with HPT fuel pressure values to find the correct byte positions.

HPT channels in this capture:
- Fuel Pressure SAE (low feed pressure) — should be ~60 PSI at idle
- Fuel Pressure Desired — should be ~4700 PSI at idle
- Fuel Pressure Actual — should be ~4700 PSI at idle
"""
import csv
import re

# ============================================================
# 1. Parse HPT fuel pressure CSV
# ============================================================
hpt_rows = []
with open('/home/ubuntu/upload/fuelpressurepidsonlyhptsniff.csv') as f:
    lines = f.readlines()

# Find the header line (has "Fuel Pressure" in it)
header_idx = None
for i, line in enumerate(lines):
    if 'Fuel Pressure' in line or 'Time' in line:
        header_idx = i
        break

if header_idx is None:
    # Try line 0
    header_idx = 0

print(f"HPT header at line {header_idx}: {lines[header_idx].strip()[:200]}")

# Parse as CSV from header line
reader = csv.reader(lines[header_idx:])
hpt_headers = next(reader)
print(f"HPT columns: {hpt_headers}")

for row in reader:
    if len(row) >= len(hpt_headers) and row[0].strip():
        try:
            vals = {}
            for i, h in enumerate(hpt_headers):
                try:
                    vals[h.strip()] = float(row[i])
                except:
                    vals[h.strip()] = row[i].strip()
            hpt_rows.append(vals)
        except:
            pass

print(f"HPT data rows: {len(hpt_rows)}")
if hpt_rows:
    print(f"HPT sample: {hpt_rows[0]}")
    print(f"HPT last:   {hpt_rows[-1]}")

# ============================================================
# 2. Parse IntelliSpy capture — get ALL frames
# ============================================================
intellispy_frames = []
with open('/home/ubuntu/upload/intellispy_capture_2026-04-22T21-17-02-277Z.csv') as f:
    reader = csv.DictReader(f)
    for row in reader:
        ts = float(row.get('Timestamp', 0))
        arb = row.get('ArbID_Hex', '')
        data = row.get('Data_Hex', '').strip()
        intellispy_frames.append((ts, arb, data))

print(f"\nIntelliSpy total frames: {len(intellispy_frames)}")

# ============================================================
# 3. Find all DDDI periodic frames (arb IDs 0x5E8, 0x5E9, etc.)
# ============================================================
periodic_arbs = {}
for ts, arb, data in intellispy_frames:
    if arb.startswith('0x5E') or arb.startswith('0x5F'):
        periodic_arbs[arb] = periodic_arbs.get(arb, 0) + 1

print(f"\nPeriodic arb IDs:")
for arb, cnt in sorted(periodic_arbs.items()):
    print(f"  {arb}: {cnt} frames")

# ============================================================
# 4. Also check for Mode 22 requests/responses on 0x7E0/0x7E8
# ============================================================
m22_requests = []
m22_responses = []
for ts, arb, data in intellispy_frames:
    bl = [int(b, 16) for b in data.split()]
    if arb == '0x7E0':
        pci = bl[0]
        if pci <= 7 and pci >= 3 and bl[1] == 0x22:
            did = (bl[2] << 8) | bl[3]
            m22_requests.append((ts, did))
    elif arb == '0x7E8':
        pci = bl[0]
        if pci <= 7 and pci >= 3 and bl[1] == 0x62:
            did = (bl[2] << 8) | bl[3]
            resp_bytes = bl[4:4 + (pci - 3)]
            m22_responses.append((ts, did, resp_bytes))

print(f"\nMode 22 requests: {len(m22_requests)}")
print(f"Mode 22 responses: {len(m22_responses)}")

if m22_responses:
    print("\nMode 22 response DIDs:")
    seen = set()
    for ts, did, resp in m22_responses:
        if did not in seen:
            seen.add(did)
            raw = (resp[0] << 8 | resp[1]) if len(resp) >= 2 else resp[0] if resp else 0
            print(f"  0x{did:04X}: raw={raw} bytes={resp}")

# ============================================================
# 5. Parse DDDI setup (0x2C defines) from 0x7E0
# ============================================================
dddi_setup = []
for ts, arb, data in intellispy_frames:
    bl = [int(b, 16) for b in data.split()]
    if arb == '0x7E0':
        pci = bl[0]
        if pci <= 7 and pci >= 1 and bl[1] == 0x2C:
            dddi_setup.append((ts, bl))
        # Multi-frame DDDI define
        if (pci & 0xF0) == 0x10 and bl[2] == 0x2C:
            dddi_setup.append((ts, bl))

print(f"\nDDDI setup frames: {len(dddi_setup)}")
for ts, bl in dddi_setup[:20]:
    print(f"  t={ts:.3f}: {' '.join(f'{b:02X}' for b in bl)}")

# ============================================================
# 6. Decode periodic frames and try to correlate with HPT values
# ============================================================
# Get periodic frames from the most common arb ID
if periodic_arbs:
    main_arb = max(periodic_arbs.items(), key=lambda x: x[1])[0]
    print(f"\nDecoding periodic frames from {main_arb}:")
    
    periodic_data = []
    for ts, arb, data in intellispy_frames:
        if arb == main_arb:
            bl = [int(b, 16) for b in data.split()]
            periodic_data.append((ts, bl))
    
    # Show first 20 frames
    for ts, bl in periodic_data[:20]:
        print(f"  t={ts:.6f}: {' '.join(f'{b:02X}' for b in bl)}")
    
    # Check if byte[0] is a periodic ID indicator
    pid_groups = {}
    for ts, bl in periodic_data:
        key = bl[0]
        if key not in pid_groups:
            pid_groups[key] = []
        pid_groups[key].append((ts, bl))
    
    print(f"\nPeriodic ID groups:")
    for pid, frames in sorted(pid_groups.items()):
        print(f"  PID 0x{pid:02X}: {len(frames)} frames")
        # Show byte variation
        if len(frames) > 1:
            for byte_pos in range(1, 8):
                vals = set()
                for _, bl in frames:
                    if byte_pos < len(bl):
                        vals.add(bl[byte_pos])
                if len(vals) > 1:
                    print(f"    byte[{byte_pos}] varies: {len(vals)} unique values, range [{min(vals)}-{max(vals)}]")
                    # Try 2-byte combos
                    if byte_pos < 7:
                        vals16 = set()
                        for _, bl in frames:
                            if byte_pos + 1 < len(bl):
                                vals16.add((bl[byte_pos] << 8) | bl[byte_pos + 1])
                        if len(vals16) > 1:
                            mn16 = min(vals16)
                            mx16 = max(vals16)
                            # Check if this could be fuel pressure
                            # FP_ACT ~4700 PSI, raw ~23346 (×0.2015)
                            # FP_SAE ~60 PSI
                            for scale in [0.2015, 0.01868, 1.0, 0.1, 0.01]:
                                eng_min = mn16 * scale
                                eng_max = mx16 * scale
                                if 4000 < eng_min < 5000 and 4000 < eng_max < 6000:
                                    print(f"      → 16-bit [{mn16}-{mx16}] × {scale} = [{eng_min:.1f}-{eng_max:.1f}] PSI — POSSIBLE FRP!")
                                if 40 < eng_min < 80 and 40 < eng_max < 80:
                                    print(f"      → 16-bit [{mn16}-{mx16}] × {scale} = [{eng_min:.1f}-{eng_max:.1f}] PSI — POSSIBLE FP_SAE!")
else:
    print("No periodic frames found!")

# ============================================================
# 7. Check ALL arb IDs for fuel-pressure-like values
# ============================================================
print("\n\n=== ALL ARB IDs ===")
arb_counts = {}
for ts, arb, data in intellispy_frames:
    arb_counts[arb] = arb_counts.get(arb, 0) + 1

for arb, cnt in sorted(arb_counts.items(), key=lambda x: -x[1])[:30]:
    print(f"  {arb}: {cnt} frames")
