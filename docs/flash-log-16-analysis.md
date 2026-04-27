# Flash Log #16 (14cdda03) — Second Run with reconnectForFlash

## Summary

Consistent with log #15 but with some interesting variability in which DIDs respond. Duration 5m11s (vs 3m52s in #15) — the extra time is from PRE_CHECK falling through to UDS fallback DIDs (no GMLAN responses in PRE_CHECK this time) and more VERIFICATION timeouts.

## Key Metrics Across Last 3 Logs

| Metric | Log #14 (old code) | Log #15 (new code) | Log #16 (new code) |
|--------|--------------------|--------------------|---------------------|
| Duration | 9m 58s | 3m 52s | 5m 11s |
| Bridge disconnects | 5 | 1 | 1 |
| Reconnect time | ~30s | 0.3s | 0.3s |
| VERIFICATION DIDs | 0/9 | 7/9 | 5/9 |
| Post-key-cycle session | FAILED | Attempt 2/5 | **Attempt 1/5** |
| Seed in PRE_CHECK | Yes | Yes | Yes |
| DID 0xB0 in PRE_CHECK | Yes (B0 11) | Yes (B0 11) | **Timeout** |
| ECU Comm after key cycle | No | No | **Yes (NRC 0x12)** |
| ClearDTC response | No | Yes | Timeout |

## Phase Analysis

### PRE_CHECK — Degraded vs Log #15

| Event | Log #15 | Log #16 |
|-------|---------|---------|
| Programming Session | All 3 timeout | All 3 timeout |
| Seed (0x27 0x01) | **57 09 FD 6C 06** | **57 09 FD 6C 06** |
| Dummy Key (0x27 0x02) | NRC 0x35 (0.26s) | **Timeout (5.25s)** |
| DID 0xB0 | **Success (B0 11)** | Timeout |
| DID 0xC1 | Timeout | Timeout |
| DID 0x90 | Timeout | Timeout |
| DID 0xA0 | Timeout | Timeout |
| UDS Fallback DIDs | Not attempted | **4 DIDs attempted, all timeout** |
| ECU Comm Verified | Yes (B0 responded) | **No (fell through to UDS fallback)** |

The seed request still works (0.36s response), but the dummy key timed out instead of getting NRC 0x35. DID 0xB0 also timed out. This suggests the ECU became less responsive after the dummy key attempt — possibly entering a brief lockout state.

The fact that log #15 got NRC 0x35 in 0.26s but log #16 timed out after 5.25s is significant. The ECU may have been in a different state (e.g., security lockout from a previous session's failed key attempt).

### SESSION_OPEN — Identical
All timing perfect, matching E88 procedure exactly.

### SECURITY_ACCESS — Interesting

The seed request **succeeded** at 145.5s (31.6s after the command was sent at 113.9s). This is a very long delay — the ECU took ~31s to respond. This is unusual and suggests the ECU was processing something or the response was captured from a delayed frame.

### VERIFICATION — 5 of 9 Succeeded

| DID | Log #15 | Log #16 | Data |
|-----|---------|---------|------|
| 0x90 (VIN) | Timeout | Timeout | — |
| 0xC1 (Cal 1) | **C1 00 C1 A5 4A** | Timeout | — |
| 0xC2 (Cal 2) | **C2 00 C1 9B AF** | **C2 00 C1 9B AF** | Consistent |
| 0xC3 (Cal 3) | **C3 00 C1 9B A7** | Timeout | — |
| 0xC4 (Cal 4) | Timeout | **C4 00 C1 9B BA** | New! |
| 0xC5 (Cal 5) | **C5 00 C1 A6 20** | **C5 00 C1 A6 20** | Consistent |
| 0xC6 (Cal 6) | **C6 00 C1 A6 14** | **C6 00 C1 A6 14** | Consistent |
| 0xD0 (Unlock) | **D0 41 42** | Timeout | — |
| 0xCC (Prog Ctr) | **CC 03 4F FE EC** | **CC 03 4F FE EC** | Consistent |
| 0xAE (Finalize) | **Positive (0x28)** | **Positive (0x28)** | Consistent |

Key observations:
- C2, C5, C6, CC, AE are **consistently responsive** across both logs
- C1, C3, D0 responded in #15 but not #16 — intermittent
- C4 responded in #16 but not #15 — also intermittent
- VIN (0x90) never responds — likely needs security unlock
- The data values are identical when they do respond — ECU is returning correct data

### KEY_CYCLE — Best Result Yet

- Session re-established on **attempt 1/5** (first try!) — best ever
- No seed received after boot (timeout) — different from #15 which got the seed
- TesterPresent verify: **NRC 0x12** — ECU is alive and responding after key cycle. First time we've seen this succeed.
- VIN read after boot: Timeout (consistent)

### CLEANUP — Degraded

- ECU Reset: Timeout (was NRC 0x11 in #15)
- ClearDTC: Timeout (was positive in #15)
- ReturnToNormal: Success (UUDT)

## Pattern Analysis

The ECU's USDT responsiveness is **intermittent and unpredictable**. Some commands respond in one run but not the next. This is consistent with CAN bus signal quality issues on a bench setup — even with 120 ohm termination, the signal integrity varies between sessions.

Consistently working:
- Seed request (0x27 0x01) in PRE_CHECK — always responds
- SESSION_OPEN UUDT broadcasts — always succeed (no response expected)
- Cal IDs C2, C5, C6 in VERIFICATION — always respond
- Programming Counter CC — always responds
- Finalize 0xAE — always responds
- Post-key-cycle session (0x10 0x02) — always succeeds (attempt 1 or 2)

Intermittent:
- DID 0xB0 in PRE_CHECK
- Cal IDs C1, C3, C4 in VERIFICATION
- Unlock Status D0 in VERIFICATION
- ClearDTC in CLEANUP
- ECU Reset in KEY_CYCLE/CLEANUP

Never responds:
- VIN (0x90) — needs security unlock
- TesterPresent USDT (0x3E 0x00) — not supported in GMLAN
- Programming session (0x10 0x02) in PRE_CHECK — may need different approach
