"""
Decode the FULL DDDI sequence from the original HPT IntelliSpy capture.
Goal: Extract exact byte sequences for:
1. 0xAA 04 00 — stop periodic
2. 0x2C FE 00 XX — clear periodic IDs
3. Mode 22 reads (one-shot)
4. 0x2C 01 XX YY ... — define composites (map source DIDs to periodic IDs)
5. 0xAA 03 XX — start periodic transmission
6. Parse 0x5E8 periodic frames and map bytes to source DIDs

We need the EXACT bytes HPT sends so we can replicate them.
"""

import csv
import struct

def parse_intellispy(filepath):
    """Parse IntelliSpy CSV and return all CAN frames."""
    frames = []
    with open(filepath) as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                arb_id = int(row.get('ArbID', '0'))
                timestamp = float(row.get('Timestamp', 0))
                data_hex = row.get('Data_Hex', '').strip('"')
                # Parse data bytes
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
                    'raw': data_hex
                })
            except:
                pass
    return frames

def decode_isotp_multiframe(frames, start_idx):
    """Reassemble ISO-TP multi-frame message starting at start_idx."""
    first = frames[start_idx]
    if not first['data'] or (first['data'][0] >> 4) != 1:
        return None, start_idx
    
    total_len = ((first['data'][0] & 0x0F) << 8) | first['data'][1]
    payload = first['data'][2:]  # First frame has 6 data bytes
    
    seq = 1
    idx = start_idx + 1
    while len(payload) < total_len and idx < len(frames):
        f = frames[idx]
        if f['arb_id'] == first['arb_id']:
            if f['data'] and (f['data'][0] >> 4) == 2:  # Consecutive frame
                expected_seq = seq & 0x0F
                actual_seq = f['data'][0] & 0x0F
                if actual_seq == expected_seq:
                    payload.extend(f['data'][1:])
                    seq += 1
            elif f['data'] and (f['data'][0] >> 4) == 0:  # Single frame (flow control response)
                pass
        elif f['arb_id'] == 0x7E8:  # Response - skip
            pass
        elif f['arb_id'] == 0x7E0:  # Another request - flow control
            if f['data'] and f['data'][0] == 0x30:  # Flow control
                pass
        idx += 1
    
    return payload[:total_len], idx

# Parse both captures
print("=" * 80)
print("PARSING ORIGINAL HPT INTELLISPY CAPTURE")
print("=" * 80)

frames = parse_intellispy('/home/ubuntu/upload/intellispy_capture_2026-04-22T19-51-58-354Z.csv')  # largest capture, has full HPT init sequence
print(f"Total frames: {len(frames)}")

# Get all 0x7E0 (ECM request) frames
ecm_tx = [f for f in frames if f['arb_id'] == 0x7E0]
ecm_rx = [f for f in frames if f['arb_id'] == 0x7E8]
periodic = [f for f in frames if f['arb_id'] == 0x5E8]

print(f"ECM TX (0x7E0): {len(ecm_tx)}")
print(f"ECM RX (0x7E8): {len(ecm_rx)}")
print(f"Periodic (0x5E8): {len(periodic)}")

# Decode ALL 0x7E0 messages in order
print("\n" + "=" * 80)
print("FULL HPT COMMAND SEQUENCE TO ECM (0x7E0)")
print("=" * 80)

phase = "INIT"
dddi_defines = []
mode22_reads = []
aa_commands = []
dddi_clears = []

i = 0
while i < len(ecm_tx):
    f = ecm_tx[i]
    d = f['data']
    if not d:
        i += 1
        continue
    
    pci = d[0] >> 4
    
    if pci == 0:  # Single frame
        sf_len = d[0] & 0x0F
        payload = d[1:1+sf_len]
        
        if payload and payload[0] == 0xAA:
            cmd = ' '.join(f'{b:02X}' for b in payload)
            print(f"  [{f['time']:.3f}] GM_AA: {cmd}")
            aa_commands.append({'time': f['time'], 'payload': payload})
        elif payload and payload[0] == 0x2C:
            if len(payload) >= 4 and payload[1] == 0xFE:
                periodic_id = payload[3]
                dddi_clears.append({'time': f['time'], 'id': periodic_id})
            elif len(payload) >= 3 and payload[1] == 0x01:
                # Short DDDI define (fits in single frame)
                cmd = ' '.join(f'{b:02X}' for b in payload)
                print(f"  [{f['time']:.3f}] DDDI_DEFINE (SF): {cmd}")
                dddi_defines.append({'time': f['time'], 'payload': payload})
        elif payload and payload[0] == 0x22:
            did = (payload[1] << 8) | payload[2] if len(payload) >= 3 else 0
            mode22_reads.append({'time': f['time'], 'did': did})
        elif payload and payload[0] == 0x3E:
            print(f"  [{f['time']:.3f}] TesterPresent: {' '.join(f'{b:02X}' for b in payload)}")
        elif payload and payload[0] == 0x23:
            print(f"  [{f['time']:.3f}] ReadMemByAddr: {' '.join(f'{b:02X}' for b in payload)}")
        else:
            cmd = ' '.join(f'{b:02X}' for b in payload)
            print(f"  [{f['time']:.3f}] Unknown SF: {cmd}")
    
    elif pci == 1:  # First frame of multi-frame
        # Reassemble from raw frames list
        # Find this frame in the full frames list
        full_idx = None
        for fi, ff in enumerate(frames):
            if ff['time'] == f['time'] and ff['arb_id'] == 0x7E0 and ff['data'] == d:
                full_idx = fi
                break
        
        if full_idx is not None:
            total_len = ((d[0] & 0x0F) << 8) | d[1]
            payload = d[2:]
            
            # Collect consecutive frames
            for j in range(full_idx + 1, min(full_idx + 50, len(frames))):
                nf = frames[j]
                if nf['arb_id'] == 0x7E0 and nf['data'] and (nf['data'][0] >> 4) == 2:
                    payload.extend(nf['data'][1:])
                    if len(payload) >= total_len:
                        break
                elif nf['arb_id'] == 0x7E8:
                    continue  # Skip responses
            
            payload = payload[:total_len]
            
            if payload and payload[0] == 0x2C and payload[1] == 0x01:
                cmd = ' '.join(f'{b:02X}' for b in payload)
                print(f"  [{f['time']:.3f}] DDDI_DEFINE (MF, {total_len}B): {cmd}")
                dddi_defines.append({'time': f['time'], 'payload': payload})
            elif payload and payload[0] == 0x22:
                did = (payload[1] << 8) | payload[2] if len(payload) >= 3 else 0
                mode22_reads.append({'time': f['time'], 'did': did})
            else:
                cmd = ' '.join(f'{b:02X}' for b in payload[:30])
                if len(payload) > 30:
                    cmd += f" ... ({len(payload)} bytes total)"
                print(f"  [{f['time']:.3f}] Multi-frame: {cmd}")
    
    elif pci == 3:  # Flow control
        pass  # Skip flow control frames
    
    i += 1

print(f"\n=== SUMMARY ===")
print(f"GM_AA commands: {len(aa_commands)}")
for a in aa_commands:
    print(f"  {' '.join(f'{b:02X}' for b in a['payload'])}")

print(f"\nDDDI clears: {len(dddi_clears)}")
if dddi_clears:
    ids = sorted(set(c['id'] for c in dddi_clears))
    print(f"  Periodic IDs cleared: {', '.join(f'0x{i:02X}' for i in ids)}")

print(f"\nMode 22 reads: {len(mode22_reads)}")
dids = sorted(set(r['did'] for r in mode22_reads))
print(f"  Unique DIDs: {len(dids)}")
print(f"  DIDs: {', '.join(f'0x{d:04X}' for d in dids)}")

print(f"\nDDDI defines: {len(dddi_defines)}")
for dd in dddi_defines:
    p = dd['payload']
    target_did = (p[2] << 8) | p[3]
    print(f"\n  Target periodic DID: 0x{target_did:04X}")
    print(f"  Raw: {' '.join(f'{b:02X}' for b in p)}")
    
    # Decode source DIDs
    # Format: 2C 01 [target_hi] [target_lo] [source_hi] [source_lo] [pos] [size] ...
    idx = 4
    sources = []
    while idx + 3 < len(p):
        src_did = (p[idx] << 8) | p[idx+1]
        pos = p[idx+2]
        size = p[idx+3]
        sources.append({'did': src_did, 'pos': pos, 'size': size})
        print(f"    Source DID 0x{src_did:04X}, position={pos}, size={size}")
        idx += 4
    
print("\n" + "=" * 80)
print("PERIODIC FRAMES (0x5E8)")
print("=" * 80)

if periodic:
    print(f"Total periodic frames: {len(periodic)}")
    print(f"Time range: {periodic[0]['time']:.3f} - {periodic[-1]['time']:.3f}")
    
    # Group by first byte (periodic DID identifier)
    by_id = {}
    for p in periodic:
        if p['data']:
            pid = p['data'][0]
            if pid not in by_id:
                by_id[pid] = []
            by_id[pid].append(p)
    
    for pid in sorted(by_id.keys()):
        pframes = by_id[pid]
        print(f"\n  Periodic ID 0x{pid:02X}: {len(pframes)} frames")
        # Show first 3 and last 3
        for pf in pframes[:3]:
            print(f"    [{pf['time']:.3f}] {' '.join(f'{b:02X}' for b in pf['data'])}")
        if len(pframes) > 6:
            print(f"    ... ({len(pframes) - 6} more)")
        for pf in pframes[-3:]:
            print(f"    [{pf['time']:.3f}] {' '.join(f'{b:02X}' for b in pf['data'])}")

# Now parse the fuel-pressure-only capture too
print("\n\n" + "=" * 80)
print("PARSING FUEL PRESSURE INTELLISPY CAPTURE")
print("=" * 80)

frames2 = parse_intellispy('/home/ubuntu/upload/intellispy_capture_2026-04-22T21-17-02-277Z.csv')
print(f"Total frames: {len(frames2)}")

periodic2 = [f for f in frames2 if f['arb_id'] == 0x5E8]
print(f"Periodic (0x5E8): {len(periodic2)}")

if periodic2:
    by_id2 = {}
    for p in periodic2:
        if p['data']:
            pid = p['data'][0]
            if pid not in by_id2:
                by_id2[pid] = []
            by_id2[pid].append(p)
    
    for pid in sorted(by_id2.keys()):
        pframes = by_id2[pid]
        print(f"\n  Periodic ID 0x{pid:02X}: {len(pframes)} frames")
        for pf in pframes[:5]:
            print(f"    [{pf['time']:.3f}] {' '.join(f'{b:02X}' for b in pf['data'])}")
        if len(pframes) > 10:
            print(f"    ... ({len(pframes) - 10} more)")
        for pf in pframes[-5:]:
            print(f"    [{pf['time']:.3f}] {' '.join(f'{b:02X}' for b in pf['data'])}")
