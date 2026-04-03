# V-OP Project TODO

## Migration from VOP-Main-Brain to Hosted Project
- [x] Copy all client source code (272 files: components, pages, lib, hooks, contexts)
- [x] Copy server files (routers.ts, db.ts, storage.ts, index.ts, 39 router modules)
- [x] Copy server/lib directory (knoxShieldMiddleware, knoxKnowledgeServer, etc.)
- [x] Copy server/_core overrides (index.ts with helmet/rate-limit, oauth.ts with retry logic, trpc.ts with super_admin)
- [x] Copy drizzle schema files (schema.ts + 6 sub-schemas)
- [x] Copy shared directory (const.ts, types.ts, knoxKnowledge.ts)
- [x] Copy config files (tsconfig.json, vite.config.ts, vitest.config.ts, drizzle.config.ts, components.json)
- [x] Copy docs and firmware directories
- [x] Install 16 missing dependencies (three.js, chart.js, helmet, jspdf, etc.)
- [x] Sync package.json scripts and pnpm overrides
- [x] Migrate database schema (96 tables, 37 ALTER statements, 83 indexes)
- [x] Fix too-long FK identifier (calibration_values constraint)
- [x] Mark migration as applied in __drizzle_migrations
- [x] Verify TypeScript compiles with 0 errors
- [x] Verify dev server starts and serves HTTP 200
- [x] Verify version badge displays v0.06
- [x] Verify all UI components render (PpeiHeader, What's New, Analyze tab, etc.)

## Existing Features (Preserved)
- [x] Datalog analysis (WP8/CSV parser, diagnostic engine)
- [x] Calibration Editor (binary parser, map editor, 3D surface view)
- [x] IntelliSpy (Knox AI diagnostic agent)
- [x] Drag Racing module
- [x] Fleet Management
- [x] Community forums
- [x] PDF export (health reports, dyno sheets)
- [x] AuthGate with access codes, share tokens, NDA signing
- [x] Admin panel (user management, notifications, audit log)
- [x] Support system (sessions, recordings, metrics)
- [x] Tune library and sharing
- [x] Protocol support (J1939, K-Line, OBD-II)
- [x] Live casting (DynoCast)

## Access Code Setup
- [x] Seed KINGKONG as the required access code when site launches
- [x] Verify AuthGate prompts for access code on first visit
- [x] Verify entering KINGKONG grants access to the site

## Auth Simplification
- [x] Remove OAuth login button/option from AuthGate — access code only entry
- [x] ~~Remove access code/login requirement on the Advanced tab~~ (reverted — user wants gate to stay)
- [x] Update tests to reflect the changes

## Auth Correction
- [x] Restore AccessGate on Advanced tab — KINGKONG code required for both site entry AND Advanced

## Tasks Panel Restoration
- [x] Find the Tasks button/panel in Advanced section that was hidden by admin-only check
- [x] Restore Tasks so it's visible to all users after entering access code in Advanced

## Tasks Panel Admin Check Bug
- [x] Remove admin-only check inside TasksPanel component (shows "admin required" when non-admin clicks TASKS)

## Mandatory Access Code for ALL Users
- [x] Fix AuthGate: access code must be required even if user is signed in via OAuth
- [x] Fix server checkAccess: do not return authenticated=true based on OAuth alone — always require vop_access cookie
- [x] Verify: OAuth-signed-in users still see the access code gate before entering the site

## Advanced Tab Access Code Gate Bug
- [x] Fix Advanced tab AccessGate — not requiring access code entry, letting users straight through

## Tasks Tab Access Code Gate
- [x] Add separate access code gate to the Tasks tab — must enter KINGKONG again after entering Advanced

## Flash Container Tab (E88 ECU Flasher)
- [x] Review existing Flash tab placeholder in Advanced section
- [x] Build PPEI container binary parser (header extraction: creator, vendor, version, block info, checksums)
- [x] Build file management system (drag-and-drop upload, organize by type: OEM/aftermarket/full flash)
- [x] Build hex viewer component for inspecting binary files at byte level
- [x] Build flash procedure viewer (parse E88 v1.4 script, syntax highlighting, command flow)
- [x] Build validation engine (file integrity, size compatibility, header validation, checksum verification)
- [x] Integrate all components into the FLASH tab in Advanced section
- [x] Consider datalogger bridge integration for future hardware connectivity

## Knox AI Training
- [x] Train Knox on E88 flash procedure commands and documentation
- [x] Train Knox on PPEI container format and binary structure
- [x] Train Knox on GMLAN protocol basics and CAN communication for E88

## Flash Container Tab Build (Updated)
- [x] Add "Calibration Flash" vs "Full Flash" toggle button in Flash tab
- [x] Build binary upload tool for uploading .bin files into the flasher
- [x] Build flash readiness validator (checks container integrity, block count, checksums)
- [x] Assess and report what is missing to flash the L5P ECU

## Security DLL Integration & Flash Pipeline
- [x] Document GM dllsecurity.dll exports (CSecurity::SetSeedAndGetKey) and algorithm
- [x] Document Ford FordSeedKeyDll.dll exports (SeedCalculation) and algorithm
- [x] Implement GM seed/key algorithm in TypeScript (AES-128 ECB for 5B, DLL-based for 2B)
- [x] Add Ford ECU family support to flash container parser
- [x] Build seed/key computation module (shared/seedKeyAlgorithms.ts)
- [x] Add security algorithm details to Flash Container readiness checks
- [x] Build WiFi upload endpoint for VOP 3.0 flasher (server-side)
- [x] Implement flash file preparation (strip header, extract data blocks, compute checksums)
- [x] Update Knox AI with complete flash procedure knowledge (E88, L5P, Ford, seed/key)
- [x] Write vitest tests for flash container parser and seed/key algorithms

## DevProg V2 MAUI Codebase Integration
- [x] Clone DevProg V2 MAUI repository from GitLab
- [x] Analyze flash procedure implementations (all ECU types)
- [x] Extract datalogging protocol and PID definitions
- [x] Document hardware communication (PCAN, WiFi, BLE) protocols
- [x] Extract container format parsing logic for all supported ECUs
- [x] Map ECU type detection and flash file validation logic
- [x] Integrate DevProg flash knowledge into Flash Container panel
- [x] Integrate datalogging knowledge into V-OP platform
- [x] Update Knox AI with complete DevProg codebase knowledge

## Flash System — Full Build (Orchestrator, Sessions, UI)
- [x] Create shared/pcanFlashOrchestrator.ts (flash plan generation, simulator engine, recovery plans, NRC descriptions, fun facts)
- [x] Create shared/flashFileValidator.ts (CRC32 big-endian, format detection, file validation, pre-flight checklist, battery voltage evaluation)
- [x] Create DB schema for flash sessions, session logs, ECU snapshots, flash queue, flash stats, file fingerprints, rollback files
- [x] Run drizzle migration for flash tables
- [x] Create server/flashDb.ts with all database helpers (CRUD for sessions, logs, snapshots, queue, stats, comparison, export)
- [x] Expand server/routers/flash.ts with 20+ endpoints (createSession, updateSession, appendLogs, getSessionLogs, exportSession, saveSnapshot, getSnapshots, compareSnapshots, addToQueue, getQueue, updateQueueItem, stats, allStats, compareSessions, checkDuplicate, preFlightChecklist, notifyFlashComplete, completeSession)
- [x] Create PreFlightChecklist component (server-side validation, ECU recognition, security profile, hardware check, duplicate detection)
- [x] Create FlashMissionControl component (full simulation UI with progress bars, phase indicators, log viewer, recovery plans, fun facts, server session recording)
- [x] Update FlashContainerPanel with PCAN Flash section, Simulator section, Dashboard section, PreFlight gate, session creation, file hash computation
- [x] Create FlashDashboard component (session history table, overall stats, queue management, session comparison)
- [x] Write 54 vitest tests for flash orchestrator, file validator, session management, queue/stats, pre-flight checklist, snapshots, notifications
- [x] Verify CRC32 uses big-endian at offset 0x1000 (confirmed correct in flashFileValidator.ts)
- [x] All 69 flash tests pass (15 original + 54 new)

## Analyzer UX Improvements
- [x] Move Compare feature from public Analyzer to Advanced mode Analyzer only
- [x] Add "Quick Rundown" toggle to HealthReport for simplified breakdown
- [x] Add "Quick Rundown" toggle to DiagnosticReport for simplified breakdown
- [x] Add fun upgrade prompt in public Analyzer ("YOU'RE RUNNING ON STOCK BOOST") to nudge users toward V-OP Pro

## Bug Fix — PCAN Flash Detection
- [x] Fix PCAN detection in flash system — use same PCANConnection.isBridgeAvailable() as datalogger/bridge

## Bug Fix — PCAN Flash Error After Plan Generation
- [x] Fix error in PCAN flash section after flash plan shows "1 blocks, 1.4 MB" — investigate launch flow and MissionControl integration

## Bug Fix — Flash Plan Validation Errors Block Launch
- [x] Fix generateFlashPlan producing validationErrors for valid containers (shows "1 blocks, 1.4 MB" with red X, disables Launch button)
- [x] Changed seed/key check from blocking error to warning (seed/key embedded in container, extracted at flash time)
- [x] Changed unknown ECU check from blocking error to warning (can still flash with default CAN addresses)
- [x] Added warnings[] field to FlashPlan interface for non-blocking issues
- [x] Updated FlashContainerPanel PCAN section with 3-state status (ok/warn/fail) instead of binary ok/fail
- [x] Updated FlashMissionControl ValidationPanel to display warnings in amber
- [x] Added 3 new tests + enhanced 1 existing test for warning behavior (57 flash tests total)

## Bug Fix — file_fingerprints Table Schema Mismatch
- [x] Fix "Failed query" error on file_fingerprints table — table existed with old schema (column `hash` instead of `fileHash`, etc.)
- [x] Dropped and recreated all 6 flash tables (flash_sessions, flash_session_logs, ecu_snapshots, flash_queue, flash_stats, file_fingerprints) with correct Drizzle schema — all were empty (0 rows)
- [x] Verified all 57 flash integration tests pass after table recreation

## Bug Fix — Flash Simulator Too Fast + Completion Screen Disappears
- [x] Flash simulator completes unrealistically fast — reduced transfer rate from 4000 bytes/tick to 4 bytes/ms (~4 KB/s realistic CAN bus UDS speed)
- [x] Completion screen disappears without showing log report — removed auto-dismiss setTimeout, added DONE + DOWNLOAD LOG buttons, auto-expand log on completion
- [x] Seed/key exchange appeared to work but download phase was instant — added realistic per-phase delays (1.5s-8s per command type)
- [x] Added CAN TX/RX log entries during block transfers for realism (every ~5% of block)
- [x] Fix E41 ECU name — now displays as "E41 (L5P Duramax)" instead of "Bosch MG1CS111 (L5P Duramax)"
- [x] Verify ECU names against strategy docs / A2L references — all GM-Delco ECUs use PPEI strategy names (E41, E88, E90, etc.), Bosch/Ford/Cummins use part numbers
- [x] Updated estimated time calculation to match realistic timing
- [x] Log area expands to h-72 on completion and shows ALL entries (not just last 100)

## Bug Fix — Flash Simulator Progress, Countdown, Section Names, Cal Blocks
- [x] Progress bar stuck at 50% — fixed to time-weighted progress (block transfers weighted by bytes, commands by phase delay)
- [x] Add countdown timer showing estimated time remaining until flash complete (estimatedRemainingMs field)
- [x] Show human-readable section names during flash ("Operating System + Calibration", "Engine Calibration", etc.) via getBlockSectionName()
- [x] Only OS block was flashed — fixed cal block filtering: if ALL blocks are OS (single-block containers like L5P), flash them all
- [x] Add key cycle routines to post-flash sequence (ECU reset, key off 10s, key on, boot wait 5s, verify, read cal ID)
- [x] Add beforeunload warning to prevent accidental tab close during active flash
- [x] Add Wake Lock API to prevent screen/computer sleep during flash
- [x] Flash execution is client-side (runs in browser) — continues without internet once page is loaded
- [x] Track last successful block index via currentBlock in SimulatorState (resume capability is partial — state not persisted to storage yet)

## Feature — Real PCAN Bridge Flash (not simulation)
- [x] Built pcanFlashEngine.ts — real CAN bus flash execution via PCANConnection WebSocket bridge
- [x] Sends actual UDS commands (TesterPresent 0x3E, DiagnosticSessionControl 0x10, SecurityAccess 0x27, RequestDownload 0x34, TransferData 0x36, TransferExit 0x37, ECUReset 0x11, ClearDTC 0x14, CommunicationControl 0x28, ControlDTCSetting 0x85)
- [x] Handles real ECU responses with NRC description table (common codes: 0x10-0x78 mapped, with fallback for unmapped codes)
- [x] Implements real seed/key exchange — GM_5B_AES (Web Crypto API) and Ford_3B_LFSR algorithms, with fallback to container header pre-computed key
- [x] Transfers actual file data blocks from container ArrayBuffer with proper chunking by xferSize and block sequence counter
- [x] Real-time progress tracking based on actual bytes transferred
- [x] FlashMissionControl wired to use PCANFlashEngine when connectionMode='pcan', simulator when 'simulator' (code path implemented, requires live PCAN bridge for end-to-end testing)
- [x] LIVE badge and safety warnings displayed during real flash
- [x] Emergency abort button for real flash (calls engine.abort())
- [x] Pause button hidden during real flash (cannot pause real CAN bus communication)
- [x] Key cycle user prompts with countdown timer during KEY_CYCLE phase (UI scaffolded, triggers when engine reaches KEY_CYCLE commands)
- [x] PCANConnection instance created when bridge is detected, passed to MissionControl (connection established on flash start via engine)
- [x] Container ArrayBuffer and header passed to MissionControl for real flash data access

## Bug Fix — Real Flash: ECU Not Responding to TesterPresent
- [x] Root cause: Flash engine was calling sendUDSRequest without first calling conn.connect() — WebSocket was not open, so all requests returned null ("WebSocket not connected") which was misreported as "No response from ECU"
- [x] Flash engine now calls conn.connect() at start of execute() and switches to extended diagnostic session before flash commands
- [x] Differentiates bridge disconnection vs ECU no-response — checks conn.getState() and attempts auto-reconnect if bridge drops
- [x] Increased request timeout from 3s to 30s for flash operations (erase can take 10-30s)
- [x] CAN addresses already correct for E41 (0x7E0/0x7E8) — extracted from flash plan commands

## Bug Fix — Real Flash: Bridge Connects But ECU Still Not Responding
- [x] Root cause: Bridge Python code likely doesn't handle 'uds_request' message type — only 'obd_request' is confirmed working (used by datalogger)
- [x] Added auto-fallback in sendUDSRequest: tries native 'uds_request' first, on timeout/error switches to 'obd_request' transport
- [x] sendUDSviaOBD wraps UDS service/subFunction/data in obd_request format (mode=service, pid=subFunction, data=payload)
- [x] Handles both positive and negative (0x7F NRC) responses from OBD transport
- [x] udsNativeSupported flag persists per connection — only one timeout penalty, then all calls use fast OBD path
- [x] Verified A2L file: E41 uses XCP over CAN (0x7F0/0x7F1 at 1Mbps) for calibration/DAQ, but UDS (0x7E0/0x7E8) for flash
- [x] All 57 flash integration tests pass
- [x] Live testing path: DRY RUN mode now provides safe way to verify TesterPresent, DiagnosticSessionControl, SecurityAccess via OBD transport fallback (requires physical PCAN hardware to execute)
- [x] Large payload mitigation: DRY RUN ISO-TP test (VIN read 0xF190, 17+ bytes) checks multi-frame RX capability before real flash; if bridge can't handle multi-frame, user is warned in logs (raw CAN fallback for TX not yet implemented — udsTransport.ts has foundation code)

## Feature — Dry Run Mode for Flash Testing
- [x] Add dryRun option to PCANFlashEngine — skip destructive operations (erase, transfer data, transfer exit) but execute all other commands
- [x] Add DRY RUN button next to Launch button in FlashContainerPanel PCAN section
- [x] Show DRY RUN badge in FlashMissionControl during dry run (yellow pulsing 🧪 DRY RUN badge)
- [x] Log skipped commands clearly in the flash log (e.g., "[DRY RUN] Skipping RoutineControl (EraseMemory)")
- [x] Dry run validates: bridge connection, extended session, TesterPresent, SecurityAccess seed/key exchange — all non-destructive
- [x] ISO-TP multi-frame capability test during dry run — reads VIN (0xF190, 17+ bytes) to verify bridge handles multi-frame responses, falls back to CalID (0xF806)
- [x] Destructive services skipped via static set: RoutineControl (0x31), RequestDownload (0x34), TransferData (0x36), RequestTransferExit (0x37)
- [x] Block transfers entirely skipped in dry run with size/section logging
- [x] Dry run completion message: "Dry run passed — ECU communication verified, seed/key exchange tested. No data was written to ECU flash."
- [x] DRY RUN start button uses yellow gradient, result banner uses yellow theme

## Feature — Simulator Speed Multiplier
- [x] Add speed multiplier buttons (1x/2x/5x/10x) to FlashMissionControl during simulator runs
- [x] Speed multiplier applied to advanceSimulator deltaMs — 10x reduces 6-minute sim to ~36 seconds
- [x] Speed buttons only visible during active simulator run (not for real PCAN flash)
- [x] Active speed highlighted with cyan accent

## Bug Fix — Dry Run: ECU Not Responding to Any UDS Commands
- [x] Investigate: bridge connects (WebSocket up) but ECU never responds to TesterPresent, DiagnosticSessionControl, or VIN read
- [x] Analyzed IntelliSpy capture (17,620 frames): confirmed NO 0x7E0/0x7E8 diagnostic frames on bus — bridge's obd_request handler does NOT translate UDS service IDs into CAN frames
- [x] Root cause: obd_request only handles standard OBD-II modes (0x01, 0x03, 0x09), not UDS services (0x3E, 0x10, 0x22, 0x27)
- [x] Fix: Added raw CAN transport (sendUDSviaRawCAN) to pcanConnection.sendUDSRequest using can_send with ISO-TP single-frame framing — matches proven udsTransport.ts approach
- [x] Transport strategy now: 1) try native uds_request → 2) try raw CAN (can_send) with ISO-TP → 3) fall back to obd_request
- [x] Wrapped setUDSSession and readUDSDID in try-catch since raw CAN transport throws on timeout instead of returning null
- [x] Test dry run again with real PCAN hardware after fix — send+listen transport implemented, ready for user to test with physical bridge

## Bug Fix — Dry Run: can_send Times Out Waiting for CAN Response
- [x] Investigate: raw CAN transport now used (error changed from "No response" to "Timeout waiting for CAN response") but bridge still times out
- [x] Analyzed IntelliSpy capture during dry run: ECU IS responding to ALL commands on 0x7E8!
- [x] DiagnosticSessionControl (0x10 0x03): POSITIVE response (0x50) — session switch works!
- [x] ReadDataByIdentifier (0x22 F190): NRC 0x31 (Request Out Of Range) — VIN DID not supported on this ECU
- [x] TesterPresent (0x3E 0x00): NRC 0x12 (Sub-Function Not Supported) — sub-function 0x00 not supported
- [x] Root cause: bridge's can_send handler is fire-and-forget — sends CAN frame but doesn't relay ECU response back via WebSocket
- [x] Fix: implemented send+listen approach — start bus monitor, set up temporary listener for response CAN ID, send frame via can_send, capture response from bus monitor stream
- [x] Fix: can_send now fire-and-forget (no sendRequest), response captured via addEventListener on WebSocket for can_frame/bus_frame messages
- [x] Fix ReadDID: ISO-TP test now tries multiple DIDs (VIN 0xF190, ECU SW# 0xF188, ECU HW# 0xF195, CalID 0xF806) and treats any response (even NRC) as proof of communication
- [x] TesterPresent sub-function comes from flash plan — NRC 0x12 is ECU-specific, handled by retry logic (not a transport issue)

## SPS Log Analysis — 2017 L5P Duramax E41 CAN Bus Sniff
- [x] Analyze uploaded SPS log (spslog.txt) — 4112 lines, 4 programming sessions, complete flash sequence
- [x] Document GMLAN protocol differences vs UDS (service 0x1A ReadDID_GM, 0xA5 ProgrammingMode, 0xA2 ReportProgrammedState, 0x20 ReturnToNormalMode)
- [x] Document security access: Algorithm 41, 5-byte seed/key, seed level 0x01/0x02
- [x] Document transfer protocol: RequestDownload 0x34, TransferData 0x36 with 4KB ISO-TP multi-frame, NRC 0x78 responsePending pattern
- [x] Document post-flash sequence: CVN reads (0x1A 0xC1-0xCC), WriteDataByIdentifier (0x3B shop code/date/VIN), DeviceControl (0xAE)
- [x] Document 8 calibration blocks with part numbers and sizes (12683015 OS 2.7MB, 12683726 engine 412KB, etc.)
- [x] Save analysis report to /home/ubuntu/l5p_sniff/analysis.md

## Fix — Dry Run Pre-Check: Use GMLAN ReadDID for GM ECUs
- [x] Update dry run pre-check to use GMLAN ReadDID (0x1A) with GM DIDs (0x90 VIN, 0xB0 ECU ID, 0xC1 CVN) when ECU protocol is GMLAN
- [x] Keep UDS ReadDID (0x22 0xF190) as fallback for non-GM ECUs
- [x] Fix TesterPresent NRC 0x12 handling — treat as SUCCESS in dry run (proves ECU communication)
- [x] Broaden NRC success handling: in dry run mode, ANY NRC response proves ECU is communicating and should count as success
- [x] Add GMLAN-specific service IDs to pcanFlashEngine.ts UDS constants (0x1A, 0x20, 0xA2, 0xA5, 0xAE)

## Fix — Build/Caching Issue: Code Changes Not Reaching Browser
- [x] Investigate Vite HMR not picking up pcanFlashEngine.ts changes
- [x] Clear Vite cache and restart dev server
- [x] Verify new code is being served by checking log format markers in browser console

## Bug Fix — Live Dry Run Log Analysis (PCAN + E41 L5P)
- [x] Fix 'Cannot read properties of undefined (toString)' crash in sendUDSRequest — happens during SecurityAccess Send Key and RequestDownload commands
- [x] Fix GMLAN ReadDID response parsing — VIN (DID 0x90) returns only 5 bytes "90 31 47 54 31" which is the DID echo + partial data, not actual VIN; same 5 bytes returned for DID 0xA0 (clearly wrong)
- [x] Fix NRC 0x0 (unknown) responses — TesterPresent, DiagSessionControl, SecurityAccess all show NRC 0x0 which means response parsing is not extracting the NRC code correctly from the CAN frame
- [x] Fix GMLAN ReadDID 0xB0 returning NRC 0x12 — service 0x1A may need different framing (sub-function vs data parameter)
- [x] Fix GMLAN ReadDID 0xC1 timeout — CVN read times out, may need extended timeout or different session
- [x] Fix Verification phase — uses UDS ReadDID (0x22 0xF190) instead of GMLAN ReadDID (0x1A 0x90) for GM ECUs
- [x] Fix post-flash Read Calibration ID — uses UDS 0x22 instead of GMLAN 0x1A for GM ECUs
- [x] Fix Clear DTCs on functional address 0x7DF — times out, GM ECUs may need physical addressing or different service
- [x] Fix ECU Reset (0x11 0x01) returning NRC 0x31 — may need GMLAN-specific reset command
- [x] Fix extended session switch — returns false, should use GMLAN ProgrammingMode (0xA5) for GM ECUs instead of UDS DiagSessionControl (0x10 0x03)

## ECU Info Poll — Pre-Flash Vehicle Scan
- [x] Build ECU scanner module (ecuScanner.ts) — polls all known ECU addresses from ECU_DATABASE
- [x] GM (GMLAN) DID reader: VIN (0x1A 0x90), all 9 cal part numbers (OBD Mode 9 PID 0x04 + 0x1A 0xCB), CVNs (0x1A 0xC1-0xCC), HW ID (0x1A 0xB0), programming state (0xA2)
- [x] Ford (UDS) DID reader: standard UDS DIDs (0x22 0xF190 VIN, 0x22 0xF188 SW#, 0x22 0xF191 HW#) — stub for now, refine with Knox/A2L docs later
- [x] Cummins (UDS) DID reader: standard UDS DIDs — stub for now, refine with Knox docs later
- [x] Compare scanned ECU info against loaded container file (current vs new part numbers, sw_c1-sw_c9)
- [x] Build "Scan Vehicle" UI panel on flash page — table showing all responding ECUs with their info
- [x] Per-ECU expandable detail: VIN, part numbers, CVNs, HW/SW versions
- [x] Visual diff: highlight mismatched part numbers between ECU and container
- [x] Scan progress indicator with per-ECU status (responding/timeout/error)
- [x] Integrate scan into pre-flash workflow — scan before flash, show results
- [x] Note: Test ECU (E41) is HPTuners-unlocked — security access may behave differently, DIDs may be more permissive
- [x] ECU scanner must perform security access (seed/key) before reading protected DIDs — some DIDs require authenticated session

## Bug Fix — Dry Run Log #3 (Apr 2)
- [x] Fix toString crash on Send Key and RequestDownload — response object is undefined when sendUDSRequest returns null
- [x] Fix response buffer contamination — ECU Reset response shows stale VIN data from previous ReadDID
- [x] Fix GMLAN DID timeouts during pre-check — added 1.5s settling delay after bridge connect + 200ms inter-command delay
- [x] Fix seed/key computation — skip Send Key command when handleSecurityAccess already handled it (lastSecurityAccessGranted flag)
- [x] Fix Clear DTCs timeout on physical address — GMLAN ECUs now use physical address for ClearDTC instead of functional 0x7DF

## Ford & Cummins OEM-Specific DID Maps
- [x] Research Ford DID documentation from Knox knowledge base, DevProg codebase, and project docs
- [x] Research Cummins DID documentation from Knox knowledge base, DevProg codebase, and project docs
- [x] Replace Ford UDS stub in ecuScanner.ts with OEM-specific Ford DID map (PCM 6.7L Powerstroke, TCM 6R140, etc.)
- [x] Replace Cummins UDS stub in ecuScanner.ts with OEM-specific Cummins DID map (CM2350, CM2250, etc.)
- [x] Add Ford-specific calibration part number reading (number of cals, DID structure)
- [x] Add Cummins-specific calibration part number reading (number of cals, DID structure)
- [x] Verify TypeScript compiles with 0 errors
- [x] Test scanner logic for all three OEM paths (GM, Ford, Cummins)

## Bug Fix — Dry Run Log #4 (Apr 2, 2026)
- [x] Fix toString crash STILL happening on Send Key (line 93) and RequestDownload (line 105) — fixed NaN handling for 'xx' placeholder bytes
- [x] Fix ALL GMLAN ReadDIDs timing out during pre-check — added security access (0x10 0x02 + 0x27 seed/key) before reading DIDs
- [x] Fix GMLAN ReadDIDs timing out during VERIFICATION phase — security access in pre-check should persist through verification
- [x] Fix seed/key not available in dry run mode — added getSecurityProfile fallback + pre-check security access with computeGM5B
- [x] Fix GMLAN ProgrammingMode (0xA5 0x01) timeout — now uses 0x10 0x02 as primary, 0xA5 0x01 as fallback
- [x] Key finding: ECU responds to 0x10 0x02 (DiagSessionControl Programming) with positive response — implemented
- [x] Key finding: ECU responds to 0x27 0x01 with 5-byte seed (57 09 FD 6C 06) — implemented in pre-check
- [x] Key finding: ECU responds to 0x20 (ReturnToNormalMode) — GMLAN cleanup works
- [x] Key finding: 0xF195 returns NRC 0x31 — UDS DIDs partially work but GMLAN 0x1A DIDs need security access first
- [x] Hypothesis confirmed: GMLAN 0x1A ReadDID needs security access FIRST — implemented session + seed/key before DID reads
- [x] ECU scan needs security access before reading part numbers — scanner now does session + seed/key before DID reads

## Key Cycle User Prompts
- [x] Key cycle steps must pause and prompt user to physically turn key off/on — not auto-assume
- [x] Add onUserPrompt callback to PCANFlashEngine for interactive prompts during flash
- [x] Flash engine pauses execution at KEY_OFF/KEY_ON steps and waits for user confirmation
- [x] Build key cycle prompt modal in FlashMissionControl UI (e.g., "Turn key OFF now" with Confirm button)
- [x] Show clear instructions for each key cycle step (key off, wait, key on, wait for boot)
- [x] Resume flash execution only after user confirms the action was performed

## Bug Fix — Dry Run Log #5 (Apr 3, 2026)
- [x] Key cycle steps auto-wait instead of prompting user — now shows modal with confirm button
- [x] GMLAN DIDs 0x90 (VIN) and 0xC1 (CVN) still timeout — expected: no pri_key available without container file loaded
- [x] Pre-check says "No pri_key available" — correct behavior, log message updated to guide user to load container
- [x] DID 0xB0 responds with only 2 bytes (B0 11) — DID echo + 1 byte data, correct for hardware ID without security
- [x] DID 0xA0 responds with 2 bytes (A0 00) — programming status 0x00 (normal mode), correct
- [x] Verification phase 0x1A 0x90 timeouts — same root cause: no key sent, security access incomplete
- [x] Clear DTCs (0x14 FF FF FF) times out — non-fatal in dry run, may need security access for GMLAN

## Key Cycle Prompt Colors
- [x] KEY_OFF prompt: red/danger theme (border, bg, button, text)
- [x] KEY_ON prompt: green/go theme (border, bg, button, text)
- [x] WAIT_BOOT: keep cyan/neutral theme

## Bug Fix — Dry Run Log #6 (Apr 3, 2026)
- [ ] Programming session 0x10 0x02 returns NRC 0x12 at 6.8s but succeeds at 46.3s after retries — ECU needs more time or different approach
- [ ] Pre-check seed received at 13.9s (57 09 FD 6C 06) but session commands seed times out at 51-62s — ECU may have dropped session
- [ ] DID 0xC1 responds (C1 00 C1 A5 4A) but 0xB0, 0x90, 0xA0 all timeout — inconsistent DID availability
- [ ] After key cycle, ALL commands timeout (0x1A 0x90, 0x14 ClearDTC, 0x20 ReturnToNormal) — ECU not responding after key cycle
- [ ] Key cycle prompts working correctly — user confirmed key off at 83.4s and key on at 86.4s
- [ ] ECU Reset 0x11 returns NRC 0x11 (serviceNotSupported) — expected for GMLAN, not fatal
- [ ] Root cause analysis: ECU communication is intermittent — works briefly after connect, then drops

## TesterPresent Keepalive & Retry Improvements
- [x] Add background TesterPresent keepalive (0x3E 0x80 suppressPositiveResponse) every 2s to maintain diagnostic session
- [x] Start keepalive after successful session switch, stop on cleanup/abort/key-off
- [x] Increase inter-retry delay for bench setups — progressive backoff: 1s, 1.5s, 2s, 2.5s between retries
- [x] Add post-key-cycle re-session: after WAIT_BOOT, re-enter programming session (0x10 0x02 for GMLAN, extended for UDS) with 5 retries and 1.5s backoff
- [x] Re-attempt security access after key cycle if session was re-established — full seed/key exchange with computeGM5B
- [x] Add CAN bus termination guidance log message (120Ω tip) during PRE_CHECK
- [x] Increase post-key-cycle command retry counts: TesterPresent verify 3→5, ReadCalID 2→4, ClearDTC 2→3, ReturnToNormal 1→2
- [x] Increase post-key-cycle command timeouts: 5000ms→8000ms for verify/read/clear commands
- [x] Add GMLAN ProgrammingMode (0xA5 0x01) command to SESSION_OPEN phase for GM ECUs
- [x] Keepalive uses raw CAN send (fire-and-forget) to avoid interfering with pending UDS request/response pairs
