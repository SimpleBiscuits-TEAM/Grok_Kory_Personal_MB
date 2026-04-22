# Datalog Analysis — 2026-04-22

## Key Issues Found

### 1. FUEL_LVL still wrong: 142-143 gal (should be ~31 gal)
- Formula still producing wrong values
- HPT shows ~31.2 gal at idle

### 2. BARO_DSL: 17-23 PSI (should be ~14.7 PSI at sea level)
- Range is wrong — values too high

### 3. EGT_EXT: 7332°F (should be ~300-400°F at idle)
- Way too high — formula is wrong

### 4. DPF_REGEN_PCT: 100% constant (should be -4% at idle per HPT)
- Formula producing wrong values

### 5. NOX_CONC: 2081 ppm constant (should be much lower at idle)
- Formula likely wrong

### 6. DPM: 7.67 mg/m³ constant — seems plausible but need to verify

### 7. EXH_PRESS: 4.64 PSI constant — seems plausible at idle

### 8. TTQRET: 61.29° (this is a gas truck PID showing on diesel — wrong PID being read)
- TTQRET is gasoline-only (Trans Torque Reduction Spark Retard)
- On diesel, 0x208A is Fuel Pressure SAE — but it's showing as TTQRET

### 9. TCTQRLR: 17-23 (same values as BARO_DSL — duplicate read)
- 0x308A is BARO_DSL on diesel but TCTQRLR on gas — wrong PID being selected

### 10. AFMIR2: 100 (same as DPF_REGEN_PCT — duplicate read)
- 0x328A is DPF_REGEN_PCT on diesel but AFMIR2 on gas — wrong PID being selected

### 11. PRNDL_T93 / KNK2_BMW: 142-143 (same as FUEL_LVL — wrong PIDs being read on diesel)

### 12. Many DEAD columns: DPF_SOOT, DPF_DP, DPF_IN_T, DPF_OUT_T, DPF_REGEN, DPF_REGEN_CT, DPF_DIST, DEF_LVL, DEF_TEMP, DEF_DOSE, NOX_IN, NOX_OUT, SCR_TEMP, DEF_QUAL, FRP_DES, DEF_LVL2, INJ_PAT, NOX_O2

### 13. FRP_ACT2: 4706 PSI — this is the high-pressure rail, seems plausible at idle

## Root Cause Analysis

The main problem is that the datalogger is reading GAS TRUCK PIDs on a DIESEL truck. The PID selection is not filtering by fuelType. When the same DID (e.g., 0x208A) exists for both diesel and gasoline, the wrong one is being used.

### Fix needed:
- The PID lookup/selection in the datalogger must filter by fuelType when the vehicle is identified as diesel
- Gas-only PIDs (TTQRET, TCTQRLR, AFMIR2, PRNDL_T93, KNK2_BMW) should not appear in diesel datalogs
