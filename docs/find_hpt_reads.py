#!/usr/bin/env python3
"""Find all 0x7E0/0x7E8 frames in the IntelliSpy capture to see how HPT reads fuel pressure."""
import csv

frames_7e0 = []
frames_7e8 = []
frames_5e8 = []

with open('/home/ubuntu/upload/intellispy_capture_2026-04-22T21-17-02-277Z.csv') as f:
    reader = csv.DictReader(f)
    for row in reader:
        arb = row.get('ArbID_Hex', '')
        data = row.get('Data_Hex', '').strip()
        ts = float(row.get('Timestamp', 0))
        if arb == '0x7E0':
            frames_7e0.append((ts, data))
        elif arb == '0x7E8':
            frames_7e8.append((ts, data))
        elif arb == '0x5E8':
            frames_5e8.append((ts, data))

print(f"0x7E0 frames: {len(frames_7e0)}")
print(f"0x7E8 frames: {len(frames_7e8)}")
print(f"0x5E8 frames: {len(frames_5e8)}")

# Show all 0x7E0 frames (requests from HPT)
print("\n=== ALL 0x7E0 FRAMES (HPT → ECU) ===")
for ts, data in frames_7e0[:50]:
    print(f"  {ts:.6f}: [{data}]")

# Show 0x7E8 frames that look like Mode 22 responses (0x62 XX YY)
print("\n=== 0x7E8 FRAMES with Mode 22 responses ===")
mode22_resps = []
for ts, data in frames_7e8:
    bytes_list = data.split()
    if len(bytes_list) < 2:
        continue
    pci = int(bytes_list[0], 16)
    # Single frame
    if (pci & 0xF0) == 0:
        payload_len = pci & 0x0F
        if payload_len >= 4:
            payload = [int(b, 16) for b in bytes_list[1:1+payload_len]]
            if payload[0] == 0x62:
                did = (payload[1] << 8) | payload[2]
                data_bytes = payload[3:]
                mode22_resps.append((ts, did, data_bytes, data))

print(f"Mode 22 single-frame responses: {len(mode22_resps)}")
for ts, did, db, raw in mode22_resps[:30]:
    raw_val = 0
    for b in db:
        raw_val = (raw_val << 8) | b
    print(f"  {ts:.6f}: DID 0x{did:04X} data=[{' '.join(f'{b:02X}' for b in db)}] raw16={raw_val}")

# Show 0x5E8 periodic frames (DDDI composites)
print(f"\n=== 0x5E8 PERIODIC FRAMES (first 30) ===")
for ts, data in frames_5e8[:30]:
    print(f"  {ts:.6f}: [{data}]")

# Now look for DDDI clear/define sequences
print("\n=== DDDI CLEAR/DEFINE SEQUENCES ===")
for ts, data in frames_7e0:
    bytes_list = data.split()
    if len(bytes_list) < 2:
        continue
    pci = int(bytes_list[0], 16)
    if (pci & 0xF0) == 0:
        payload_len = pci & 0x0F
        payload = [int(b, 16) for b in bytes_list[1:1+payload_len]]
        if payload and payload[0] == 0x2C:
            print(f"  {ts:.6f}: DDDI [{' '.join(f'{b:02X}' for b in payload)}]")
        elif payload and payload[0] == 0xAA:
            print(f"  {ts:.6f}: STOP PERIODIC [{' '.join(f'{b:02X}' for b in payload)}]")
        elif payload and payload[0] == 0x22:
            did = (payload[1] << 8) | payload[2] if len(payload) >= 3 else 0
            print(f"  {ts:.6f}: READ DID 0x{did:04X}")

# Check for ReadMemoryByAddress (0x23)
print("\n=== ReadMemoryByAddress (0x23) ===")
for ts, data in frames_7e0:
    bytes_list = data.split()
    if len(bytes_list) < 2:
        continue
    pci = int(bytes_list[0], 16)
    if (pci & 0xF0) == 0:
        payload_len = pci & 0x0F
        payload = [int(b, 16) for b in bytes_list[1:1+payload_len]]
        if payload and payload[0] == 0x23:
            print(f"  {ts:.6f}: RMBA [{' '.join(f'{b:02X}' for b in payload)}]")

# Check multi-frame 0x7E0 requests
print("\n=== Multi-frame 0x7E0 requests ===")
for ts, data in frames_7e0:
    bytes_list = data.split()
    if len(bytes_list) < 2:
        continue
    pci = int(bytes_list[0], 16)
    if (pci & 0xF0) == 0x10:
        total_len = ((pci & 0x0F) << 8) | int(bytes_list[1], 16)
        payload = [int(b, 16) for b in bytes_list[2:]]
        print(f"  {ts:.6f}: FF total={total_len} [{' '.join(f'{b:02X}' for b in payload)}]")
