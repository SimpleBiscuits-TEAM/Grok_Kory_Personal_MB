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
