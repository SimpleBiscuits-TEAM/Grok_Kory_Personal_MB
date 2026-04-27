#!/usr/bin/env python3
"""
Final decode of DDDI periodic frames for fuel pressure.

Key observations:
1. FE frame: [42 XX YY ZZ 0C BB 88] — 7 bytes
   - Byte 0: 0x42 constant (66 decimal)
   - Byte 1: mostly 0x02, sometimes varies
   - Bytes 2-3: varies widely (stdev=19541)
   - Bytes 4-5: varies moderately (stdev=1494), range 3242-8329
   - Byte 6: varies slightly (135-141)

2. FD frame: [42 XX YY ZZ 00 00 00] — 7 bytes
   - Same structure as FE but bytes 4-6 are always 0

3. HPT channels:
   - FP_SAE: 57-60 PSI (stdev=0.49) — very stable
   - FP: 4710-4740 PSI (stdev=6.63) — slightly varies
   - FP_DES: 4710-4740 PSI (stdev=6.63) — slightly varies

4. FE w45 (bytes 4-5) range 3242-8329:
   - w45 * 0.01868 → 60.6-155.6 — too wide for FP_SAE
   - w45 * 10 * 0.145038 → 4701-12078 — too wide for FP
   
   Wait, the stdev of w45 is 1494, but HPT FP stdev is only 6.63.
   That's a 225x difference. These CAN'T be the same signal.
   
   Unless... the w45 range 3242-8329 includes a transient (rev-up?).
   Let me check if there's a rev-up event in the HPT data.

5. Actually, looking more carefully at the HPT data:
   - FP range: 4710-4740 PSI at idle
   - But there might be a rev-up that goes higher
   
   Let me check the full HPT range and see if FP ever goes to 8000+ PSI.

Actually, I think the issue is that the DDDI composite packs MULTIPLE DID values
into a single periodic frame. The 7 bytes after the periodic ID contain data from
multiple source DIDs concatenated together.

From the original capture's DDDI define for FD:
  0x2C FD 00 4F 00 10 00 0A
  → periodicID=0xFD, sourceDID=0x004F, positionInSource=0x00, memorySize=0x10, ???

But in THIS capture, the DDDI setup is:
  ReadDataByPeriodicIdentifier: 2D FE 00 40 01 4F
  → Read periodic IDs: 0x00, 0x40, 0x01, 0x4F

These are PRE-DEFINED periodic identifiers, not DDDI composites!
The ECU has built-in periodic data blocks at IDs 0x00, 0x40, 0x01, 0x4F.

Then: 2C FD FE 01 = DynamicallyDefineDataIdentifier
  → Define periodic ID 0xFD from... hmm, subfunction 0xFE, data 0x01?
  
Actually: 0x2C [subfunction] [DID_hi] [DID_lo]
  → 0x2C 0xFD 0xFE 0x01
  → subfunction = 0xFD? No, that doesn't make sense.
  
Wait, for DDDI:
  0x2C [subfunction] [dynamicallyDefinedDID_hi] [dynamicallyDefinedDID_lo] ...
  subfunctions: 0x01=defineByIdentifier, 0x02=defineByMemoryAddress, 0x03=clear

Hmm, 0xFD is not a standard subfunction. But GM might use proprietary subfunctions.

Actually, I think the frame format is different for periodic identifiers.
The periodic DID is a single byte (0x00-0xFF), not a 2-byte DID.

Let me re-read the UDS spec for 0x2C:
  0x2C [subfunction] [periodicDataIdentifier] [sourceDataIdentifier_hi] [sourceDataIdentifier_lo] [positionInSourceDataRecord] [memorySize]

So: 0x2C 0xFD 0xFE 0x01
  → subfunction = clear (0x03)? No, 0xFD...
  
Hmm, maybe it's: 0x2C [periodicID=0xFD] [sourceInfo=0xFE 0x01]

I think GM uses a non-standard format. Let me just focus on the data.

The real question is: what formula converts the raw periodic data to PSI?

Let me try a different approach: look at the raw data when the engine revs up.
If FP goes from 4712 to say 20000 PSI under load, the corresponding raw bytes
should change proportionally.
"""
import csv, statistics

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
                    })
                except:
                    pass

print("=== HPT FULL RANGE ===")
fp_sae_vals = [r['fp_sae'] for r in hpt_rows]
fp_vals = [r['fp'] for r in hpt_rows]
fp_des_vals = [r['fp_des'] for r in hpt_rows]
print(f"FP_SAE: min={min(fp_sae_vals):.2f} max={max(fp_sae_vals):.2f} mean={statistics.mean(fp_sae_vals):.2f}")
print(f"FP:     min={min(fp_vals):.2f} max={max(fp_vals):.2f} mean={statistics.mean(fp_vals):.2f}")
print(f"FP_DES: min={min(fp_des_vals):.2f} max={max(fp_des_vals):.2f} mean={statistics.mean(fp_des_vals):.2f}")

# Check if there's a rev-up event
print("\nHPT FP over time (every 20th sample):")
for i in range(0, len(hpt_rows), 20):
    r = hpt_rows[i]
    print(f"  t={r['time']:6.2f}s FP_SAE={r['fp_sae']:7.2f} FP={r['fp']:8.2f} FP_DES={r['fp_des']:8.2f}")

# Parse periodic frames
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

is_base = fe_frames[0][0]

# Now the critical test: the periodic frame byte 0 is 0x42.
# What if byte 0 is NOT constant but is actually the HIGH byte of a 3-byte value?
# [42 02 60] = 0x420260 = 4325984 → * some factor?
# [42 02 2F] = 0x42022F = 4325935 → * some factor?
# Difference is tiny, doesn't match FP variation.

# What if the frame packs 3 separate values:
# Value 1: bytes 0-1 as uint16 (0x4202 = 16898) — constant, maybe a DID echo
# Value 2: bytes 2-3 as uint16 (varies widely) — fuel rail pressure?
# Value 3: bytes 4-5 as uint16 (varies moderately) — another pressure?
# Value 4: byte 6 (varies slightly) — temperature?

# HPT FP is ~4712 PSI. In kPa that's ~32488 kPa.
# FE w23 at idle varies 4769-24748. Mean ~27807.
# 32488 / 27807 = 1.168... not a clean factor.
# But 27807 * 0.145038 = 4033... not 4712.
# 27807 * 0.17 = 4727... close!

# Actually wait. The w23 varies from 111 to 65497 with stdev=19541.
# That's basically random noise or a rapidly changing signal.
# HPT FP only varies 4710-4740 (stdev=6.63).
# These can't be the same signal — the variance is completely different.

# So w23 is NOT fuel rail pressure. It's something else entirely.

# Let me reconsider. What if the periodic frame structure is:
# [periodicSubID] [data...] where periodicSubID tells which data block this is?
# Byte 0 = 0x42 could be a sub-identifier for a specific data block.
# Byte 1 = varies — could be another sub-ID or first data byte.

# Actually, in UDS periodic data responses:
# The response format is: [periodicDataIdentifier] [dataRecord]
# So after the 0xFE/0xFD periodic ID byte, the next bytes are the data record.
# The data record format depends on how the periodic ID was defined.

# For pre-defined periodic IDs (0x00, 0x40, 0x01, 0x4F), the ECU defines
# what data goes into each one. We don't know the mapping without ECU documentation.

# But we CAN figure it out by correlation!

# Let me try: what if FE contains FP (actual) and FP_SAE,
# and FD contains FP_DES (desired)?

# FP at idle = ~4712 PSI = ~32488 kPa
# If raw is in kPa * 10: 324880 → doesn't fit in 2 bytes
# If raw is in kPa: 32488 → fits in 2 bytes (0x7EE8)
# FE w45 at idle ≈ 3253
# 3253 * 10 = 32530 kPa → 32530 * 0.145038 = 4718 PSI ✓

# So w45 = pressure in kPa / 10? → w45 * 10 * 0.145038 = PSI
# But w45 stdev = 1494, and HPT FP stdev = 6.63
# 1494 * 10 * 0.145038 = 2167 PSI of variation — way too much!

# Unless the stdev is driven by a rev-up event.
# Let me check FE w45 over time:
print("\n=== FE w45 over time ===")
for ts, data in fe_frames[::10]:
    w45 = (data[4] << 8) | data[5] if len(data) > 5 else 0
    psi = w45 * 10 * 0.145038
    print(f"  t={ts-is_base:7.3f}s w45={w45:5d} → {psi:8.2f} PSI")

# Also check FE byte 6 — could this be FP_SAE?
# b6 range: 135-141
# 135 * 0.435 = 58.7 ≈ FP_SAE!
# 141 * 0.435 = 61.3 ≈ FP_SAE!
# 137 * 0.435 = 59.6 ≈ FP_SAE!
print("\n=== FE byte 6 as FP_SAE ===")
for ts, data in fe_frames[:20]:
    b6 = data[6] if len(data) > 6 else 0
    # Try: b6 * 0.435
    fp_sae = b6 * 0.435
    # Find closest HPT
    is_rel = ts - is_base
    closest = min(hpt_rows, key=lambda r: abs(r['time'] - is_rel))
    print(f"  t={is_rel:7.3f}s b6={b6:3d} → b6*0.435={fp_sae:6.2f} HPT_FP_SAE={closest['fp_sae']:6.2f}")

# Also try b6 * 100/255 * some factor
print("\n=== FE byte 6 formula search ===")
b6_sample = fe_frames[0][1][6]
hpt_sae = hpt_rows[0]['fp_sae']
factor = hpt_sae / b6_sample
print(f"b6={b6_sample}, HPT_FP_SAE={hpt_sae:.4f}, factor={factor:.6f}")
print(f"Check: {b6_sample} * {factor:.6f} = {b6_sample * factor:.4f}")

# Try common factors
for f in [0.435, 0.4353, 0.4348, 100/230, 100/229.5, 3/6.895]:
    print(f"  b6 * {f:.6f} = {b6_sample * f:.4f}")
