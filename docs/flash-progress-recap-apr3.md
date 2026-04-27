# V-OP Flash Engine — Progress Recap (April 3, 2026)

## Executive Summary

Today was a marathon debugging session: **14 real flash attempts** against the E41 (L5P Duramax) ECU on a bench setup, each one peeling back another layer of the GMLAN flash protocol. We went from "ECU completely silent after broadcast" to "security access granted, RequestDownload format correct, ECU accepted the download request" — and we are now one fix away from the first successful data transfer. The remaining NRC 0x22 on attempt #14 has been root-caused and patched: a session change was invalidating the security unlock. The next attempt (#15) will be the first time the engine sends RequestDownload with security intact and no intervening session disruption.

---

## What Was Accomplished Today

### 14 Real Flash Attempts — Progressive Debugging

Each attempt uncovered a new protocol layer. Here is the progression:

| Attempt | Log ID | Milestone | Root Cause Found |
|---------|--------|-----------|------------------|
| #1 | — | SECURITY_ACCESS timeout after broadcast | Physical 0x10 0x02 needed on 0x7E0 after GMLAN broadcast |
| #2 | — | Physical session times out | Made non-fatal; ECU responds after bridge reconnect |
| #3 | 8c8c5b4a | ECU silent after DisableNormalCommunication | Skip SECURITY_ACCESS when PRE_CHECK already granted |
| #4 | 538072b2 | PRE_CHECK seed timed out, skip didn't trigger | SECURITY_ACCESS must be nonFatal unconditionally for GMLAN |
| #5 | 6e9121e4 | ECU silent on USDT — timing mismatch | Delays too long (6s→1s for A5 01→A5 03, 2s→0.5s for A5 03→USDT) |
| #6 | 04533083 | **Security access works after broadcast!** | PriRC (34 00 00 0F FE) is E88-specific, NRC 0x22 on E41 |
| #7 | 5531bbfd | PriRC skipped, but ECU still rebooting | Need bootloader readiness polling (12 probes × 5s = 60s budget) |
| #8 | 4d32f3e4 | **Bootloader polling works! Security GRANTED** | Per-block RequestDownload had 3 bugs (session timeout, xx placeholder, missing erase) |
| #9 | 4fb2cd46 | Erase command (0x31) returns NRC 0x11 | E41 does NOT support 0x31 — erase is implicit in 0x34 (NRC 0x78) |
| #10 | 73b202dc | **RequestDownload ACCEPTED by ECU!** | xferSize=0 bug, TransferData needs ISO-TP multi-frame |
| #11 | 10a615c8 | xferSize fixed to 0xFFE | Key-send always times out — added 200ms delay before key send |
| #12 | 12514b98 | **Security GRANTED twice, key-send fix confirmed** | PriRC 5s timeout burns programming session timer |
| #13 | 388c5fc6 | PriRC removed, bootloader polling working | Bootloader starts in DEFAULT session — needs 0x10 0x02 before 0x34 |
| #14 | daac7370 | Programming session accepted on bootloader | **0x10 0x02 AFTER security invalidates security grant** |

### Key Breakthroughs

**Bootloader reboot timing discovered.** The E41 bootloader takes 30-77 seconds to become responsive after the A5 03 (ProgrammingMode Complete) broadcast. This was not documented anywhere — we discovered it empirically. The polling loop (12 probes × 5s) now handles this reliably.

**Seed/key algorithm working.** The AES-128-ECB security algorithm from Seed_key.cs is computing correct keys. Seed `57 09 FD 6C 06` consistently produces key `C6 BF 02 28 58`, and the ECU accepts it every time.

**GMLAN broadcast sequence validated.** The full SESSION_OPEN broadcast (ReturnToNormal → TesterPresent → ReadB0 → DiagSession → DisableComm → ReportProgrammedState → A5 01 → A5 03) works correctly with the timing we dialed in.

**RequestDownload format confirmed.** The GMLAN-specific format `34 00 00 0F FE` (first block) and `34 10 0F FE` (subsequent blocks) matches the BUSMASTER reference exactly. The ECU accepted this format in attempt #10.

**ISO-TP multi-frame transport implemented.** `sendUDSMultiFrame` now handles First Frame → Flow Control wait → Consecutive Frames with STmin pacing, which is required for TransferData payloads larger than 7 bytes.

**Bridge reconnect resilience.** The WebSocket bridge drops every ~50-60s. Auto-reconnect now works reliably (1-3 attempts, <1s recovery), and the flash engine continues gracefully after reconnection.

### Other Fixes Shipped Today

- Hardcoded all GM ECU AES keys from Seed_key.cs (E41, E83, E78, E39, E46, E88/E90/E99, E92, E80, E98, T87)
- Fixed `hexToBytes` bug that was stripping '0' characters from hex strings (AES key was 14 bytes instead of 16)
- Added WebSocket ping/pong heartbeat to PCAN bridge v2.1
- Removed USDT TesterPresent verify for GMLAN (saves ~25s)
- Skipped ECU Reset (0x11) for GMLAN in CLEANUP and KEY_CYCLE (NRC 0x11, saves ~24s)
- Reduced PRE_CHECK UDS fallback DID scan when GMLAN seed received (saves ~20s)

---

## Current State — Where We Are Right Now

The flash engine sequence after today's final fix (#14) is:

```
1. PRE_CHECK       → Ignition ON, bridge connect, initial ECU probe
2. SESSION_OPEN    → GMLAN broadcast (FE 01 20, FE 01 3E, FE 02 1A B0, FE 02 10 02, FE 01 28, FE 01 A2, FE 02 A5 01, FE 02 A5 03)
3. SECURITY_ACCESS → Bootloader polling (up to 12 probes × 5s), seed/key exchange (AES-128-ECB)
4. BLOCK_TRANSFER  → RequestDownload (34 00 00 0F FE) → NRC 0x78 poll → TransferData (0x36) → TransferExit (0x37)
5. POST_FLASH      → Verification DIDs, ECU Reset, ClearDTC
```

**Steps 1-3 are fully working.** Step 4 has never been reached with security intact — attempt #15 will be the first time.

---

## Challenges Ahead

### Challenge 1: First Successful RequestDownload with Security Intact

The fix for #14 (removing the session change that invalidated security) is the most critical untested change. If the ECU still returns NRC 0x22, it means there is another condition beyond session and security that we have not identified. Possible unknowns:

- The bootloader may require a specific session state that the broadcast does not establish
- The bootloader may have its own session/security model different from the application ECU
- There may be a timing window between security grant and RequestDownload that we are exceeding

### Challenge 2: NRC 0x78 Erase Wait

When RequestDownload succeeds, the ECU will respond with NRC 0x78 (ResponsePending) while it erases flash memory. The BUSMASTER reference shows this can take 10-30 seconds. Our polling loop (2s interval, 60s budget) should handle this, but it has never been exercised on a real ECU.

### Challenge 3: TransferData ISO-TP Multi-Frame Transport

The `sendUDSMultiFrame` implementation has never been tested against the real ECU. Key unknowns:

- The ECU's Flow Control response (`30 00 F1` per BUSMASTER — STmin=241, BlockSize=0) needs to be parsed and respected
- STmin=0xF1 means 241 microseconds between consecutive frames — this is very fast and may need precise timing
- The bridge WebSocket adds latency that could violate STmin requirements
- 4094-byte chunks (0xFFE) require ~585 consecutive frames per chunk — any single frame error fails the entire chunk

### Challenge 4: Bridge WebSocket Stability During Transfer

The bridge drops every ~50-60s. A full 1.4 MB transfer at ~4 KB/s takes approximately 6 minutes. That means we will hit 6-7 bridge disconnects during the transfer. The reconnect logic works, but:

- Reconnecting mid-ISO-TP multi-frame sequence will corrupt the transfer
- The ECU may time out waiting for the next consecutive frame during a bridge drop
- We may need to implement chunk-level retry (re-send the entire 4094-byte chunk after reconnect)

### Challenge 5: Multi-Block Transfers

The E41 container has 1 block (1.4 MB OS + Calibration). Other ECUs may have multiple blocks. The per-block sequence (RequestDownload → TransferData → TransferExit) needs to work for subsequent blocks with the `34 10 0F FE` format.

### Challenge 6: Post-Flash Verification

After all blocks are transferred, the engine needs to:
1. Read verification DIDs (VIN, Cal IDs, unlock status)
2. Send the finalize command (`0xAE 0x28 0x80` from shortflash_analysis.md)
3. ECU Reset
4. Clear DTCs
5. Verify the ECU boots with the new calibration

The finalize command `0xAE 0x28 0x80` is only documented in the VOP3 shortflash log — we do not have full documentation on what it does or whether it is required for all flash types.

---

## What I Need to Succeed

This is the critical section. I have been reverse-engineering the protocol from fragments across multiple documents. Having the actual source materials would eliminate guesswork and dramatically accelerate progress. Here is what would help, ranked by impact:

### Priority 1 — CRITICAL (Would Unblock Immediately)

**1. The raw BUSMASTER flash logs (the actual .log or .csv files)**

I have `busmaster_analysis.md`, `shortflash_analysis.md`, and `gmlan_timing.md` which are summaries/analyses of the BUSMASTER captures. But I have never seen the raw CAN frame-by-frame logs. These would show me:

- The exact byte-level CAN frames for every step of a successful flash
- The exact timing between every frame (not just summaries like "206ms after key accepted")
- The Flow Control frame the ECU sends (I am assuming `30 00 F1` based on a one-line reference)
- How TransferData consecutive frames are paced (STmin compliance)
- Whether there are any frames I am missing between phases
- The exact post-flash sequence (finalize, verification DIDs, reset)

**2. The DevProg V2 PCAN flash engine source code (the actual C#/.NET files)**

I integrated knowledge from the DevProg V2 MAUI codebase, but the actual PCAN flash engine implementation would show me:

- How DevProg handles the bootloader reboot wait (polling vs fixed delay)
- How DevProg handles ISO-TP multi-frame for TransferData
- How DevProg handles bridge disconnects during transfer
- The exact error recovery logic for each NRC
- Whether DevProg sends any commands between security and RequestDownload that I am missing

**3. The VOP3 device firmware source code (the embedded flash engine)**

The `shortflash_analysis.md` is a PuTTY log of the VOP3 device flashing an E41. The actual firmware source would show me:

- The complete flash state machine as implemented on the device
- The `0xAE 0x28 0x80` finalize command — what it is, when to send it, what response to expect
- How the device handles the bootloader reboot timing
- The exact ISO-TP implementation used on the device

### Priority 2 — HIGH VALUE (Would Prevent Future Debugging Cycles)

**4. The container header specification / documentation**

I am parsing the PPEI container format based on reverse-engineering from `knoxKnowledgeServer.ts` and the DevProg codebase. A formal spec would clarify:

- What `rc34`, `pri_rc`, `post_rc`, `erase` fields contain for each ECU type
- Whether the container's `rc34` field includes the service byte (0x34) or just the parameters
- The `block_struct` format for multi-block containers
- The `verify` section format (pri_key, pri_request, request, key arrays)

**5. The Seed_key.cs file (complete, not just the E41 key)**

I have the E41 AES key hardcoded, and I extracted keys for other GM ECUs from the analysis. But having the complete file would give me:

- All ECU security profiles in one place
- The GM_2B algorithm parameters for ECUs that use DLL-based seed/key
- Any ECU-specific quirks in the key computation (salt values, padding, etc.)
- Ford and Cummins security algorithms if they are in the same file

**6. The E88 FlashprocedurE88_v1.4 binary (or its decompiled source)**

I have `e88_flash_procedure_analysis.md` which is an analysis of this binary. The actual binary or decompiled source would let me:

- Compare E88 vs E41 flash sequences precisely
- Understand the PriRC mechanism that E88 uses but E41 does not
- See the complete post-flash verification sequence
- Understand the `0xAE` finalize command family

### Priority 3 — NICE TO HAVE (Would Improve Robustness)

**7. GM GMLAN specification (GMW3110 or equivalent)**

I have fragments referenced in `gmw3110-disable-normal-comm.md`. The full spec would clarify:

- UUDT vs USDT framing rules
- Functional vs physical addressing behavior after DisableNormalCommunication
- Session management rules specific to GMLAN (vs standard UDS)
- Security access behavior across session transitions

**8. The ECU A2L file for the E41 (L5P Duramax)**

This would provide:

- Complete memory map (flash regions, calibration offsets, bootloader address space)
- All diagnostic service definitions supported by the E41
- DID definitions and their expected responses
- Measurement and calibration parameter definitions

**9. A successful flash log from the VOP3 device (full CAN trace, not just PuTTY output)**

The PuTTY log shows high-level status messages. A CAN trace (from a CAN analyzer like PCAN-View or Vector CANalyzer) would show every frame on the bus during a successful flash.

**10. Documentation on the PCAN bridge WebSocket protocol**

The bridge (`pcan_bridge.py`) translates between WebSocket and PCAN USB. Understanding its:

- Message framing format
- Buffering behavior
- Timeout/keepalive configuration
- Maximum throughput characteristics

would help optimize the transfer speed and reliability.

---

## Summary of Current Flash Engine Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Flash Container (.bin)               │
│  Header: ECU type, block_struct, verify, checksums   │
│  Data: OS + Calibration blocks (1.4 MB for E41)     │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              pcanFlashOrchestrator.ts                 │
│  Generates FlashPlan: ordered FlashCommand[] array   │
│  Phases: PRE_CHECK → SESSION_OPEN → SECURITY_ACCESS  │
│          → BLOCK_TRANSFER → POST_FLASH → CLEANUP     │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                pcanFlashEngine.ts                     │
│  Executes commands sequentially                      │
│  handleSecurityAccess() — bootloader polling + AES   │
│  executeBlockTransfer() — 0x34 → 0x36 → 0x37        │
│  Bridge reconnect, keepalive, NRC handling           │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│               pcanConnection.ts                      │
│  WebSocket ↔ PCAN bridge communication               │
│  sendUDSRequest() — single-frame UDS                 │
│  sendUDSMultiFrame() — ISO-TP FF+CF transport        │
│  Auto-reconnect, heartbeat, response monitoring      │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              pcan_bridge.py (v2.1)                    │
│  WebSocket server ↔ PCAN USB adapter                 │
│  Ping/pong heartbeat (20s interval)                  │
│  CAN frame TX/RX at 500 kbps                        │
└─────────────────────────────────────────────────────┘
```

---

## Bottom Line

We are genuinely close. The protocol is 90% understood. Security works, the broadcast sequence works, the RequestDownload format is correct, and the ECU has accepted the download request before. The remaining gap is ensuring security stays valid when RequestDownload fires — which is exactly what the #14 fix addresses. If attempt #15 gets past RequestDownload, the next frontier is TransferData multi-frame transport, which is a well-understood ISO-TP problem rather than a protocol mystery.

The single highest-impact document you could provide is the **raw BUSMASTER CAN log from a successful flash**. Every frame, every timestamp, every byte. That would let me validate the entire sequence end-to-end instead of debugging one NRC at a time.
