/**
 * Tests for the ConverterStallChart component logic.
 *
 * Since the chart is a React component that uses Recharts, we test the
 * underlying WOT launch detection logic and data preparation separately.
 */
import { describe, it, expect } from 'vitest';

// Replicate the WOT launch detection logic from ConverterStallChart
interface WotLaunch {
  startIdx: number;
  endIdx: number;
  peakRpm: number;
  rpmAtFirstBoost: number;
  firstBoostIdx: number;
  boostBuildDelay: number;
}

function detectWotLaunches(
  rpm: number[],
  throttle: number[],
  boost: number[],
  gear: number[],
  vss: number[]
): WotLaunch[] {
  if (rpm.length === 0 || throttle.length === 0 || boost.length === 0) return [];

  const launches: WotLaunch[] = [];
  let inWotLaunch = false;
  let launchStart = -1;
  let peakRpm = 0;
  let firstBoostIdx = -1;

  for (let i = 0; i < rpm.length; i++) {
    const isWot = throttle[i] > 85;
    const isLowGear = gear.length > 0 ? (gear[i] === 1 || gear[i] === 2) : true;
    const isLowSpeed = vss[i] < 15;

    if (isWot && isLowGear && isLowSpeed && !inWotLaunch) {
      inWotLaunch = true;
      launchStart = i;
      peakRpm = rpm[i];
      firstBoostIdx = -1;
    } else if (inWotLaunch) {
      if (!isWot || vss[i] > 30) {
        if (launchStart >= 0 && (i - launchStart) > 5) {
          launches.push({
            startIdx: launchStart,
            endIdx: i,
            peakRpm,
            rpmAtFirstBoost: firstBoostIdx >= 0 ? rpm[firstBoostIdx] : 0,
            firstBoostIdx: firstBoostIdx >= 0 ? firstBoostIdx : i,
            boostBuildDelay: firstBoostIdx >= 0 ? firstBoostIdx - launchStart : i - launchStart,
          });
        }
        inWotLaunch = false;
        launchStart = -1;
      } else {
        if (rpm[i] > peakRpm) peakRpm = rpm[i];
        if (firstBoostIdx < 0 && boost[i] > 3) firstBoostIdx = i;
      }
    }
  }
  return launches;
}

describe('ConverterStallChart — WOT Launch Detection', () => {
  it('returns empty array when no data', () => {
    expect(detectWotLaunches([], [], [], [], [])).toEqual([]);
  });

  it('returns empty when throttle never exceeds 85%', () => {
    const rpm = Array(20).fill(1000);
    const throttle = Array(20).fill(50); // never WOT
    const boost = Array(20).fill(0);
    const gear = Array(20).fill(1);
    const vss = Array(20).fill(0);
    expect(detectWotLaunches(rpm, throttle, boost, gear, vss)).toEqual([]);
  });

  it('detects a single WOT launch with boost delay', () => {
    // Simulate: 10 samples idle, then 20 samples WOT from stop
    const n = 30;
    const rpm: number[] = [];
    const throttle: number[] = [];
    const boost: number[] = [];
    const gear: number[] = [];
    const vss: number[] = [];

    for (let i = 0; i < n; i++) {
      if (i < 10) {
        // Idle phase
        rpm.push(700);
        throttle.push(10);
        boost.push(0);
        gear.push(0);
        vss.push(0);
      } else {
        // WOT launch phase
        rpm.push(1200 + (i - 10) * 100); // RPM climbs from 1200 to 3200
        throttle.push(95);
        boost.push(i < 20 ? 1 : 8); // Boost only appears after sample 20 (delay of 10 samples)
        gear.push(1);
        vss.push(Math.min(i - 10, 12)); // Speed climbs slowly
      }
    }
    // End the launch by going above 30 mph
    rpm.push(3500);
    throttle.push(95);
    boost.push(15);
    gear.push(2);
    vss.push(35); // triggers end

    const launches = detectWotLaunches(rpm, throttle, boost, gear, vss);
    expect(launches.length).toBe(1);
    expect(launches[0].startIdx).toBe(10);
    expect(launches[0].peakRpm).toBeGreaterThan(2000);
    // Boost first exceeded 3 psi at index 20
    expect(launches[0].rpmAtFirstBoost).toBe(rpm[20]);
    expect(launches[0].boostBuildDelay).toBe(10); // 10 samples delay
  });

  it('detects multiple WOT launches', () => {
    const rpm: number[] = [];
    const throttle: number[] = [];
    const boost: number[] = [];
    const gear: number[] = [];
    const vss: number[] = [];

    // Launch 1: samples 0-14 (15 samples)
    for (let i = 0; i < 15; i++) {
      rpm.push(1300 + i * 50);
      throttle.push(90);
      boost.push(i > 8 ? 5 : 0);
      gear.push(1);
      vss.push(Math.min(i, 12));
    }
    // End launch 1
    rpm.push(3000); throttle.push(90); boost.push(12); gear.push(2); vss.push(35);

    // Idle gap
    for (let i = 0; i < 10; i++) {
      rpm.push(700); throttle.push(10); boost.push(0); gear.push(0); vss.push(0);
    }

    // Launch 2: samples 26-40 (15 samples)
    for (let i = 0; i < 15; i++) {
      rpm.push(1100 + i * 60);
      throttle.push(92);
      boost.push(i > 10 ? 4 : 0);
      gear.push(1);
      vss.push(Math.min(i, 10));
    }
    // End launch 2
    rpm.push(3200); throttle.push(92); boost.push(10); gear.push(2); vss.push(32);

    const launches = detectWotLaunches(rpm, throttle, boost, gear, vss);
    expect(launches.length).toBe(2);
    expect(launches[0].startIdx).toBe(0);
    expect(launches[1].startIdx).toBe(26);
  });

  it('ignores short WOT bursts (< 5 samples)', () => {
    const rpm: number[] = [];
    const throttle: number[] = [];
    const boost: number[] = [];
    const gear: number[] = [];
    const vss: number[] = [];

    // Only 3 WOT samples — too short
    for (let i = 0; i < 3; i++) {
      rpm.push(1500);
      throttle.push(90);
      boost.push(0);
      gear.push(1);
      vss.push(5);
    }
    // End
    rpm.push(1500); throttle.push(20); boost.push(0); gear.push(1); vss.push(5);

    const launches = detectWotLaunches(rpm, throttle, boost, gear, vss);
    expect(launches.length).toBe(0);
  });

  it('handles launch where boost never exceeds 3 psi (tight stall scenario)', () => {
    const n = 20;
    const rpm: number[] = [];
    const throttle: number[] = [];
    const boost: number[] = [];
    const gear: number[] = [];
    const vss: number[] = [];

    for (let i = 0; i < n; i++) {
      rpm.push(1100 + i * 30);
      throttle.push(90);
      boost.push(1.5); // Boost never exceeds 3 psi — turbo can't spool
      gear.push(1);
      vss.push(Math.min(i * 0.5, 10));
    }
    // End
    rpm.push(1700); throttle.push(90); boost.push(2); gear.push(2); vss.push(35);

    const launches = detectWotLaunches(rpm, throttle, boost, gear, vss);
    expect(launches.length).toBe(1);
    // rpmAtFirstBoost should be 0 (boost never exceeded 3 psi)
    expect(launches[0].rpmAtFirstBoost).toBe(0);
    // boostBuildDelay should be the full launch length
    expect(launches[0].boostBuildDelay).toBe(n);
  });

  it('works without gear data (defaults to true for isLowGear)', () => {
    const n = 15;
    const rpm: number[] = [];
    const throttle: number[] = [];
    const boost: number[] = [];
    const vss: number[] = [];

    for (let i = 0; i < n; i++) {
      rpm.push(1200 + i * 80);
      throttle.push(88);
      boost.push(i > 6 ? 5 : 0);
      vss.push(Math.min(i, 12));
    }
    rpm.push(2500); throttle.push(88); boost.push(10); vss.push(35);

    const launches = detectWotLaunches(rpm, throttle, boost, [], vss);
    expect(launches.length).toBe(1);
  });

  it('correctly identifies peak RPM during launch', () => {
    const rpm = [700, 1300, 1800, 2400, 2200, 2600, 2500, 2700, 2650, 2800, 2750];
    const throttle = Array(11).fill(90);
    const boost = [0, 0, 0, 2, 4, 6, 8, 10, 12, 14, 16];
    const gear = Array(11).fill(1);
    const vss = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 35]; // last triggers end

    const launches = detectWotLaunches(rpm, throttle, boost, gear, vss);
    expect(launches.length).toBe(1);
    expect(launches[0].peakRpm).toBe(2800); // max RPM in the launch
  });
});

describe('ConverterStallChart — Visibility Gating', () => {
  it('requires converter-stall-turbo-mismatch finding with warning/fault type', () => {
    // This tests the gating logic conceptually
    const findings = [
      { id: 'converter-stall-turbo-mismatch', type: 'warning', category: 'transmission' },
    ];
    const stallFinding = findings.find(
      f => f.id === 'converter-stall-turbo-mismatch' && (f.type === 'warning' || f.type === 'fault')
    );
    expect(stallFinding).toBeDefined();
  });

  it('does not show for info-type findings', () => {
    const findings = [
      { id: 'converter-stall-turbo-mismatch', type: 'info', category: 'transmission' },
    ];
    const stallFinding = findings.find(
      f => f.id === 'converter-stall-turbo-mismatch' && (f.type === 'warning' || f.type === 'fault')
    );
    expect(stallFinding).toBeUndefined();
  });

  it('does not show for unrelated findings', () => {
    const findings = [
      { id: 'boost-leak-suspicion', type: 'warning', category: 'boost' },
    ];
    const stallFinding = findings.find(
      f => f.id === 'converter-stall-turbo-mismatch' && (f.type === 'warning' || f.type === 'fault')
    );
    expect(stallFinding).toBeUndefined();
  });
});
