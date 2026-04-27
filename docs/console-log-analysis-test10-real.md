# Console Log Analysis — Test 10 (2026-04-23T19:23)

## MAJOR BREAKTHROUGH: DDDI Periodic Streaming IS Working!

### Evidence:
- Line 25: `[PPEI-DIAG] DDDI setup sequence for 0x7E0 (clear + define + start periodic)` — TRIGGERED!
- Line 26-29: `DDDI periodic #1-4: FRP_ACT=4712.0 PSI VSS=0.0 MPH (0xFB frame)` — FRAMES ARRIVING BEFORE SETUP COMPLETES
- Line 30: `DDDI setup OK on 0x7E0: cleared 25 periodic IDs (31 NRC), defined 5 composites in 1103.9ms — PERIODIC STREAMING ACTIVE on 0x5E8 [0xFD, 0xFB, 0xF9, 0xF8]`
- Line 31: `DDDI periodic streaming started — FRP_ACT will be extracted from 0x5E8 frames`
- Line 32-36: More periodic frames arriving
- Line 40: `DDDI periodic #100` — continuous streaming confirmed
- Line 45-55: `Injected 2-3 DDDI periodic value(s): IBR_1=-0.1, THRTL_CMD=100.0, FRP_ACT=4712.0` — VALUES BEING INJECTED!

### Problem: FRP_ACT=4712.0 PSI is CONSTANT (wrong)
- FRP_ACT shows 4712.0 PSI every single time
- 4712.0 = 10000 * 0.4712 = raw bytes [0x27, 0x10] = 10000
- This is likely the IDLE rail pressure value (about 4700 PSI is typical for L5P idle)
- Wait — actually 4712 PSI IS a reasonable idle rail pressure for L5P!
- But it's CONSTANT — never changes even slightly, which is suspicious
- Could be that the ECU is sending the same snapshot value because the engine is idling steadily

### Problem: Second DDDI setup (line 163-164) lost streaming
- Line 163: Second `DDDI setup sequence for 0x7E0` triggered (30s timer expired)
- Line 164: `defined 3 composites` (was 5 before!) and NO "PERIODIC STREAMING ACTIVE" message
- This means the second setup FAILED to start periodic streaming
- After line 164, no more periodic injection messages appear

### Problem: batch_read_dids only decoding 2-5 out of 61 DIDs
- Line 44: `5/61 decoded` — only 5 out of 61 Mode 22 DIDs responded
- Most DIDs get paused as non-responding
- This is the same pattern as before — the DDDI clear unlocks SOME DIDs but not all

### Key Findings:
1. DDDI periodic streaming WORKS on first setup
2. FRP_ACT IS being extracted from 0x5E8 frames
3. FRP_ACT IS being injected into readings
4. The value (4712 PSI) is plausible for idle
5. Second DDDI setup breaks streaming (only 3 composites defined vs 5)
6. Need to verify: is the value actually changing or stuck?
