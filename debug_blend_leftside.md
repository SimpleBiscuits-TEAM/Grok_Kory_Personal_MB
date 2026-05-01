# Blend Left-Side Interpolation Issue Analysis

## Problem
At 4250-5000 RPM, left of TPS 12, blended values go up-down-up instead of monotonically decreasing.

## Root Cause Analysis

The issue is in how the open-ended left gap interpolation interacts with the boundary blending pass.

### Current flow:
1. **Row pass**: interpolateGapsInLine scans left from the leftmost corrected cell in each row
   - Finds anchor where originalValue < correctedValue
   - Interpolates factors between anchor and corrected cell
   - BUT: the "skip at least 1 cell" requirement means if anchor is immediately adjacent, it falls through to gradual fade

2. **Column pass**: Same logic runs vertically
   - Can create interpolated cells that conflict with row interpolation
   - When both row and column interpolate the same cell, they AVERAGE — this can create non-monotonic values

3. **Boundary blending**: Adds a ring of blended cells around corrected/interpolated cells
   - Uses average of neighboring corrected/interpolated factors × BLEND_BOUNDARY_WEIGHT
   - This can create bumps because it doesn't respect monotonicity

## The Fix
The left-side anchor search needs to:
1. Find the first cell to the left with value LESS than the corrected value
2. Skip at least 1 cell between anchor and corrected (so there's room to interpolate)
3. If the immediate neighbor is already less, use it as anchor but still interpolate the cells between

The boundary blending should NOT override interpolated cells from the open-ended gap logic.

Also: the column pass averaging with row pass can break monotonicity. Need to ensure that after all passes, the values along each row are monotonically increasing.
