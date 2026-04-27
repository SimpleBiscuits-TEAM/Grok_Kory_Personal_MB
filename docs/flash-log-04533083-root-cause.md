# Flash Log #6 Root Cause — PriRC NRC 0x22

## The Problem

The PriRC command `34 00 00 0F FE` gets NRC 0x22 (conditionsNotCorrect) on the E41.

## Analysis

Looking at the E88 reference procedure:
- Step 2000: `DATA (3400000FFE)` = `34 00 00 0F FE`
- This is sent as USDT on 0x7E0 with response expected, timeout=250ms

But the E88 and E41 are DIFFERENT ECUs. The PriRC may be E88-specific.

## Key Insight: NRC 0x22 = conditionsNotCorrect

This typically means one of:
1. The ECU needs EraseMemory BEFORE RequestDownload
2. The command format is wrong for this ECU
3. The ECU is not in the right state (but we just got security access, so it should be)

## Looking at our orchestrator block loop

For each block, the sequence is:
1. **Erase** (0x31 01 FF 00) — RoutineControl EraseMemory
2. **RequestDownload** (0x34) — with block-specific address and length
3. **TransferData** (0x36) — block data
4. **TransferExit** (0x37)

The PriRC is BEFORE the block loop. The E41 may not support this pre-block RequestDownload.

## Fix Options

### Option A: Make PriRC non-fatal (safest)
Mark the PriRC as `nonFatal: true`. If it fails, continue to the block loop where the per-block erase + RequestDownload will handle everything.

### Option B: Remove PriRC for E41
Only send PriRC for E88 ECUs. The E41 may not need it.

### Option C: Send EraseMemory before PriRC
The NRC 0x22 may mean the ECU needs erase first. But this doesn't make sense for a PriRC (which is supposed to be an initialization step).

## Recommendation: Option A (nonFatal)

The PriRC is an E88-specific optimization. Making it nonFatal allows:
- E88 ECUs to benefit from the PriRC if they support it
- E41 ECUs to skip it and proceed to the block loop
- No risk of breaking anything

The per-block sequence (erase → RequestDownload → TransferData → TransferExit) is the standard GMLAN flash procedure and should work for all ECUs.
