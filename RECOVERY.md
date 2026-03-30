# V-OP Powered by PPEI — Disaster Recovery Guide

**Last Updated:** March 30, 2026
**Project:** V-OP (Vehicle Optimizer Platform)
**Owner:** Kory Willis (kory@latuning.com)
**GitHub Repo:** github.com/simplebiscuits/VOP-Main-Brain

---

## Table of Contents

1. [Quick Recovery Overview](#quick-recovery-overview)
2. [What You Need](#what-you-need)
3. [Step-by-Step Recovery](#step-by-step-recovery)
4. [One-Paste Manus Recovery Prompt](#one-paste-manus-recovery-prompt)
5. [Architecture Reference](#architecture-reference)
6. [AI Agents Reference](#ai-agents-reference)
7. [Access Control System](#access-control-system)
8. [Database Tables](#database-tables)
9. [Key Design Decisions](#key-design-decisions)

---

## Quick Recovery Overview

If the Manus project goes down, you need three things to get back online:

| Item | Where It Lives | What It Contains |
|---|---|---|
| Source Code | GitHub (VOP-Main-Brain) | All application code, components, routers, libs |
| Database Backup | S3 (weekly export) | SQL dump of all tables — users, sessions, feedback, etc. |
| This Document | GitHub repo + your local copy | Recovery instructions + Manus rebuild prompt |

**Estimated recovery time:** 15-30 minutes

---

## What You Need

Before starting recovery, ensure you have:

- [ ] Access to your Manus account (manus.im)
- [ ] Access to GitHub repo (github.com/simplebiscuits/VOP-Main-Brain)
- [ ] Latest SQL backup file (from S3 or local download)
- [ ] Access to your domain registrar for ppei.ai DNS settings
- [ ] This document

---

## Step-by-Step Recovery

### Step 1: Create New Manus Project

1. Open Manus (manus.im)
2. Start a new task
3. Paste the **One-Paste Recovery Prompt** below
4. Wait for Manus to set up the project

### Step 2: Verify GitHub Sync

1. In Management UI, go to **Settings > GitHub**
2. Connect to `simplebiscuits/VOP-Main-Brain`
3. Verify all code is pulled in

### Step 3: Restore Database

1. In Management UI, go to **Database**
2. Use the SQL editor or ask Manus to run the latest backup SQL file
3. Verify tables are populated (check users table has your account)

### Step 4: Reconfigure Secrets

Ask Manus to set up these environment variables (the values will be auto-configured by the platform):

- `DATABASE_URL` — auto-configured
- `JWT_SECRET` — auto-configured
- `VITE_APP_ID` — auto-configured
- `OAUTH_SERVER_URL` — auto-configured
- `VITE_OAUTH_PORTAL_URL` — auto-configured
- `BUILT_IN_FORGE_API_URL` — auto-configured
- `BUILT_IN_FORGE_API_KEY` — auto-configured
- `VITE_APP_TITLE` — set to "V-OP Powered by PPEI"

### Step 5: Rebind Domain

1. Go to **Settings > Domains**
2. Add `www.ppei.ai` as custom domain
3. Update CNAME record at your domain registrar to point to the new Manus deployment
4. Wait for DNS propagation (usually 5-30 minutes)

### Step 6: Publish

1. Save a checkpoint
2. Click **Publish** in the Management UI header

---

## One-Paste Manus Recovery Prompt

Copy everything below between the `---` markers and paste it into a fresh Manus conversation:

---

```
DISASTER RECOVERY — V-OP Powered by PPEI

I need you to rebuild my web application from my GitHub repo. This is a production application that was previously running on Manus. Here's everything you need to know:

PROJECT SETUP:
1. Create a new web project called "duramax_analyzer" (internal name, display name is "V-OP Powered by PPEI")
2. Add feature: web-db-user (database + server + user management)
3. Connect to my GitHub repo: github.com/simplebiscuits/VOP-Main-Brain
4. Pull all code from the main branch
5. Set VITE_APP_TITLE to "V-OP Powered by PPEI"
6. Run pnpm install and pnpm db:push to sync the database schema

DATABASE RESTORE:
After the project is set up, I'll provide the latest SQL backup file. Run it against the database to restore all user accounts, debug sessions, feedback, and chat history.

ARCHITECTURE OVERVIEW:
This is V-OP — a Vehicle Optimizer Platform built by PPEI. It's an AI-powered automotive diagnostic and calibration tool. The stack is:
- Frontend: React 19 + Tailwind 4 + tRPC client
- Backend: Express 4 + tRPC 11 + Drizzle ORM
- Database: TiDB (MySQL-compatible)
- Auth: Manus OAuth
- Design: Industrial motorsport dark theme — black (#0a0a0a) background, PPEI Red (oklch 0.52 0.22 25) accents, Bebas Neue headings, Rajdhani body, Share Tech Mono for data

TWO-TIER ACCESS SYSTEM:
- V-OP Lite (Home page): Available to all signed-in users. Contains file upload/analyzer, Basic Editor (Vehicle Coding + Can-Am VIN sub-tabs), Data Re-Imagined (analyzer), Datalogger, Service Procedures, and About section.
- V-OP Pro (Advanced page): Requires admin approval OR access code "KINGKONG". Contains Datalogger, AI Chat (Erika), Editor (Calibration Editor + Segment Swapper + Honda Talon sub-tabs), IntelliSpy (CAN Sniffer + Reverse Engineering sub-tabs), Flash (V-OP + PCAN channels, coming soon placeholder), QA Tests (admin), Offsets (admin).

USER ROLES:
- super_admin: Full access to everything
- admin: Full access to Pro + user management
- user: Lite access by default, Pro access when approved
- Access levels 1-3 control feature depth

AI AGENTS (CRITICAL):
1. ERIKA — The main LLM. She learns from uploaded binary and A2L files. She powers the AI Chat tab and diagnostic analysis. She has access to proprietary calibration knowledge.

2. KNOX — Lead debug agent. The "bad mofo" who doesn't miss. Has FULL access to proprietary info (A2L files, functional docs, calibration data). Handles deep bug analysis, protocol issues, PID problems. Knox classifies bugs into tiers (Tier 1 critical, Tier 2 moderate, Tier 3 minor). Knox treats missing PIDs, datalogger issues, and PID mapping errors as legitimate Tier 1 bugs. Knox rejects feature requests, layout changes, and design preferences — strict debug-only.

3. MONICA (AI Monica) — Customer-facing debug assistant. Born March 29, 2026 (V-OP AI woke up March 24). She talks directly to testers in the debug panel. She's friendly, inspiring, has big vision energy — makes testers feel like they're part of something revolutionary. She keeps testers informed on bug status, when PPEI approval is needed, what to retest. She can escalate protocol/PID issues to Knox internally and relay sanitized answers. She NEVER exposes proprietary data. Anti-repetition: she never says the same thing twice but keeps the same energy. If users talk shit, she gives it right back — tongue in cheek, playful, calls people "dickhead" when warranted. If users repeatedly cuss, she matches their language. Always redirects back to debugging because it's a closed-loop system and testers are helping change the world.

KEY FEATURES:
- CSV datalog upload and analysis (HP/torque estimation, boost efficiency, fault detection)
- Real-time OBD-II datalogger (ELM327, PCAN, V-OP channels)
- UDS diagnostic support (universal vehicle coverage)
- DTC read/clear (OBD-II Mode 03/04, UDS 0x19/0x14, J1939 DM1/DM2)
- Calibration editor with A2L file support
- Binary segment swapper
- Honda Talon WP8 tuner
- Can-Am VIN changer
- IntelliSpy CAN bus sniffer
- Reverse engineering tools (admin only)
- Service procedures (OBD-connected)
- Drag strip timeslip analyzer
- Health report PDF generation
- DTC search database
- ECU reference panel
- Voice commands and speech-to-text
- Feedback system with video/screen recording upload
- Debug system with Knox AI analysis and Monica chat
- User management with role-based access control
- Notification system
- Flash tab (V-OP + PCAN channels, coming soon)

DESIGN RULES:
- Industrial motorsport dark theme throughout
- No "manus" references visible in inspect element — renamed to ppei-runtime, AuthDialog, etc.
- PPEI Red accent color: oklch(0.52 0.22 25)
- Fonts: Bebas Neue (headings), Rajdhani (body), Share Tech Mono (data/mono)
- Sharp corners, red left-border accents on cards
- Dark panels with subtle gradients

IMPORTANT NOTES:
- The project internal name is "duramax_analyzer" but NEVER call it that externally. It's "V-OP Powered by PPEI"
- No competitor names anywhere in the codebase
- Weekly database backups should be set up (server/backup-export.mjs)
- Domain: www.ppei.ai (needs CNAME rebinding after recovery)
- The feedback system only allows bug reports through Knox — no feature requests or layout changes
- Monica can escalate to Knox but never exposes proprietary info

After setup, verify:
1. Homepage loads with V-OP Lite interface
2. Login works via Manus OAuth
3. V-OP Pro accessible with code "KINGKONG"
4. AI Chat (Erika) responds
5. Debug panel shows Monica chat
6. All database tables populated from backup
7. Domain www.ppei.ai resolves correctly
```

---

## Architecture Reference

### Frontend Structure

```
client/src/
├── pages/
│   ├── Home.tsx              — V-OP Lite (main landing + tools)
│   ├── Advanced.tsx          — V-OP Pro (full diagnostic suite)
│   ├── CalibrationEditor.tsx — Calibration editing interface
│   ├── DebugDashboard.tsx    — Admin debug overview
│   └── SupportJoin.tsx       — Support ticket join page
├── components/
│   ├── DataloggerPanel.tsx   — Live OBD-II datalogger
│   ├── IntelliSpy.tsx        — CAN bus sniffer
│   ├── MonicaChat.tsx        — AI Monica debug chat
│   ├── DebugReportButton.tsx — Bug report submission
│   ├── FeedbackPanel.tsx     — User feedback with video upload
│   ├── HondaTalonTuner.tsx   — WP8 Honda Talon tuner
│   ├── CanAmVinChanger.tsx   — Can-Am VIN modification
│   ├── ServiceProcedures.tsx — OBD-connected service procedures
│   ├── BinaryUploadPanel.tsx — Binary file analysis
│   └── ... (40+ components)
├── lib/
│   ├── obdConnection.ts      — OBD-II protocol handling
│   ├── diagnostics.ts        — Diagnostic analysis engine
│   ├── reasoningEngine.ts    — AI reasoning for diagnostics
│   ├── binaryParser.ts       — Binary file parsing
│   ├── a2lParser.ts          — A2L file parsing
│   ├── universalVinDecoder.ts — VIN decode for all makes
│   ├── vehicleKnowledgeBase.ts — Vehicle protocol database
│   └── ... (30+ libraries)
└── hooks/
    ├── useVoiceInput.ts      — Speech-to-text
    ├── useVoiceCommand.ts    — Voice commands
    └── usePdfExport.ts       — PDF generation
```

### Backend Structure

```
server/
├── routers/
│   ├── debug.ts              — Knox debug AI system
│   ├── monica.ts             — AI Monica customer chat
│   ├── diagnostic.ts         — Diagnostic analysis
│   ├── editor.ts             — Calibration editor backend
│   ├── binaryAnalysis.ts     — Binary file processing
│   ├── accessManagement.ts   — Role-based access control
│   ├── support.ts            — Support ticket system
│   ├── notifications.ts      — Notification system
│   └── ... (15+ routers)
├── routers.ts                — Main tRPC router aggregation
├── db.ts                     — Database query helpers
├── storage.ts                — S3 file storage
└── backup-export.mjs         — Database backup script
```

---

## AI Agents Reference

| Agent | Role | Access Level | Personality |
|---|---|---|---|
| **Erika** | Main LLM / AI Chat | Full proprietary (A2L, binaries, functional docs) | Knowledgeable, professional, learns from uploads |
| **Knox** | Lead Debug Agent | Full proprietary + all debug data | "Bad mofo who doesn't miss" — strict, thorough, no-nonsense |
| **Monica** | Customer Debug Chat | Public-facing only, NO proprietary access | Inspiring, funny, big vision, claps back, matches user energy |

### Monica → Knox Escalation Flow

1. Tester reports issue to Monica
2. Monica tries to help with public knowledge
3. If it's a protocol/PID/communication issue Monica can't solve → she escalates to Knox
4. Monica tells user: "Hold tight, pulling in Knox — he's the lead agent and doesn't miss..."
5. Knox analyzes with full proprietary access
6. Monica relays sanitized answer (no proprietary details exposed)
7. If Knox can't solve it → PPEI team gets probed → Knox gets probed back → it gets fixed

---

## Access Control System

| Level | What They Get | How to Get It |
|---|---|---|
| Not signed in | Can see V-OP Lite landing, must sign in for tools | — |
| Signed in (user) | V-OP Lite: upload, analyzer, basic editor, datalogger, procedures | Manus OAuth sign-in |
| Approved (user) | V-OP Lite + V-OP Pro | Admin approves request OR user enters code "KINGKONG" |
| Admin | Everything + user management, QA tests, offsets | Set role to "admin" in database |
| Super Admin | Everything + system-level controls | Set role to "super_admin" in database |

Access levels 1-3 provide additional depth within Pro features.

---

## Database Tables

| Table | Purpose |
|---|---|
| `users` | User accounts, roles, access levels, request reasons |
| `feedback` | User feedback submissions with attachments |
| `debug_permissions` | Per-user debug access grants |
| `debug_sessions` | Knox debug analysis sessions |
| `debug_audit_log` | Debug action audit trail |
| `admin_conversations` | Admin messaging threads |
| `admin_messages` | Individual admin messages |
| `generated_a2l` | AI-generated A2L file records |
| `datalog_cache` | Cached datalog analysis results |
| `monica_messages` | AI Monica chat history per debug session |

---

## Key Design Decisions

1. **No "manus" in inspect element** — all client-side references renamed to ppei-runtime, AuthDialog, etc.
2. **Two-tier access** — Lite is free with sign-in, Pro requires approval (keeps proprietary tools protected)
3. **Knox stays internal** — never talks to customers directly, only through Monica
4. **Monica is sandboxed** — no access to A2L, functional docs, or calibration internals
5. **Datalogger is priority #1** — most debugged feature, Knox treats datalogger bugs as Tier 1
6. **Weekly backups** — SQL dump uploaded to S3, synced to GitHub via checkpoint
7. **Flash tab** — placeholder for V-OP and PCAN flashing (protocol coming soon)
8. **Service Procedures** — connected to OBD device (V-OP, ELM327, PCAN adapters)
9. **No competitor names** — nowhere in the codebase or UI
10. **Industrial motorsport theme** — consistent dark theme with PPEI Red accents throughout
