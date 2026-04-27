"""
Find the FF that starts the mega multi-frame message containing the IOCTL + DDDI defines + AA start.
The orphan CFs at 9690.83 and 9690.845 and 9690.956 belong to this message.
The FF must be somewhere before 9686.7 (where Mode 22 reads start).

Actually wait — looking at the data again:
- At 9690.826: RX FC (flow control FROM ECM) — this means the ECM is asking US for more data
- At 9690.830: TX CF seq=1: 21 84 04 00 00 00 00 00
- At 9690.832: RX SF: 6D FE 00 (IOCTL positive response)
- At 9690.839: RX FC (flow control FROM ECM again)
- At 9690.845: TX CF seq=1: 21 15 40 00 00 00 00 00

Wait — CF seq=1 TWICE? That means these are TWO DIFFERENT multi-frame messages, not one.
Each one has: FF (somewhere) → RX FC → TX CF seq=1 → response

But where are the FFs? They must be interleaved with the Mode 22 reads.

Let me look at ALL 0x7E0 TX frames from 9686.7 to 9690.83 to find the FFs.
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

# Get ALL 0x7E0 TX frames from 9686.7 to 9691.0
print("=" * 80)
print("ALL 0x7E0 TX FRAMES 9686.7 - 9691.0 (with PCI decode)")
print("=" * 80)

tx_in_window = []
for t, aid, d in frames:
    if 9686.7 <= t <= 9691.0 and aid == 0x7E0:
        pci = d[0] >> 4 if d else -1
        pci_names = {0: 'SF', 1: 'FF', 2: 'CF', 3: 'FC'}
        hex_str = ' '.join(f'{b:02X}' for b in d)
        
        extra = ""
        if pci == 0:
            sf_len = d[0] & 0x0F
            payload = d[1:1+sf_len]
            if payload and payload[0] == 0x22:
                did = (payload[1] << 8) | payload[2] if len(payload) >= 3 else 0
                extra = f" ReadDID 0x{did:04X}"
            elif payload and payload[0] == 0x2C:
                extra = f" DDDI"
            elif payload and payload[0] == 0xAA:
                extra = f" GM_AA"
        elif pci == 1:
            total_len = ((d[0] & 0x0F) << 8) | d[1]
            svc = d[2]
            svc_name = {0x2C: 'DDDI', 0x2D: 'IOCTL', 0xAA: 'GM_AA', 0x22: 'ReadDID'}.get(svc, f'0x{svc:02X}')
            extra = f" FF total={total_len}B {svc_name}"
        elif pci == 2:
            seq = d[0] & 0x0F
            extra = f" CF seq={seq}"
        elif pci == 3:
            extra = " FC"
        
        tx_in_window.append((t, d, pci, extra))
        print(f"  [{t:.6f}] [{pci_names.get(pci,'??')}] {hex_str}{extra}")

# Also show RX frames that are FC (flow control) in the same window
print("\n" + "=" * 80)
print("ALL 0x7E8 RX FC FRAMES 9686.7 - 9691.0")
print("=" * 80)

for t, aid, d in frames:
    if 9686.7 <= t <= 9691.0 and aid == 0x7E8:
        pci = d[0] >> 4 if d else -1
        if pci == 3:  # FC
            hex_str = ' '.join(f'{b:02X}' for b in d)
            print(f"  [{t:.6f}] RX FC: {hex_str}")

# Now look at the INTERLEAVED sequence — TX and RX together
print("\n" + "=" * 80)
print("INTERLEAVED TX/RX 9686.7 - 9691.0 (non-periodic-response only)")
print("=" * 80)

for t, aid, d in frames:
    if 9686.7 <= t <= 9691.0 and aid in (0x7E0, 0x7E8):
        pci = d[0] >> 4 if d else -1
        pci_names = {0: 'SF', 1: 'FF', 2: 'CF', 3: 'FC'}
        dir = "TX" if aid == 0x7E0 else "RX"
        hex_str = ' '.join(f'{b:02X}' for b in d)
        
        # Skip repetitive ReadDID responses
        if aid == 0x7E8 and pci == 0:
            sf_len = d[0] & 0x0F
            payload = d[1:1+sf_len]
            if payload and payload[0] == 0x62:
                continue  # Skip ReadDID responses
        
        # Skip repetitive ReadDID requests
        if aid == 0x7E0 and pci == 0:
            sf_len = d[0] & 0x0F
            payload = d[1:1+sf_len]
            if payload and payload[0] == 0x22:
                did = (payload[1] << 8) | payload[2] if len(payload) >= 3 else 0
                print(f"  [{t:.6f}] {dir} [{pci_names.get(pci,'??')}] {hex_str} ReadDID 0x{did:04X}")
                continue
        
        extra = ""
        if pci == 0:
            sf_len = d[0] & 0x0F
            payload = d[1:1+sf_len]
            if payload:
                if payload[0] == 0x6C:
                    extra = f" DDDI+ 0x{payload[1]:02X}"
                elif payload[0] == 0x6D:
                    extra = f" IOCTL+"
                elif payload[0] == 0x7E:
                    extra = " TesterPresent+"
                elif payload[0] == 0x2C:
                    extra = f" DDDI clear 0x{payload[3]:02X}" if len(payload) >= 4 and payload[1] == 0xFE else f" DDDI"
        elif pci == 1:
            total_len = ((d[0] & 0x0F) << 8) | d[1]
            svc = d[2]
            extra = f" FF total={total_len}B svc=0x{svc:02X}"
        elif pci == 2:
            seq = d[0] & 0x0F
            extra = f" seq={seq} data={' '.join(f'{b:02X}' for b in d[1:])}"
        elif pci == 3:
            extra = f" FC"
        
        print(f"  [{t:.6f}] {dir} [{pci_names.get(pci,'??')}] {hex_str}{extra}")
