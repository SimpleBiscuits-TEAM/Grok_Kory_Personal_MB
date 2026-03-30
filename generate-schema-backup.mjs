/**
 * V-OP Schema Backup Generator
 * 
 * Generates a schema-only SQL dump from the Drizzle migration files.
 * Used when DATABASE_URL is not available (e.g., scheduled agent tasks).
 * The resulting file documents the full database structure for disaster recovery.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(__dirname, 'drizzle');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const filename = `vop-schema-backup-${timestamp}.sql`;
const outPath = `/tmp/${filename}`;

const TABLES = [
  'users',
  'feedback',
  'debug_permissions',
  'debug_sessions',
  'debug_audit_log',
  'admin_conversations',
  'admin_messages',
  'generated_a2l',
  'datalog_cache',
  'monica_messages',
];

const lines = [];

lines.push(`-- V-OP Powered by PPEI — Database Schema Backup`);
lines.push(`-- Generated: ${new Date().toISOString()}`);
lines.push(`-- Type: Schema-only (live data export requires DATABASE_URL)`);
lines.push(`-- Tables: ${TABLES.join(', ')}`);
lines.push(`-- Source: Drizzle ORM migration files (complete history)`);
lines.push(`-- GitHub: https://github.com/simplebiscuits/VOP-Main-Brain`);
lines.push(`-- Owner: Kory Willis (kory@latuning.com)`);
lines.push('');
lines.push('SET FOREIGN_KEY_CHECKS = 0;');
lines.push('');

// Read all migration SQL files in order
const migrationFiles = readdirSync(drizzleDir)
  .filter(f => f.endsWith('.sql') && /^\d+_/.test(f))
  .sort();

console.log(`Found ${migrationFiles.length} migration files`);

for (const file of migrationFiles) {
  const content = readFileSync(join(drizzleDir, file), 'utf8');
  lines.push(`-- ─── Migration: ${file} ───`);
  lines.push(content.trim());
  lines.push('');
}

// Also include the raw SQL schema file if present
try {
  const projectsSql = readFileSync(join(drizzleDir, 'schema_projects.sql'), 'utf8');
  lines.push(`-- ─── Extended Schema: schema_projects.sql ───`);
  lines.push(projectsSql.trim());
  lines.push('');
} catch (e) {
  // Not present
}

lines.push('SET FOREIGN_KEY_CHECKS = 1;');
lines.push('');
lines.push(`-- End of schema backup`);
lines.push(`-- Note: This is a schema-only backup. For full data backup, run:`);
lines.push(`--   node server/backup-export.mjs`);
lines.push(`-- (requires DATABASE_URL, BUILT_IN_FORGE_API_URL, BUILT_IN_FORGE_API_KEY)`);

const sqlContent = lines.join('\n');
writeFileSync(outPath, sqlContent);

console.log(`\nSchema backup complete: ${filename}`);
console.log(`Total size: ${(sqlContent.length / 1024).toFixed(1)} KB`);
console.log(`Migrations included: ${migrationFiles.length}`);
console.log(`Saved to: ${outPath}`);

export { outPath, filename };
