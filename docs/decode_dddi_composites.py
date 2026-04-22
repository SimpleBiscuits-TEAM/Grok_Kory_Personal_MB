#!/usr/bin/env python3
"""
Decode DDDI composite periodic frames from 0x5E8.

Key findings from the setup sequence:
1. HPT sends: [10 08 2D FE 00 40 01 4F] = ReadDataByPeriodicIdentifier
   - Service 0x2D, transmissionMode=0xFE (slow rate)
   - Periodic IDs to read: 0x00, 0x40, 0x01, 0x4F
   - But wait, total=8 bytes: 2D FE 00 40 01 4F XX XX (need CF)
   
2. ECU responds: [03 6D FE 00] = positive response for periodic ID 0x00 at rate FE
   Then: [02 6C FE] = positive response for DDDI clear (0x2C response = 0x6C)
   Then: [03 6D FE 01] = positive response for periodic ID 0x01 at rate FE
   
3. HPT sends: [04 2C FD FE 01] = DynamicallyDefineDataIdentifier
   - Service 0x2C, periodicID=0xFD, subfunction=0xFE, source=0x01
   - This defines composite FD from source periodic ID 0x01
   
4. HPT sends: [04 AA 04 FE FD] = ReadDataByPeriodicIdentifier (start)
   - Service 0xAA (GM proprietary?), periodic IDs FE and FD
   
So the periodic frames on 0x5E8 are:
- FE: contains data from periodic ID composites (fuel pressure data)
- FD: contains data from a different composite

The FE frame structure [42 02 XX XX 0C BB 88]:
- Bytes 0-1: 42 02 = constant? Or DID echo?
  - 0x4202 could be a DID... but that's not in our list
  - Wait: 0x42 = 0x40 + 0x02? No...
  - Actually in DDDI periodic responses, first byte after periodic ID is the data
  
Let me look at this differently. The DDDI define from the FIRST capture had:
  FE composite defined from source DIDs
  FD composite defined from source DIDs

From the first IntelliSpy capture, the DDDI defines were:
  0x2C FD 00 4F 00 10 00 0A  → FD = DID 0x004F bytes 0-16, size 10
  0x2C FB 20 B4 30 BE 32 8A 00 0D → FB = DIDs 0x20B4, 0x30BE, 0x328A, size 13
  0x2C F9 30 8A 13 2A → F9 = DIDs 0x308A, 0x132A
  0x2C F8 11 BB 20 BC 32 A8 00 0F 00 05 00 33 23 2C → F8 = many DIDs

But THIS capture is different — HPT only has 3 fuel pressure channels.
The setup is simpler: just periodic IDs 0x00, 0x40, 0x01, 0x4F.

Hmm wait, those might be pre-defined periodic IDs, not DDDI composites.
UDS service 0x2D ReadDataByPeriodicIdentifier reads pre-defined periodic data.
The ECU has built-in periodic identifiers (0x00-0xFF) that map to specific data.

So HPT is reading periodic IDs: 0x00, 0x40, 0x01, 0x4F
These are ECU-defined periodic data blocks, not DDDI composites.

The FE/FD in the 0x5E8 frames is the periodic response identifier.
But the first byte of the data (0x42) might be part of the periodic data, not a DID echo.

Let me just try to match the varying bytes to HPT values.
"""
import csv

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

# FE frame: [42 02 XX YY 0C BB 88]
# Bytes 0-1: 42 02 (constant across all frames? Let's check)
print("=== FE FRAME BYTE ANALYSIS ===")
print(f"Total FE frames: {len(fe_frames)}")
for i in range(7):
    vals = [f[1][i] for f in fe_frames if len(f[1]) > i]
    mn, mx = min(vals), max(vals)
    print(f"  Byte {i}: min=0x{mn:02X}({mn}) max=0x{mx:02X}({mx}) {'CONSTANT' if mn==mx else 'VARIES'}")

# Bytes 0-1 are constant (0x42, 0x02) — likely a DID echo or header
# Bytes 2-3 vary — this is likely the fuel pressure data
# Bytes 4-5 vary slightly — another value
# Byte 6 varies slightly — another value

print("\n=== FE FRAME: Bytes 2-3 as uint16 ===")
print("Trying formulas against HPT FP_SAE (~59 PSI) and FP (~4712 PSI):")
for ts, data in fe_frames[:10]:
    w_23 = (data[2] << 8) | data[3]
    w_45 = (data[4] << 8) | data[5]
    b_6 = data[6]
    
    # FP_SAE formulas
    fp_sae_a = w_23 * 0.01868
    fp_sae_b = w_23 * 0.1 * 0.145038
    
    # FP formulas  
    fp_a = w_23 * 1.39 * 0.145038
    fp_b = w_23 * 10 * 0.145038
    
    # w_45 formulas
    fp_sae_c = w_45 * 0.01868
    fp_d = w_45 * 1.39 * 0.145038
    fp_e = w_45 * 10 * 0.145038
    
    print(f"  w23={w_23:5d} w45={w_45:5d} b6={b_6:3d} | "
          f"w23*0.01868={fp_sae_a:8.2f} w45*0.01868={fp_sae_c:8.2f} | "
          f"w23*1.39*0.145={fp_a:8.2f} w45*10*0.145={fp_e:8.2f}")

print("\n=== FD FRAME BYTE ANALYSIS ===")
print(f"Total FD frames: {len(fd_frames)}")
for i in range(7):
    vals = [f[1][i] for f in fd_frames if len(f[1]) > i]
    mn, mx = min(vals), max(vals)
    print(f"  Byte {i}: min=0x{mn:02X}({mn}) max=0x{mx:02X}({mx}) {'CONSTANT' if mn==mx else 'VARIES'}")

print("\n=== FD FRAME: Bytes 2-3 as uint16 ===")
for ts, data in fd_frames[:10]:
    w_23 = (data[2] << 8) | data[3]
    w_45 = (data[4] << 8) | data[5]
    b_6 = data[6]
    print(f"  w23={w_23:5d} w45={w_45:5d} b6={b_6:3d}")

# Now the key insight: bytes 0-1 = 0x42 0x02
# 0x42 = 0x40 + 0x02 → this is a Mode 01 PID 0x02 response!
# No wait, 0x42 is not a standard response...
# Actually in periodic data, the first byte might be the periodic sub-ID
# Let me check: periodic ID 0x00 might map to bytes [42 02 ...] 

# Actually, looking more carefully:
# The DDDI setup sent periodic IDs: 0x00, 0x40, 0x01, 0x4F
# But the multi-frame was 8 bytes total: 2D FE 00 40 01 4F XX XX
# We need the continuation frame to get the full list

# Let me check if 0x42 0x02 is actually part of the data
# HPT FP SAE at idle = ~59 PSI
# HPT FP at idle = ~4712 PSI
# HPT FP DES at idle = ~4712 PSI

# FE frame bytes 4-5 (w_45) = 0x0CBB = 3259
# 3259 * 0.01868 = 60.88 → very close to FP_SAE!
# 3259 * 10 * 0.145038 = 4726.79 → close to FP!

# So bytes 4-5 could be the low-feed/SAE fuel pressure raw value
# And bytes 2-3 could be the high-pressure fuel rail raw value

# Let me check: FE bytes 2-3 vary a lot (0x1C30 to 0x60AC)
# 0x60AC = 24748 → 24748 * 0.145038 = 3589 PSI (too low for FP)
# 24748 * 1.39 * 0.145038 = 4989 PSI (close to FP!)
# But HPT says 4712... let me check the scale more carefully

print("\n\n=== DETAILED FORMULA MATCHING ===")
print("HPT first 5 values:")
for r in hpt_rows[:5]:
    print(f"  t={r['time']:.3f}s FP_SAE={r['fp_sae']:.4f} FP={r['fp']:.4f} FP_DES={r['fp_des']:.4f}")

print("\nFE first 5 frames with all formula attempts:")
for ts, data in fe_frames[:5]:
    w_01 = (data[0] << 8) | data[1]
    w_23 = (data[2] << 8) | data[3]
    w_45 = (data[4] << 8) | data[5]
    b_6 = data[6]
    
    print(f"\n  ts={ts:.6f} raw=[{' '.join(f'{x:02X}' for x in data)}]")
    print(f"  w01={w_01} w23={w_23} w45={w_45} b6={b_6}")
    
    # Try every word with common GM diesel formulas
    for label, val in [('w01', w_01), ('w23', w_23), ('w45', w_45)]:
        results = []
        # kPa to PSI conversions
        results.append((f'{label}*0.145038', val * 0.145038))
        results.append((f'{label}*1.39*0.145038', val * 1.39 * 0.145038))
        results.append((f'{label}*10*0.145038', val * 10 * 0.145038))
        results.append((f'{label}*0.01868', val * 0.01868))
        results.append((f'{label}*0.1', val * 0.1))
        results.append((f'{label}*0.01', val * 0.01))
        results.append((f'{label}/6.895', val / 6.895))
        results.append((f'{label}*0.001*145.038', val * 0.001 * 145.038))
        
        for name, result in results:
            # Match FP_SAE (~59 PSI)
            if 55 < result < 65:
                print(f"    {name} = {result:.4f} ≈ FP_SAE ({hpt_rows[0]['fp_sae']:.4f})")
            # Match FP (~4712 PSI)
            if 4600 < result < 4800:
                print(f"    {name} = {result:.4f} ≈ FP ({hpt_rows[0]['fp']:.4f})")
            # Match FP_DES (~4712 PSI)
            if 4600 < result < 4800:
                pass  # Same as FP at idle
