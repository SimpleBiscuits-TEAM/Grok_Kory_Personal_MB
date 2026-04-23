# Console Log Analysis — Test 10 (2026-04-23T19:02)

## Key Findings

1. **NO DDDI log entries at all** — no [DDDI], no "DDDI setup", no "periodic streaming"
2. **FRP_ACT still paused** (line 33, 64) — never got a value
3. **FP_SAE also paused** (line 25, 42, 63) — never got a value
4. **Bridge version v2.1.0** — user did NOT re-download the bridge file

## Root Cause

The user is still running the OLD ppei_pcan_bridge.py (v2.1.0) which does NOT have Phase 4.
The new bridge file with Phase 4 was just deployed but the user needs to:
1. Re-download ppei_pcan_bridge.py from the PPEI DATALOGGER tab
2. Stop the old bridge process
3. Start the new bridge

## But Wait — Bigger Issue

Even the OLD bridge should have logged DDDI setup messages in the browser console (F12).
The DEVICE CONSOLE only shows emit('log') messages, not console.log() messages.
The PPEI patches use console.log() for DDDI messages, not emit('log').

So the DDDI setup IS happening (it must be, because Mode 22 reads work for SOME PIDs),
but the messages only appear in browser DevTools console, not in the DEVICE CONSOLE panel.

## Action Items

1. User needs to re-download the bridge file
2. Also need to emit('log') for DDDI messages so they appear in DEVICE CONSOLE
3. Check if dddi_setup is even being called — the ensureGmLiveDataSession patch
   should call it, but maybe it's not being triggered because the session check
   passes (30s cooldown)
