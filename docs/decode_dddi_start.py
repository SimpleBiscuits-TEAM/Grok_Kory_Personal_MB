"""
Find the AA start command and decode the complete DDDI setup sequence.
Also correlate periodic frame bytes to source DIDs using the define commands.
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

# Look at ALL frames around the DDDI define window, including the preceding setup
print("=" * 80)
print("COMPLETE DDDI SETUP SEQUENCE (9690.7 - 9691.0)")
print("=" * 80)

for t, aid, d in frames:
    if 9690.7 <= t <= 9691.0 and aid in (0x7E0, 0x7E8):
        dir = "TX" if aid == 0x7E0 else "RX"
        hex_str = ' '.join(f'{b:02X}' for b in d)
        pci = d[0] >> 4
        pci_names = {0: 'SF', 1: 'FF', 2: 'CF', 3: 'FC'}
        
        # Decode payload for SF
        extra = ""
        if pci == 0:
            sf_len = d[0] & 0x0F
            payload = d[1:1+sf_len]
            if payload:
                if payload[0] == 0xAA:
                    extra = f" → GM_AA sub=0x{payload[1]:02X} args=[{' '.join(f'{b:02X}' for b in payload[2:])}]"
                elif payload[0] == 0x2C:
                    extra = f" → DDDI target=0x{payload[1]:02X}"
                elif payload[0] == 0x6C:
                    extra = f" → DDDI+ target=0x{payload[1]:02X}"
                elif payload[0] == 0x6D:
                    extra = f" → IOCTL+ DID=0x{payload[1]:02X}{payload[2]:02X}" if len(payload) >= 3 else ""
                elif payload[0] == 0x3E:
                    extra = " → TesterPresent"
                elif payload[0] == 0x7E:
                    extra = " → TesterPresent+"
                elif payload[0] == 0xEA:
                    extra = f" → GM_EA"
        elif pci == 1:
            total_len = ((d[0] & 0x0F) << 8) | d[1]
            extra = f" → FF total={total_len}B, svc=0x{d[2]:02X}"
        
        print(f"  [{t:.6f}] {dir} [{pci_names.get(pci,'??')}] {hex_str}{extra}")

# Now look for the IOCTL (0x2D) setup that precedes the DDDI defines
print("\n" + "=" * 80)
print("LOOKING FOR IOCTL (0x2D) SETUP BEFORE DDDI DEFINES")
print("=" * 80)

# Search wider - the 0x2D setup might be earlier
for t, aid, d in frames:
    if 9690.0 <= t <= 9691.0 and aid == 0x7E0:
        pci = d[0] >> 4
        if pci == 1:  # FF
            svc = d[2]
            if svc in (0x2C, 0x2D, 0xAA):
                total_len = ((d[0] & 0x0F) << 8) | d[1]
                hex_str = ' '.join(f'{b:02X}' for b in d)
                print(f"  [{t:.6f}] FF total={total_len}B: {hex_str}")
        elif pci == 0:  # SF
            sf_len = d[0] & 0x0F
            payload = d[1:1+sf_len]
            if payload and payload[0] in (0x2C, 0x2D, 0xAA):
                hex_str = ' '.join(f'{b:02X}' for b in d)
                print(f"  [{t:.6f}] SF: {hex_str}")

# Now find the FULL multi-frame messages by looking at ALL 0x7E0 frames in order
print("\n" + "=" * 80)
print("ALL 0x7E0 TX FRAMES 9690.7 - 9691.0 (reassembled)")
print("=" * 80)

tx_in_window = [(t, d) for t, aid, d in frames if 9690.7 <= t <= 9691.0 and aid == 0x7E0]

messages = []
i = 0
while i < len(tx_in_window):
    t, d = tx_in_window[i]
    pci = d[0] >> 4
    
    if pci == 1:  # FF
        total_len = ((d[0] & 0x0F) << 8) | d[1]
        payload = list(d[2:])
        i += 1
        while i < len(tx_in_window) and len(payload) < total_len:
            t2, d2 = tx_in_window[i]
            if d2[0] >> 4 == 2:  # CF
                payload.extend(d2[1:])
                i += 1
            else:
                break
        messages.append((t, payload[:total_len]))
    elif pci == 0:  # SF
        sf_len = d[0] & 0x0F
        payload = list(d[1:1+sf_len])
        messages.append((t, payload))
        i += 1
    else:
        i += 1

for t, payload in messages:
    hex_str = ' '.join(f'{b:02X}' for b in payload)
    svc = payload[0] if payload else 0
    svc_name = {0x2C: 'DDDI', 0x2D: 'IOCTL', 0xAA: 'GM_AA', 0x3E: 'TesterPresent'}.get(svc, f'0x{svc:02X}')
    print(f"  [{t:.6f}] {svc_name} ({len(payload)}B): {hex_str}")

# Now the critical part: the AA start command
# Looking at the CF at 9690.956: 21 FA F9 F8 00 00 00 00
# This is CF seq=1, so the FF must have come before the FC at 9690.951
# But the FC is from ECM (RX). Let me look for the FF from us.

print("\n" + "=" * 80)
print("SEARCHING FOR AA START FF (9690.94 - 9690.96)")
print("=" * 80)

for t, aid, d in frames:
    if 9690.94 <= t <= 9690.96 and aid in (0x7E0, 0x7E8):
        dir = "TX" if aid == 0x7E0 else "RX"
        hex_str = ' '.join(f'{b:02X}' for b in d)
        pci = d[0] >> 4
        pci_names = {0: 'SF', 1: 'FF', 2: 'CF', 3: 'FC'}
        print(f"  [{t:.6f}] {dir} [{pci_names.get(pci,'??')}] {hex_str}")

# The FF might be right after the 6C F8 response
# Let me look at the EXACT frame ordering
print("\n" + "=" * 80)
print("EXACT FRAME ORDER 9690.94 - 9690.97 (ALL arb IDs)")
print("=" * 80)

for t, aid, d in frames:
    if 9690.94 <= t <= 9690.97 and aid in (0x7E0, 0x7E8, 0x5E8):
        dir = {0x7E0: "TX", 0x7E8: "RX", 0x5E8: "PER"}.get(aid, "??")
        hex_str = ' '.join(f'{b:02X}' for b in d)
        pci = d[0] >> 4 if aid != 0x5E8 else -1
        pci_names = {0: 'SF', 1: 'FF', 2: 'CF', 3: 'FC'}
        print(f"  [{t:.6f}] {dir} 0x{aid:03X} [{pci_names.get(pci,'  ')}] {hex_str}")

# Now correlate periodic frame bytes to source DIDs
print("\n" + "=" * 80)
print("PERIODIC FRAME BYTE CORRELATION")
print("=" * 80)

# From the DDDI defines:
# FE: defined by IOCTL (0x2D) — we need to figure out what's in it
# FD: defined as 0x004F, 0x0010, 0x000A (or some other interpretation)
# FB: sources 0x20B4, 0x30BE, 0x328A + trailing 00 0D
# F9: sources 0x308A, 0x132A + trailing 32 A8 00 0F 00 05
# F8: sources 0x11BB, 0x20BC, 0x32A8 + more

# Wait — the DDDI define format might be:
# 2C [target] [src_did_hi src_did_lo src_did_hi src_did_lo ...] with NO position/size fields
# Each source DID contributes its full response bytes to the composite

# Let me check: how many bytes does each source DID return?
# 0x20B4 (IBR_1) = 2 bytes
# 0x30BE (THRTL_CMD) = 2 bytes  
# 0x328A (FRP_ACT) = 2 bytes
# Total for FB: 6 bytes → FB frame has 7 data bytes (byte 0 = ID, bytes 1-7 = data)
# But 3 DIDs × 2 bytes = 6 bytes, and FB has 7 data bytes. The extra byte might be from 0x000D?

# Actually, the trailing bytes might be MORE source DIDs or position/size info
# Let me re-examine: 2C FB 20 B4 30 BE 32 8A 00 0D
# If pairs: (20B4) (30BE) (328A) (000D) — 4 source DIDs
# 0x000D = standard PID 0x0D = MAP sensor (1 byte)
# So FB = IBR_1(2) + THRTL_CMD(2) + FRP_ACT(2) + MAP(1) = 7 bytes ✓

# F9: 2C F9 30 8A 13 2A 32 A8 00 0F 00 05
# Pairs: (308A) (132A) (32A8) (000F) (0005)
# 0x308A = BARO_DSL (2 bytes)
# 0x132A = ? (2 bytes)
# 0x32A8 = DPF_REGEN_PCT (2 bytes)  
# 0x000F = standard PID 0x0F = IAT (1 byte)
# 0x0005 = standard PID 0x05 = ECT (1 byte)
# Total: 2+2+2+1+1 = 8 bytes? But F9 only has 7 data bytes
# Hmm, maybe some are 1-byte DIDs

# F8: 2C F8 11 BB 20 BC 32 A8 00 0F 00 05 00 33 23 2C
# Pairs: (11BB) (20BC) (32A8) (000F) (0005) (0033) (232C)
# 0x11BB = ? 
# 0x20BC = IPW_5
# 0x32A8 = DPF_REGEN_PCT
# 0x000F = IAT
# 0x0005 = ECT
# 0x0033 = standard PID 0x33 = BARO (1 byte)
# 0x232C = AAT_DSL

# Let me verify with actual periodic frame data
periodic = [(t, d) for t, aid, d in frames if aid == 0x5E8 and 9690.9 <= t <= 9691.1]

print("\nFirst periodic frames after DDDI start:")
for t, d in periodic[:14]:
    pid = d[0]
    hex_str = ' '.join(f'{b:02X}' for b in d)
    print(f"  [{t:.6f}] ID=0x{pid:02X}: {hex_str}")

# FB frame: FB FF F6 03 E8 00 3B A1
# If FB = [IBR_1(2)] [THRTL_CMD(2)] [FRP_ACT(2)] [MAP(1)]
#   IBR_1 = FF F6 = -10 (signed) → -10 * 0.01 = -0.10 mm³
#   THRTL_CMD = 03 E8 = 1000 → 1000 * 0.1 = 100%
#   FRP_ACT = 00 3B = 59 → 59 * 0.4712 = 27.8 PSI? No, should be ~4712
#   MAP = A1 = 161 → 161 kPa = 23.3 PSI

# That doesn't work. Let me try different byte groupings.
# FB FF F6 03 E8 00 3B A1
# Maybe: [FRP_ACT = FF F6 03 E8?] No, that's 4 bytes for one DID

# Actually, looking at the DDDI define format more carefully:
# GM might use: 2C [target] [src_did_hi src_did_lo byte_pos byte_size] [src_did_hi src_did_lo byte_pos byte_size] ...
# So FB: 2C FB [20 B4] [30 BE] [32 8A] [00 0D]
# That's 4 groups of 2 bytes each = 4 source DIDs, no position/size
# OR: 2C FB [20 B4 30 BE] [32 8A 00 0D]
# = 2 groups of (DID, pos, size)? But pos and size would be 1 byte each

# Let me try: 2C FB [src=20B4 pos=30 size=BE]? No, that's nonsensical

# Standard UDS DDDI defineByIdentifier format:
# 2C 01 [target_hi target_lo] [src_hi src_lo pos size] [src_hi src_lo pos size] ...
# But GM seems to omit the 0x01 subfunction AND the target high byte

# GM format might be:
# 2C [target_lo] [src_hi src_lo] [src_hi src_lo] ...
# Where each source DID contributes ALL its bytes

# Let me verify with known values:
print("\n\nVERIFYING FB FRAME BYTE MAPPING:")
print("FB frame: FB FF F6 03 E8 00 3B A1")
print("DDDI define: 2C FB 20 B4 30 BE 32 8A 00 0D")
print()

# Check: what if the format is [src_did_hi src_did_lo] pairs?
# Sources: 0x20B4, 0x30BE, 0x328A, 0x000D
# 0x20B4 = IBR_1 → 2 bytes (signed16 * 0.01)
# 0x30BE = THRTL_CMD → 2 bytes
# 0x328A = FRP_ACT → 2 bytes
# 0x000D = Mode 01 PID 0x0D MAP → 1 byte

# FB data: FF F6 | 03 E8 | 00 3B | A1
# IBR_1 = FFF6 = -10 → -0.10 mm³ (idle, reasonable)
# THRTL_CMD = 03E8 = 1000 → 1000 * 0.1 = 100% (throttle command)
# FRP_ACT = 003B = 59 → 59 * ??? 
# MAP = A1 = 161 → 161 kPa (reasonable for boosted diesel)

# FRP_ACT = 59 doesn't make sense with any reasonable scale for 4712 PSI
# Unless FRP_ACT is NOT 0x328A here

# Let me check FA frame which I said has FRP_ACT at bytes 5-6
# FA: FA 68 72 03 E8 27 10 00
# Bytes 5-6: 27 10 = 10000 → 10000 * 0.4712 = 4712 ✓

# So 0x328A contributes to FA, not FB?
# But the DDDI define for FB lists 0x328A as a source

# WAIT — maybe the DDDI define format includes position and size:
# 2C FB [src=0x20B4] [src=0x30BE] [src=0x328A] [pos=0x00 size=0x0D]
# No, 0x0D = 13 bytes, that's too many

# Or maybe: 2C FB [src_hi src_lo pos size] repeated:
# [20 B4 30 BE] → src=0x20B4, pos=0x30, size=0xBE? No, nonsensical
# [20 B4] [30 BE] [32 8A] [00 0D] → 4 source DIDs, each 2 bytes

# I think the simplest interpretation is correct: 4 source DIDs
# But the byte mapping doesn't work for FRP_ACT

# Let me check if 0x328A returns more than 2 bytes
# From IntelliSpy Mode 22 read: 0x328A response was 05 62 32 8A 27 10
# That's: service(62) + DID(328A) + data(2710) = 2 data bytes
# So 0x328A = 2 bytes

# Total: 2+2+2+1 = 7 bytes ✓ (matches FB frame data length)
# But FRP_ACT = 003B = 59 doesn't match 4712 PSI

# UNLESS the formula is different in periodic mode
# 59 * 80 = 4720 ≈ 4712? Close!
# Or maybe the periodic packs only the HIGH byte of FRP_ACT?

# Actually wait — let me recount the FB bytes:
# FB [FF F6] [03 E8] [00 3B] [A1]
#     2 bytes  2 bytes  2 bytes  1 byte = 7 bytes ✓
# 003B = 59, and 0x2710 = 10000 from Mode 22
# 10000 / 59 ≈ 169.5 — no clean ratio

# Hmm, maybe the source DIDs are NOT what I think
# Let me re-examine: maybe the format is:
# 2C [target] [src_hi src_lo startByte numBytes] repeated
# 2C FB [20 B4] [30 BE] [32 8A] [00 0D]
# → src=0x20B4, startByte=0x30, numBytes=0xBE? No

# Or: 2C FB [20] [B4 30 BE 32 8A 00 0D]
# → src=0x20, data=B4 30 BE 32 8A 00 0D? No

print("\nNeed to look at this differently.")
print("Let me check the FE frame (defined by IOCTL, not DDDI):")
print("FE: FE 44 A3 8E D3 09 62 A2")
print()

# FE is defined by IOCTL (0x2D), not DDDI
# The IOCTL command was: 2D FE 00 40 01 4F (in fuel pressure capture)
# In the full capture, the preceding setup was different

# Let me check if the FE frame bytes correlate to known values
# At idle: RPM ≈ 800, FRP ≈ 4712, FP_SAE ≈ 59
# FE: 44 A3 8E D3 09 62 A2
# 44 A3 = 17571
# 8E D3 = 36563
# 09 62 = 2402
# A2 = 162

# From fuel pressure capture:
# FE: 42 02 60 AC 0C BB 88
# 42 02 = 16898
# 60 AC = 24748
# 0C BB = 3259 → 3259 * 0.01868 = 60.88 ≈ FP_SAE ✓
# 88 = 136

# Bytes 5-6 of FE = FP_SAE in fuel pressure capture
# But in full capture, FE bytes 5-6 = 09 62 = 2402 → 2402 * 0.01868 = 44.87
# That doesn't match FP_SAE ≈ 59

# The FE frame structure is DIFFERENT between the two captures!
# Because the IOCTL setup is different.

print("The FE frame structure depends on the IOCTL (0x2D) setup command.")
print("Different channel selections = different FE byte layout.")
print()
print("For V-OP, we need to send OUR OWN IOCTL + DDDI setup")
print("to define periodic frames with the channels we want.")
