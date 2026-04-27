# Flash Log #14 (b856491f) — 120 Ohm Isolated CAN vs Log #13 (575373d8)

## Test Conditions

| Parameter | Log #13 (575373d8) | Log #14 (b856491f) |
|-----------|---------------------|---------------------|
| CAN Termination | No 120 ohm (unterminated) | 120 ohm isolated CAN |
| ECU | E41 (L5P Duramax) | E41 (L5P Duramax) |
| Mode | DRY RUN | DRY RUN |
| Result | SUCCESS | SUCCESS |
| Duration | 7m 52s (472s) | 9m 58s (598s) |
| Code Version | Pre-reconnectForFlash | Pre-reconnectForFlash |

## PRE_CHECK Phase Comparison

The most significant difference is in the PRE_CHECK phase, where the 120 ohm terminated bus produces dramatically better results.

| Event | Log #13 (No Term) | Log #14 (120 Ohm) |
|-------|--------------------|--------------------|
| Programming Session (0x10 0x02) | Succeeded attempt 1 at 16.2s | NRC 0x12 attempt 1, succeeded attempt 2 at 17.3s |
| Seed Request (0x27 0x01) | Timeout (no response) | **Seed received: 57 09 FD 6C 06** |
| Dummy Key (0x27 0x02) | Not attempted (no seed) | NRC 0x35 (invalidKey) — ECU responded |
| DID 0xB0 (Hardware ID) | Timeout | **Success: B0 11 (2 bytes)** |
| DID 0xC1 (Cal Verify) | Timeout | Timeout |
| DID 0x90 (VIN) | Timeout | Timeout |
| DID 0xA0 (Prog Status) | Timeout | Timeout |
| UDS Fallback DIDs | All timeout | Not attempted (GMLAN response detected) |
| ECU Comm Verified | No (no response to any) | **Yes — send+listen transport working** |
| TesterPresent (0x3E 0x00) | Timeout (all retries) | Timeout (all retries) |

### Key Insight: 120 Ohm Termination Enables ECU Communication

With proper 120 ohm termination, the ECU responds to:
- **Programming session** (0x10 0x02) — both logs got this, but log #14 was faster
- **Security access seed request** (0x27 0x01) — only log #14 got the seed
- **DID 0xB0** (Hardware ID) — only log #14 got a response (B0 11)

Without termination (log #13), the ECU responded to programming session on attempt 1 but then went silent for everything else. With termination (log #14), the ECU responded to 3 different commands in PRE_CHECK.

### Interesting Anomaly: TesterPresent Still Fails

Both logs show TesterPresent (0x3E 0x00) timing out on all retries. This is consistent across both setups. The ECU may not support service 0x3E with sub-function 0x00 in GMLAN mode — the NRC 0x12 (subFunctionNotSupported) seen in log #13 post-key-cycle confirms this. The GMLAN TesterPresent is the UUDT broadcast (FE 01 3E on 0x101), not the USDT request.

### Interesting Anomaly: DID 0xC1, 0x90, 0xA0 Still Timeout

Even with proper termination, DIDs 0xC1, 0x90, and 0xA0 timeout. Only DID 0xB0 responds. This suggests the ECU may require security unlock before exposing calibration/VIN data, or these DIDs are simply not supported in the current session state.

## SESSION_OPEN Phase — Identical

Both logs show identical SESSION_OPEN sequences with correct timing:

| Command | Log #13 Timing | Log #14 Timing | Match |
|---------|----------------|----------------|-------|
| ReturnToNormal (FE 01 20) | 98.7s | 61.4s | Same sequence |
| TesterPresent (FE 01 3E) | +1.0s | +1.0s | Identical |
| ReadB0 (FE 02 1A B0) | +0.25s | +0.25s | Identical |
| DiagSession (FE 02 10 02) | +0.25s | +0.25s | Identical |
| DisableComm (FE 01 28) | +1.0s | +1.0s | Identical |
| ReportProgrammedState (FE 01 A2) | +2.0s | +2.0s | Identical |
| ProgrammingMode Enable (FE 02 A5 01) | +1.0s | +1.0s | Identical |
| ProgrammingMode Complete (FE 02 A5 03) | +0.5s | +0.5s | Identical |

The E88 procedure timing alignment is working perfectly in both cases.

## SECURITY_ACCESS Phase

| Event | Log #13 | Log #14 |
|-------|---------|---------|
| Seed Request (0x27 0x01) | Timeout (3 retries) | Timeout (3 retries) |

Both timeout here. This is expected — after SESSION_OPEN broadcasts (especially DisableNormalCommunication 0x28), the ECU stops responding to USDT requests until after key cycle. The seed was only obtained during PRE_CHECK (before SESSION_OPEN).

## VERIFICATION Phase

Both logs show all DID reads timing out, which is expected since the ECU is in programming mode after SESSION_OPEN. The key difference is the bridge reconnection pattern:

| Metric | Log #13 | Log #14 |
|--------|---------|---------|
| Bridge disconnects | 4 | 5 |
| Reconnect successes | 4/4 | 5/5 |
| Reconnect time (avg) | ~14s | ~30s |
| First disconnect | 153.4s | 85.3s |

The 120 ohm setup has **slower reconnections** (~25-53s vs ~14s). This might be because the bridge takes longer to re-establish on the isolated CAN bus, or network conditions differed.

## KEY_CYCLE Phase — Critical Difference

| Event | Log #13 | Log #14 |
|-------|---------|---------|
| Key Off → Key On time | 35s | 9s |
| ECU boot wait | 8s | 8s |
| Session re-establish | **Success (attempt 5/5)** | **FAILED (all 5 attempts)** |
| Seed after boot | 57 09 FD 6C 06 | Not received (session failed) |
| TesterPresent after boot | NRC 0x12 (ECU alive) | Timeout (WebSocket down) |
| Verify ECU comm | Success (NRC 0x12) | Timeout (all 5 retries) |
| Read Cal ID after boot | Timeout (4 retries) | Timeout (4 retries) |

This is the most significant finding. In log #13, the post-key-cycle session re-establishment succeeded on attempt 5 and the ECU responded with a seed. In log #14, the WebSocket was disconnected during the key cycle and the `reEstablishSession` method couldn't reconnect — attempts 2-5 all show "WebSocket not connected" instead of actual ECU timeouts.

The root cause is clear: `reEstablishSession()` doesn't call `reconnectBridge()` early enough. The bridge drops during the key-off period, and the session re-establishment loop tries to send UDS commands on a dead WebSocket.

## CLEANUP Phase

| Event | Log #13 | Log #14 |
|-------|---------|---------|
| ECU Reset (0x11 0x01) | Timeout | Timeout + WebSocket drop |
| ClearDTC (0x04 on 0x7DF) | **Positive response** | Timeout (all retries) |
| ReturnToNormal (FE 01 20) | Success (UUDT) | Success (UUDT) |

In log #13, ClearDTC got a positive response from the ECU. In log #14, it timed out. This is likely because log #14's session was never re-established after key cycle, so the ECU wasn't in a responsive state.

## Summary of Findings

The 120 ohm isolated CAN termination **significantly improves initial ECU communication** — the ECU responds to seed requests, DID reads, and programming session commands that it ignores without termination. However, the bridge WebSocket stability is worse in this test, with more frequent disconnects and slower reconnections.

The critical issue exposed by this log is that `reEstablishSession()` needs to call `reconnectBridge()` at the very beginning, before attempting any session switch commands. The current code has the reconnect call, but it may not be triggering properly when the WebSocket drops during the key-off period.

### Action Items
1. The `reconnectForFlash()` fix (already implemented in latest checkpoint) should resolve the post-key-cycle WebSocket issue
2. The dry run retry reduction (already implemented) will cut ~120s from VERIFICATION phase
3. Consider adding a pre-emptive reconnect check before each session switch attempt in `reEstablishSession()`
