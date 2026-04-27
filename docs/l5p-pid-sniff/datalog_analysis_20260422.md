# Datalog Analysis — 2026-04-22T20:08 (DDDI Clear Test)

## Summary
- 22 LIVE PIDs (updating values)
- 28 FROZEN PIDs (single value but responding)
- 48 EMPTY PIDs (not responding)

## Value Issues

### RPM: avg 1534 rpm (expected ~600 at idle)
- Formula likely doubled or wrong byte offset
- Raw value ~767 * 2 = 1534? Or 4-byte instead of 2-byte?

### MAF: avg 10.79 lb/min (expected ~0.3 at idle)
- Way too high, ~36x expected
- Conversion factor wrong or raw bytes misinterpreted

### IBR_2: 4830 mm³ (expected ~0.2 mm³)
- Completely wrong, ~24000x expected
- DID 0x058E likely returns different data format than expected

### IBR_3: -32.77 mm³ (expected ~0.2 mm³)
- Negative value, signed interpretation wrong
- DID 0x058F

### FUEL_LVL: 133 gal (expected ~25 gal)
- Tank is 86.67% full, should be ~25 gal for a 30-gal tank
- Formula conversion factor wrong

### BARO_DSL: 58.78 PSI (expected ~14.7 PSI)
- ~4x too high, likely raw kPa value not converted properly
- 58.78 * 0.25 ≈ 14.7 — formula missing /4 factor?

### EGT_EXT: 5.9°F (expected ~300°F)
- Way too low, formula completely wrong

### NOX_O2: -12% (expected 0-21%)
- Negative, signed interpretation wrong

### TQ_REF: 916 lb·ft
- Possible but high for idle — might be max torque reference not current

## Duplicate Values (same raw bytes, different DIDs)
- BARO_DSL = TCTQRLR = 58.78
- DPF_REGEN_PCT = AFMIR2 = 103.31
- FUEL_LVL = PRNDL_T93 = KNK2_BMW = 133.43

These duplicates suggest the DID addresses are wrong — reading same ECU memory.

## Working PIDs (correct values)
- LOAD: 8.33% ✅
- ECT: 183.2°F ✅
- MAP: 8.59 PSI ✅ (atmospheric at idle)
- BARO: 14.78 PSI ✅
- BOOST_CMD: 8.18 PSI (atmospheric, correct for idle)
- AAT: 83.38°F ✅
- EOT_STD: 186°F ✅
- EGT1: 658.4°F ✅
- FRP_DES: 4706.62 PSI ✅ (correct idle rail pressure)
- FRP_ACT2: 4706.62 PSI ✅
- ECT_DSL: 176°F ✅
- DEF_LVL2: 38.04% ✅
- THRTL_CMD: 100% (diesel, correct — throttle is wide open at idle)
- INJ_PAT: 4 ✅ (injection pattern)
- DPF_SOOT_PCT: 0% ✅
- EXH_PRESS: 4.64 PSI ✅ (low at idle)
- VIN_CNT: 1 ✅

## Empty PIDs — All 0x05xx range DIDs
FRP_CMD (0x0564), FRP_ACT (0x0565), FRP_DEV (0x0566), INJ_TMG (0x057A),
INJ_QTY (0x055A), FPR_I (0x0567), IBR_1 (0x058D), IBR_4-8, BOOST_CMD/ACT,
VGT_CMD/ACT, TURBO_RPM, CAC_OUT, DPF_SOOT, DPF_DP, DPF_IN_T, DPF_OUT_T,
EGT_PRE, EGT_POST, DEF_LVL, DEF_TEMP, DEF_DOSE, NOX_IN, NOX_OUT, SCR_TEMP,
DEF_QUAL, EGR_FLOW, EGR_BYP, NOX_CONC, TFT, TCC_SLIP, TCC_CMD, TRANS_OUT,
TRANS_IN, EOT, EOP, OIL_LIFE, FUEL_FILT

## Key Insight
The 0x05xx range DIDs are NOT responding. The 0x30xx range DIDs (HPT-sourced) ARE responding.
The DDDI clear unlocks the 0x30xx range but NOT the 0x05xx range.
The 0x05xx range may require a different ECU address or a different session type.
