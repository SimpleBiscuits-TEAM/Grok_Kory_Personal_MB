#!/usr/bin/env python3
"""
Time-aligned correlation between DDDI periodic frames and HPT fuel pressure values.

Key findings so far:
- FE composite bytes 4-5 (w45) matches FP_SAE via w45*0.01868 ≈ 60 PSI
- FE composite bytes 4-5 (w45) also matches FP via w45*10*0.145038 ≈ 4720 PSI
  But these can't BOTH be right — same raw value can't be two different channels.
  
- FP_SAE = ~59 PSI (low feed pressure, SAE standard)
- FP = ~4712 PSI (high pressure fuel rail)
- FP_DES = ~4712 PSI (desired fuel rail pressure)

At idle, FP and FP_DES are nearly identical (~4712 PSI).
FP_SAE is the low-pressure feed pump (~59 PSI).

The FE frame has 7 data bytes: [42 02 XX YY ZZ WW VV]
- Byte 0: 0x42 constant
- Byte 1: varies 0x01-0xA6
- Bytes 2-3: varies widely (0-65535)
- Bytes 4-5: varies slightly (0x0C05-0x20FD) → ~3077-8445
- Byte 6: varies slightly (0x87-0x8D) → 135-141

The FD frame has 7 data bytes: [42 02 XX YY 00 00 00]
- Byte 0: 0x42 constant
- Byte 1: varies
- Bytes 2-3: varies widely
- Bytes 4-6: always 0x00

So FD has only 4 meaningful bytes (0-3), same as FE bytes 0-3.
Bytes 0-1 in both are [42, varies]. Byte 0 is always 0x42.

Wait — 0x42 = 66 decimal. In the DDDI setup, HPT requested periodic IDs 0x00, 0x40, 0x01, 0x4F.
The periodic response format is: [periodicID] [data...]
So the 0x5E8 frame is: [FE/FD] [periodicSubID?] [data...]

Actually, looking at the original capture's DDDI composites:
  FD was defined from DID 0x004F (bytes 0-16, size 10)
  FB was defined from DIDs 0x20B4, 0x30BE, 0x328A

In THIS capture, the setup is different — only 3 fuel pressure channels.
HPT sent: 2D FE 00 40 01 4F (ReadDataByPeriodicIdentifier)
  - transmissionMode = 0xFE (slow)
  - periodicDataIdentifiers = [0x00, 0x40, 0x01, 0x4F]
  
But total message was 8 bytes, and we only see 6 in the FF.
The CF would add 2 more bytes. Let me check what those could be.

Actually, the 8-byte payload is: 2D FE 00 40 01 4F
That's only 6 bytes. With PCI (10 08), total = 8 bytes of UDS payload.
So there are 2 more bytes we're missing from the continuation frame.

But we don't see a CF from 0x7E0 — the next 0x7E0 frame is a flow control (0x30).
Wait, 0x30 IS the flow control from the TESTER (0x7E0) to the ECU (0x7E8).
The ECU sent the FC. Let me re-examine...

Actually no: 0x7E0 is the TESTER → ECU direction.
If HPT is sending a multi-frame request, HPT sends FF on 0x7E0, ECU sends FC on 0x7E8.
Then HPT sends CF on 0x7E0.

But we only see one 0x7E0 frame at 14828.284705 (the FF).
The next 0x7E0 frame is at 14828.324384 which is a different message.
The ECU FC is at 14828.291958 on 0x7E8: [30 00 0A]

So where's the CF from HPT? It should be on 0x7E0 with PCI 0x21.
Maybe IntelliSpy missed it, or it was filtered.

Regardless, the periodic data is streaming. Let me focus on matching values.

The key question: which bytes in the periodic frame correspond to which HPT channel?

Let me look at the FE frame structure more carefully.
FE has 7 bytes after the periodic ID: [42 B1 XX XX 0C B6 8B]
                                        [42 02 XX XX 0C BB 88]

Byte 1 varies: 0x01, 0x02, 0xA6, etc. — this might be a sub-identifier
indicating which periodic data block this is.

Actually, I think the periodic response format is:
[periodicID] [responseServiceId=0x6D-0x40=0x2D?] ... no

Let me just do brute-force time correlation.
"""
import csv

# Parse HPT values with timestamps
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
                    })
                except:
                    pass

# Parse 0x5E8 periodic frames
fe_frames = []
fd_frames = []
with open('/home/ubuntu/upload/intellispy_capture_2026-04-22T21-17-02-277Z.csv') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row.get('ArbID_Hex') == '0x5E8':
            data = row.get('Data_Hex', '').strip()
            ts = float(row.get('Timestamp', 0))
            bl = [int(b, 16) for b in data.split()]
            if bl[0] == 0xFE:
                fe_frames.append((ts, bl[1:]))
            elif bl[0] == 0xFD:
                fd_frames.append((ts, bl[1:]))

# The HPT log starts at t=0 and the IntelliSpy starts at ~14828s.
# The first periodic frame is at 14828.335733.
# HPT first data at t=0.061s.
# So IntelliSpy t=14828.335733 ≈ HPT t=0.

# Let me align: IntelliSpy base = first FE frame timestamp
is_base = fe_frames[0][0] if fe_frames else 14828.335733
hpt_base = hpt_rows[0]['time'] if hpt_rows else 0

print("=== TIME-ALIGNED FE FRAMES vs HPT ===")
print(f"IntelliSpy base: {is_base:.6f}")
print(f"HPT base: {hpt_base:.3f}")
print()

# For each FE frame, find the closest HPT row and compare
for ts, data in fe_frames[:30]:
    is_rel = ts - is_base  # relative time in IntelliSpy
    
    # Find closest HPT row
    closest_hpt = min(hpt_rows, key=lambda r: abs(r['time'] - hpt_base - is_rel))
    hpt_rel = closest_hpt['time'] - hpt_base
    
    w_01 = (data[0] << 8) | data[1]
    w_23 = (data[2] << 8) | data[3]
    w_45 = (data[4] << 8) | data[5] if len(data) > 5 else 0
    b_6 = data[6] if len(data) > 6 else 0
    
    # Try the formula that matched: w45 * 10 * 0.145038
    fp_calc = w_45 * 10 * 0.145038
    fp_sae_calc = w_45 * 0.01868
    
    print(f"IS t={is_rel:7.3f}s HPT t={hpt_rel:7.3f}s | "
          f"w01={w_01:5d} w23={w_23:5d} w45={w_45:5d} b6={b_6:3d} | "
          f"HPT: FP_SAE={closest_hpt['fp_sae']:7.2f} FP={closest_hpt['fp']:8.2f} FP_DES={closest_hpt['fp_des']:8.2f}")

# Now let's try to figure out which bytes map to which channel
# by looking at variance correlation
print("\n\n=== VARIANCE ANALYSIS ===")
print("Looking at how each byte position varies over time...")

# Extract all FE word values
fe_w01 = [(ts - is_base, (d[0] << 8) | d[1]) for ts, d in fe_frames]
fe_w23 = [(ts - is_base, (d[2] << 8) | d[3]) for ts, d in fe_frames]
fe_w45 = [(ts - is_base, (d[4] << 8) | d[5]) for ts, d in fe_frames if len(d) > 5]
fe_b6 = [(ts - is_base, d[6]) for ts, d in fe_frames if len(d) > 6]

# Extract all FD word values
fd_w01 = [(ts - is_base, (d[0] << 8) | d[1]) for ts, d in fd_frames]
fd_w23 = [(ts - is_base, (d[2] << 8) | d[3]) for ts, d in fd_frames]

import statistics
for label, series in [
    ('FE w01', fe_w01), ('FE w23', fe_w23), ('FE w45', fe_w45), ('FE b6', fe_b6),
    ('FD w01', fd_w01), ('FD w23', fd_w23),
]:
    vals = [v for _, v in series]
    if vals:
        print(f"  {label}: min={min(vals):6d} max={max(vals):6d} mean={statistics.mean(vals):10.2f} stdev={statistics.stdev(vals) if len(vals)>1 else 0:10.2f}")

# HPT variance
for label, key in [('HPT FP_SAE', 'fp_sae'), ('HPT FP', 'fp'), ('HPT FP_DES', 'fp_des')]:
    vals = [r[key] for r in hpt_rows]
    print(f"  {label}: min={min(vals):10.2f} max={max(vals):10.2f} mean={statistics.mean(vals):10.2f} stdev={statistics.stdev(vals):10.2f}")

# Now check: FE w45 has stdev ~X, HPT FP_SAE has stdev ~Y
# If they correlate, w45 maps to FP_SAE

# Also check if FE w23 and FD w23 are the same (they seem to be for matching timestamps)
print("\n=== FE vs FD w23 at similar timestamps ===")
for i in range(min(10, len(fd_frames))):
    fd_ts, fd_data = fd_frames[i]
    fd_w = (fd_data[2] << 8) | fd_data[3]
    # Find closest FE frame
    closest_fe = min(fe_frames, key=lambda x: abs(x[0] - fd_ts))
    fe_w = (closest_fe[1][2] << 8) | closest_fe[1][3]
    dt = abs(closest_fe[0] - fd_ts)
    print(f"  FD w23={fd_w:5d} FE w23={fe_w:5d} dt={dt*1000:.1f}ms {'MATCH' if fd_w == fe_w else 'DIFF'}")

# The big question: what are bytes 0-1 (always 0x42 XX)?
# And what are bytes 2-3?
# Let me check if byte 1 is a sub-periodic-ID
print("\n=== FE byte 1 distribution ===")
b1_vals = [d[1] for _, d in fe_frames]
from collections import Counter
for val, cnt in Counter(b1_vals).most_common(10):
    print(f"  0x{val:02X} ({val}): {cnt} times")

print("\n=== FD byte 1 distribution ===")
b1_vals = [d[1] for _, d in fd_frames]
for val, cnt in Counter(b1_vals).most_common(10):
    print(f"  0x{val:02X} ({val}): {cnt} times")
