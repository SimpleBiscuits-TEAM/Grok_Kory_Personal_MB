import { readFileSync } from 'fs';
import { parseWP8 } from './client/src/lib/wp8Parser';
import { getHondaTalonKeyChannels } from './client/src/lib/wp8Parser';

const buf = readFileSync('./test_data.wp8');
const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const result = parseWP8(arrayBuf);

console.log('=== WP8 Parse Result ===');
console.log(`Channels: ${result.channels.length}`);
console.log(`Rows: ${result.rows.length}`);
console.log(`Sample Rate: ${result.sampleRate}`);
console.log(`Title: ${result.title || '(none)'}`);
console.log(`Note: ${result.note || '(none)'}`);

// Print all channel names
console.log('\n=== Channel List ===');
result.channels.forEach((ch, i) => {
  console.log(`  [${i}] ${ch.name} (${ch.unit})`);
});

// Get key channels
const keys = getHondaTalonKeyChannels(result);
console.log('\n=== Key Channel Indices ===');
console.log(JSON.stringify(keys, null, 2));

// Analyze key data
const rpmIdx = keys.engineSpeed;
const tpsIdx = keys.throttlePosition;
const injFinalIdx = keys.injPwFinal;
const injDesiredIdx = keys.injPwDesired;
const afr1Idx = keys.afr1;
const afr2Idx = keys.afr2;
const mapIdx = keys.map;
const mapCorrIdx = keys.mapCorrected;
const vssIdx = keys.vehicleSpeed;

console.log('\n=== First 20 rows of key data ===');
console.log('Row | RPM    | TPS    | InjFinal | InjDesired | AFR1   | AFR2   | MAP    | VSS');
for (let i = 0; i < Math.min(20, result.rows.length); i++) {
  const r = result.rows[i];
  const rpm = rpmIdx >= 0 ? r.values[rpmIdx] : NaN;
  const tps = tpsIdx >= 0 ? r.values[tpsIdx] : NaN;
  const injF = injFinalIdx >= 0 ? r.values[injFinalIdx] : NaN;
  const injD = injDesiredIdx >= 0 ? r.values[injDesiredIdx] : NaN;
  const afr1 = afr1Idx >= 0 ? r.values[afr1Idx] : NaN;
  const afr2 = afr2Idx >= 0 ? r.values[afr2Idx] : NaN;
  const map_ = mapIdx >= 0 ? r.values[mapIdx] : NaN;
  const vss = vssIdx >= 0 ? r.values[vssIdx] : NaN;
  console.log(`${String(i).padStart(3)} | ${rpm?.toFixed(0)?.padStart(6)} | ${tps?.toFixed(1)?.padStart(6)} | ${injF?.toFixed(3)?.padStart(8)} | ${injD?.toFixed(3)?.padStart(10)} | ${afr1?.toFixed(2)?.padStart(6)} | ${afr2?.toFixed(2)?.padStart(6)} | ${map_?.toFixed(1)?.padStart(6)} | ${vss?.toFixed(1)?.padStart(6)}`);
}

// Find max/min values
let maxRPM = 0, maxTPS = 0, maxInjF = 0, maxInjD = 0, maxAFR = 0, minAFR = 999, maxMAP = 0;
let wotSamples = 0;

for (const r of result.rows) {
  const rpm = rpmIdx >= 0 ? r.values[rpmIdx] : 0;
  const tps = tpsIdx >= 0 ? r.values[tpsIdx] : 0;
  const injF = injFinalIdx >= 0 ? r.values[injFinalIdx] : 0;
  const injD = injDesiredIdx >= 0 ? r.values[injDesiredIdx] : 0;
  const afr1 = afr1Idx >= 0 ? r.values[afr1Idx] : 0;
  const map_ = mapIdx >= 0 ? r.values[mapIdx] : 0;

  if (rpm > maxRPM) maxRPM = rpm;
  if (tps > maxTPS) maxTPS = tps;
  if (injF > maxInjF) maxInjF = injF;
  if (injD > maxInjD) maxInjD = injD;
  if (afr1 > maxAFR && afr1 < 30) maxAFR = afr1;
  if (afr1 < minAFR && afr1 > 5) minAFR = afr1;
  if (map_ > maxMAP) maxMAP = map_;
  if (tps >= 72) wotSamples++;
}

console.log('\n=== Data Ranges ===');
console.log(`Max RPM: ${maxRPM.toFixed(0)}`);
console.log(`Max TPS: ${maxTPS.toFixed(1)} degrees`);
console.log(`Max Inj PW Final: ${maxInjF.toFixed(3)} ms`);
console.log(`Max Inj PW Desired: ${maxInjD.toFixed(3)} ms`);
console.log(`AFR range: ${minAFR.toFixed(2)} - ${maxAFR.toFixed(2)}`);
console.log(`Max MAP: ${maxMAP.toFixed(1)} kPa`);
console.log(`WOT samples (TPS >= 72°): ${wotSamples} of ${result.rows.length}`);

// WOT run detection (same logic as DynoSheet)
console.log('\n=== WOT Run Detection (TPS >= 72°) ===');
let inWOT = false;
let wotStart = -1;
interface WOTRun { start: number; end: number; duration: number; }
const wotRuns: WOTRun[] = [];

for (let i = 0; i < result.rows.length; i++) {
  const tps = tpsIdx >= 0 ? result.rows[i].values[tpsIdx] : 0;
  const rpm = rpmIdx >= 0 ? result.rows[i].values[rpmIdx] : 0;

  if (tps >= 72 && rpm > 2000) {
    if (!inWOT) {
      wotStart = i;
      inWOT = true;
    }
  } else {
    if (inWOT) {
      wotRuns.push({ start: wotStart, end: i, duration: i - wotStart });
      inWOT = false;
    }
  }
}
if (inWOT) {
  wotRuns.push({ start: wotStart, end: result.rows.length, duration: result.rows.length - wotStart });
}

console.log(`Found ${wotRuns.length} WOT runs:`);
for (const run of wotRuns) {
  const startRPM = rpmIdx >= 0 ? result.rows[run.start].values[rpmIdx] : 0;
  const endRPM = rpmIdx >= 0 ? result.rows[run.end - 1].values[rpmIdx] : 0;
  const durationSec = run.duration / (result.sampleRate || 20);
  console.log(`  Run: rows ${run.start}-${run.end}, duration=${durationSec.toFixed(1)}s, RPM ${startRPM.toFixed(0)}-${endRPM.toFixed(0)}, samples=${run.duration}`);
  
  // Show some data from this run
  if (run.duration > 10) {
    console.log('    Sample data from this run:');
    const step = Math.max(1, Math.floor(run.duration / 10));
    for (let i = run.start; i < run.end; i += step) {
      const r = result.rows[i];
      const rpm = rpmIdx >= 0 ? r.values[rpmIdx] : 0;
      const tps = tpsIdx >= 0 ? r.values[tpsIdx] : 0;
      const injF = injFinalIdx >= 0 ? r.values[injFinalIdx] : 0;
      const afr1 = afr1Idx >= 0 ? r.values[afr1Idx] : 0;
      console.log(`    [${i}] RPM=${rpm.toFixed(0)} TPS=${tps.toFixed(1)}° InjFinal=${injF.toFixed(3)}ms AFR1=${afr1.toFixed(2)}`);
    }
  }
}

// Check what the DynoSheet would see
console.log('\n=== DynoSheet WOT Detection (old threshold 90%) ===');
let oldWOTCount = 0;
for (const r of result.rows) {
  const tps = tpsIdx >= 0 ? r.values[tpsIdx] : 0;
  if (tps >= 90) oldWOTCount++;
}
console.log(`Samples with TPS >= 90%: ${oldWOTCount}`);
console.log(`Samples with TPS >= 72°: ${wotSamples}`);

// Check injector duty cycle at WOT
if (wotRuns.length > 0) {
  const injDutyIdx = result.channels.findIndex(c => c.name.includes('Injector Duty Cycle'));
  console.log(`\n=== Injector Duty Cycle at WOT (channel idx: ${injDutyIdx}) ===`);
  if (injDutyIdx >= 0) {
    for (const run of wotRuns.slice(0, 3)) {
      let maxDuty = 0;
      for (let i = run.start; i < run.end; i++) {
        const duty = result.rows[i].values[injDutyIdx];
        if (duty > maxDuty) maxDuty = duty;
      }
      console.log(`  Run RPM range: max duty cycle = ${maxDuty.toFixed(1)}%`);
    }
  }
}
