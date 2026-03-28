import fs from 'fs';

const SERVER_URL = 'http://localhost:3000';
const localPath = '/home/ubuntu/ecu_files/10l1000/24048502 22  6.6L T93.a2l';
const fileName = '24048502 22  6.6L T93.a2l';
const ecuFamily = 'T93';

const content = fs.readFileSync(localPath, 'utf-8');
console.log('Uploading T93:', (content.length / 1024 / 1024).toFixed(1), 'MB...');

const body = { '0': { json: { fileName, ecuFamily, content, mapCount: 0, measurementCount: 0 } } };

const response = await fetch(`${SERVER_URL}/api/trpc/editor.storeA2L?batch=1`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

if (!response.ok) {
  const text = await response.text().catch(() => response.statusText);
  console.error(`FAILED (${response.status}):`, text.substring(0, 300));
  process.exit(1);
}

const result = await response.json();
if (result[0]?.result?.data?.json?.success) {
  console.log('OK → T93 stored in S3');
} else {
  console.error('FAILED:', JSON.stringify(result[0]?.error || result[0]).substring(0, 300));
}
