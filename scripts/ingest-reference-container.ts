/**
 * CLI: read a DevProg container .bin and write `.data/ecu-container-session.json`
 * with `referenceContainer.matchParams` for agent / offline matching.
 *
 * Usage: npx tsx scripts/ingest-reference-container.ts "C:\path\to\file.bin"
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractContainerMatchParamsFromBin } from '../shared/ecuContainerMatch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function main() {
  const p = process.argv[2];
  if (!p) {
    console.error('Usage: npx tsx scripts/ingest-reference-container.ts <path-to-container.bin>');
    process.exit(1);
  }
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) {
    console.error('File not found:', abs);
    process.exit(1);
  }
  const buf = fs.readFileSync(abs);
  const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const matchParams = extractContainerMatchParamsFromBin(u8);
  const dir = path.join(root, '.data');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'ecu-container-session.json');
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(out)) {
    try {
      existing = JSON.parse(fs.readFileSync(out, 'utf-8')) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  const session = {
    ...existing,
    version: 1 as const,
    updatedAt: Date.now(),
    referenceContainer: {
      absolutePath: abs,
      fileName: path.basename(abs),
      matchParams,
      lastIngestedAt: Date.now(),
    },
  };
  fs.writeFileSync(out, JSON.stringify(session, null, 2), 'utf-8');
  console.log('Wrote', out);
  if (!matchParams) {
    console.warn('Warning: could not parse DevProg header — matchParams is null');
  } else {
    console.log('ecu_type:', matchParams.ecu_type, 'hardware_number:', matchParams.hardware_number);
    console.log('slots:', matchParams.swSlots.map((s, i) => (s ? `sw_c${i + 1}=${s}` : '')).filter(Boolean).join(', '));
  }
}

main();
