# BLEND Bug Analysis

## Screenshot 1 (BLEND OFF):
- Row 1000: cells at col ~88 show value 2.113 (no correction %), then 2.507, 2.576, 2.738, 2.935, 3.111...
- Row 1100: shows 2.269 with -5.5% correction at one cell
- Row 1200: shows 2.128 -5.5%, 2.416 -3.1%
- Row 1300: shows 1.995 -2.8%, 2.172 -1.5%, 2.506 -0.7%
- Row 1400: shows 2.030 +1.2%, 2.256 +0.0%, 2.431 -0.0%
- Row 1500: shows 2.028 -0.5%, 2.135 -2.6%, 2.374 -2.1%, 2.566 -3.1%

## Screenshot 2 (BLEND ON):
- Row 1000: cells at same position show 2.055 -2.0%, 2.438 -2.0%, 2.505 -2.0%
- Row 1100: shows 2.077 -2.0%, 2.144 -10.7%, 2.522 -2.4%, 2.659 -1.6%
- Row 1200: shows 1.869 -1.0%, 2.029 -1.0%, 2.018 -10.7%, 2.361 -6.3%, 2.741 -1.0%
- Row 1300: shows 1.858 -0.2%, 1.954 -4.0%, 2.140 -2.9%, 2.488 -1.4%, 2.737 -0.0%
- Row 1400: shows 1.001 -0.2%, 2.055 +2.4%, 2.273 +1.5%, 2.412 -1.6%, 2.696, 2.754 -1.5%
- Row 1500: shows 1.919 -0.4%, 2.015 -1.3%, 2.081 -5.0%, 2.323 -4.2%, 2.487

## Key Observations:
1. In BLEND OFF, row 1000 cells at col ~88 position show 2.113 WITHOUT any correction percentage
2. In BLEND ON, those same cells show 2.055 WITH -2.0% correction
3. This means cells that had NO correction in BLEND OFF are getting corrections in BLEND ON
4. This is EXPECTED behavior for gap interpolation/boundary blending!
5. BUT - cells that DID have corrections (like row 1100 showing 2.269 -5.5%) now show DIFFERENT values (2.144 -10.7%)
6. THAT is the bug - the already-corrected cells are changing their values when blend is toggled

## Root Cause Hypothesis:
The corrected cells ARE changing because blendCorrectedMap uses corr.correctionFactor to multiply
map.data[r][c]. If map.data[r][c] != corr.originalValue (which shouldn't happen normally), the
result would differ. 

WAIT - looking more carefully at row 1100:
- BLEND OFF: 2.269 at -5.5%
- BLEND ON: 2.144 at -10.7%

If originalValue was ~2.401 (2.269 / (1 - 0.055) ≈ 2.401), then:
- BLEND OFF correction factor: 2.269 / 2.401 = 0.945 (-5.5%)
- BLEND ON shows 2.144 at -10.7%, which means factor = 0.893

This is a DIFFERENT factor! The blend is somehow changing the factor for corrected cells.
