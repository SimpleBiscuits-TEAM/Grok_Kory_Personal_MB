"""
Find the complete IOCTL (0x2D) multi-frame message that sets up periodic ID FE,
and the AA start command. These are large multi-frame messages that span the
9690.7-9690.96 window.
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

# Get ALL 0x7E0 TX frames from 9689 to 9691 to find the IOCTL setup
print("=" * 80)
print("ALL 0x7E0 TX FRAMES 9689.0 - 9691.0")
print("=" * 80)

tx_frames = [(t, d) for t, aid, d in frames if 9689.0 <= t <= 9691.0 and aid == 0x7E0]
print(f"Total TX frames: {len(tx_frames)}")

# Reassemble ALL multi-frame messages
messages = []
i = 0
while i < len(tx_frames):
    t, d = tx_frames[i]
    pci = d[0] >> 4
    
    if pci == 1:  # FF
        total_len = ((d[0] & 0x0F) << 8) | d[1]
        payload = list(d[2:])
        ff_time = t
        i += 1
        while i < len(tx_frames) and len(payload) < total_len:
            t2, d2 = tx_frames[i]
            if d2[0] >> 4 == 2:  # CF
                payload.extend(d2[1:])
                i += 1
            elif d2[0] >> 4 == 3:  # FC (we sent flow control)
                i += 1
            else:
                break
        messages.append(('MF', ff_time, payload[:total_len], total_len))
    elif pci == 0:  # SF
        sf_len = d[0] & 0x0F
        payload = list(d[1:1+sf_len])
        messages.append(('SF', t, payload, sf_len))
        i += 1
    elif pci == 3:  # FC
        i += 1
    elif pci == 2:  # Orphan CF
        # This CF belongs to a message whose FF was before our window
        i += 1
    else:
        i += 1

print(f"\nReassembled {len(messages)} messages:")
for msg_type, t, payload, length in messages:
    hex_str = ' '.join(f'{b:02X}' for b in payload[:40])
    if len(payload) > 40:
        hex_str += f" ... ({len(payload)} bytes total)"
    svc = payload[0] if payload else 0
    svc_name = {0x2C: 'DDDI', 0x2D: 'IOCTL', 0xAA: 'GM_AA', 0x3E: 'TesterPresent', 0x22: 'ReadDID'}.get(svc, f'Svc_0x{svc:02X}')
    print(f"  [{t:.6f}] {msg_type} {svc_name} ({length}B): {hex_str}")

# Now look BEFORE 9689 for the IOCTL setup — it might start much earlier
print("\n" + "=" * 80)
print("SEARCHING FOR IOCTL (0x2D) FF FRAMES IN ENTIRE CAPTURE")
print("=" * 80)

for t, aid, d in frames:
    if aid == 0x7E0 and d and (d[0] >> 4) == 1:  # FF
        svc = d[2]
        if svc == 0x2D:
            total_len = ((d[0] & 0x0F) << 8) | d[1]
            hex_str = ' '.join(f'{b:02X}' for b in d)
            print(f"  [{t:.6f}] FF total={total_len}B: {hex_str}")

# Also search for 0xAA FF frames
print("\nSearching for AA FF frames:")
for t, aid, d in frames:
    if aid == 0x7E0 and d and (d[0] >> 4) == 1:
        svc = d[2]
        if svc == 0xAA:
            total_len = ((d[0] & 0x0F) << 8) | d[1]
            hex_str = ' '.join(f'{b:02X}' for b in d)
            print(f"  [{t:.6f}] FF total={total_len}B: {hex_str}")

# Search for AA SF frames
print("\nSearching for AA SF frames:")
for t, aid, d in frames:
    if aid == 0x7E0 and d and (d[0] >> 4) == 0:
        sf_len = d[0] & 0x0F
        payload = d[1:1+sf_len]
        if payload and payload[0] == 0xAA:
            hex_str = ' '.join(f'{b:02X}' for b in payload)
            print(f"  [{t:.6f}] SF: {hex_str}")

# Now look at the FULL sequence from the Mode 22 reads through DDDI setup
# The Mode 22 reads happen at ~9689.1-9690.8, then DDDI setup at 9690.8-9691.0
print("\n" + "=" * 80)
print("FULL SEQUENCE: Last Mode 22 reads + DDDI setup")
print("=" * 80)

# Get the last 10 Mode 22 reads before DDDI
mode22_reads = []
for msg_type, t, payload, length in messages:
    if payload and payload[0] == 0x22:
        did = (payload[1] << 8) | payload[2] if len(payload) >= 3 else 0
        mode22_reads.append((t, did))

if mode22_reads:
    print(f"Last 5 Mode 22 reads:")
    for t, did in mode22_reads[-5:]:
        print(f"  [{t:.6f}] ReadDID 0x{did:04X}")

# Now get everything after the last Mode 22 read
last_m22_time = mode22_reads[-1][0] if mode22_reads else 9690.0
print(f"\nEverything after last Mode 22 read ({last_m22_time:.3f}):")
for msg_type, t, payload, length in messages:
    if t > last_m22_time:
        hex_str = ' '.join(f'{b:02X}' for b in payload[:50])
        if len(payload) > 50:
            hex_str += f" ... ({len(payload)} bytes total)"
        svc = payload[0] if payload else 0
        svc_name = {0x2C: 'DDDI', 0x2D: 'IOCTL', 0xAA: 'GM_AA', 0x3E: 'TesterPresent'}.get(svc, f'Svc_0x{svc:02X}')
        print(f"  [{t:.6f}] {msg_type} {svc_name} ({length}B): {hex_str}")

# The key question: where is the IOCTL for FE and the AA start?
# They might be in multi-frame messages that span across Mode 22 reads
# Let me look at ALL multi-frame messages in the 9689-9691 window
print("\n" + "=" * 80)
print("ALL MULTI-FRAME MESSAGES (9689-9691)")
print("=" * 80)

for msg_type, t, payload, length in messages:
    if msg_type == 'MF':
        hex_str = ' '.join(f'{b:02X}' for b in payload[:60])
        if len(payload) > 60:
            hex_str += f" ... ({len(payload)} bytes total)"
        svc = payload[0] if payload else 0
        print(f"  [{t:.6f}] MF ({length}B) svc=0x{svc:02X}: {hex_str}")
