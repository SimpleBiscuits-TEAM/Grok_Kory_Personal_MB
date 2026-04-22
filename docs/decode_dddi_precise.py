"""
Precisely decode the 4 DDDI define multi-frame messages from the original capture.
Focus on the exact raw CAN bytes at 9690.83-9690.95.
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

frames = parse_frames('/home/ubuntu/upload/intellispy_capture_2026-04-22T19-51-58-354Z.csv')

# Get ALL 0x7E0 and 0x7E8 frames from 9690.82 to 9690.97
print("=" * 80)
print("ALL ECM FRAMES DURING DDDI DEFINE WINDOW")
print("=" * 80)

window = [(t, aid, d) for t, aid, d in frames if 9690.82 <= t <= 9691.0 and aid in (0x7E0, 0x7E8)]
for t, aid, d in window:
    dir = "TX→ECM" if aid == 0x7E0 else "RX←ECM"
    hex_str = ' '.join(f'{b:02X}' for b in d)
    pci = d[0] >> 4
    pci_names = {0: 'SF', 1: 'FF', 2: 'CF', 3: 'FC'}
    print(f"  [{t:.6f}] {dir} [{pci_names.get(pci,'??')}] {hex_str}")

# Now manually reassemble each multi-frame message
print("\n" + "=" * 80)
print("REASSEMBLED MULTI-FRAME MESSAGES")
print("=" * 80)

tx_frames = [(t, d) for t, aid, d in window if aid == 0x7E0]
rx_frames = [(t, d) for t, aid, d in window if aid == 0x7E8]

# Group TX frames into messages (FF + CFs)
messages = []
i = 0
while i < len(tx_frames):
    t, d = tx_frames[i]
    pci = d[0] >> 4
    
    if pci == 1:  # First Frame
        total_len = ((d[0] & 0x0F) << 8) | d[1]
        payload = d[2:]  # 6 bytes from FF
        i += 1
        # Collect consecutive frames
        while i < len(tx_frames) and len(payload) < total_len:
            t2, d2 = tx_frames[i]
            if d2[0] >> 4 == 2:  # CF
                payload.extend(d2[1:])  # 7 bytes from CF
                i += 1
            else:
                break
        messages.append(('MF', t, payload[:total_len], total_len))
    elif pci == 0:  # Single Frame
        sf_len = d[0] & 0x0F
        payload = d[1:1+sf_len]
        messages.append(('SF', t, payload, sf_len))
        i += 1
    elif pci == 3:  # Flow Control (we sent)
        i += 1
    else:
        i += 1

for msg_type, t, payload, length in messages:
    hex_str = ' '.join(f'{b:02X}' for b in payload)
    print(f"\n  [{t:.6f}] {msg_type} ({length} bytes): {hex_str}")
    
    if payload and payload[0] == 0x2C:
        # DDDI service
        print(f"    Service: 0x2C (DynamicallyDefineDataIdentifier)")
        # GM format appears to be: 2C [target_periodic_id] [source_did_hi source_did_lo ...] 
        # The subfunction byte (01) might be omitted in GM's implementation
        target = payload[1]
        print(f"    Target Periodic ID: 0x{target:02X}")
        
        # Try to decode as: 2C [target] [src_hi src_lo] [src_hi src_lo] ...
        # Each source DID is 2 bytes
        remaining = payload[2:]
        print(f"    Remaining bytes: {' '.join(f'{b:02X}' for b in remaining)}")
        
        # Try interpreting as pairs of source DIDs
        source_dids = []
        for j in range(0, len(remaining) - 1, 2):
            did = (remaining[j] << 8) | remaining[j+1]
            source_dids.append(did)
        print(f"    As source DIDs (2-byte pairs): {', '.join(f'0x{d:04X}' for d in source_dids)}")
        
    elif payload and payload[0] == 0xAA:
        print(f"    GM Proprietary: 0xAA")
        print(f"    Subcommand: 0x{payload[1]:02X}")
        if payload[1] == 0x03:
            print(f"    START periodic for IDs: {', '.join(f'0x{b:02X}' for b in payload[2:])}")
        elif payload[1] == 0x04:
            print(f"    STOP periodic: {', '.join(f'0x{b:02X}' for b in payload[2:])}")

# Now do the same for the FULL sequence including the AA start command
print("\n" + "=" * 80)
print("LOOKING FOR AA START COMMAND (9690.9 - 9691.5)")
print("=" * 80)

aa_window = [(t, aid, d) for t, aid, d in frames if 9690.9 <= t <= 9691.5 and aid == 0x7E0]
for t, aid, d in aa_window:
    hex_str = ' '.join(f'{b:02X}' for b in d)
    pci = d[0] >> 4
    if pci == 0:
        sf_len = d[0] & 0x0F
        payload = d[1:1+sf_len]
        if payload and payload[0] == 0xAA:
            print(f"  [{t:.6f}] AA command: {' '.join(f'{b:02X}' for b in payload)}")
        elif payload and payload[0] == 0x3E:
            print(f"  [{t:.6f}] TesterPresent: {' '.join(f'{b:02X}' for b in payload)}")

# Look wider for the AA start
print("\nSearching wider window 9690.0 - 9700.0 for AA commands...")
for t, aid, d in frames:
    if 9690.0 <= t <= 9700.0 and aid == 0x7E0:
        pci = d[0] >> 4
        if pci == 0:
            sf_len = d[0] & 0x0F
            payload = d[1:1+sf_len]
            if payload and payload[0] == 0xAA:
                print(f"  [{t:.6f}] AA: {' '.join(f'{b:02X}' for b in payload)}")

# Also decode the fuel pressure capture DDDI setup
print("\n" + "=" * 80)
print("FUEL PRESSURE CAPTURE — DDDI SETUP SEQUENCE")
print("=" * 80)

frames2 = parse_frames('/home/ubuntu/upload/intellispy_capture_2026-04-22T21-17-02-277Z.csv')
ecm_tx2 = [(t, d) for t, aid, d in frames2 if aid == 0x7E0]
ecm_rx2 = [(t, d) for t, aid, d in frames2 if aid == 0x7E8]

print(f"TX frames: {len(ecm_tx2)}")
print(f"RX frames: {len(ecm_rx2)}")

# Show ALL TX frames
print("\nALL TX→ECM frames:")
for t, d in ecm_tx2:
    hex_str = ' '.join(f'{b:02X}' for b in d)
    pci = d[0] >> 4
    pci_names = {0: 'SF', 1: 'FF', 2: 'CF', 3: 'FC'}
    print(f"  [{t:.6f}] [{pci_names.get(pci,'??')}] {hex_str}")

# Reassemble TX multi-frame messages
print("\nReassembled TX messages:")
i = 0
while i < len(ecm_tx2):
    t, d = ecm_tx2[i]
    pci = d[0] >> 4
    if pci == 1:
        total_len = ((d[0] & 0x0F) << 8) | d[1]
        payload = d[2:]
        i += 1
        while i < len(ecm_tx2) and len(payload) < total_len:
            t2, d2 = ecm_tx2[i]
            if d2[0] >> 4 == 2:
                payload.extend(d2[1:])
                i += 1
            else:
                break
        payload = payload[:total_len]
        hex_str = ' '.join(f'{b:02X}' for b in payload)
        print(f"  [{t:.6f}] MF ({total_len}B): {hex_str}")
        
        if payload[0] == 0x2D:
            print(f"    Service: 0x2D (InputOutputControlByIdentifier)")
            did = (payload[1] << 8) | payload[2]
            print(f"    DID: 0x{did:04X}")
            print(f"    Control: {' '.join(f'{b:02X}' for b in payload[3:])}")
        elif payload[0] == 0x2C:
            print(f"    Service: 0x2C (DDDI)")
            print(f"    Remaining: {' '.join(f'{b:02X}' for b in payload[1:])}")
    elif pci == 0:
        sf_len = d[0] & 0x0F
        payload = d[1:1+sf_len]
        hex_str = ' '.join(f'{b:02X}' for b in payload)
        print(f"  [{t:.6f}] SF ({sf_len}B): {hex_str}")
        
        if payload and payload[0] == 0x2C:
            target = payload[1]
            print(f"    Service: 0x2C, Target: 0x{target:02X}")
            print(f"    Remaining: {' '.join(f'{b:02X}' for b in payload[2:])}")
        elif payload and payload[0] == 0xAA:
            print(f"    GM AA: sub=0x{payload[1]:02X}, args={' '.join(f'{b:02X}' for b in payload[2:])}")
        elif payload and payload[0] == 0x3E:
            print(f"    TesterPresent")
        i += 1
    else:
        i += 1
