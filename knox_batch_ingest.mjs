/**
 * Knox Batch Ingest — Upload all analyzed ECU files to S3 and store metadata in DB.
 * Run: node knox_batch_ingest.mjs
 */
import fs from 'fs';
import path from 'path';
import { createConnection } from 'mysql2/promise';

// Load env from the running dev server
const DATABASE_URL = process.env.DATABASE_URL;
const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL?.replace(/\/+$/, '');
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

if (!DATABASE_URL || !FORGE_API_URL || !FORGE_API_KEY) {
  console.error('Missing env vars. Run with: source .env && node knox_batch_ingest.mjs');
  console.error('DATABASE_URL:', !!DATABASE_URL);
  console.error('FORGE_API_URL:', !!FORGE_API_URL);
  console.error('FORGE_API_KEY:', !!FORGE_API_KEY);
  process.exit(1);
}

// Parse analysis results
const analysisResults = JSON.parse(fs.readFileSync('/home/ubuntu/knox_analysis_results.json', 'utf8'));
console.log(`Loaded ${analysisResults.length} file analysis results`);

// Determine source collection from path
function getSourceCollection(filepath) {
  if (filepath.includes('/KTFKDC3/')) return 'KTFKDC3';
  if (filepath.includes('/3.0LPowerstroke/') || filepath.includes('/F1503LDiesel/')) return '3.0L Powerstroke';
  if (filepath.includes('/Copperhead/')) return 'Copperhead';
  if (filepath.includes('/TC1797/')) return 'TC1797';
  if (filepath.includes('/2016FocusRS/')) return '2016 Focus RS';
  if (filepath.includes('/Mustang/')) return 'Mustang';
  if (filepath.includes('/PCMTec/')) return 'PCMTec';
  if (filepath.includes('/Random/')) return 'Random';
  if (filepath.includes('fordecoboost')) return 'Ford EcoBoost';
  return 'Standalone';
}

// Upload to S3 via forge API
async function uploadToS3(filepath, s3Key) {
  const fileBuffer = fs.readFileSync(filepath);
  const ext = path.extname(filepath).toLowerCase();
  
  // Determine content type
  const contentTypes = {
    '.a2l': 'text/plain',
    '.vst': 'application/octet-stream',
    '.h32': 'application/octet-stream',
    '.c': 'text/x-c',
    '.ati': 'application/octet-stream',
    '.vbf': 'application/octet-stream',
    '.err': 'text/plain',
    '.zip': 'application/zip',
  };
  const contentType = contentTypes[ext] || 'application/octet-stream';
  
  const url = new URL('v1/storage/upload', FORGE_API_URL + '/');
  url.searchParams.set('path', s3Key);
  
  const blob = new Blob([fileBuffer], { type: contentType });
  const form = new FormData();
  form.append('file', blob, path.basename(filepath));
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${FORGE_API_KEY}` },
    body: form,
  });
  
  if (!response.ok) {
    const msg = await response.text().catch(() => response.statusText);
    throw new Error(`S3 upload failed (${response.status}): ${msg}`);
  }
  
  const result = await response.json();
  return result.url;
}

async function main() {
  // Connect to DB
  const conn = await createConnection(DATABASE_URL);
  console.log('Connected to database');
  
  // Check existing files to avoid duplicates
  const [existing] = await conn.execute('SELECT filename FROM knox_files');
  const existingSet = new Set(existing.map(r => r.filename));
  console.log(`${existingSet.size} files already in knox_files`);
  
  let uploaded = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const item of analysisResults) {
    const { filename, path: filepath, file_type, size_bytes, size_mb, platform } = item;
    
    // Skip if already exists
    if (existingSet.has(filename)) {
      console.log(`  SKIP (exists): ${filename}`);
      skipped++;
      continue;
    }
    
    // Skip archive files (nested zips)
    if (file_type === 'archive') {
      console.log(`  SKIP (archive): ${filename}`);
      skipped++;
      continue;
    }
    
    // Generate S3 key
    const collection = getSourceCollection(filepath);
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const s3Key = `knox-ecu-files/${collection.replace(/\s+/g, '_')}/${filename}-${randomSuffix}`;
    
    try {
      console.log(`  Uploading ${filename} (${size_mb} MB) to S3...`);
      const s3Url = await uploadToS3(filepath, s3Key);
      
      // Build analysis JSON (memory segments, subsystems, etc.)
      const analysisJson = {};
      if (item.parameters) analysisJson.parameters = item.parameters;
      if (item.memory_segments) analysisJson.memory_segments = item.memory_segments;
      if (item.subsystems_sample) analysisJson.subsystems_sample = item.subsystems_sample;
      if (item.subsystem_count) analysisJson.subsystem_count = item.subsystem_count;
      if (item.format) analysisJson.format = item.format;
      if (item.config) analysisJson.config = item.config;
      if (item.software_modules_sample) analysisJson.software_modules_sample = item.software_modules_sample;
      if (item.total_lines) analysisJson.total_lines = item.total_lines;
      if (item.module_count) analysisJson.module_count = item.module_count;
      if (item.sw_part_number) analysisJson.sw_part_number = item.sw_part_number;
      if (item.sw_part_type) analysisJson.sw_part_type = item.sw_part_type;
      if (item.ecu_address) analysisJson.ecu_address = item.ecu_address;
      
      // Insert into DB
      await conn.execute(
        `INSERT INTO knox_files 
         (filename, fileType, sizeMb, sizeBytes, s3Key, s3Url, platform, ecuId, projectId, projectName, version, epk, cpuType, totalCalibratables, totalMeasurements, totalFunctions, analysisJson, sourceCollection)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          filename,
          file_type,
          size_mb,
          size_bytes,
          s3Key,
          s3Url,
          platform,
          item.ecu || null,
          item.project_id || null,
          item.project_name || null,
          item.version || null,
          item.epk || null,
          item.cpu_type || null,
          item.total_calibratables || 0,
          item.total_measurements || 0,
          item.total_functions || 0,
          JSON.stringify(analysisJson),
          collection,
        ]
      );
      
      uploaded++;
      console.log(`  ✓ ${filename} → ${collection} (${item.total_calibratables || 0} cals, ${item.total_measurements || 0} meas)`);
      
    } catch (err) {
      errors++;
      console.error(`  ✗ FAILED ${filename}: ${err.message}`);
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`INGESTION COMPLETE`);
  console.log(`  Uploaded: ${uploaded}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Errors:   ${errors}`);
  console.log(`  Total:    ${analysisResults.length}`);
  
  // Verify
  const [count] = await conn.execute('SELECT COUNT(*) as cnt FROM knox_files');
  console.log(`\nKnox files in DB: ${count[0].cnt}`);
  
  // Platform summary
  const [platforms] = await conn.execute('SELECT platform, COUNT(*) as cnt FROM knox_files GROUP BY platform ORDER BY cnt DESC');
  console.log('\nPlatform breakdown:');
  for (const p of platforms) {
    console.log(`  ${p.platform}: ${p.cnt}`);
  }
  
  await conn.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
