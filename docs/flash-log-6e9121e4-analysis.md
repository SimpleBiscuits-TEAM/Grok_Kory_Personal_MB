# Flash Log #5 Analysis — 6e9121e4 (FAILED)

## Progress vs Previous Attempts

| Aspect | Log #3 (8c8c5b4a) | Log #4 (538072b2) | Log #5 (6e9121e4) |
|--------|-------------------|-------------------|-------------------|
| PRE_CHECK session | OK (3 attempts) | OK (3 attempts) | TIMEOUT all 3 |
| PRE_CHECK seed | OK (57 09 FD 6C 06) | TIMEOUT | OK (57 09 FD 6C 06) |
| PRE_CHECK security | GRANTED | FAILED | GRANTED |
| SESSION_OPEN broadcast | All OK | All OK | All OK |
| Physical session (0x10 0x02) | TIMEOUT (nonFatal) | TIMEOUT (nonFatal) | TIMEOUT (nonFatal) |
| SECURITY_ACCESS | TIMEOUT → FATAL | TIMEOUT → FATAL | **SKIPPED (PRE_CHECK)** ✓ |
| PRE_FLASH (0x34) | Not reached | Not reached | **TIMEOUT → FATAL** |

## Key Findings

1. **SECURITY_ACCESS skip worked perfectly** — Lines 55-59 show the engine correctly detected PRE_CHECK security was granted and skipped the post-broadcast seed/key exchange. This is the fix from attempt #3/#4 working as designed.

2. **ECU is completely silent on USDT after SESSION_OPEN broadcast** — No response to:
   - Physical session 0x10 0x02 on 0x7E0 (lines 45-53)
   - RequestDownload 0x34 on 0x7E0 (lines 60-67)

3. **PRE_CHECK showed intermittent behavior** — Programming session timed out all 3 attempts, but then seed request succeeded immediately (34.9s). This suggests the ECU is responsive but the session switch (0x10 0x02) is problematic.

4. **The fundamental problem**: After the UUDT broadcast sequence (especially DisableNormalCommunication 0x28 and ProgrammingMode A5 01/03), the ECU enters a state where it does NOT respond to ANY USDT commands on 0x7E0. This is not just a security issue — it's a complete USDT communication blackout.

## Root Cause Analysis

The E88 reference procedure (FlashprocedurE88_v1.4) uses `CAN_SEND_USDT` for post-broadcast commands, which implies the ECU SHOULD respond to USDT after the broadcast. But our ECU doesn't.

Possible explanations:
1. **ProgrammingMode (A5 01/03) puts ECU in a different state** than expected — maybe it needs a specific wake-up sequence
2. **The ECU needs a physical session (0x10 0x02) sent as UUDT** (not USDT) to re-establish communication
3. **Timing issue** — the 2s delay after A5 03 may not be enough; ECU may need longer to transition
4. **The ECU expects commands on a different address** after ProgrammingMode (e.g., 0x241 instead of 0x7E0)
5. **DisableNormalCommunication (0x28) is killing USDT responses** — the ECU only accepts UUDT after this

## Critical Question

If the ECU doesn't respond to USDT after the broadcast, how does the real SPS tool send RequestDownload? Options:
- SPS sends RequestDownload as UUDT (fire-and-forget) — unlikely, needs response
- SPS uses a different address pair
- SPS has a specific wake-up/re-enable sequence
- SPS doesn't use DisableNormalCommunication at all (our E88 procedure may be wrong)
- The ECU needs a key cycle BEFORE the broadcast to enter a receptive state

## Next Steps

1. Research GMLAN DisableNormalCommunication behavior — does it block ALL responses or just normal traffic?
2. Try removing DisableNormalCommunication (0x28) from the broadcast sequence
3. Try sending RequestDownload as UUDT instead of USDT
4. Try longer delays after ProgrammingMode Complete (A5 03)
5. Check if E41 uses different CAN IDs in programming mode
