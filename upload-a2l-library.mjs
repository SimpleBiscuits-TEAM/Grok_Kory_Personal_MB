/**
 * Upload A2L/CSV definition files to S3 for the editor's auto-matching feature.
 * Run once: node upload-a2l-library.mjs
 */

import fs from 'fs';
import path from 'path';

const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL?.replace(/\/+$/, '');
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

if (!FORGE_API_URL || !FORGE_API_KEY) {
  console.error('Missing BUILT_IN_FORGE_API_URL or BUILT_IN_FORGE_API_KEY');
  process.exit(1);
}

const FILES = [
  {
    ecuFamily: 'E41',
    fileName: 'E41_a171711502_quasi.a2l',
    localPath: '/home/ubuntu/ecu_files/l5p/E41_a171711502_quasi.a2l',
  },
  {
    ecuFamily: 'MG1C',
    fileName: '1E1101953.a2l',
    localPath: '/home/ubuntu/ecu_files/canam/1E1101953.a2l',
  },
  {
    ecuFamily: 'T93',
    fileName: '24048502 22  6.6L T93.a2l',
    localPath: '/home/ubuntu/ecu_files/10l1000/24048502 22  6.6L T93.a2l',
  },
  {
    ecuFamily: 'CUMMINS',
    fileName: 'Cummins 2019 6.7L PK 68RFE 52.19.03.00 (52370931AF).csv',
    localPath: '/home/ubuntu/ecu_files/cummins/Cummins 2019 6.7L PK 68RFE 52.19.03.00 (52370931AF).csv',
  },
];

async function uploadFile(entry) {
  const { ecuFamily, fileName, localPath } = entry;
  const key = `a2l-library/${ecuFamily}/${fileName}`;

  console.log(`Uploading ${ecuFamily}: ${fileName} (${(fs.statSync(localPath).size / 1024 / 1024).toFixed(1)} MB)...`);

  const fileData = fs.readFileSync(localPath);
  const blob = new Blob([fileData], { type: 'application/octet-stream' });
  const form = new FormData();
  form.append('file', blob, fileName);

  const uploadUrl = new URL('v1/storage/upload', FORGE_API_URL + '/');
  uploadUrl.searchParams.set('path', key);

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${FORGE_API_KEY}` },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    console.error(`  FAILED (${response.status}): ${text}`);
    return false;
  }

  const result = await response.json();
  console.log(`  OK → ${result.url?.substring(0, 80)}...`);

  // Also store metadata
  const metaKey = `a2l-library/${ecuFamily}/${fileName}.meta.json`;
  const metadata = {
    fileName,
    ecuFamily,
    uploadedAt: new Date().toISOString(),
    fileSize: fs.statSync(localPath).size,
  };

  const metaBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
  const metaForm = new FormData();
  metaForm.append('file', metaBlob, `${fileName}.meta.json`);

  const metaUrl = new URL('v1/storage/upload', FORGE_API_URL + '/');
  metaUrl.searchParams.set('path', metaKey);

  await fetch(metaUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${FORGE_API_KEY}` },
    body: metaForm,
  });

  console.log(`  Metadata stored.`);
  return true;
}

async function main() {
  console.log('=== A2L Library Upload ===\n');

  let success = 0;
  let failed = 0;

  for (const entry of FILES) {
    if (!fs.existsSync(entry.localPath)) {
      console.error(`  SKIP: ${entry.localPath} not found`);
      failed++;
      continue;
    }
    const ok = await uploadFile(entry);
    if (ok) success++;
    else failed++;
  }

  console.log(`\nDone: ${success} uploaded, ${failed} failed.`);
}

main().catch(console.error);
