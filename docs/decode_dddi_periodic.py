#!/usr/bin/env python3
"""
Decode the DDDI periodic frames from 0x5E8 and correlate with HPT fuel pressure values.

From the IntelliSpy capture:
- HPT sends a DDDI define: multi-frame [2D FE 00 40 01 4F] then [2C FD FE 01]
  - 0x2D = ReadDataByPeriodicIdentifier (not DDDI clear!)
  - Wait... 0x2D FE 00 40 01 4F — this is ReadDataByPeriodicIdentifier
    - subfunction 0xFE = "slow rate" periodic
    - periodicIDs: 0x00, 0x40, 0x01, 0x4F
  - Then 0x2C FD FE 01 — this is DynamicallyDefineDataIdentifier
    - subfunction 0xFD = clear
    - DID = 0xFE01
  - Then 0xAA 04 FE FD — stop periodic for FE and FD

Actually wait, let me re-read the frames more carefully.

Multi-frame: total=8 bytes, payload starts [2D FE 00 40 01 4F]
  - Service 0x2D = ReadDataByPeriodicIdentifier
  - Full payload (8 bytes): 2D FE 00 40 01 4F XX XX
  
Then: [2C FD FE 01] = DDDI define? 
  - 0x2C = DynamicallyDefineDataIdentifier
  - subfunction 0xFD (defineByMemoryAddress? or clear?)
  - Actually: 0x2C with first byte after = subfunction
  - Hmm, 0xFD could be the periodicID being defined
  
Then: [AA 04 FE FD] = stop periodic for IDs FE and FD

The 0x5E8 responses have first byte = FE or FD (the periodic ID!)
  FE frames: [FE 42 02 60 AC 0C BB 88] — 7 data bytes after periodic ID
  FD frames: [FD 42 02 2F B1 00 00 00] — 7 data bytes after periodic ID

So HPT set up 2 periodic composites (FE and FD) that stream on 0x5E8.
The data in each composite is the concatenated DID response data.

Let me decode what's in each composite by matching to HPT values.
"""
import csv

# Parse HPT values
hpt_rows = []
with open('/home/ubuntu/upload/fuelpressurepidsonlyhptsniff.csv') as f:
    in_data = False
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
                        'fp_sae': float(parts[1]),
                        'fp': float(parts[2]),
                        'fp_des': float(parts[3]),
                        'fp_des2': float(parts[4]),
                    })
                except:
                    pass

print(f"HPT rows: {len(hpt_rows)}")
print(f"HPT FP SAE: {hpt_rows[0]['fp_sae']:.4f} PSI")
print(f"HPT FP: {hpt_rows[0]['fp']:.4f} PSI")
print(f"HPT FP DES: {hpt_rows[0]['fp_des']:.4f} PSI")

# Parse 0x5E8 periodic frames
frames_5e8 = []
with open('/home/ubuntu/upload/intellispy_capture_2026-04-22T21-17-02-277Z.csv') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row.get('ArbID_Hex') == '0x5E8':
            data = row.get('Data_Hex', '').strip()
            ts = float(row.get('Timestamp', 0))
            bytes_list = [int(b, 16) for b in data.split()]
            frames_5e8.append((ts, bytes_list))

print(f"\n0x5E8 frames: {len(frames_5e8)}")

# Separate FE and FD composites
fe_frames = [(ts, b) for ts, b in frames_5e8 if b[0] == 0xFE]
fd_frames = [(ts, b) for ts, b in frames_5e8 if b[0] == 0xFD]
print(f"FE composite frames: {len(fe_frames)}")
print(f"FD composite frames: {len(fd_frames)}")

# Analyze FE composite structure
print("\n=== FE COMPOSITE (7 data bytes) ===")
print("First 10 frames:")
for ts, b in fe_frames[:10]:
    data = b[1:]  # skip periodic ID byte
    print(f"  {ts:.6f}: [{' '.join(f'{x:02X}' for x in data)}]")

# Analyze FD composite structure  
print("\n=== FD COMPOSITE (7 data bytes) ===")
print("First 10 frames:")
for ts, b in fd_frames[:10]:
    data = b[1:]
    print(f"  {ts:.6f}: [{' '.join(f'{x:02X}' for x in data)}]")

# The DDDI define was: multi-frame total=8: [2D FE 00 40 01 4F ...]
# Service 0x2D = ReadDataByPeriodicIdentifier
# 0xFE = transmissionMode (slow rate)
# Then periodic IDs: 0x00, 0x40, 0x01, 0x4F
# But wait, that's only 6 bytes shown, total is 8, so there are 2 more bytes in continuation frame
# The continuation frame would have been a CF (0x21 XX XX)
# But we don't see it in the 0x7E0 list... 

# Actually, let me re-examine. The multi-frame first frame has:
# PCI: 10 08 → total length = 8 bytes
# First 6 bytes of payload: 2D FE 00 40 01 4F
# Continuation frame would have bytes 7-8
# But we only see [30 00 00 00 00 00 00 00] as flow control FROM 0x7E0
# Wait, 0x30 is FC from the RECEIVER. So 0x7E0 sent FC, meaning 0x7E8 was the sender.
# But 0x7E0 is the ECU request address... 

# Let me re-check: the multi-frame at 14828.284705 on 0x7E0 is:
# [10 08 2D FE 00 40 01 4F] — this IS a request FROM HPT TO ECU
# It's a First Frame (10 08) with total=8 bytes
# Payload: 2D FE 00 40 01 4F (6 bytes in FF)
# Remaining 2 bytes would be in a CF (0x21 XX XX)
# But the next 0x7E0 frame is at 14828.324384: [04 2C FD FE 01]
# That's a different message entirely.

# Wait, maybe the ECU sent a FC (0x30) back on 0x7E8?
# Let me check 0x7E8 frames around that time

print("\n=== 0x7E8 frames around DDDI setup time ===")
with open('/home/ubuntu/upload/intellispy_capture_2026-04-22T21-17-02-277Z.csv') as f:
    reader = csv.DictReader(f)
    for row in reader:
        ts = float(row.get('Timestamp', 0))
        arb = row.get('ArbID_Hex', '')
        if 14828.0 < ts < 14829.0 and arb in ('0x7E0', '0x7E8'):
            print(f"  {ts:.6f} {arb}: [{row.get('Data_Hex', '')}]")

# Now try to correlate FE/FD data with HPT values
print("\n\n=== FORMULA CORRELATION ===")
print("\nFE composite — trying to match HPT Fuel Pressure (~4712 PSI) and FP SAE (~59 PSI)")
for ts, b in fe_frames[:5]:
    data = b[1:]
    # Try different byte groupings
    # 7 bytes: could be 2+2+2+1 or 2+2+3 or other combos
    if len(data) >= 7:
        w1 = (data[0] << 8) | data[1]  # bytes 0-1
        w2 = (data[2] << 8) | data[3]  # bytes 2-3
        w3 = (data[4] << 8) | data[5]  # bytes 4-5
        b6 = data[6]                    # byte 6
        
        print(f"\n  Raw: [{' '.join(f'{x:02X}' for x in data)}]")
        print(f"  w1={w1} w2={w2} w3={w3} b6={b6}")
        
        # Try formulas for each word
        for label, val in [('w1', w1), ('w2', w2), ('w3', w3)]:
            # FP SAE (~59 PSI)
            if 50 < val * 0.01868 < 70:
                print(f"    {label} * 0.01868 = {val * 0.01868:.4f} ≈ FP_SAE?")
            # FP (~4712 PSI)
            if 4500 < val * 1.39 * 0.145038 < 5000:
                print(f"    {label} * 1.39 * 0.145038 = {val * 1.39 * 0.145038:.4f} ≈ FP?")
            if 4500 < val * 0.145038 < 5000:
                print(f"    {label} * 0.145038 = {val * 0.145038:.4f} ≈ FP?")
            if 4500 < val * 10 * 0.145038 < 5000:
                print(f"    {label} * 10 * 0.145038 = {val * 10 * 0.145038:.4f} ≈ FP?")

print("\nFD composite — trying to match")
for ts, b in fd_frames[:5]:
    data = b[1:]
    if len(data) >= 7:
        w1 = (data[0] << 8) | data[1]
        w2 = (data[2] << 8) | data[3]
        w3 = (data[4] << 8) | data[5]
        b6 = data[6]
        
        print(f"\n  Raw: [{' '.join(f'{x:02X}' for x in data)}]")
        print(f"  w1={w1} w2={w2} w3={w3} b6={b6}")
        
        for label, val in [('w1', w1), ('w2', w2), ('w3', w3)]:
            if 50 < val * 0.01868 < 70:
                print(f"    {label} * 0.01868 = {val * 0.01868:.4f} ≈ FP_SAE?")
            if 4500 < val * 1.39 * 0.145038 < 5000:
                print(f"    {label} * 1.39 * 0.145038 = {val * 1.39 * 0.145038:.4f} ≈ FP?")
            if 4500 < val * 0.145038 < 5000:
                print(f"    {label} * 0.145038 = {val * 0.145038:.4f} ≈ FP?")
            if 4500 < val * 10 * 0.145038 < 5000:
                print(f"    {label} * 10 * 0.145038 = {val * 10 * 0.145038:.4f} ≈ FP?")
