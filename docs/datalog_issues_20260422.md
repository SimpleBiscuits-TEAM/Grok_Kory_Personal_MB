# Datalog Issues Analysis — 2026-04-22

## Working PIDs (values look correct)
- RPM: 599-600 ✅
- MAF: 4.03-4.09 lb/min ✅
- ECT (Mode 01): 183°F ✅
- BOOST: -0.23 to 0.3 PSI ✅ (near zero at idle)
- FRP: 7968-8412 (raw) → need to verify formula
- INJ_TMG_SAE: -1.66 to 0 °BTDC ✅ (matches HPT ~-1.2)
- TQ_ACT: 11-15% ✅
- TQ_REF: 916-1243 lb·ft ✅
- FRP_ACT2: 4706 PSI ✅ (matches HPT ~4740)
- ECT_DSL: 176°F ✅ (matches HPT)
- IPW_1: 1.019-1.055 ms ✅ (matches HPT ~1.3 ms)
- IBR_1: -0.13 to 0 mm³ ✅ (small balance at idle)
- EXH_PRESS: 4.64 PSI ✅ (plausible at idle)

## Broken PIDs — Formula Issues
1. **FUEL_LVL (gal)**: 135-144 gal → should be ~31 gal
   - FUEL_LVL (%): 85.1% is correct! The gal conversion is wrong.
   - Tank size assumption is wrong (using 85.1% * 168 = 143 gal?)
   - L5P Sierra HD has a 36 gal tank, so 85.1% * 36 = 30.6 gal ✅

2. **BARO_DSL**: 17-23 PSI → should be ~14.7 PSI
   - DID 0x308A raw response needs formula check
   - HPT shows 14.7 PSI at idle

3. **EGT_EXT**: 7332°F → should be ~300-400°F
   - Way too high — formula is completely wrong

4. **DPF_REGEN_PCT**: 100% → HPT shows -4%
   - DID 0x32A8, raw 252 → HPT interprets as signed byte: 252-256 = -4
   - Our formula is treating it as unsigned

5. **NOX_CONC**: 2081 ppm → should be low at idle
   - Formula likely wrong

6. **DPM**: 7.67 mg/m³ → need to verify

7. **FP_SAE**: 61.29 PSI → HPT shows ~60 PSI ✅ (actually correct!)

## Dead PIDs (no data)
- DPF_SOOT, DPF_DP, DPF_IN_T, DPF_OUT_T, DPF_REGEN, DPF_REGEN_CT, DPF_DIST
- DEF_LVL, DEF_TEMP, DEF_DOSE, DEF_LVL2, DEF_QUAL
- NOX_IN, NOX_OUT, SCR_TEMP
- FRP_DES, INJ_PAT, NOX_O2
- AAT_DSL, INJ_TMG (old), MAIN_FUEL_RATE
- TP_A, TP_B, EGR_PNTL (not in preset)

## Gas PIDs appearing on diesel (fuelType filter bug — FIXED)
- TTQRET: 61.29 (same as FP_SAE — shared DID 0x208A)
- TCTQRLR: 17-23 (same as BARO_DSL — shared DID 0x308A)
- AFMIR2: 100 (same as DPF_REGEN_PCT — shared DID 0x328A)
- PRNDL_T93: 135-144 (same as FUEL_LVL — shared DID)
- KNK2_BMW: 135-144 (same as FUEL_LVL — shared DID)
