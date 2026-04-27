#!/usr/bin/env node
/**
 * check-tobi-protection.mjs
 * 
 * Manus sync-check script: detects unauthorized modifications to Tobi's protected files.
 * Run this BEFORE pushing to GROK to catch any damage from Cursor or other agents.
 *
 * Usage:
 *   node scripts/check-tobi-protection.mjs [base-ref]
 *
 * base-ref defaults to "origin/GROK" — the last known good state from Tobi's branch.
 * Exits with code 1 if protected files were modified (blocking push).
 * Exits with code 0 if all protected files are clean.
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Protected file list ──────────────────────────────────────────────────────
// Sourced from TOBI_PROTECTED_FILES.md Categories 1–9
const PROTECTED_FILES = [
  // Category 1: Flash Engine & Transport (CRITICAL)
  'client/src/lib/pcanFlashEngine.ts',
  'client/src/lib/pcanConnection.ts',
  'client/src/lib/pcanConnection.test.ts',
  'client/src/lib/vopCan2UsbConnection.ts',
  'client/src/lib/flashBridgeConnection.ts',
  'shared/pcanFlashOrchestrator.ts',
  'shared/flashFileValidator.ts',
  'shared/flashVerify.ts',
  'shared/flashVerify.test.ts',
  'shared/flashLogRecommendations.ts',
  'shared/flashLogRecommendations.test.ts',
  'shared/ecuContainerMatch.ts',
  'shared/ecuSoftwareSlotMask.ts',

  // Category 2: Flash UI Components
  'client/src/components/FlashContainerPanel.tsx',
  'client/src/components/FlashDashboard.tsx',
  'client/src/components/FlashMissionControl.tsx',
  'client/src/components/EcuScanPanel.tsx',

  // Category 3: Flash Support Libraries
  'client/src/lib/ecuContainerSessionStorage.ts',
  'client/src/lib/ecuScanner.ts',
  'client/src/lib/flashContainerParser.ts',
  'client/src/lib/flashLogExcelExport.ts',
  'client/src/lib/computeSecurityKeyClient.ts',
  'client/src/lib/ecuChecksums.ts',
  'client/src/lib/ecuDetection.ts',
  'client/src/lib/ecuReference.ts',
  'shared/ecuDatabase.ts',

  // Category 4: Flash Server/Database
  'server/routers/flash.ts',
  'server/routers/flash.test.ts',
  'server/routers/flash-integration.test.ts',
  'server/flashDb.ts',
  'server/flash.test.ts',

  // Category 5: Datalogging
  'client/src/components/DataloggerPanel.tsx',
  'client/src/lib/obdConnection.ts',
  'client/src/lib/obdConnection.test.ts',
  'server/routers/datalogCache.ts',
  'server/routers/datalogNaming.ts',

  // Category 6: Tune Deploy
  'server/tuneDeployRoutes.ts',
  'server/tuneDeployDb.ts',
  'server/routers/tuneDeploy.ts',
  'server/routers/tuneDeploy.test.ts',
  'server/lib/tuneDeployParser.ts',
  'server/lib/tuneDeployParser.test.ts',
  'shared/tuneDeploySchemas.ts',

  // Category 8: Infrastructure Dependencies
  'server/_core/index.ts',
  'server/_core/loadEnv.ts',
  'server/_core/vite.ts',
  'server/_core/vopDevServerArgv.ts',

  // Category 9: Flash Scripts
  'scripts/find-containers-for-ecu.ts',
  'scripts/fix-flash-tables.mjs',
  'scripts/generate-flash-fix-pdf.ts',
  'scripts/ingest-reference-container.ts',
];

// Firmware directory (glob)
const FIRMWARE_PREFIX = 'firmware/';

// ── Main ─────────────────────────────────────────────────────────────────────

const baseRef = process.argv[2] || 'origin/GROK';

console.log('');
console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║          TOBI PROTECTION CHECK — Pre-Push to GROK              ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`Comparing HEAD against: ${baseRef}`);
console.log('');

let changedFiles;
try {
  const output = execSync(`git diff --name-only ${baseRef}...HEAD`, {
    cwd: ROOT,
    encoding: 'utf-8',
  }).trim();
  changedFiles = output ? output.split('\n') : [];
} catch (err) {
  console.error(`⚠️  Could not diff against ${baseRef}. Is the remote fetched?`);
  console.error(`   Run: git fetch origin GROK`);
  process.exit(2);
}

const violations = [];
const infraWarnings = [];

for (const file of changedFiles) {
  // Check firmware directory
  if (file.startsWith(FIRMWARE_PREFIX)) {
    violations.push({ file, category: 'Firmware (Category 7)' });
    continue;
  }

  // Check exact file matches
  if (PROTECTED_FILES.includes(file)) {
    const isInfra = file.startsWith('server/_core/');
    if (isInfra) {
      infraWarnings.push(file);
    }
    violations.push({
      file,
      category: isInfra ? 'Infrastructure Dependency (Category 8)' : 'Tobi Protected',
    });
  }
}

if (violations.length === 0) {
  console.log('✅ All Tobi-protected files are CLEAN. Safe to push to GROK.');
  console.log('');
  process.exit(0);
}

// ── Violations found ─────────────────────────────────────────────────────────

console.log('');
console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  ⛔  WARNING: PROTECTED FILES HAVE BEEN MODIFIED               ║');
console.log('║                                                                  ║');
console.log('║  These files are owned by Tobi. Pushing these changes to GROK   ║');
console.log('║  may BREAK ECU flashing and datalogging.                         ║');
console.log('║                                                                  ║');
console.log('║  OWNER APPROVAL REQUIRED from Kory before proceeding.            ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
console.log('');

for (const v of violations) {
  console.log(`  ⛔  ${v.file}`);
  console.log(`      Category: ${v.category}`);
}

if (infraWarnings.length > 0) {
  console.log('');
  console.log('  ⚠️  INFRASTRUCTURE WARNING:');
  console.log('  The following server/_core files were changed. On April 9–10, 2026,');
  console.log('  similar changes broke ECU flashing by altering server binding,');
  console.log('  NODE_ENV behavior, and WebSocket routing.');
  for (const f of infraWarnings) {
    console.log(`    → ${f}`);
  }
}

console.log('');
console.log(`Total violations: ${violations.length}`);
console.log('');
console.log('OPTIONS:');
console.log('  1. REVERT these changes: git checkout origin/GROK -- <file>');
console.log('  2. GET OWNER APPROVAL: Ask Kory to review and approve');
console.log('  3. ROUTE TO TOBI: These changes should go through Tobi\'s branch');
console.log('');

process.exit(1);
