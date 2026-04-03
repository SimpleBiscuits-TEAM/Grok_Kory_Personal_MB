# Flash Log #18 Analysis (8d20db51) — Dry Run with AES Keys

## Summary
- **Duration:** 4m 0s (down from 9m 58s in log #14)
- **Mode:** FULL_FLASH dry run
- **Result:** SUCCESS
- **Key finding:** AES key length error — 14 bytes instead of 16

## Critical Bug: Invalid AES Key Length

```
[108.095s] SECURITY_ACCESS  warning  Error: Invalid AES key length: 14, expected 16
[114.595s] SECURITY_ACCESS  warning  Error: Invalid AES key length: 14, expected 16
[216.499s] KEY_CYCLE        warning  Post-boot security access error: Invalid AES key length: 14, expected 16
```

The hardcoded AES key for E41 is being read as 14 bytes instead of 16. This is likely a hex string parsing issue — the key `45AE6BA2CB81F5656B05072D74FF47E0` is 32 hex chars = 16 bytes, but something is truncating it.

**Root cause hypothesis:** The `hexToBytes()` function or the `aesKeyHex` string has a formatting issue (spaces, wrong delimiter, or truncation).

## Sequence Analysis

### PRE_CHECK (0s - 65s)
- Programming session: NRC 0x12 on attempt 1 (subFunctionNotSupported), success on attempt 2 ✓
- Security access seed request: Timeout (no seed in PRE_CHECK) — expected on bench without termination
- GMLAN DID reads: All timeout — expected without security access
- UDS fallback DID reads: All timeout — expected for GMLAN ECU
- **Still running UDS fallback even though this is GMLAN** — the `seedReceivedInPreCheck` flag wasn't set because seed timed out

### SESSION_OPEN (65s - 98.8s)
- All UUDT broadcasts: ✓ Perfect
- A5 01 → A5 03: 3s gap ✓ (was 0.5s before)
- Physical session (0x10 0x02): Timed out on attempts 1-2, bridge disconnected on attempt 3
- Bridge reconnect: 0.3s ✓ (attempt 1/3)
- Physical session: SUCCESS on retry 4 (after reconnect) ✓
- **RX: 0x7E8 (empty)** — ECU responded but with empty data? Or positive response 0x50 0x02 not shown?

### SECURITY_ACCESS (98.8s - 114.6s)
- Seed received: 57 09 FD 6C 06 ✓ (same seed as always)
- **AES key computation FAILED: "Invalid AES key length: 14, expected 16"**
- Retried, same error
- Dry run continued with placeholder bytes

### VERIFICATION (114.6s - 178.2s)
- VIN (0x90): Timeout ✓ (expected)
- C1: ✓ C1 00 C1 A5 4A
- C2: ✓ C2 00 C1 9B AF
- C3: ✓ C3 00 C1 9B A7
- **C4: ✓ C4 00 C1 9B BA** — First time C4 responded! 🎉
- C5: ✓ C5 00 C1 A6 20
- C6: ✓ C6 00 C1 A6 14
- D0: ✓ D0 41 42 (Unlock Status)
- CC: ✓ CC 03 4F FE EC (Programming Counter)
- AE: ✓ Finalize (positive response 0x28)
- **8/9 DIDs responded** — best result ever!

### KEY_CYCLE (178.2s - 229.3s)
- Key Off/On: ✓
- Session re-established: attempt 2/5 ✓
- Seed received after boot: 57 09 FD 6C 06 ✓
- **AES key error again:** Invalid AES key length: 14

### CLEANUP (229.3s - 240s)
- ClearDTC (0x04): ✓ (attempt 2)
- ReturnToNormal: ✓

## Action Items
1. **FIX: AES key length 14 → 16** — Check `aesKeyHex` string in seedKeyAlgorithms.ts for E41
2. VERIFICATION is excellent — 8/9 DIDs responding
3. Bridge reconnect working perfectly (0.3s)
4. Physical session re-establishment working (after reconnect)
5. Post-key-cycle session working (attempt 2/5)

## Comparison with Previous Logs

| Metric | #14 (old) | #15 (new) | #16 | #18 (this) |
|--------|-----------|-----------|-----|------------|
| Duration | 9m 58s | 3m 52s | 5m 11s | 4m 0s |
| Bridge disconnects | 5 | 1 | 1 | 1 |
| VERIFICATION DIDs | 0/9 | 7/9 | 5/9 | **8/9** |
| Post-key-cycle | FAILED | Attempt 2 | Attempt 1 | Attempt 2 |
| Security access | Dummy key | Dummy key | Dummy key | **AES key error** |
