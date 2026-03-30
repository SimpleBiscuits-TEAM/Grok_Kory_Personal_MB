/**
 * V-OP Database Backup Export
 * 
 * Exports all database tables as SQL INSERT statements.
 * Uploads the SQL dump to S3 for safekeeping.
 * Designed to be run as a standalone script or via tRPC admin endpoint.
 * 
 * Usage: node server/backup-export.mjs
 */

import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

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

function escapeValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
  if (Buffer.isBuffer(val)) return `X'${val.toString('hex')}'`;
  // String — escape single quotes
  const escaped = String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  return `'${escaped}'`;
}

async function exportDatabase() {
  const connection = await mysql.createConnection(DATABASE_URL);
  const lines = [];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  
  lines.push(`-- V-OP Powered by PPEI — Database Backup`);
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Tables: ${TABLES.join(', ')}`);
  lines.push('');
  lines.push('SET FOREIGN_KEY_CHECKS = 0;');
  lines.push('');

  for (const table of TABLES) {
    console.log(`Exporting table: ${table}...`);
    
    try {
      // Get CREATE TABLE statement
      const [createResult] = await connection.query(`SHOW CREATE TABLE \`${table}\``);
      if (createResult.length > 0) {
        const createStmt = createResult[0]['Create Table'];
        lines.push(`-- ─── Table: ${table} ───`);
        lines.push(`DROP TABLE IF EXISTS \`${table}\`;`);
        lines.push(`${createStmt};`);
        lines.push('');
      }

      // Get all rows
      const [rows] = await connection.query(`SELECT * FROM \`${table}\``);
      
      if (rows.length === 0) {
        lines.push(`-- (no data in ${table})`);
        lines.push('');
        continue;
      }

      // Get column names from first row
      const columns = Object.keys(rows[0]);
      const colList = columns.map(c => `\`${c}\``).join(', ');

      // Batch INSERT statements (500 rows per batch for efficiency)
      const BATCH_SIZE = 500;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const values = batch.map(row => {
          const vals = columns.map(col => escapeValue(row[col]));
          return `(${vals.join(', ')})`;
        });
        lines.push(`INSERT INTO \`${table}\` (${colList}) VALUES`);
        lines.push(values.join(',\n') + ';');
        lines.push('');
      }

      console.log(`  → ${rows.length} rows exported`);
    } catch (err) {
      console.error(`  ✗ Error exporting ${table}:`, err.message);
      lines.push(`-- ERROR exporting ${table}: ${err.message}`);
      lines.push('');
    }
  }

  lines.push('SET FOREIGN_KEY_CHECKS = 1;');
  lines.push('');
  lines.push('-- End of backup');

  await connection.end();

  const sqlContent = lines.join('\n');
  const filename = `vop-backup-${timestamp}.sql`;
  
  console.log(`\nBackup complete: ${filename}`);
  console.log(`Total size: ${(sqlContent.length / 1024).toFixed(1)} KB`);
  console.log(`Tables exported: ${TABLES.length}`);

  return { sql: sqlContent, filename, timestamp };
}

// Run if called directly
const result = await exportDatabase();

// Write to stdout or file
const fs = await import('fs');
const outPath = `/tmp/${result.filename}`;
fs.writeFileSync(outPath, result.sql);
console.log(`\nSaved to: ${outPath}`);

// Upload to S3 if storage is available
try {
  const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL;
  const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;
  
  if (FORGE_API_URL && FORGE_API_KEY) {
    console.log('\nUploading to S3...');
    const fileBuffer = fs.readFileSync(outPath);
    const key = `backups/${result.filename}`;
    
    const response = await fetch(`${FORGE_API_URL}/api/storage/put`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FORGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key,
        contentType: 'application/sql',
        data: fileBuffer.toString('base64'),
        encoding: 'base64',
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✓ Uploaded to S3: ${data.url || key}`);
    } else {
      console.log(`S3 upload returned ${response.status} — backup saved locally only`);
    }
  }
} catch (err) {
  console.log(`S3 upload skipped: ${err.message}`);
}

console.log('\n✓ Backup export complete');
