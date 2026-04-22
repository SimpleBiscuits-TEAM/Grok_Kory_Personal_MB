"""
Decode the DDDI periodic frame structure from the fuel-pressure-only capture.
This capture is simpler: only 3 HPT channels (FP_ACT, FP_DES, FP_SAE).

From the full capture, the DDDI DEFINE commands are:

FULL CAPTURE DDDI DEFINES (reassembled):
  FE: IOCTL setup (0x2D FE 00 ...) + DDDI define (0x2C FE ...) — embedded in multi-frame
      CF1: 84 04 00 00 00 00 00 → IOCTL: 2D FE 00 40 01 84 04 (address/length?)
      CF2: 15 40 00 00 00 00 00 → DDDI: 2C FE 15 40 (source DID 0x1540?)
  FD: 2C FD 00 4F 00 10 00 0A → defineByIdentifier: target=FD, source=0x004F pos=0 size=16, source2=0x000A?
  FB: 2C FB 20 B4 30 BE 32 8A 00 0D → target=FB, sources: 0x20B4, 0x30BE, 0x328A, pos/size=0x00 0x0D
  FA: (response 6C FA seen but define not captured in this window)
  F9: 2C F9 30 8A 13 2A → target=F9, sources: 0x308A, 0x132A
  F8: 2C F8 11 BB 20 BC 32 A8 00 0F 00 05 00 33 23 2C → target=F8, sources: 0x11BB, 0x20BC, 0x32A8, 0x000F, 0x0005, 0x0033, 0x232C

Wait — the DDDI defineByIdentifier format is:
  0x2C [subfunction=01] [targetDID_hi] [targetDID_lo] [sourceDID_hi] [sourceDID_lo] [posInSource] [sizeInSource] ...

But for GM, the target DID is a single byte (F8-FE), not two bytes.
And the subfunction is embedded differently.

Let me re-examine. The UDS 0x2C service:
  Byte 0: 0x2C (service)
  Byte 1: subfunction (01=defineByIdentifier, 02=defineByMemoryAddress, 03=clear)
  
But HPT sends: 2C FD 00 4F 00 10 00 0A
  If subfunction = FD, that's not standard.
  
Actually, GM uses a PROPRIETARY variant of 0x2C:
  Byte 0: 0x2C
  Byte 1: target periodic ID (F8-FE)
  Byte 2+: source DID high, source DID low, position, size, ...

Let me decode with this format:

FD: 2C FD | 00 4F | 00 10 | 00 0A
  → target=FD, source1=DID 0x004F pos=0x00 size=0x10(16), source2=DID 0x000A?
  That doesn't make sense. 0x004F and 0x000A aren't valid DIDs.

Alternative: maybe it's:
  2C FD | sourceType | sourceDID_hi | sourceDID_lo | position | size | ...

Or maybe the format is:
  2C [target] [sourceDID_hi] [sourceDID_lo] [startByte] [numBytes] [sourceDID_hi] [sourceDID_lo] [startByte] [numBytes] ...

Let me try FB: 2C FB 20 B4 30 BE 32 8A 00 0D
  target=FB
  source1: DID=0x20B4, startByte=?, numBytes=?
  But 0x30BE and 0x328A are also valid DIDs...
  
  If format is [DID_hi DID_lo startByte numBytes]:
    source1: DID=0x20B4, start=0x30, num=0xBE → doesn't make sense
    
  If format is [DID_hi DID_lo] [DID_hi DID_lo] [DID_hi DID_lo] [extra]:
    sources: 0x20B4, 0x30BE, 0x328A, extra=0x00 0x0D
    
  Actually, looking at the GM DDDI format more carefully:
  The GM format for defineByIdentifier (subfunction 0x01) is:
    2C 01 [targetDID_hi] [targetDID_lo] [sourceDID_hi] [sourceDID_lo] [position] [memorySize]
    
  But HPT doesn't use subfunction 0x01. It uses the target ID directly as byte 1.
  This is the GM-proprietary DDDI format where:
    2C [targetPeriodicID] [sourceDID_hi] [sourceDID_lo] [positionInSourceRecord] [memorySize] ...
    
  So FB: 2C FB | 20 B4 | 30 BE | 32 8A | 00 0D
  That would be: target=FB, source=0x20B4, pos=0x30, size=0xBE, ... no that's wrong too.
  
  Let me try 4-byte groups: [DID_hi DID_lo pos size]
  FB: 2C FB | 20 B4 30 BE | 32 8A 00 0D
    source1: DID=0x20B4, pos=0x30, size=0xBE → no, pos and size too large
    
  Or 3-byte groups: [DID_hi DID_lo size]
  FB: 2C FB | 20 B4 30 | BE 32 8A | 00 0D ??
    source1: DID=0x20B4, size=0x30 → 48 bytes? no
    
  Let me look at F8 which has the most data:
  F8: 2C F8 11 BB 20 BC 32 A8 00 0F 00 05 00 33 23 2C
  
  If 2-byte DID pairs: 0x11BB, 0x20BC, 0x32A8, 0x000F, 0x0005, 0x0033, 0x232C
  That's 7 DIDs. 0x000F, 0x0005, 0x0033 aren't valid DIDs.
  
  If 4-byte groups [DID_hi DID_lo pos size]:
  F8: 2C F8 | 11 BB 20 BC | 32 A8 00 0F | 00 05 00 33 | 23 2C
    source1: DID=0x11BB, pos=0x20, size=0xBC → no
    
  Wait — what if the GM format is:
  2C [target] [sourceDID_hi sourceDID_lo positionInSource sizeOfData] repeated
  
  Where position and size are 1-byte each:
  F8: 2C F8 | 11 BB 01 02 | 20 BC 01 02 | 32 A8 01 02 | 00 0F 01 02 → no, doesn't fit
  
  Let me try: [sourceDID_hi sourceDID_lo sizeOfData] (3-byte groups, no position):
  F8: 2C F8 | 11 BB 02 | 0B C3 2A | 80 0F 00 | 05 00 33 | 23 2C → no
  
  Actually let me re-read the raw bytes more carefully from the capture.
"""

import csv

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

# Use the fuel-pressure-only capture — it's simpler
frames_fp = parse_frames('/home/ubuntu/upload/intellispy_capture_2026-04-22T21-17-02-277Z.csv')

print("=" * 80)
print("FUEL PRESSURE CAPTURE — ALL 0x7E0 TX FRAMES")
print("=" * 80)

for t, aid, d in frames_fp:
    if aid == 0x7E0:
        hex_str = ' '.join(f'{b:02X}' for b in d)
        pci = d[0] >> 4 if d else -1
        pci_names = {0: 'SF', 1: 'FF', 2: 'CF', 3: 'FC'}
        print(f"  [{t:.6f}] [{pci_names.get(pci,'??')}] {hex_str}")

print("\n" + "=" * 80)
print("FUEL PRESSURE CAPTURE — ALL 0x7E8 RX FRAMES")
print("=" * 80)

for t, aid, d in frames_fp:
    if aid == 0x7E8:
        hex_str = ' '.join(f'{b:02X}' for b in d)
        pci = d[0] >> 4 if d else -1
        pci_names = {0: 'SF', 1: 'FF', 2: 'CF', 3: 'FC'}
        print(f"  [{t:.6f}] [{pci_names.get(pci,'??')}] {hex_str}")

print("\n" + "=" * 80)
print("FUEL PRESSURE CAPTURE — ALL 0x5E8 PERIODIC FRAMES (first 20)")
print("=" * 80)

periodic_count = 0
for t, aid, d in frames_fp:
    if aid == 0x5E8:
        hex_str = ' '.join(f'{b:02X}' for b in d)
        print(f"  [{t:.6f}] {hex_str}")
        periodic_count += 1
        if periodic_count >= 20:
            break

# Count total periodic frames
total_periodic = sum(1 for t, aid, d in frames_fp if aid == 0x5E8)
print(f"\n  Total periodic frames on 0x5E8: {total_periodic}")

# Now correlate periodic frame bytes with HPT values
print("\n" + "=" * 80)
print("FUEL PRESSURE CAPTURE — PERIODIC BYTE CORRELATION WITH HPT")
print("=" * 80)

# Load HPT data
import csv as csv2
hpt_data = []
with open('/home/ubuntu/upload/fuelpressurepidsonlyhptsniff.csv') as f:
    lines = f.readlines()
    # Find the header line (has channel names)
    for i, line in enumerate(lines):
        if 'Fuel Pressure SAE' in line or 'Fuel Pressure' in line:
            # Parse from here
            headers = [h.strip().strip('"') for h in line.split(',')]
            for j in range(i+1, len(lines)):
                vals = lines[j].strip().split(',')
                if len(vals) >= len(headers):
                    try:
                        row = {}
                        for k, h in enumerate(headers):
                            try:
                                row[h] = float(vals[k].strip().strip('"'))
                            except:
                                row[h] = vals[k].strip().strip('"')
                        hpt_data.append(row)
                    except:
                        pass
            break

print(f"HPT data rows: {len(hpt_data)}")
if hpt_data:
    print(f"HPT headers: {list(hpt_data[0].keys())}")
    # Show first 5 rows
    for row in hpt_data[:5]:
        print(f"  {row}")

# Get periodic frames with timestamps
periodic_frames = [(t, d) for t, aid, d in frames_fp if aid == 0x5E8]
print(f"\nPeriodic frames: {len(periodic_frames)}")

# Show byte patterns
print("\nPeriodic frame byte analysis:")
if periodic_frames:
    # Separate by first byte (periodic ID)
    from collections import defaultdict
    by_id = defaultdict(list)
    for t, d in periodic_frames:
        pid = d[0] if d else 0
        by_id[pid].append((t, d))
    
    for pid in sorted(by_id.keys()):
        frames_list = by_id[pid]
        print(f"\n  Periodic ID 0x{pid:02X}: {len(frames_list)} frames")
        # Show first 5
        for t, d in frames_list[:5]:
            hex_str = ' '.join(f'{b:02X}' for b in d)
            print(f"    [{t:.6f}] {hex_str}")
        
        # Show byte ranges
        if len(frames_list) > 1:
            for byte_idx in range(1, 8):
                vals = [d[byte_idx] for t, d in frames_list if len(d) > byte_idx]
                if vals:
                    min_v, max_v = min(vals), max(vals)
                    # Also check 16-bit values
                    print(f"    Byte {byte_idx}: min={min_v} max={max_v} range={max_v-min_v}")
            
            # Check 16-bit combinations
            print("    16-bit combinations:")
            for start in range(1, 7):
                vals16 = [(d[start] << 8) | d[start+1] for t, d in frames_list if len(d) > start+1]
                if vals16:
                    min_v, max_v = min(vals16), max(vals16)
                    if max_v - min_v > 0:
                        print(f"      Bytes [{start}:{start+2}]: min={min_v} max={max_v} range={max_v-min_v}")
