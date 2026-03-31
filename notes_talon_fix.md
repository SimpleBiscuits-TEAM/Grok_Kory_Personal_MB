# Honda Talon Tuner Fix Notes

## Open Issues (from todo.md)
1. **Image-to-table import showing zeros instead of correct data values** (line 2722)
2. **Red number readability issue in editor table color scheme** (line 2723) - ALREADY FIXED (brightened sColor.red to oklch 0.68, added text shadow)
3. **Test fixes with provided Dynojet Speed Density screenshot** (line 2724)

## Root Cause Analysis: Zeros in OCR Import

### Problem
When a screenshot of a Dynojet Speed Density fuel table is pasted/uploaded, the extracted table shows zeros instead of the correct values.

### Code Flow
1. User pastes screenshot → `processImageForOCR()` in HondaTalonTuner.tsx
2. Image converted to base64 → sent to `trpc.talonOcr.extractFuelTable.mutateAsync()`
3. Server: talonOcr.ts uploads to S3, calls LLM vision with structured JSON schema
4. LLM returns `{tableName, unit, colAxisLabel, rowAxisLabel, colAxis, rowAxis, data}`
5. Server validates dimensions, runs 3-pass zero detection/fix

### Identified Issues

#### Issue 1: val.toFixed(1) truncates precision
Line 806: `val.toFixed(1)` — fuel table values like 0.910 display as "0.9", losing precision.
For values like 0.058, this shows "0.1" which is wrong.
**Fix**: Use `val.toFixed(3)` for fuel table cells.

#### Issue 2: RPM axis scaling confusion
The LLM prompt mentions "RPM values may be displayed as multiplied by 1000 (e.g., '0.800' means 800 RPM)"
But the Dynojet Speed Density table uses actual RPM values (800, 1000, 1100...) not scaled.
The LLM might be dividing RPM values by 1000, returning 0.8 instead of 800.
**Fix**: Add post-processing to detect and fix RPM scaling.

#### Issue 3: Dimension padding uses last-value copy instead of interpolation
Lines 345-367: When data rows are short, padding uses `lastVal` which could be 0 or wrong.
**Fix**: Already partially addressed by interpolation in Pass 3, but the initial padding should be smarter.

#### Issue 4: The display format val.toFixed(1) makes small values appear as 0
Values like 0.058 → "0.1" (close enough)
But values like 0.004 → "0.0" (appears as zero!)
**Fix**: Use adaptive precision based on value magnitude.

## Red Number Readability
Already fixed per todo line 2733: brightened sColor.red to oklch 0.68, added text shadow.
The header/axis text uses sColor.red which is now oklch(0.68 0.20 25) — should be readable.
Cell values use color: 'white' with textShadow — should be fine.
