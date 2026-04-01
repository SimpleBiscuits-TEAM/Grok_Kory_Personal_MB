import { readFileSync } from 'fs';

// Use tsx to import the parser
const { parseWP8, getHondaTalonKeyChannels } = await import('./client/src/lib/wp8Parser.ts');
const { calculateFuelFlow, estimateHP, calculateTorque, FUEL_PROFILES, INJECTOR_FLOW_RATES } = await import('./client/src/lib/talonVirtualDyno.ts');

const buf = readFileSync('./test_data.wp8');
const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const result = parseWP8(arrayBuf);
const keys = getHondaTalonKeyChannels(result);

const rpmIdx = keys.engineSpeed;
const tpsIdx = keys.throttlePosition;
const injFinalIdx = keys.injPwFinal;
const afr1Idx = keys.afr1;

// Analyze the second WOT run (rows 959-2902) which is the longest
console.log('=== RPM Profile in WOT Run 2 (rows 959-2902) ===');
console.log('Looking for individual acceleration pulls...\n');

// Sample every 10th row to see the RPM pattern
const startRow = 959;
const endRow = 2902;

let prevRPM = 0;
let ascending = false;
let pullStart = -1;
let pulls = [];

for (let i = startRow; i <= endRow; i++) {
  const rpm = result.rows[i].values[rpmIdx];
  const tps = result.rows[i].values[tpsIdx];
  
  if (i === startRow) {
    prevRPM = rpm;
    continue;
  }
  
  const rpmDelta = rpm - prevRPM;
  
  // Detect start of an acceleration pull (RPM increasing consistently)
  if (!ascending && rpmDelta > 50) {
    ascending = true;
    pullStart = i;
  }
  
  // Detect end of pull (RPM drops significantly or stops increasing)
  if (ascending && (rpmDelta < -200 || rpm < prevRPM - 300)) {
    if (pullStart >= 0) {
      const pullEnd = i - 1;
      const duration = (pullEnd - pullStart) / 20; // 20Hz
      const startRPM = result.rows[pullStart].values[rpmIdx];
      const endRPM = result.rows[pullEnd].values[rpmIdx];
      const rpmRange = endRPM - startRPM;
      
      if (duration >= 1.0 && rpmRange > 500) {
        pulls.push({ start: pullStart, end: pullEnd, duration, startRPM, endRPM, rpmRange });
      }
    }
    ascending = false;
    pullStart = -1;
  }
  
  prevRPM = rpm;
}

console.log(`Found ${pulls.length} acceleration pulls:\n`);

const fuel = FUEL_PROFILES.pump;
const injFlowRate = INJECTOR_FLOW_RATES.id1050;

for (const pull of pulls) {
  console.log(`Pull: rows ${pull.start}-${pull.end}, ${pull.duration.toFixed(1)}s, RPM ${pull.startRPM.toFixed(0)}-${pull.endRPM.toFixed(0)} (range: ${pull.rpmRange.toFixed(0)})`);
  
  // Calculate HP at peak RPM
  let maxHP = 0;
  let maxTorque = 0;
  let peakRPM = 0;
  let peakTorqueRPM = 0;
  
  for (let i = pull.start; i <= pull.end; i++) {
    const rpm = result.rows[i].values[rpmIdx];
    const injPW = result.rows[i].values[injFinalIdx];
    const afr = afr1Idx >= 0 ? result.rows[i].values[afr1Idx] : 14.7;
    const lambda = afr / 14.7;
    const targetLambda = 0.85;
    
    // Apply AFR correction
    const correctedPW = injPW * (lambda / targetLambda);
    
    const fuelFlow = calculateFuelFlow(correctedPW, rpm, injFlowRate, fuel.density);
    const hp = estimateHP(fuelFlow, fuel.bsfc);
    const torque = calculateTorque(hp, rpm);
    
    if (hp > maxHP) { maxHP = hp; peakRPM = rpm; }
    if (torque > maxTorque) { maxTorque = torque; peakTorqueRPM = rpm; }
  }
  
  console.log(`  Peak HP: ${maxHP.toFixed(1)} @ ${peakRPM.toFixed(0)} RPM`);
  console.log(`  Peak Torque: ${maxTorque.toFixed(1)} ft-lb @ ${peakTorqueRPM.toFixed(0)} RPM`);
  console.log('');
}

// Also print RPM every 50 samples to see the pattern
console.log('\n=== RPM Pattern (every 50 samples) ===');
for (let i = startRow; i <= endRow; i += 50) {
  const rpm = result.rows[i].values[rpmIdx];
  const tps = result.rows[i].values[tpsIdx];
  const injPW = result.rows[i].values[injFinalIdx];
  console.log(`  [${i}] RPM=${rpm.toFixed(0)} TPS=${tps.toFixed(1)}° InjFinal=${injPW.toFixed(3)}ms`);
}
