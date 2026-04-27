#!/usr/bin/env python3
"""
Cross-reference HPT fuel pressure values with IntelliSpy raw CAN bytes.
HPT channels: 6502=Fuel Pressure SAE, 6510=Fuel Pressure, 6501=Desired Fuel Pressure
"""
import csv, re

# ── Parse HPT CSV ──
hpt_rows = []
with open('/home/ubuntu/upload/fuelpressurepidsonlyhptsniff.csv') as f:
    in_data = False
    headers = None
    for line in f:
        line = line.strip()
        if line == '[Channel Data]':
            in_data = True
            continue
        if in_data and line:
            parts = line.split(',')
            if len(parts) >= 5:
                try:
                    hpt_rows.append({
                        'time': float(parts[0]),
                        'fp_sae': float(parts[1]),      # Fuel Pressure SAE (psi)
                        'fp': float(parts[2]),            # Fuel Pressure (psi)
                        'fp_des': float(parts[3]),        # Desired Fuel Pressure (psi)
                        'fp_des2': float(parts[4]),       # Desired Fuel Pressure (duplicate)
                    })
                except:
                    pass

print(f"HPT rows: {len(hpt_rows)}")
print(f"HPT FP SAE range: {min(r['fp_sae'] for r in hpt_rows):.2f} - {max(r['fp_sae'] for r in hpt_rows):.2f} PSI")
print(f"HPT FP range: {min(r['fp'] for r in hpt_rows):.2f} - {max(r['fp'] for r in hpt_rows):.2f} PSI")
print(f"HPT FP DES range: {min(r['fp_des'] for r in hpt_rows):.2f} - {max(r['fp_des'] for r in hpt_rows):.2f} PSI")
print()

# ── Parse IntelliSpy CSV ──
intellispy = []
with open('/home/ubuntu/upload/intellispy_capture_2026-04-22T21-17-02-277Z.csv') as f:
    reader = csv.DictReader(f)
    for row in reader:
        intellispy.append(row)

print(f"IntelliSpy frames: {len(intellispy)}")

# Find all ReadDataByIdentifier requests (0x22 XX YY) and responses (0x62 XX YY)
# These go to 0x7E0 (TX) and come from 0x7E8 (RX)
requests = []
responses = []
for row in intellispy:
    arb_hex = row.get('ArbID_Hex', '')
    data_hex = row.get('Data_Hex', '').strip()
    ts = float(row.get('Timestamp', 0))
    
    if not data_hex:
        continue
    
    bytes_list = data_hex.split()
    if len(bytes_list) < 2:
        continue
    
    # ISO-TP single frame: first byte is PCI (0x0N where N is length)
    pci = int(bytes_list[0], 16)
    if (pci & 0xF0) != 0:
        continue  # Not a single frame
    
    payload_len = pci & 0x0F
    if payload_len < 3:
        continue
    
    payload = [int(b, 16) for b in bytes_list[1:1+payload_len]]
    
    if arb_hex == '0x7E0' and payload[0] == 0x22:
        did = (payload[1] << 8) | payload[2]
        requests.append({'ts': ts, 'did': did, 'raw': data_hex})
    
    if arb_hex == '0x7E8' and payload[0] == 0x62:
        did = (payload[1] << 8) | payload[2]
        data_bytes = payload[3:]
        responses.append({'ts': ts, 'did': did, 'data': data_bytes, 'raw': data_hex})

# Also check for multi-frame responses
for row in intellispy:
    arb_hex = row.get('ArbID_Hex', '')
    data_hex = row.get('Data_Hex', '').strip()
    ts = float(row.get('Timestamp', 0))
    
    if arb_hex != '0x7E8' or not data_hex:
        continue
    
    bytes_list = data_hex.split()
    if len(bytes_list) < 2:
        continue
    
    pci = int(bytes_list[0], 16)
    # First Frame: 0x1N LL
    if (pci & 0xF0) == 0x10:
        total_len = ((pci & 0x0F) << 8) | int(bytes_list[1], 16)
        payload = [int(b, 16) for b in bytes_list[2:]]
        if len(payload) >= 3 and payload[0] == 0x62:
            did = (payload[1] << 8) | payload[2]
            responses.append({'ts': ts, 'did': did, 'data': payload[3:], 'raw': data_hex, 'multiframe': True, 'total_len': total_len})

print(f"\nMode 22 requests: {len(requests)}")
print(f"Mode 22 responses: {len(responses)}")

# Get unique DIDs requested
unique_dids = sorted(set(r['did'] for r in requests))
print(f"\nUnique DIDs requested: {len(unique_dids)}")
for did in unique_dids:
    count = sum(1 for r in requests if r['did'] == did)
    resp_count = sum(1 for r in responses if r['did'] == did)
    # Get sample response
    sample = next((r for r in responses if r['did'] == did), None)
    if sample:
        data_str = ' '.join(f'{b:02X}' for b in sample['data'])
        raw_val = 0
        for b in sample['data']:
            raw_val = (raw_val << 8) | b
        print(f"  DID 0x{did:04X}: {count} req, {resp_count} resp, sample data=[{data_str}] raw16={raw_val}")
    else:
        print(f"  DID 0x{did:04X}: {count} req, {resp_count} resp, NO RESPONSE")

# ── Now correlate specific fuel pressure DIDs with HPT values ──
print("\n\n=== FUEL PRESSURE DID CORRELATION ===\n")

# Collect all response values for each DID over time
did_timeseries = {}
for r in responses:
    did = r['did']
    if did not in did_timeseries:
        did_timeseries[did] = []
    raw_val = 0
    for b in r['data']:
        raw_val = (raw_val << 8) | b
    did_timeseries[did].append({'ts': r['ts'], 'raw': raw_val, 'bytes': r['data']})

# For each fuel pressure DID candidate, try different formulas
fuel_candidates = [d for d in unique_dids if d in did_timeseries]
print("Testing formulas against HPT values:")
print(f"HPT FP SAE at t=0: ~{hpt_rows[0]['fp_sae']:.2f} PSI")
print(f"HPT FP at t=0: ~{hpt_rows[0]['fp']:.2f} PSI")
print(f"HPT FP DES at t=0: ~{hpt_rows[0]['fp_des']:.2f} PSI")
print()

for did in fuel_candidates:
    samples = did_timeseries[did]
    if not samples:
        continue
    raw = samples[0]['raw']
    data = samples[0]['bytes']
    
    # Try various formulas
    formulas = {}
    if len(data) >= 2:
        a, b = data[0], data[1]
        raw16 = (a << 8) | b
        formulas['raw16'] = raw16
        formulas['raw16 * 0.01868'] = raw16 * 0.01868
        formulas['raw16 * 0.1 * 0.145038'] = raw16 * 0.1 * 0.145038
        formulas['raw16 * 1.39 * 0.145038'] = raw16 * 1.39 * 0.145038
        formulas['raw16 * 0.145038'] = raw16 * 0.145038
        formulas['raw16 * 10 * 0.145038'] = raw16 * 10 * 0.145038
        formulas['raw16 / 6.895'] = raw16 / 6.895
        formulas['raw16 * 0.001'] = raw16 * 0.001
        formulas['raw16 * 0.01'] = raw16 * 0.01
        formulas['raw16 * 0.1'] = raw16 * 0.1
        formulas['raw16 * 1.0'] = raw16 * 1.0
    if len(data) >= 1:
        formulas['byte0'] = data[0]
        formulas['byte0 * 100/255'] = data[0] * 100 / 255
    
    # Check which formula matches HPT values
    print(f"\nDID 0x{did:04X} — raw bytes: [{' '.join(f'{b:02X}' for b in data)}]")
    for name, val in formulas.items():
        # Check against each HPT channel
        for hpt_name, hpt_val in [('FP_SAE', hpt_rows[0]['fp_sae']), 
                                    ('FP', hpt_rows[0]['fp']),
                                    ('FP_DES', hpt_rows[0]['fp_des'])]:
            if hpt_val != 0 and abs(val - hpt_val) / abs(hpt_val) < 0.05:  # within 5%
                print(f"  ✅ {name} = {val:.4f} ≈ HPT {hpt_name} = {hpt_val:.4f} (err={abs(val-hpt_val)/abs(hpt_val)*100:.1f}%)")
