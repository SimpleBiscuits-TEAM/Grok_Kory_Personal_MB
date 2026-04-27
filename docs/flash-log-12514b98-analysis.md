# Flash Log #12 Analysis — 12514b98

## Result: FAILED — NRC 0x22 on per-block RequestDownload

## Timeline
- 0s: PRE_CHECK start
- 17.6s: Programming session active (3rd attempt)
- 17.9s: Seed received: 57 09 FD 6C 06
- 19.9s: **Security access GRANTED** (200ms delay fix WORKED!)
- 20.2s: SESSION_OPEN broadcast begins
- 26.7s: A5 03 ProgrammingMode Complete
- 27.2s: SECURITY_ACCESS bootloader polling begins
- 68.2s: NRC 0x37 lockout → wait 10s
- 78.4s: Seed received, key computed → **KEY SEND TIMEOUT** (5s)
- 83.7s: Retry — seed 00 00 00 00 00 (zero seed = already unlocked?)
- 88.2s: Key for zero seed → NRC 0x22 (conditionsNotCorrect)
- 96.8s: More bootloader polling
- 112.2s: Seed received again: 57 09 FD 6C 06
- **112.5s: SECURITY ACCESS GRANTED** (key accepted on 3rd overall attempt)
- 112.8s: PriRC (34 00 00 0F FE) → Timeout → correctly skipped (nonFatal)
- 117.9s: Per-block RequestDownload (34 00 00 0F FE) → **NRC 0x22 (conditionsNotCorrect)**

## Key Observations

### GOOD NEWS
1. **Key-send delay fix WORKED** — PRE_CHECK security granted at 19.9s (line 24)
2. **Post-broadcast security also eventually granted** at 112.5s (line 62)
3. **GMLAN RequestDownload format used correctly** — `34 00 00 0F FE` (line 73)
4. **Bootloader polling working** — 4 probes before ECU responds

### THE PROBLEM
The per-block RequestDownload at line 73 sends `00 00 0F FE` (after service byte 0x34).
But the PriRC at line 66 sends `05 34 00 00 0F FE` (PCI=5, then full 0x34 command).

Wait — the PriRC is the SAME command (`34 00 00 0F FE`) sent via the orchestrator.
The per-block is also `34 00 00 0F FE` sent via executeBlockTransfer.

Both get the same result — PriRC times out, per-block gets NRC 0x22.

### ROOT CAUSE ANALYSIS

NRC 0x22 = conditionsNotCorrect. Possible reasons:
1. **Session timeout** — Security was granted at 112.5s. PriRC at 112.8s (0.3s later) timed out (5s).
   Per-block at 117.9s is 5.4s after security was granted. The ECU's programming session
   may have timed out (P3 timer is typically 5s for GMLAN).
   
2. **TesterPresent stopped** — Line 74 shows "TesterPresent keepalive stopped" at 118.1s.
   But was TesterPresent running BETWEEN security grant (112.5s) and RequestDownload (117.9s)?
   The PriRC took 5s (timeout), during which keepalive was PAUSED.

3. **The PriRC is burning the session timer** — PriRC at 112.8s waits 5s for timeout.
   By the time per-block fires at 117.9s, the session has been idle for 5.4s with no
   TesterPresent. The ECU dropped the programming session.

### FIX
The PriRC timeout (5s) is killing the session. Options:
- **Reduce PriRC timeout to 1s** (it's nonFatal anyway, just needs to fail fast)
- **Send TesterPresent between PriRC and per-block RequestDownload**
- **Remove PriRC entirely for GMLAN** — it's E88-specific and always fails on E41
- **Keep TesterPresent running during PriRC** (don't pause keepalive for nonFatal commands)
