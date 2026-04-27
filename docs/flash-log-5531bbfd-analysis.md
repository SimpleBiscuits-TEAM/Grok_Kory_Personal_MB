# Flash Log #7 Analysis — 5531bbfd (Apr 3, 2026)

## Timeline Summary

| Time | Phase | Event | Result |
|------|-------|-------|--------|
| 0.0s | PRE_CHECK | Ignition ON confirmed | OK |
| 6.1s | PRE_CHECK | PCAN bridge connected | OK |
| 14.3s | PRE_CHECK | Programming session active (attempt 1/3) | **OK** |
| 14.7s | PRE_CHECK | Seed received: 57 09 FD 6C 06 | OK |
| 14.7s | PRE_CHECK | Key computed: C6 BF 02 28 58 | OK |
| 15.0s | PRE_CHECK | **Security access GRANTED** | **OK** |
| 15.2s | SESSION_OPEN | Broadcast sequence (8 commands) | All OK (UUDT) |
| 21.7s | SESSION_OPEN | A5 03 ProgrammingMode Complete | OK |
| 22.2s | SECURITY_ACCESS | **SKIPPED** (PRE_CHECK granted) | Synthetic OK |
| 22.4s | PRE_FLASH | PriRC 0x34 (3 attempts) | Timeout → nonFatal skip |
| 40.4s | PRE_FLASH | Per-block RequestDownload (3 attempts) | **TIMEOUT → FAILED** |

## Critical Comparison: Log #6 vs Log #7

| Factor | Log #6 (worked partially) | Log #7 (all USDT dead) |
|--------|--------------------------|----------------------|
| PRE_CHECK session | Failed (NRC 0x12 x3) | **Succeeded (attempt 1)** |
| PRE_CHECK security | Failed (NRC 0x12) | **Succeeded (seed+key)** |
| Post-broadcast security | **Worked!** (NRC 0x37 → seed → key → granted) | **SKIPPED** (PRE_CHECK granted) |
| PriRC 0x34 | NRC 0x22 (ECU responded!) | Timeout (ECU silent) |
| Per-block 0x34 | Not reached | Timeout (ECU silent) |

## ROOT CAUSE IDENTIFIED

**In log #6, the ECU responded to USDT after the broadcast** — security access worked (NRC 0x37 → seed → granted), and PriRC got NRC 0x22 (ECU responded with a negative response, meaning it was alive).

**In log #7, the ECU is completely silent after the broadcast** — PriRC times out, per-block 0x34 times out. No response at all.

The key difference: **In log #6, PRE_CHECK failed (NRC 0x12), so the engine did a REAL security access after the broadcast, which involved actual USDT communication with the ECU.** In log #7, PRE_CHECK succeeded, so security was skipped — the ECU never received any USDT command between A5 03 and the PriRC.

### Theory: The post-broadcast security access in log #6 was actually WAKING UP the ECU

In log #6:
1. A5 03 at ~19s
2. Seed request at ~19.6s (500ms after A5 03)
3. NRC 0x37 at ~57.9s (38s later! — ECU was processing/rebooting)
4. Retry after 10s wait → seed received at 68s
5. Key sent → granted at 70s
6. PriRC at 70.3s → NRC 0x22 (ECU alive and responding!)

The 38-second gap between seed request and NRC 0x37 suggests the ECU was rebooting/processing after A5 03. The seed request acted as a "probe" that the ECU eventually responded to.

In log #7:
1. A5 03 at ~21.7s
2. Security SKIPPED (synthetic OK)
3. PriRC at 22.4s (only 700ms after A5 03!)
4. Timeout — ECU hasn't finished rebooting yet

### THE FIX: The ECU needs TIME after A5 03 before it will respond to USDT

In log #6, the security access attempt (with its 5s timeout + 10s lockout wait) gave the ECU ~48 seconds to reboot. The ECU responded at 68s (48s after A5 03).

In log #7, we tried PriRC only 700ms after A5 03. The ECU hasn't finished rebooting.

## Proposed Fix

1. **Do NOT skip security access after broadcast for GMLAN** — always attempt a real seed request, even if PRE_CHECK granted security. The seed request serves as a probe to wait for the ECU to finish rebooting after A5 03.

2. **OR: Add a long delay (30-60s) after A5 03** before any USDT commands. The ECU needs time to reboot into bootloader mode.

3. **OR: Add a polling loop after A5 03** — send seed requests every 5s until the ECU responds, with a 60s total timeout.

## Recommendation: Option 1 (always attempt real security access)

This is the simplest fix. Remove the GMLAN skip optimization in handleSecurityAccess. The real seed request will:
- Wait for the ECU to finish rebooting (5s timeout per attempt)
- Handle NRC 0x37 lockout (10s wait + retry)
- Confirm the ECU is alive and responsive before proceeding to RequestDownload
