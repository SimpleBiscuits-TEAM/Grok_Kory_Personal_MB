/**
 * Accuracy test: Compare virtual dyno estimates vs real Dynojet readings
 * for the reference turbo Talon files.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseWP8 } from './wp8Parser';
import { computeVirtualDyno, VirtualDynoConfig } from './talonVirtualDyno';

const REF_DIR = '/home/ubuntu/upload/JacksonRacingTurbo';
const hasRefDir = fs.existsSync(REF_DIR);

function findExactChannel(channels: Array<{name: string}>, exactName: string): number {
  return channels.findIndex(c => c.name === exactName);
}

describe.skipIf(!hasRefDir)('Virtual Dyno Accuracy vs Real Dynojet', () => {
  const files = hasRefDir ? fs.readdirSync(REF_DIR).filter(f => f.endsWith('.wp8')) : [];

  it('estimates within 20% of real dyno peak HP across all reference files', () => {
    const config: VirtualDynoConfig = {
      injectorType: 'id1050',
      fuelType: 'pump',
      isTurbo: true,
      dynoCalibrationFactor: 1.0,
    };

    const results: Array<{file: string; realHP: number; estHP: number; error: number}> = [];

    for (const file of files) {
      const filePath = path.join(REF_DIR, file);
      const buffer = fs.readFileSync(filePath);
      const wp8 = parseWP8(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      if (!wp8) continue;

      // Get real dyno peak HP
      let powerIdx = findExactChannel(wp8.channels, 'Power (uncorrected)');
      if (powerIdx < 0) powerIdx = findExactChannel(wp8.channels, 'Power Drum 1 (uncorrected)');
      if (powerIdx < 0) continue;

      let realPeakHP = 0;
      for (const row of wp8.rows) {
        const v = row.values[powerIdx];
        if (v > realPeakHP && v < 500) realPeakHP = v;
      }

      // Get our virtual dyno estimate
      const result = computeVirtualDyno(wp8, config, file);
      const estHP = result.peakHP;
      const error = realPeakHP > 0 ? ((estHP - realPeakHP) / realPeakHP) * 100 : 0;

      results.push({
        file: file.substring(0, 55),
        realHP: Math.round(realPeakHP * 10) / 10,
        estHP,
        error: Math.round(error * 10) / 10,
      });
    }

    console.log('\n=== Virtual Dyno Accuracy ===');
    console.log('File | Real HP | Est HP | Error %');
    console.log('-'.repeat(90));
    for (const r of results) {
      const marker = Math.abs(r.error) > 20 ? ' ⚠️' : ' ✓';
      console.log(`${r.file} | ${r.realHP} | ${r.estHP} | ${r.error > 0 ? '+' : ''}${r.error}%${marker}`);
    }

    const errors = results.map(r => Math.abs(r.error));
    const avgError = errors.reduce((s, v) => s + v, 0) / errors.length;
    const maxError = Math.max(...errors);
    console.log(`\nAvg absolute error: ${avgError.toFixed(1)}%`);
    console.log(`Max absolute error: ${maxError.toFixed(1)}%`);

    // Most files should be within 20%
    const within20 = results.filter(r => Math.abs(r.error) <= 20).length;
    console.log(`Within 20%: ${within20}/${results.length}`);

    expect(within20).toBeGreaterThan(results.length * 0.6);
  });
});
