import fs from 'fs';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

// First create the table if it doesn't exist
const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS fca_calibrations (
  id int AUTO_INCREMENT NOT NULL,
  calibration text NOT NULL,
  moduleType varchar(32) NOT NULL,
  newPartNumber varchar(32) NOT NULL,
  oldPartNumbers json NOT NULL,
  tsbs json NOT NULL,
  recalls json NOT NULL,
  yearStart int,
  yearEnd int,
  platformCodes varchar(255),
  createdAt timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT fca_calibrations_id PRIMARY KEY(id)
);
`;

const INSERT_SQL = `
INSERT INTO fca_calibrations (calibration, moduleType, newPartNumber, oldPartNumbers, tsbs, recalls, yearStart, yearEnd, platformCodes)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

function extractYears(calibration) {
  // Extract year numbers from the calibration description
  const yearMatches = calibration.match(/\b(19\d{2}|20\d{2})\b/g);
  if (!yearMatches) {
    // Try 2-digit years like "95", "98"
    const shortYears = calibration.match(/\b(\d{2})\b/g);
    if (shortYears) {
      const years = shortYears
        .map(y => parseInt(y))
        .filter(y => (y >= 95 && y <= 99) || (y >= 0 && y <= 30))
        .map(y => y >= 95 ? 1900 + y : 2000 + y);
      if (years.length > 0) {
        return { start: Math.min(...years), end: Math.max(...years) };
      }
    }
    return { start: null, end: null };
  }
  const years = yearMatches.map(y => parseInt(y));
  return { start: Math.min(...years), end: Math.max(...years) };
}

function extractPlatformCodes(calibration) {
  // Extract 2-letter platform codes (e.g., VB, D1, VA, LX, WK, JR, etc.)
  const codes = new Set();
  const matches = calibration.match(/\b([A-Z][A-Z0-9])\b/g);
  if (matches) {
    for (const m of matches) {
      // Filter out common non-platform words
      if (!['IN', 'OR', 'ON', 'TO', 'AT', 'OF', 'BY', 'NO', 'IF', 'UP', 'SO', 'DO', 'MY', 'AN'].includes(m)) {
        codes.add(m);
      }
    }
  }
  return codes.size > 0 ? Array.from(codes).join(',') : null;
}

async function main() {
  const records = JSON.parse(fs.readFileSync('/home/ubuntu/fca_calibration_records.json', 'utf8'));
  console.log(`Loaded ${records.length} records`);

  const conn = await mysql.createConnection(DATABASE_URL + '&connectTimeout=30000');
  
  // Create table
  console.log('Creating table if not exists...');
  await conn.execute(CREATE_TABLE_SQL);
  
  // Check if data already exists
  const [rows] = await conn.execute('SELECT COUNT(*) as cnt FROM fca_calibrations');
  if (rows[0].cnt > 0) {
    console.log(`Table already has ${rows[0].cnt} records. Truncating...`);
    await conn.execute('TRUNCATE TABLE fca_calibrations');
  }

  // Insert in batches of 500
  const BATCH_SIZE = 500;
  let inserted = 0;
  
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    
    // Build batch insert
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    const values = [];
    
    for (const r of batch) {
      const years = extractYears(r.calibration);
      const platforms = extractPlatformCodes(r.calibration);
      
      values.push(
        r.calibration || '',
        r.type || '',
        r.new_part_number || '',
        JSON.stringify(r.old_part_numbers || []),
        JSON.stringify(r.tsbs || []),
        JSON.stringify(r.recalls || []),
        years.start,
        years.end,
        platforms
      );
    }
    
    const sql = `INSERT INTO fca_calibrations (calibration, moduleType, newPartNumber, oldPartNumbers, tsbs, recalls, yearStart, yearEnd, platformCodes) VALUES ${placeholders}`;
    await conn.execute(sql, values);
    
    inserted += batch.length;
    process.stdout.write(`\r  Inserted ${inserted} / ${records.length}`);
  }
  
  console.log(`\n\nDone! Inserted ${inserted} records.`);
  
  // Verify
  const [count] = await conn.execute('SELECT COUNT(*) as cnt FROM fca_calibrations');
  console.log(`Verification: ${count[0].cnt} records in database`);
  
  // Show module type distribution
  const [types] = await conn.execute('SELECT moduleType, COUNT(*) as cnt FROM fca_calibrations GROUP BY moduleType ORDER BY cnt DESC LIMIT 10');
  console.log('\nTop module types:');
  for (const t of types) {
    console.log(`  ${t.moduleType}: ${t.cnt}`);
  }
  
  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
