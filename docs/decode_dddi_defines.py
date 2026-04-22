"""
Decode the DDDI DEFINE commands from the IntelliSpy capture.
The multi-frame messages at ~9690.85s are:
  2C FD 00 4F 00 10 00 0A
  2C FB 20 B4 30 BE 32 8A 00 0D
  2C F9 30 8A 13 2A 32 A8 00 0F 00 05
  2C F8 11 BB 20 BC 32 A8 00 0F 00 05 00 33 23 2C

These are UDS 0x2C service, subfunction 0x01 (defineByIdentifier).
Format: 2C 01 [target_hi target_lo] [src_hi src_lo pos size] [src_hi src_lo pos size] ...

Wait — the output shows them WITHOUT the 0x01 subfunction byte. Let me re-check.
Actually looking at the raw output more carefully:
  2C FD 00 4F 00 10 00 0A
  → 0x2C = service, FD = ??? 

Hmm, that doesn't match. Let me re-read the UDS spec:
  0x2C = DynamicallyDefineDataIdentifier
  Subfunction: 0x01 = defineByIdentifier, 0x02 = defineByMemoryAddress, 0x03 = clearDynamicallyDefinedDataIdentifier

Wait — looking at the DDDI clears: "2C FE 00 XX" — that's 0x2C, 0xFE, 0x00, XX
  0x2C = service
  0xFE = ??? That's not a standard subfunction.

This must be GM proprietary. Let me look at the actual frame bytes more carefully.
The clears are: SF [04] 2C FE 00 XX — so 0x2C is service, 0xFE is subfunction (GM clear), 0x00 XX is the periodic ID.

The defines: MF 2C FD 00 4F 00 10 00 0A
  0x2C = service
  0xFD = subfunction (GM define?)
  
No wait — looking at the original capture decode output again:
  [9690.854] Multi-frame: 2C FD 00 4F 00 10 00 0A

Actually 0xFD here might be the target periodic DID low byte!
Standard UDS DDDI: 2C [subfunction] [DID_hi] [DID_lo] ...
  For GM, periodic DIDs are in F200-F2FF range.
  So: 2C 01 F2 FD ... would define periodic DID 0xF2FD

But that doesn't match either. Let me look at what the PCAN bridge does:

From the bridge code (which I analyzed earlier), the DDDI define format was:
  0x2C 0x01 [target_hi] [target_lo] [source_hi] [source_lo] [pos] [size] ...

But the raw bytes show: 2C FD 00 4F 00 10 00 0A
  If 0x01 subfunction is implicit/omitted in GM:
    target = 0xFD (single byte periodic ID)
    Then: 00 4F = source DID 0x004F? That doesn't exist.
  
  OR: 2C = service, 01 = subfunction (but where is it?)
  
Let me look at the ACTUAL raw CAN frames, not the reassembled payload.
"""

import csv

def parse_intellispy(filepath):
    frames = []
    with open(filepath) as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                arb_id = int(row.get('ArbID', '0'))
                timestamp = float(row.get('Timestamp', 0))
                data_hex = row.get('Data_Hex', '').strip('"')
                data_bytes = []
                for b in data_hex.split():
                    try:
                        data_bytes.append(int(b, 16))
                    except:
                        pass
                frames.append({
                    'time': timestamp,
                    'arb_id': arb_id,
                    'data': data_bytes,
                })
            except:
                pass
    return frames

frames = parse_intellispy('/home/ubuntu/upload/intellispy_capture_2026-04-22T19-51-58-354Z.csv')

# Get ALL frames between 9690.8 and 9691.0 (the DDDI define window)
print("=" * 80)
print("RAW CAN FRAMES DURING DDDI DEFINE WINDOW (9690.8 - 9691.0)")
print("=" * 80)

for f in frames:
    if 9690.8 <= f['time'] <= 9691.0 and f['arb_id'] in (0x7E0, 0x7E8):
        direction = "TX" if f['arb_id'] == 0x7E0 else "RX"
        hex_data = ' '.join(f'{b:02X}' for b in f['data'])
        
        # Decode PCI
        pci = f['data'][0] >> 4 if f['data'] else -1
        pci_type = {0: 'SF', 1: 'FF', 2: 'CF', 3: 'FC'}.get(pci, '??')
        
        print(f"  [{f['time']:.6f}] {direction} 0x{f['arb_id']:03X} [{pci_type}] {hex_data}")

# Now also look at the AA start command and what comes after the defines
print("\n" + "=" * 80)
print("RAW CAN FRAMES AROUND PERIODIC START (9690.9 - 9691.1)")
print("=" * 80)

for f in frames:
    if 9690.9 <= f['time'] <= 9691.1 and f['arb_id'] in (0x7E0, 0x7E8, 0x5E8):
        direction = {0x7E0: "TX", 0x7E8: "RX", 0x5E8: "PER"}.get(f['arb_id'], "??")
        hex_data = ' '.join(f'{b:02X}' for b in f['data'])
        pci = f['data'][0] >> 4 if f['data'] and f['arb_id'] != 0x5E8 else -1
        pci_type = {0: 'SF', 1: 'FF', 2: 'CF', 3: 'FC'}.get(pci, '  ')
        print(f"  [{f['time']:.6f}] {direction} 0x{f['arb_id']:03X} [{pci_type}] {hex_data}")

# Also look at the fuel-pressure-only capture for DDDI defines
print("\n" + "=" * 80)
print("FUEL PRESSURE CAPTURE — ALL 0x7E0/0x7E8 FRAMES")
print("=" * 80)

frames2 = parse_intellispy('/home/ubuntu/upload/intellispy_capture_2026-04-22T21-17-02-277Z.csv')
ecm_frames = [f for f in frames2 if f['arb_id'] in (0x7E0, 0x7E8)]
print(f"Total ECM frames: {len(ecm_frames)}")

for f in ecm_frames[:100]:
    direction = "TX" if f['arb_id'] == 0x7E0 else "RX"
    hex_data = ' '.join(f'{b:02X}' for b in f['data'])
    pci = f['data'][0] >> 4 if f['data'] else -1
    pci_type = {0: 'SF', 1: 'FF', 2: 'CF', 3: 'FC'}.get(pci, '??')
    print(f"  [{f['time']:.6f}] {direction} 0x{f['arb_id']:03X} [{pci_type}] {hex_data}")
