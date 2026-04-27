# Cross-Reference: HPT vs V-OP Values (2026-04-22)

## Perfect Matches
- AAT: HPT 84.2°F vs Ours 83.4°F ✅
- BARO: HPT 14.79 PSI vs Ours 14.78 PSI ✅
- VPWR: HPT 14.37V vs Ours 14.36V ✅
- ECT: HPT 183.2°F vs Ours 183.2°F ✅
- FRP_DES: HPT 4704.8 PSI vs Ours 4706.6 PSI ✅
- VSS: Both 0 MPH ✅

## Wrong Values
- RPM: HPT 600 rpm vs Ours 1534 rpm (2.56x — likely reading 4 bytes instead of 2, or wrong formula)
- MAF: HPT 4.04 lb/min vs Ours 10.79 lb/min (2.67x)
- MAP: HPT -0.08 PSI (gauge) vs Ours 8.59 PSI (absolute) — HPT shows gauge pressure, we show absolute
- BOOST_CMD: HPT 0.09 PSI (gauge) vs Ours 8.18 PSI (absolute) — same issue, gauge vs absolute
- INJ_TMG_SAE: HPT -1.12° vs Ours 0.01° — formula issue
- FUEL_LVL: HPT 31.2 gal vs Ours 133.4 gal (4.27x — formula wrong)

## Key Insights
1. MAP/BOOST show ABSOLUTE pressure, HPT shows GAUGE (subtract BARO)
2. RPM is 2.56x too high — formula multiplier wrong
3. MAF is 2.67x too high — conversion factor wrong
4. FUEL_LVL is 4.27x too high — formula wrong
5. All 0x05xx DIDs still EMPTY — DDDI clear doesn't unlock them
6. HPT "Fuel Pressure (SAE)" = 59.4 PSI (Mode 01 PID 0x0A?) — NOT same as our FRP_CMD (0x0564)
