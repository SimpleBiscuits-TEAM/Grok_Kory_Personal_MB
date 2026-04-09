/**
 * Rank .bin containers in a directory against a VehicleScanSnapshot (from ECU scan or session file).
 *
 * Usage:
 *   npx tsx scripts/find-containers-for-ecu.ts <scanDir> [.data/ecu-container-session.json]
 *
 * Session JSON may include `lastVehicleScan` from the app (localStorage export) or only reference container.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractContainerMatchParamsFromBin,
  rankContainerBinsByScan,
  type VehicleScanSnapshotV1,
} from '../shared/ecuContainerMatch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadSnapshot(sessionPath: string): VehicleScanSnapshotV1 {
  const raw = fs.readFileSync(sessionPath, 'utf-8');
  const j = JSON.parse(raw) as { lastVehicleScan?: VehicleScanSnapshotV1 };
  if (!j.lastVehicleScan || j.lastVehicleScan.version !== 1) {
    console.error('Session file must contain lastVehicleScan (run an ECU scan in the app, or paste snapshot).');
    process.exit(1);
  }
  return j.lastVehicleScan;
}

function walkBins(dir: string): string[] {
  const out: string[] = [];
  const st = fs.statSync(dir);
  if (!st.isDirectory()) return [dir];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const s = fs.statSync(p);
    if (s.isDirectory()) out.push(...walkBins(p));
    else if (/\.bin$/i.test(name)) out.push(p);
  }
  return out;
}

function main() {
  const scanDir = process.argv[2];
  const sessionFile = process.argv[3] ?? path.join(root, '.data', 'ecu-container-session.json');
  if (!scanDir) {
    console.error('Usage: npx tsx scripts/find-containers-for-ecu.ts <directory-with-bin-files> [session.json]');
    process.exit(1);
  }
  if (!fs.existsSync(sessionFile)) {
    console.error('Session file not found:', sessionFile);
    process.exit(1);
  }
  const scan = loadSnapshot(sessionFile);
  const bins = walkBins(path.resolve(scanDir));
  const candidates: { path: string; params: NonNullable<ReturnType<typeof extractContainerMatchParamsFromBin>> }[] = [];
  for (const p of bins) {
    const buf = fs.readFileSync(p);
    const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const params = extractContainerMatchParamsFromBin(u8);
    if (params) candidates.push({ path: p, params });
  }
  const ranked = rankContainerBinsByScan(candidates, scan);
  console.log(JSON.stringify({ scan, ranked: ranked.slice(0, 20) }, null, 2));
}

main();
