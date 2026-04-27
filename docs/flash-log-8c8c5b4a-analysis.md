# Flash Log 8c8c5b4a Analysis

## Key Findings

### Timeline
- PRE_CHECK: Programming session succeeds on attempt 2 (21.6s), seed received, security GRANTED
- SESSION_OPEN: All 8 broadcast commands succeed (UUDT, no response expected)
- Physical session (0x10 0x02 on 0x7E0) at 37.6s: TIMEOUT on all 4 attempts
- nonFatal flag works: engine continues past physical session timeout
- SECURITY_ACCESS seed request (0x27 0x01 on 0x7E0) at 62.7s: TIMEOUT on all 3 attempts
- FATAL FAILURE at 80.6s

### Critical Observation
**PRE_CHECK seed works (23.6s) but post-SESSION_OPEN seed fails (62.7s)**

The ECU responds to USDT commands BEFORE the broadcast SESSION_OPEN sequence, but goes completely silent AFTER it.

### Root Cause: DisableNormalCommunication (0x28) DOES NOT kill diagnostic responses
From pcmhacking.net forum (GM PCM flashing tool):
```
start diagnostic session (0x10 0x03)...ok.
disable normal communication (0x28)...ok.
security access (0x27)...
    request seed...NOT ok, no valid seed received.
    Wait 30s after power on or failed attempt.
connecting...
start diagnostic session (0x10 0x03)...ok.
disable normal communication (0x28)...ok.
security access (0x27)...
    request seed...ok.
```

This proves that on GM ECUs:
1. DisableNormalCommunication (0x28) does NOT kill diagnostic responses
2. Security access CAN work after 0x28
3. But the first attempt can fail — requires retry after 30s wait

### Revised Root Cause: ProgrammingMode (A5 01/A5 03) Resets ECU State
The more likely culprit is the **ProgrammingMode Enable/Complete (A5 01/A5 03)** sequence.
When the ECU enters programming mode via A5 01/A5 03, it:
1. Resets all active diagnostic sessions
2. May change its communication state
3. Requires a fresh session + security access

But our physical session (0x10 0x02) and seed request (0x27 0x01) both timeout — meaning the ECU is NOT responding to ANY USDT after A5 01/A5 03.

### NEW Hypothesis: PRE_CHECK Session Conflicts with Broadcast
The real issue may be:
1. PRE_CHECK establishes session + security on 0x7E0 (physical)
2. SESSION_OPEN broadcasts Programming Session (0x10 0x02) on 0x101 (functional)
3. The functional broadcast RESETS the physical session that was already active
4. A5 01/A5 03 puts ECU in a different mode where it needs specific re-initialization
5. Our physical 0x10 0x02 after the broadcast may be rejected because the ECU is in a different state

### SOLUTION: Restructure the flow
**Option A: Move security access BEFORE SESSION_OPEN broadcast (current PRE_CHECK already does this)**
- PRE_CHECK: session + security ✓ (already working)
- SESSION_OPEN: broadcast sequence (ECU enters programming mode)
- SECURITY_ACCESS: SKIP — already granted in PRE_CHECK
- PRE_FLASH: proceed directly to RequestDownload (0x34)

**Option B: Don't do PRE_CHECK session/security, let SESSION_OPEN handle everything**
- Remove PRE_CHECK session/security
- SESSION_OPEN: broadcast sequence
- SECURITY_ACCESS: seed/key on physical address (may need longer delay after A5 03)

**Going with Option A** — it's proven working and requires minimal changes.

The key change: When `lastSecurityAccessGranted` is true from PRE_CHECK, the SECURITY_ACCESS phase should be skipped entirely (or made non-fatal).
