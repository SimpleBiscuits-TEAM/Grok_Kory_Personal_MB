# Flash Log #5 Root Cause Analysis — Deep Dive

## What the E88 Reference Procedure Shows

Steps 1800-1900 (Security Access) come AFTER the broadcast sequence (steps 1100-1700).
Step 2000 (RequestDownload 0x34) is sent as USDT on 0x7E0 with response expected.

This means the E88 tool DOES send USDT commands after DisableNormalCommunication and ProgrammingMode, and the ECU DOES respond. So our ECU should respond too.

## Why Our ECU Doesn't Respond

The E88 procedure shows security access at steps 1800-1900 — these are USDT commands on 0x7E0. The ECU responds to them. Then step 2000 sends RequestDownload (0x34) as USDT on 0x7E0, and the ECU responds.

But in our case, the ECU doesn't respond to ANY USDT commands after the broadcast. What's different?

### Key Difference: ProgrammingMode A5 01 vs A5 03 Timing

In the E88 procedure:
- A5 01 (ProgrammingMode Enable): 1000ms delay
- A5 03 (ProgrammingMode Complete): 500ms delay
- Then immediately security access (USDT on 0x7E0)

In our implementation:
- A5 01: 6000ms delay (we use 6s!)
- A5 03: 2000ms delay (we use 2s!)
- Then physical session (0x10 0x02 on 0x7E0) — TIMEOUT

Wait — the E88 procedure does NOT send a physical session (0x10 0x02) between A5 03 and security access! It goes directly from A5 03 to security access (0x27 0x01).

### CRITICAL FINDING: We send an EXTRA 0x10 0x02 physical session that the E88 procedure doesn't!

Looking at our SESSION_OPEN sequence:
1. Broadcast: ReturnToNormal, TesterPresent, ReadDID, ProgrammingSession, DisableNormalComm, ReportProgrammedState, A5 01, A5 03
2. **Physical session 0x10 0x02 on 0x7E0** ← THIS IS NOT IN THE E88 PROCEDURE
3. Security access 0x27 0x01 on 0x7E0

The E88 procedure goes directly from A5 03 to security access. The physical session is already established by the broadcast (step 1300: FE 02 10 02 on 0x101).

### But wait — our physical session is already nonFatal

The physical session at step 2 already times out and is marked nonFatal. So it continues to security access. And security access is now also nonFatal (our fix). So it continues to PRE_FLASH.

### The REAL issue: RequestDownload (0x34) also times out!

The ECU doesn't respond to 0x34 either. This is the critical difference from the E88 procedure. In the E88 procedure, 0x34 works after the broadcast.

### Possible causes:
1. **A5 03 delay is too long** — our 2s delay vs E88's 500ms. The ECU may have a timeout window after A5 03 where it expects the next command quickly.
2. **The physical session 0x10 0x02 (even though it times out) may confuse the ECU** — it may interpret the 0x10 0x02 as an invalid command and enter an error state.
3. **TesterPresent timing** — the E88 procedure starts TesterPresent CYCLIC at step 1101 (500ms interval). Our TesterPresent is also cyclic but may have different timing.
4. **The ECU may need the security access BEFORE it will accept 0x34** — but our security access also times out.

## Most Likely Fix: Timing

The E88 procedure uses much shorter delays:
- A5 01: 1000ms (we use 6000ms)
- A5 03: 500ms (we use 2000ms)

The total time from A5 03 to the first USDT command in E88 is ~500ms.
In our case, it's 2000ms + physical session timeout (~5s) + security access skip = ~7s.

The ECU may have a short window after A5 03 where it accepts USDT commands, and we're missing it.

## Proposed Fix

1. **Reduce A5 01 delay from 6000ms to 1000ms** (match E88)
2. **Reduce A5 03 delay from 2000ms to 500ms** (match E88)
3. **Remove the physical session (0x10 0x02) between broadcast and security access** — it's not in the E88 procedure
4. **Go directly from A5 03 to RequestDownload (0x34)** — skip security access entirely since it was granted in PRE_CHECK
5. **If 0x34 still fails, try sending it immediately after A5 03 with only 500ms delay**
