# V-OP Agent Instructions

## CRITICAL: Tobi Protected Files Policy

**Before modifying ANY file, check if it is on the protected list below. If it is, STOP and do not modify it.**

On April 9-10, 2026, AI agent changes to infrastructure and transport files broke ECU flashing. The following policy is now in effect:

### Protected File Categories

All files related to flash, datalogging, ECU scan, PCAN, V-OP CAN, tune deploy, firmware, and server infrastructure are **owned by Tobi** and **must not be modified** by any AI agent or developer without explicit written approval from Kory (project owner).

This includes but is not limited to:

- All files matching `**/pcanFlashEngine*`, `**/pcanConnection*`, `**/vopCan2UsbConnection*`, `**/flashBridgeConnection*`
- All files matching `**/FlashContainerPanel*`, `**/FlashDashboard*`, `**/FlashMissionControl*`, `**/EcuScanPanel*`
- All files matching `**/obdConnection*`, `**/DataloggerPanel*`, `**/datalogCache*`, `**/datalogNaming*`
- All files matching `**/tuneDeploy*`, `**/tuneDeployParser*`, `**/tuneDeploySchemas*`
- All files matching `**/flashDb*`, `**/flash.ts`, `**/flash.test*`, `**/flashVerify*`
- All files in `firmware/`
- All files in `scripts/` related to flash or containers
- `server/_core/index.ts`, `server/_core/loadEnv.ts`, `server/_core/vite.ts`, `server/_core/vopDevServerArgv.ts`

### If asked to modify a protected file:

Respond with: "This file is protected under Tobi's code ownership policy. Modification requires explicit approval from Kory. See TOBI_PROTECTED_FILES.md."

### Full documentation:

See `TOBI_PROTECTED_FILES.md` in the project root for the complete file list, rationale, and approval process.

---

## PPEI Team Sandbox — Safe to Modify

The following directories contain **wrapper components** that the PPEI team owns and can freely modify. These wrappers import Tobi's protected originals as a base, but the wrapper files themselves are NOT protected.

**Safe directories (edit freely):**
- `client/src/components/ppei-flash/` — PPEI Flasher sandbox (wraps FlashContainerPanel)
- `client/src/components/ppei-datalogger/` — PPEI Datalogger sandbox (wraps DataloggerPanel)

**How it works:** Each wrapper imports Tobi's original component and renders it inside a sandbox frame. The team can add custom behavior in clearly marked TEAM OVERRIDE ZONE sections. Breaking a wrapper does NOT break Tobi's production FLASH or DATALOGGER tabs.

**Quick rule:** If the file path contains `ppei-flash/` or `ppei-datalogger/` → safe to edit. If not → check the protected list above.
