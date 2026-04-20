/**
 * Calibration test v3: Use exact Dynojet channel names
 * "Power (uncorrected)" and "Torque (uncorrected)" — NOT "Normalized Power"
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseWP8, getHondaTalonKeyChannels } from './wp8Parser';
import {
  calculateFuelFlow,
  estimateHP,
  FUEL_PROFILES,
  INJECTOR_FLOW_RATES,
} from './talonVirtualDyno';

const REF_DIR = '/home/ubuntu/upload/JacksonRacingTurbo';
const hasRefDir = fs.existsSync(REF_DIR);

function findExactChannel(channels: Array<{name: string}>, exactName: string): number {
  return channels.findIndex(c => c.name === exactName);
}

describe.skipIf(!hasRefDir)('Turbo Talon BSFC Calibration v3 (exact channel match)', () => {
  const files = hasRefDir ? fs.readdirSync(REF_DIR).filter(f => f.endsWith('.wp8')) : [];

  it('calibrates BSFC from measured dyno power vs fuel flow', () => {
    const fuel = FUEL_PROFILES['pump'];
    const injFlow = INJECTOR_FLOW_RATES['id1050'];
    const allBsfcSamples: number[] = [];
    const bsfcByRPM: Record<string, number[]> = {};
    const filePeaks: Array<{file: string; peakHP: number; peakTorque: number; peakRPM: number; medianBSFC: number; samples: number}> = [];

    for (const file of files) {
      const filePath = path.join(REF_DIR, file);
      const buffer = fs.readFileSync(filePath);
      const wp8 = parseWP8(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      if (!wp8) continue;

      const keys = getHondaTalonKeyChannels(wp8);
      const channels = wp8.channels;

      // Use EXACT channel names for Dynojet power/torque
      let powerIdx = findExactChannel(channels, 'Power (uncorrected)');
      if (powerIdx < 0) powerIdx = findExactChannel(channels, 'Power Drum 1 (uncorrected)');
      if (powerIdx < 0) powerIdx = findExactChannel(channels, 'Horsepower');

      let torqueIdx = findExactChannel(channels, 'Torque (uncorrected)');
      if (torqueIdx < 0) torqueIdx = findExactChannel(channels, 'Torque Drum 1 (uncorrected)');

      // Honda 3-bar MAP and corrected MAP
      const honda3BarIdx = channels.findIndex(c => c.name.startsWith('Honda_3 bar MAP'));
      const correctedMapIdx = findExactChannel(channels, 'Honda_Corrected MAP');
      const stdMapIdx = keys.map;

      const rpmIdx = keys.engineSpeed;
      const tpsIdx = keys.throttlePosition;
      const ipwIdx = keys.injPwFinal >= 0 ? keys.injPwFinal : keys.injPwDesired;
      const afrIdx = keys.afr1 >= 0 ? keys.afr1 : keys.lambda1;

      if (powerIdx < 0) continue;

      let peakHP = 0, peakTorque = 0, peakRPM = 0;
      const fileBsfcSamples: number[] = [];

      for (let i = 0; i < wp8.rows.length; i++) {
        const row = wp8.rows[i];
        const rpm = rpmIdx >= 0 ? row.values[rpmIdx] : 0;
        const tps = tpsIdx >= 0 ? row.values[tpsIdx] : 0;
        const ipw = ipwIdx >= 0 ? row.values[ipwIdx] : 0;
        const realPower = powerIdx >= 0 ? row.values[powerIdx] : 0; // Don't abs() — negative = decel
        const realTorque = torqueIdx >= 0 ? row.values[torqueIdx] : 0;
        const stdMap = stdMapIdx >= 0 ? row.values[stdMapIdx] : 0;
        const h3bMap = honda3BarIdx >= 0 ? row.values[honda3BarIdx] : 0;
        const corrMap = correctedMapIdx >= 0 ? row.values[correctedMapIdx] : 0;
        const afr = afrIdx >= 0 ? row.values[afrIdx] : 0;

        if (realPower > peakHP && realPower < 500) {
          peakHP = realPower;
          peakRPM = rpm;
        }
        if (realTorque > peakTorque && realTorque < 500) {
          peakTorque = realTorque;
        }

        // BSFC calibration: only use positive power points during WOT pulls
        if (realPower > 30 && realPower < 500 && tps > 60 && rpm > 4000 && ipw > 1) {
          const fuelFlowGPerSec = calculateFuelFlow(ipw, rpm, injFlow, fuel.density);
          if (fuelFlowGPerSec > 0) {
            const fuelFlowLbPerHr = (fuelFlowGPerSec / 453.592) * 3600;
            const measuredBSFC = fuelFlowLbPerHr / realPower;
            if (measuredBSFC > 0.2 && measuredBSFC < 2.0) {
              fileBsfcSamples.push(measuredBSFC);
              allBsfcSamples.push(measuredBSFC);

              const rpmBucket = `${Math.round(rpm / 500) * 500}`;
              if (!bsfcByRPM[rpmBucket]) bsfcByRPM[rpmBucket] = [];
              bsfcByRPM[rpmBucket].push(measuredBSFC);
            }
          }
        }
      }

      const medBSFC = fileBsfcSamples.length > 0
        ? fileBsfcSamples.sort((a, b) => a - b)[Math.floor(fileBsfcSamples.length / 2)]
        : 0;

      filePeaks.push({
        file: file.substring(0, 55),
        peakHP: Math.round(peakHP * 10) / 10,
        peakTorque: Math.round(peakTorque * 10) / 10,
        peakRPM: Math.round(peakRPM),
        medianBSFC: Math.round(medBSFC * 1000) / 1000,
        samples: fileBsfcSamples.length,
      });
    }

    // Print per-file summary
    console.log('\n=== Per-File Summary ===');
    for (const f of filePeaks) {
      console.log(`${f.file} | HP=${f.peakHP} | Tq=${f.peakTorque} | RPM=${f.peakRPM} | BSFC=${f.medianBSFC} | n=${f.samples}`);
    }

    // Overall BSFC
    if (allBsfcSamples.length > 0) {
      allBsfcSamples.sort((a, b) => a - b);
      const median = allBsfcSamples[Math.floor(allBsfcSamples.length / 2)];
      const mean = allBsfcSamples.reduce((s, v) => s + v, 0) / allBsfcSamples.length;
      const p10 = allBsfcSamples[Math.floor(allBsfcSamples.length * 0.10)];
      const p25 = allBsfcSamples[Math.floor(allBsfcSamples.length * 0.25)];
      const p75 = allBsfcSamples[Math.floor(allBsfcSamples.length * 0.75)];
      const p90 = allBsfcSamples[Math.floor(allBsfcSamples.length * 0.90)];

      console.log('\n=== OVERALL BSFC (Turbo ID1050, 93oct, 21 dyno runs) ===');
      console.log(`Samples: ${allBsfcSamples.length}`);
      console.log(`Mean: ${mean.toFixed(4)}`);
      console.log(`Median: ${median.toFixed(4)}`);
      console.log(`P10: ${p10.toFixed(4)}, P25: ${p25.toFixed(4)}, P75: ${p75.toFixed(4)}, P90: ${p90.toFixed(4)}`);

      console.log('\n=== BSFC by RPM ===');
      const sortedBuckets = Object.keys(bsfcByRPM).sort((a, b) => Number(a) - Number(b));
      for (const bucket of sortedBuckets) {
        const vals = bsfcByRPM[bucket].sort((a, b) => a - b);
        const med = vals[Math.floor(vals.length / 2)];
        console.log(`  ${bucket} RPM: n=${vals.length}, median=${med.toFixed(3)}`);
      }

      console.log(`\n>>> TURBO BSFC = ${median.toFixed(4)} <<<`);
      console.log(`>>> NA BSFC = ${fuel.bsfc} <<<`);
      console.log(`>>> Ratio (turbo/NA) = ${(median / fuel.bsfc).toFixed(3)} <<<`);
    }

    expect(allBsfcSamples.length).toBeGreaterThan(0);
  });
});
