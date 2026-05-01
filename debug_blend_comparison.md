# Detailed Screenshot Comparison

## BLEND OFF - Row 1100:
- Cols up to col ~12 (83.33 kPa): 1.946 (no correction)
- Col ~13 (88 kPa): **2.269** with **-5.5%** (green, corrected)
- Col ~14 (88.67 kPa): 2.583 (no correction)
- Col ~15 (71.67 kPa): 2.701 (no correction)

## BLEND ON - Row 1100:
- Col ~12 (83.33 kPa): 2.077 with **-2.0%** (NEW - blended cell, wasn't corrected before)
- Col ~13 (88 kPa): **2.144** with **-10.7%** (WAS 2.269 at -5.5%!)
- Col ~14 (88.67 kPa): 2.522 with **-2.4%** (NEW - blended cell)
- Col ~15 (71.67 kPa): 2.659 with **-1.6%** (NEW - blended cell)

## The Bug:
The cell at row 1100, col 13 (88 kPa) changes from 2.269 (-5.5%) to 2.144 (-10.7%).
This is a DIRECTLY CORRECTED cell (from datalog data) and its value should NOT change when blend is toggled.

## Math check:
- Original value at [1100, col13]: If correction was -5.5%, then original = 2.269 / (1 - 0.055) = 2.401
- With BLEND ON showing 2.144 at -10.7%: 2.401 * (1 - 0.107) = 2.144 ✓
- So the FACTOR changed from 0.945 to 0.893!

## Root Cause Theory:
The blendCorrectedMap function is NOT changing corrected cells (proven by test).
So the issue must be in how CorrectionPreviewTable reads the values.

Looking at line 147: `const smoothedVal = processedMap.data[c.row]?.[c.col] ?? c.correctedValue;`

If processedMap.data[c.row][c.col] equals c.correctedValue (which it should), then the display should be the same.

UNLESS: the `map` passed to CorrectionPreviewTable is different from the map used during correction computation.

Wait - what if the issue is that `map.data[r][c]` in blendCorrectedMap is NOT the same as `corr.originalValue`?
This could happen if:
1. The map was loaded with different precision
2. The target lambda presets changed the map somehow
3. There's a race condition where the map reference changes

Actually - I think the real issue might be simpler. Let me look at the column axis values again:
25.17, 28.83, 32.67, 38.33, 40, 43.83, 46.5, 48.33, 52.17, 55, 57.67, 60.67, 83.33, 88, 88.67, 71.67, 74.33, 77.33...

Wait - those column values are NOT monotonically increasing! After 60.67, it jumps to 83.33, then 88, then 88.67, then DROPS to 71.67!
This is very unusual for a fuel map. The columns should be monotonically increasing MAP values.

Could this be a display issue where the columns are being reordered or the data is misaligned?
