"""
Find the COMPLETE DDDI setup sequence from the original capture.
The IOCTL (0x2D) and AA start commands are NOT in the 9689-9691 window.
They must be earlier. Also find orphan CFs that belong to messages starting before our window.

Key observations:
- AA 04 00 (stop periodic) was at 9682.537
- DDDI clears were at ~9682.5-9690.0
- DDDI defines are at 9690.85-9690.95
- But we see orphan CFs at 9690.83 and 9690.845 with responses 6D FE 00 and 6C FE
- These CFs belong to multi-frame messages that started BEFORE 9689.0
- Also the CF at 9690.956 (21 FA F9 F8) belongs to a message that started before

Let me find ALL multi-frame messages by tracking FF→CF sequences across the ENTIRE capture.
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

# Strategy: find ALL 0x7E0 FF frames in the entire capture and reassemble them
print("=" * 80)
print("ALL 0x7E0 FIRST FRAMES IN ENTIRE CAPTURE")
print("=" * 80)

tx_frames = [(t, d) for t, aid, d in frames if aid == 0x7E0]
print(f"Total 0x7E0 TX frames: {len(tx_frames)}")

# Find all FF frames
ff_frames = []
for i, (t, d) in enumerate(tx_frames):
    if d and (d[0] >> 4) == 1:
        total_len = ((d[0] & 0x0F) << 8) | d[1]
        svc = d[2]
        ff_frames.append((i, t, total_len, svc, d))

print(f"FF frames found: {len(ff_frames)}")
for idx, t, total_len, svc, d in ff_frames:
    hex_str = ' '.join(f'{b:02X}' for b in d)
    svc_name = {0x2C: 'DDDI', 0x2D: 'IOCTL', 0xAA: 'GM_AA', 0x22: 'ReadDID', 0x3E: 'TesterPresent'}.get(svc, f'0x{svc:02X}')
    print(f"  [{t:.6f}] idx={idx} total={total_len}B svc={svc_name}: {hex_str}")

# Now reassemble ALL multi-frame messages from 0x7E0
print("\n" + "=" * 80)
print("ALL REASSEMBLED MULTI-FRAME MESSAGES FROM 0x7E0")
print("=" * 80)

messages = []
i = 0
while i < len(tx_frames):
    t, d = tx_frames[i]
    pci = d[0] >> 4 if d else -1
    
    if pci == 1:  # FF
        total_len = ((d[0] & 0x0F) << 8) | d[1]
        payload = list(d[2:])
        ff_time = t
        i += 1
        while i < len(tx_frames) and len(payload) < total_len:
            t2, d2 = tx_frames[i]
            pci2 = d2[0] >> 4 if d2 else -1
            if pci2 == 2:  # CF
                payload.extend(d2[1:])
                i += 1
            elif pci2 == 3:  # FC (shouldn't happen for TX but just in case)
                i += 1
            else:
                break  # New message started
        messages.append(('MF', ff_time, payload[:total_len], total_len))
    elif pci == 0:  # SF
        sf_len = d[0] & 0x0F
        payload = list(d[1:1+sf_len])
        messages.append(('SF', t, payload, sf_len))
        i += 1
    elif pci == 2:  # Orphan CF
        seq = d[0] & 0x0F
        hex_str = ' '.join(f'{b:02X}' for b in d)
        print(f"  ORPHAN CF at [{t:.6f}] seq={seq}: {hex_str}")
        i += 1
    elif pci == 3:  # FC
        i += 1
    else:
        i += 1

print(f"\nTotal messages: {len(messages)}")
for msg_type, t, payload, length in messages:
    svc = payload[0] if payload else 0
    svc_name = {0x2C: 'DDDI', 0x2D: 'IOCTL', 0xAA: 'GM_AA', 0x22: 'ReadDID', 0x3E: 'TesterPresent'}.get(svc, f'0x{svc:02X}')
    
    # Only show non-ReadDID and non-TesterPresent messages, plus first/last ReadDID
    if svc not in (0x22, 0x3E):
        hex_str = ' '.join(f'{b:02X}' for b in payload[:60])
        if len(payload) > 60:
            hex_str += f" ... ({len(payload)} bytes total)"
        print(f"  [{t:.6f}] {msg_type} {svc_name} ({length}B): {hex_str}")

# Count ReadDID messages
read_dids = [(t, p) for mt, t, p, l in messages if p and p[0] == 0x22]
print(f"\n  ... plus {len(read_dids)} ReadDID messages from {read_dids[0][0]:.3f} to {read_dids[-1][0]:.3f}" if read_dids else "")

# Now the critical question: where are the IOCTL (0x2D) and AA start?
# They might be interleaved with the DDDI clears
# Let me look at ALL 0x7E0 frames from 9682 (AA stop) to 9691 (periodic start)
print("\n" + "=" * 80)
print("COMPLETE HPT INIT SEQUENCE (9682 - 9691)")
print("=" * 80)

# Get ALL 0x7E0 and 0x7E8 frames in this window
init_frames = [(t, aid, d) for t, aid, d in frames if 9682.0 <= t <= 9691.0 and aid in (0x7E0, 0x7E8)]
print(f"Total frames in init window: {len(init_frames)}")

# Show non-DDDI-clear frames (skip the 70 repetitive clears)
prev_was_clear = False
clear_count = 0
for t, aid, d in init_frames:
    dir = "TX" if aid == 0x7E0 else "RX"
    pci = d[0] >> 4
    
    # Check if this is a DDDI clear (SF: 04 2C FE 00 XX)
    is_clear = False
    if pci == 0 and aid == 0x7E0:
        sf_len = d[0] & 0x0F
        payload = d[1:1+sf_len]
        if len(payload) >= 3 and payload[0] == 0x2C and payload[1] == 0xFE and payload[2] == 0x00:
            is_clear = True
    
    # Check if this is a DDDI clear response (SF: 02 6C FE)
    is_clear_resp = False
    if pci == 0 and aid == 0x7E8:
        sf_len = d[0] & 0x0F
        payload = d[1:1+sf_len]
        if len(payload) >= 2 and payload[0] == 0x6C and payload[1] == 0xFE:
            is_clear_resp = True
    
    if is_clear or is_clear_resp:
        clear_count += 1
        if not prev_was_clear:
            print(f"  [{t:.6f}] ... DDDI clears start ...")
        prev_was_clear = True
        continue
    
    if prev_was_clear:
        print(f"  ... ({clear_count} DDDI clear frames) ...")
        clear_count = 0
        prev_was_clear = False
    
    hex_str = ' '.join(f'{b:02X}' for b in d)
    pci_names = {0: 'SF', 1: 'FF', 2: 'CF', 3: 'FC'}
    
    # Decode
    extra = ""
    if pci == 0:
        sf_len = d[0] & 0x0F
        payload = d[1:1+sf_len]
        if payload:
            if payload[0] == 0xAA:
                extra = f" GM_AA sub=0x{payload[1]:02X}"
            elif payload[0] == 0x2C:
                extra = f" DDDI target=0x{payload[1]:02X}"
            elif payload[0] == 0x6C:
                extra = f" DDDI+ 0x{payload[1]:02X}"
            elif payload[0] == 0x6D:
                extra = f" IOCTL+"
            elif payload[0] == 0x7F:
                extra = f" NRC svc=0x{payload[1]:02X} code=0x{payload[2]:02X}" if len(payload) >= 3 else ""
            elif payload[0] == 0xEA:
                extra = f" GM_EA"
            elif payload[0] == 0x62:
                did = (payload[1] << 8) | payload[2] if len(payload) >= 3 else 0
                extra = f" ReadDID+ 0x{did:04X}"
    elif pci == 1:
        total_len = ((d[0] & 0x0F) << 8) | d[1]
        svc = d[2]
        extra = f" FF total={total_len}B svc=0x{svc:02X}"
    
    print(f"  [{t:.6f}] {dir} [{pci_names.get(pci,'??')}] {hex_str}{extra}")

if prev_was_clear:
    print(f"  ... ({clear_count} DDDI clear frames) ...")
