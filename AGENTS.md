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
