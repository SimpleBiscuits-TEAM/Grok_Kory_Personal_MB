# TOBI PROTECTED FILES — DO NOT MODIFY

> **OWNER APPROVAL REQUIRED:** These files are maintained exclusively by Tobi (via his branch → GROK).
> No AI agent (Manus, Cursor, Copilot, etc.) or developer may modify these files without
> **explicit written approval from Kory (project owner)**.
>
> Tobi's code is production-tested, well-documented, and working. Unauthorized changes have
> previously broken ECU flashing — a safety-critical operation that can brick hardware.

---

## Why This Exists

On April 9–10, 2026, infrastructure changes made by AI agents (Cursor/Manus) broke Tobi's
working flash implementation. The root causes were:

1. Server binding changed to IPv6 dual-stack — broke WebSocket connections
2. NODE_ENV forced to development — changed Helmet/CSP behavior
3. PCAN bridge URLs rewritten from `localhost` to `127.0.0.1` — broke bridge discovery
4. Vite SPA fallback middleware rewritten — changed request routing

None of Tobi's actual flash files were directly edited, but the infrastructure they depend on
was changed without understanding the downstream impact. This manifest protects BOTH.

---

## Category 1: Flash Engine & Transport (CRITICAL)

These files implement ECU flashing. Unauthorized changes can brick ECUs.

| File | Purpose |
|------|---------|
| `client/src/lib/pcanFlashEngine.ts` | Flash engine — orchestrates the entire flash sequence |
| `client/src/lib/pcanConnection.ts` | PCAN WebSocket bridge connection |
| `client/src/lib/pcanConnection.test.ts` | PCAN connection tests |
| `client/src/lib/vopCan2UsbConnection.ts` | V-OP USB CAN bridge connection |
| `client/src/lib/flashBridgeConnection.ts` | Flash bridge interface/types |
| `shared/pcanFlashOrchestrator.ts` | Flash plan generation (command sequences) |
| `shared/flashFileValidator.ts` | Flash file format validation |
| `shared/flashVerify.ts` | Flash verification logic |
| `shared/flashVerify.test.ts` | Flash verification tests |
| `shared/flashLogRecommendations.ts` | Flash log analysis/recommendations |
| `shared/flashLogRecommendations.test.ts` | Flash log recommendation tests |
| `shared/ecuContainerMatch.ts` | ECU container matching logic |
| `shared/ecuSoftwareSlotMask.ts` | ECU software slot mask (on GROK, not yet on main) |

## Category 2: Flash UI Components (CRITICAL)

| File | Purpose |
|------|---------|
| `client/src/components/FlashContainerPanel.tsx` | Main flash UI panel |
| `client/src/components/FlashDashboard.tsx` | Flash dashboard overview |
| `client/src/components/FlashMissionControl.tsx` | Flash mission control UI |
| `client/src/components/EcuScanPanel.tsx` | ECU scan/discovery panel |

## Category 3: Flash Support Libraries

| File | Purpose |
|------|---------|
| `client/src/lib/ecuContainerSessionStorage.ts` | ECU container session state |
| `client/src/lib/ecuScanner.ts` | ECU scanner logic |
| `client/src/lib/flashContainerParser.ts` | Flash container file parser |
| `client/src/lib/flashLogExcelExport.ts` | Flash log Excel export |

## Category 4: Flash Server/Database

| File | Purpose |
|------|---------|
| `server/routers/flash.ts` | Flash tRPC router |
| `server/routers/flash.test.ts` | Flash router tests |
| `server/routers/flash-integration.test.ts` | Flash integration tests |
| `server/flashDb.ts` | Flash database helpers |
| `server/flash.test.ts` | Flash server tests |

## Category 5: Datalogging

| File | Purpose |
|------|---------|
| `client/src/components/DataloggerPanel.tsx` | Datalogger UI panel |
| `client/src/lib/obdConnection.ts` | OBD connection (used by datalogging) |
| `client/src/lib/obdConnection.test.ts` | OBD connection tests |
| `server/routers/datalogCache.ts` | Datalog cache router |
| `server/routers/datalogNaming.ts` | Datalog naming router |

## Category 6: Tune Deploy (Flash-Adjacent)

| File | Purpose |
|------|---------|
| `server/tuneDeployRoutes.ts` | Tune deploy routes |
| `server/tuneDeployDb.ts` | Tune deploy database |
| `server/routers/tuneDeploy.ts` | Tune deploy tRPC router |
| `server/routers/tuneDeploy.test.ts` | Tune deploy tests |
| `server/lib/tuneDeployParser.ts` | Tune deploy parser |
| `server/lib/tuneDeployParser.test.ts` | Tune deploy parser tests |
| `shared/tuneDeploySchemas.ts` | Tune deploy schemas |

## Category 7: Firmware

| File | Purpose |
|------|---------|
| `firmware/flash_encryption/vop3_flash_crypt.c` | Flash encryption C code |
| `firmware/flash_encryption/vop3_flash_crypt.h` | Flash encryption header |
| `firmware/flash_encryption/vop3_ext_flash.h` | External flash header |
| `firmware/flash_encryption/vop3_crypt_integration.c` | Crypto integration |
| `firmware/flash_encryption/vop3_provision.c` | Provisioning code |
| `firmware/flash_encryption/vop3_provision.h` | Provisioning header |

## Category 8: Infrastructure Dependencies (CAUTION)

These files are NOT flash-specific but flash depends on them. Changes here have previously
broken flashing. Modify with extreme caution and test flash functionality afterward.

| File | Purpose | Why It Matters to Flash |
|------|---------|------------------------|
| `server/_core/index.ts` | Express server setup, Helmet, CSP, binding | Server binding and CSP affect WebSocket connections |
| `server/_core/loadEnv.ts` | Environment variable loading | NODE_ENV override changes Helmet/CSP behavior |
| `server/_core/vite.ts` | Vite middleware integration | SPA fallback affects API routing |
| `server/_core/vopDevServerArgv.ts` | Dev server argument detection | Affects NODE_ENV determination |

## Category 9: Flash Scripts

| File | Purpose |
|------|---------|
| `scripts/find-containers-for-ecu.ts` | ECU container lookup script |
| `scripts/fix-flash-tables.mjs` | Flash table fix script |
| `scripts/generate-flash-fix-pdf.ts` | Flash fix PDF generator |
| `scripts/ingest-reference-container.ts` | Reference container ingestion |

---

## PPEI Team Sandbox (NOT Protected — Safe to Edit)

The following directories contain **wrapper components** that import Tobi's protected originals as a base. The PPEI team can freely modify, experiment with, and break these files without affecting Tobi's production code.

| Directory | Purpose | Wraps |
|-----------|---------|-------|
| `client/src/components/ppei-flash/` | PPEI Flasher sandbox | FlashContainerPanel (Category 2) |
| `client/src/components/ppei-datalogger/` | PPEI Datalogger sandbox | DataloggerPanel (Category 5) |

These wrappers are accessible via the **PPEI FLASHER** and **PPEI DATALOGGER** tabs in the Advanced section. When Tobi pushes updates to his originals, the improvements automatically flow through the wrappers. If a wrapper breaks, the original FLASH and DATALOGGER tabs continue to work.

---

## Rules

1. **NO AI agent may modify any file listed in Categories 1–9** without Kory's explicit approval
2. **Tobi's branch → GROK is the source of truth** for all files in Categories 1–7
3. **Infrastructure files (Category 8)** require flash regression testing after any change
4. **When merging from GROK**, Tobi's versions of these files always take precedence
5. **If Cursor or another agent modifies these files**, Manus will detect and repair on next sync
6. **PPEI sandbox directories** (`ppei-flash/`, `ppei-datalogger/`) are team-owned and may be freely modified by any agent or developer
