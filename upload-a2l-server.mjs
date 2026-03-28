/**
 * Upload A2L/CSV definition files to S3 using the app's storage proxy.
 * This script makes HTTP requests to the running dev server's tRPC endpoint.
 * 
 * Usage: node upload-a2l-server.mjs
 */

import fs from 'fs';

const SERVER_URL = 'http://localhost:3000';

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
  const sizeMB = (fs.statSync(localPath).size / 1024 / 1024).toFixed(1);
  console.log(`Uploading ${ecuFamily}: ${fileName} (${sizeMB} MB)...`);

  const content = fs.readFileSync(localPath, 'utf-8');

  // Use tRPC batch format to call editor.storeA2L
  const body = {
    "0": {
      json: {
        fileName,
        ecuFamily,
        content,
        mapCount: 0,
        measurementCount: 0,
      }
    }
  };

  const response = await fetch(`${SERVER_URL}/api/trpc/editor.storeA2L?batch=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    console.error(`  FAILED (${response.status}): ${text.substring(0, 200)}`);
    return false;
  }

  const result = await response.json();
  if (result[0]?.result?.data?.json?.success) {
    console.log(`  OK → stored in S3`);
    return true;
  } else {
    console.error(`  FAILED:`, JSON.stringify(result[0]?.error || result[0]).substring(0, 200));
    return false;
  }
}

async function main() {
  console.log('=== A2L Library Upload via tRPC ===\n');

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
