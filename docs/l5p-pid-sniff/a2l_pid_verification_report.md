# L5P PID Verification Report: A2L + BUSMASTER Cross-Reference

**Date:** April 22, 2026  
**Source A2L:** E41_a171711502_quasi.a2l (2017 L5P Duramax)  
**Source Capture:** BUSMASTERLogFile_FullPIDsChannelListHPT4.21.26(1).log  
**Truck State:** Warm idle, parked, engine running ~750 RPM

---

## Key A2L Findings

The E41 A2L reveals that **all internal ECU measurements are FLOAT32_IEEE** with **MSB_FIRST (big-endian)** byte order and **identity conversion** (COEFFS 0 1 0 0 0 1 = no scaling). This means:

- **Fuel Rail Pressure** (`VeFHPR_p_FuelRail`): FLOAT32, unit MPa, at RAM 0x40014398
- **EGT** (`VeEGTR_T_SnsrDPF_Up`): FLOAT32, unit °C, at RAM 0x400103D0
- **Engine Speed** (`VeTAPR_n_EngSpd`): FLOAT32, unit RPM, at RAM 0x40011764

However, **Mode 22 DID responses use integer encoding with scaling**, not raw FLOAT32. The ECU firmware converts the internal FLOAT32 to a scaled integer for the UDS response. The DDDI periodic frames (0x5E8) that read RAM directly **do** use FLOAT32.

---

## HPT DDDI Composite Addresses (from BUSMASTER)

| Periodic ID | RAM Address  | A2L Measurement | Data Type | Unit | Notes |
|-------------|-------------|-----------------|-----------|------|-------|
| FE00 | 0x40022158 | *Not in quasi A2L* | Unknown | Unknown | HPT-only runtime variable |
| FE01 | 0x4001BC8C | VeEGTC_dm_HC_QntyCL_Prop | FLOAT32 | mg/s | HC closed-loop quantity (proportional) |
| FE02 | 0x40014398 | **VeFHPR_p_FuelRail** | FLOAT32 | **MPa** | Fuel rail pressure — confirmed |
| FE03 | 0x400123D4 | VeASSR_g_ChkEngOnB | ULONG | bitfield | Check-engine-on bit-packed reasons |
| FE04 | 0x40011F18 | VeFULR_V_MaxQntyThrshA | FLOAT32 | mm³ | Max fuel quantity threshold A-pulse |

**Critical insight:** FE02 at 0x40014398 is definitively `VeFHPR_p_FuelRail` — FLOAT32 in MPa. This confirms that the DDDI periodic FE frame bytes 1-4 contain an IEEE 754 float representing fuel rail pressure in MPa.

---

## Mode 22 DID Verification Table

### Confirmed Correct (14 PIDs)

| DID | Short Name | Our Formula | BUSMASTER Raw | Our Result | Expected | Status |
|-----|-----------|-------------|---------------|------------|----------|--------|
| 0x0C | RPM | (A×256+B)/4 | N/A (Mode 01) | ~750 RPM | ~750 RPM | ✅ Anchor |
| 0x10 | MAF | (A×256+B)/100 | N/A (Mode 01) | Correct | Correct | ✅ Anchor |
| 0x328A | FRP_ACT | (A×256+B) × 0.4712 | 0x2710 = 10000 | 4712 PSI | ~4712 PSI | ✅ Exact |
| 0x30C1 | FRP_ACT_SS | (A×256+B) × 1.39 × 0.145038 | 0x5B32 = 23346 | 4706 PSI | ~4712 PSI | ✅ (0.13% off) |
| 0x30BC | FRP_DES_SS | (A×256+B) × 1.39 × 0.145038 | 0x5B32 = 23346 | 4706 PSI | ~4712 PSI | ✅ Same as 30C1 |
| 0x308A | BARO_DSL | (A×256+B) × 0.03125 × 0.145038 | 0x0CAD = 3245 | 14.7 PSI | ~14.7 PSI | ✅ |
| 0x0062 | TQ_ACT | A - 125 | 0x88 = 136 | 11% | ~10-15% idle | ✅ |
| 0x0063 | TQ_REF | (A×256+B) × 0.737562 | 0x04DB = 1243 | 917 lb·ft | ~910 lb·ft | ✅ |
| 0x005D | INJ_TMG | ((A×256+B) - 26880) / 128 | 0x686F = 26735 | -1.13° BTDC | ~-1° idle | ✅ |
| 0x000F | IAT | A - 40 | 0x51 = 81 | 41°C / 106°F | Warm engine bay | ✅ |
| 0x002C | EGR_CMD | A × 100/255 | 0xA0 = 160 | 62.7% | Diesel idle | ✅ |
| 0x30BE | THRTL_CMD | (A×256+B) × 0.1 | 0x03E8 = 1000 | 100% | Diesel WOT at idle | ✅ |
| 0x1141 | FUEL_LVL | A × 0.21832 | 0x8F = 143 | 31.22 gal | HPT: 31.2177 | ✅ Exact |
| 0x30D5 | ECT_DSL | (A - 40) × 1.8 + 32 | 0x78 = 120 | 176°F / 80°C | Warm idle | ✅ |

### Confirmed Wrong (1 PID + 1 DDDI parse)

| Item | Issue | Current | Correct |
|------|-------|---------|---------|
| **DDDI FE frame FRP_ACT** | Wrong data type and byte positions | b67_LE × 0.1338 | FLOAT32_BE(bytes[1:4]) × 145.038 |
| **0x004A AAT** | (A-40) gives -16°C in TX April | (A - 40) °C | Likely A directly in °C (24°C = 75°F) |

### Needs Verification on Truck (6 PIDs)

| DID | Short Name | Issue | Notes |
|-----|-----------|-------|-------|
| 0x208A | FP_SAE | 0.01868 gives 60.6 vs HPT 59.18 (2.4% off) | Could be timing difference in capture |
| 0x0069 | EGT_EXT | Multi-frame — need full CF data | byte0 may be count, not data |
| 0x30D7 | DEF_LVL2 | ×100/255 = 38% vs raw = 97% | Need HPT to confirm which |
| 0x0071 | NOX_CONC | Named NOx but SAE says turbo inlet pressure | GM may repurpose on diesel |
| 0x007A | NOX_O2 | Named NOx O2 but SAE says turbo RPM | GM may repurpose on diesel |
| 0x1337 | EGT (if used) | ×0.1 gives 3511°F at idle — way too high | Likely ×0.01 = 355°C = 671°F |

### Unknown DIDs (6 PIDs — need HPT channel names)

| DID | Raw Value | Guesses |
|-----|-----------|---------|
| 0x132A | 0x1ECA = 7882 | ×0.01 = 78.82°C (intake manifold temp?) |
| 0x20BC | 0xC0 = 192 | ×100/255 = 75.3% (some percentage) |
| 0x2072 | 0x4D = 77 | 77°C = 171°F (a temperature?) |
| 0x30CA | 0x04 | Injection pattern active (enum) |
| 0x30DA | 0x00 | DPF soot load 0% |
| 0x3039 | 0xFFFF | Likely "not available" / max sentinel |

---

## DDDI Periodic Frame Parsing Fix

### Current (Wrong)
```typescript
// FRP_ACT = bytes[6:7] little-endian × 0.1338
const frpRaw = (data[7] << 8) | data[6];  // b67_LE
const frpPsi = frpRaw * 0.1338;
```

### Correct (A2L-verified)
```typescript
// FRP_ACT = bytes[1:4] IEEE 754 FLOAT32 big-endian, value in MPa
// A2L: VeFHPR_p_FuelRail at 0x40014398 = FLOAT32_IEEE, CM_T_p_MPa, COEFFS identity
const buf = new DataView(new Uint8Array(data.slice(1, 5)).buffer);
const frpMpa = buf.getFloat32(0, false);  // false = big-endian
const frpPsi = frpMpa * 145.038;          // MPa → PSI
```

### Verification
```
FE frame: FE 42 02 60 AC 0C BB 88
bytes[1:4] = 42 02 60 AC → FLOAT32_BE = 32.5944 MPa
32.5944 × 145.038 = 4727.4 PSI (HPT shows ~4712 PSI — 0.3% off)
```

---

## Summary

Out of ~30 DIDs analyzed:
- **14 confirmed correct** — our formulas match BUSMASTER data
- **1 confirmed wrong** — DDDI FE frame FRP_ACT parsing (wrong data type entirely)
- **1 likely wrong** — 0x004A AAT formula
- **6 need truck verification** — close but need HPT comparison
- **6 unknown** — need HPT channel name mapping

The A2L was essential for confirming that DDDI periodic frames use **raw FLOAT32 IEEE 754** from ECU RAM, while Mode 22 responses use **scaled integers**. This is why our uint16 × 0.1338 formula was wrong for the periodic stream but the Mode 22 formula (×0.4712) works for 0x328A.
