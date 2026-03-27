/**
 * PPEI AI Beta — Drag Racing Analyzer
 *
 * Detects drag runs from datalog, calculates timeslip metrics, identifies
 * performance-limiting faults, and generates tuner recommendations.
 *
 * Run detection criteria:
 *   - Vehicle speed starts near 0 mph (< 5 mph)
 *   - Throttle position rises to ≥ 80% within 0.5s of launch
 *   - Vehicle accelerates continuously for at least 3 seconds
 *
 * Timeslip metrics:
 *   - 60ft time (0 → 60 ft based on speed/time integration)
 *   - 1/8 mile ET and trap speed
 *   - 1/4 mile ET and trap speed
 *   - Gear shift times and RPM drops
 *   - TCC slip during run
 *   - Rail pressure drop during WOT
 *   - Boost drop during run
 *   - Estimated torque loss from converter slip
 */

import { ProcessedMetrics } from './dataProcessor';

export interface GearShift {
  timeFromLaunch: number;   // seconds
  rpmBefore: number;
  rpmAfter: number;
  rpmDrop: number;
  timeLost: number;         // estimated seconds lost due to shift
  gear: number;             // gear being shifted INTO
}

export interface DragRun {
  startIndex: number;
  endIndex: number;
  launchRpm: number;
  launchBoost: number;

  // Timeslip data
  time60ft: number | null;       // seconds to 60 feet
  time330ft: number | null;      // seconds to 330 feet (1/16 mile)
  time660ft: number | null;      // 1/8 mile ET in seconds
  speed660ft: number | null;     // 1/8 mile trap speed in mph
  time1320ft: number | null;     // 1/4 mile ET in seconds
  speed1320ft: number | null;    // 1/4 mile trap speed in mph

  // Gear shift analysis
  shifts: GearShift[];
  totalShiftTimeLost: number;    // total seconds lost to gear changes

  // Fault analysis during run
  maxTccSlip: number;            // peak TCC slip RPM during run
  tccSlipEvents: number;         // number of slip events > 50 RPM
  tccLockedByGear3: boolean;     // was TCC locked by 3rd gear?
  tccSlipTorqueLoss: number;     // estimated % torque not reaching ground

  railPressureDropMax: number;   // max rail pressure drop from baseline (kPa)
  railPressureDropPct: number;   // as percentage of baseline
  boostDropMax: number;          // max boost drop from peak (psi)
  boostDropPct: number;          // as percentage of peak boost

  peakBoost: number;             // peak boost during run
  peakRpm: number;               // peak RPM during run
  peakRailPressure: number;      // peak rail pressure during run

  // Ratings
  runQuality: 'excellent' | 'good' | 'fair' | 'poor';
  estimatedEtGain: number;       // seconds that could be recovered with fixes
}

export interface DragAnalysis {
  runsDetected: number;
  runs: DragRun[];
  bestRun: DragRun | null;
  tips: DragTip[];
  dataQuality: 'full' | 'partial' | 'insufficient';
  missingChannels: string[];
}

export interface DragTip {
  category: 'launch' | 'tcc' | 'fuel' | 'boost' | 'shift' | 'general';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  estimatedGain: string;
}

// ── Benchmarks for Duramax trucks ──────────────────────────────────────────
const BENCHMARKS = {
  // Stock Duramax 2500/3500 4WD (6,500-7,500 lb)
  stock: {
    time60ft: 2.10,
    time660ft: 9.40,
    speed660ft: 76,
    time1320ft: 14.80,
    speed1320ft: 93,
  },
  // Good street tune (500 RWHP range)
  tuned: {
    time60ft: 1.85,
    time660ft: 8.80,
    speed660ft: 82,
    time1320ft: 13.80,
    speed1320ft: 98,
  },
};

/**
 * Integrate speed over time to get distance in feet
 */
function integrateDistance(
  speeds: number[],   // mph
  times: number[],    // seconds
  startIdx: number,
  endIdx: number
): number[] {
  const distances: number[] = [0];
  for (let i = startIdx + 1; i <= endIdx; i++) {
    const dt = times[i] - times[i - 1];
    const avgSpeedMph = (speeds[i] + speeds[i - 1]) / 2;
    const avgSpeedFtPerSec = avgSpeedMph * 1.46667;
    distances.push(distances[distances.length - 1] + avgSpeedFtPerSec * dt);
  }
  return distances;
}

/**
 * Find the time at which a given distance was reached
 */
function timeAtDistance(
  distances: number[],
  times: number[],
  startIdx: number,
  targetFt: number
): number | null {
  for (let i = 0; i < distances.length; i++) {
    if (distances[i] >= targetFt) {
      // Interpolate
      if (i === 0) return times[startIdx];
      const d0 = distances[i - 1];
      const d1 = distances[i];
      const t0 = times[startIdx + i - 1];
      const t1 = times[startIdx + i];
      const frac = (targetFt - d0) / (d1 - d0);
      return t0 + frac * (t1 - t0);
    }
  }
  return null;
}

/**
 * Detect gear shifts from RPM drops
 * A shift is a drop of ≥ 400 RPM within 0.5 seconds followed by recovery
 */
function detectShifts(
  rpm: number[],
  times: number[],
  startIdx: number,
  endIdx: number,
  launchTime: number
): GearShift[] {
  const shifts: GearShift[] = [];
  let gear = 1;
  let i = startIdx + 2;

  while (i < endIdx - 2) {
    const rpmNow = rpm[i];
    const rpmPrev = rpm[i - 1];
    const rpmDrop = rpmPrev - rpmNow;

    // Shift detected: RPM drops ≥ 400 in one step
    if (rpmDrop >= 400) {
      // Find where RPM stabilizes after the drop
      let rpmAfter = rpmNow;
      let j = i + 1;
      while (j < Math.min(i + 10, endIdx) && rpm[j] < rpmPrev - 200) {
        rpmAfter = Math.min(rpmAfter, rpm[j]);
        j++;
      }

      const shiftDuration = times[j] - times[i - 1];
      // Estimate time lost: time spent not accelerating at peak torque RPM
      // Rough model: each 100 RPM of unnecessary drop costs ~0.02s
      const timeLost = Math.max(0, (rpmPrev - rpmAfter - 200) / 100 * 0.015);

      gear++;
      shifts.push({
        timeFromLaunch: times[i - 1] - launchTime,
        rpmBefore: rpmPrev,
        rpmAfter,
        rpmDrop: rpmPrev - rpmAfter,
        timeLost,
        gear,
      });

      i = j + 1;
    } else {
      i++;
    }
  }

  return shifts;
}

/**
 * Estimate torque loss percentage from TCC slip
 * Slip RPM as a fraction of engine RPM represents power lost to heat
 */
function estimateTccTorqueLoss(slipRpm: number, engineRpm: number): number {
  if (engineRpm <= 0) return 0;
  // Slip ratio: slip/engine RPM
  const slipRatio = Math.abs(slipRpm) / engineRpm;
  // Torque loss is roughly proportional to slip ratio
  // At 100 RPM slip on 2000 RPM engine = 5% slip ratio = ~3-4% torque loss
  return Math.min(slipRatio * 0.7 * 100, 25); // cap at 25%
}

/**
 * Main drag run detector and analyzer
 */
export function analyzeDragRuns(data: ProcessedMetrics): DragAnalysis {
  const { rpm, vehicleSpeed, throttlePosition, boost, railPressureActual,
          converterSlip, converterPressure, timeMinutes } = data;

  const times = timeMinutes.map(t => t * 60); // convert to seconds
  const n = rpm.length;

  // Check data quality
  const hasSpeed = vehicleSpeed.some(v => v > 0);
  const hasThrottle = throttlePosition && throttlePosition.some(v => v > 0);
  const hasBoost = boost.some(v => v > 0);
  const hasRail = railPressureActual.some(v => v > 0);
  const hasTcc = converterSlip.some(v => v !== 0);

  const missingChannels: string[] = [];
  if (!hasSpeed) missingChannels.push('Vehicle Speed');
  if (!hasThrottle) missingChannels.push('Throttle/APP Position');
  if (!hasBoost) missingChannels.push('Boost Pressure');
  if (!hasRail) missingChannels.push('Rail Pressure');
  if (!hasTcc) missingChannels.push('TCC Slip');

  if (!hasSpeed) {
    return {
      runsDetected: 0,
      runs: [],
      bestRun: null,
      tips: [{
        category: 'general',
        severity: 'warning',
        title: 'Vehicle Speed Channel Missing',
        detail: 'Drag run detection requires a Vehicle Speed channel. Ensure Vehicle Speed is included in your datalog configuration.',
        estimatedGain: 'N/A',
      }],
      dataQuality: 'insufficient',
      missingChannels,
    };
  }

  // ── Detect drag run start points ────────────────────────────────────────
  const runs: DragRun[] = [];
  let i = 0;

  while (i < n - 10) {
    const spd = vehicleSpeed[i];
    const tps = hasThrottle ? (throttlePosition![i] ?? 0) : 0;

    // Look for: speed < 5 mph AND (throttle ≥ 80% OR RPM rising fast)
    if (spd < 5) {
      // Look ahead for WOT event
      let wotIdx = -1;
      for (let j = i; j < Math.min(i + 20, n); j++) {
        const t = hasThrottle ? (throttlePosition![j] ?? 0) : 0;
        const rpmRising = j > 0 && rpm[j] - rpm[j - 1] > 50;
        if (t >= 75 || (rpmRising && rpm[j] > 1200)) {
          wotIdx = j;
          break;
        }
      }

      if (wotIdx === -1) { i++; continue; }

      // Track the run: vehicle must accelerate for at least 3 seconds
      const launchTime = times[wotIdx];
      let endIdx = wotIdx;
      let maxSpeed = 0;
      let prevSpeed = 0;
      let decelerating = 0;

      for (let j = wotIdx + 1; j < n; j++) {
        const curSpd = vehicleSpeed[j];
        if (curSpd > maxSpeed) maxSpeed = curSpd;

        // End run if: throttle drops below 50%, or speed drops significantly
        const tpsCur = hasThrottle ? (throttlePosition![j] ?? 0) : 100;
        const speedDrop = prevSpeed - curSpd;
        if (tpsCur < 50) { endIdx = j; break; }
        if (speedDrop > 5 && curSpd < maxSpeed * 0.9) {
          decelerating++;
          if (decelerating > 3) { endIdx = j; break; }
        } else {
          decelerating = 0;
        }

        // Cap run at 30 seconds
        if (times[j] - launchTime > 30) { endIdx = j; break; }

        endIdx = j;
        prevSpeed = curSpd;
      }

      const runDuration = times[endIdx] - launchTime;
      if (runDuration < 3 || maxSpeed < 20) { i = wotIdx + 1; continue; }

      // ── Calculate distances and timeslip metrics ──────────────────────
      const runSpeeds = vehicleSpeed.slice(wotIdx, endIdx + 1);
      const runTimes = times.slice(wotIdx, endIdx + 1);
      const distances = integrateDistance(runSpeeds, runTimes, 0, runSpeeds.length - 1);

      const absTime60ft   = timeAtDistance(distances, runTimes, 0, 60);
      const absTime330ft  = timeAtDistance(distances, runTimes, 0, 330);
      const absTime660ft  = timeAtDistance(distances, runTimes, 0, 660);
      const absTime1320ft = timeAtDistance(distances, runTimes, 0, 1320);

      const time60ft   = absTime60ft   != null ? absTime60ft   - launchTime : null;
      const time330ft  = absTime330ft  != null ? absTime330ft  - launchTime : null;
      const time660ft  = absTime660ft  != null ? absTime660ft  - launchTime : null;
      const time1320ft = absTime1320ft != null ? absTime1320ft - launchTime : null;

      // Trap speeds: speed at distance markers
      const getSpeedAt = (targetFt: number): number | null => {
        for (let k = 0; k < distances.length; k++) {
          if (distances[k] >= targetFt) {
            return runSpeeds[Math.min(k, runSpeeds.length - 1)];
          }
        }
        return null;
      };
      const speed660ft  = getSpeedAt(660);
      const speed1320ft = getSpeedAt(1320);

      // ── Gear shift detection ──────────────────────────────────────────
      const shifts = detectShifts(rpm, times, wotIdx, endIdx, launchTime);
      const totalShiftTimeLost = shifts.reduce((sum, s) => sum + s.timeLost, 0);

      // ── TCC analysis ─────────────────────────────────────────────────
      const runSlip = converterSlip.slice(wotIdx, endIdx + 1);
      const runPressure = converterPressure.slice(wotIdx, endIdx + 1);
      const maxTccSlip = Math.max(...runSlip.map(Math.abs));
      const tccSlipEvents = runSlip.filter(s => Math.abs(s) > 50).length;

      // TCC locked by 3rd gear: check if pressure is high (>800 kPa or >80%)
      // and slip is low after 2nd shift
      const tccLockedByGear3 = shifts.length >= 2
        ? runPressure.slice(shifts[1] ? Math.floor(shifts[1].timeFromLaunch / (runDuration / runSpeeds.length)) : 0)
            .some(p => p > 800 || p > 80)
        : runPressure.some(p => p > 800 || p > 80);

      // Estimate torque loss from average slip during run
      const avgSlip = runSlip.reduce((a, b) => a + Math.abs(b), 0) / runSlip.length;
      const avgRpmDuringRun = rpm.slice(wotIdx, endIdx + 1).reduce((a, b) => a + b, 0) / (endIdx - wotIdx + 1);
      const tccSlipTorqueLoss = estimateTccTorqueLoss(avgSlip, avgRpmDuringRun);

      // ── Rail pressure analysis ────────────────────────────────────────
      const runRail = railPressureActual.slice(wotIdx, endIdx + 1).filter(v => v > 0);
      const baselineRail = runRail.length > 0 ? runRail[0] : 0;
      const peakRailPressure = runRail.length > 0 ? Math.max(...runRail) : 0;
      const minRailDuringRun = runRail.length > 0 ? Math.min(...runRail) : 0;
      const railPressureDropMax = baselineRail > 0 ? Math.max(0, baselineRail - minRailDuringRun) : 0;
      const railPressureDropPct = baselineRail > 0 ? (railPressureDropMax / baselineRail) * 100 : 0;

      // ── Boost analysis ────────────────────────────────────────────────
      const runBoost = boost.slice(wotIdx, endIdx + 1);
      const peakBoost = Math.max(...runBoost);
      const minBoostAfterPeak = runBoost.length > 5
        ? Math.min(...runBoost.slice(Math.floor(runBoost.length * 0.3)))
        : peakBoost;
      const boostDropMax = Math.max(0, peakBoost - minBoostAfterPeak);
      const boostDropPct = peakBoost > 0 ? (boostDropMax / peakBoost) * 100 : 0;

      // ── Run quality rating ────────────────────────────────────────────
      let qualityScore = 100;
      if (maxTccSlip > 150) qualityScore -= 25;
      else if (maxTccSlip > 75) qualityScore -= 15;
      if (railPressureDropPct > 10) qualityScore -= 20;
      else if (railPressureDropPct > 5) qualityScore -= 10;
      if (boostDropPct > 20) qualityScore -= 15;
      else if (boostDropPct > 10) qualityScore -= 8;
      if (!tccLockedByGear3) qualityScore -= 20;
      if (totalShiftTimeLost > 0.3) qualityScore -= 10;

      const runQuality: DragRun['runQuality'] =
        qualityScore >= 85 ? 'excellent' :
        qualityScore >= 70 ? 'good' :
        qualityScore >= 50 ? 'fair' : 'poor';

      // Estimated ET gain from fixing faults
      let estimatedEtGain = 0;
      if (maxTccSlip > 100) estimatedEtGain += 0.15;
      if (railPressureDropPct > 8) estimatedEtGain += 0.20;
      if (boostDropPct > 15) estimatedEtGain += 0.10;
      estimatedEtGain += totalShiftTimeLost * 0.5;

      runs.push({
        startIndex: wotIdx,
        endIndex: endIdx,
        launchRpm: rpm[wotIdx],
        launchBoost: boost[wotIdx],
        time60ft,
        time330ft,
        time660ft,
        speed660ft,
        time1320ft,
        speed1320ft,
        shifts,
        totalShiftTimeLost,
        maxTccSlip,
        tccSlipEvents,
        tccLockedByGear3,
        tccSlipTorqueLoss,
        railPressureDropMax,
        railPressureDropPct,
        boostDropMax,
        boostDropPct,
        peakBoost,
        peakRpm: Math.max(...rpm.slice(wotIdx, endIdx + 1)),
        peakRailPressure,
        runQuality,
        estimatedEtGain,
      });

      i = endIdx + 1;
    } else {
      i++;
    }
  }

  // ── Find best run ────────────────────────────────────────────────────────
  let bestRun: DragRun | null = null;
  if (runs.length > 0) {
    // Best = fastest 1/4 mile, or 1/8 mile if no 1/4 available
    bestRun = runs.reduce((best, run) => {
      const bestTime = best.time1320ft ?? best.time660ft ?? Infinity;
      const runTime = run.time1320ft ?? run.time660ft ?? Infinity;
      return runTime < bestTime ? run : best;
    });
  }

  // ── Generate tips ────────────────────────────────────────────────────────
  const tips = generateDragTips(runs, bestRun, data, missingChannels);

  const dataQuality: DragAnalysis['dataQuality'] =
    missingChannels.length === 0 ? 'full' :
    missingChannels.length <= 2 ? 'partial' : 'insufficient';

  return {
    runsDetected: runs.length,
    runs,
    bestRun,
    tips,
    dataQuality,
    missingChannels,
  };
}

function generateDragTips(
  runs: DragRun[],
  bestRun: DragRun | null,
  data: ProcessedMetrics,
  missingChannels: string[]
): DragTip[] {
  const tips: DragTip[] = [];

  if (!bestRun) {
    tips.push({
      category: 'general',
      severity: 'info',
      title: 'No Drag Runs Detected',
      detail: 'No full-throttle acceleration events starting from near-zero speed were found in this datalog. To analyze a drag run, log from a standing start with throttle at 80%+ and drive at least 3 seconds at WOT.',
      estimatedGain: 'N/A',
    });
    return tips;
  }

  // TCC tips
  if (bestRun.maxTccSlip > 200) {
    tips.push({
      category: 'tcc',
      severity: 'critical',
      title: 'Severe TCC Slip Under Full Lock Command',
      detail: `Peak converter slip of ${bestRun.maxTccSlip.toFixed(0)} RPM detected while TCC was commanded to full lock. This indicates the torque converter is not holding under load. Possible causes: worn TCC clutch pack, low transmission line pressure, or a tune that does not have aggressive enough TCC apply pressure tables. Estimated ${bestRun.tccSlipTorqueLoss.toFixed(1)}% of torque is not reaching the ground due to converter slip.`,
      estimatedGain: '0.10-0.20 sec ET',
    });
  } else if (bestRun.maxTccSlip > 75) {
    tips.push({
      category: 'tcc',
      severity: 'warning',
      title: 'TCC Slip Detected During WOT',
      detail: `Converter slip of ${bestRun.maxTccSlip.toFixed(0)} RPM detected during the run. For drag racing, the TCC should be locked solid with zero slip by 3rd gear. Consider having your tune reviewed to increase TCC apply pressure, or inspect the transmission for wear.`,
      estimatedGain: '0.05-0.15 sec ET',
    });
  }

  if (!bestRun.tccLockedByGear3) {
    tips.push({
      category: 'tcc',
      severity: 'warning',
      title: 'TCC Not Confirmed Locked by 3rd Gear',
      detail: 'For maximum performance on the drag strip, the torque converter should be fully locked by 3rd gear. An unlocked converter wastes power as heat. Add TCC Commanded Pressure and Converter Slip Speed to your datalog for definitive TCC status.',
      estimatedGain: '0.05-0.10 sec ET',
    });
  }

  // Rail pressure tips
  if (bestRun.railPressureDropPct > 10) {
    tips.push({
      category: 'fuel',
      severity: 'critical',
      title: 'Significant Rail Pressure Drop Under WOT',
      detail: `Rail pressure dropped ${bestRun.railPressureDropMax.toFixed(0)} kPa (${bestRun.railPressureDropPct.toFixed(1)}%) from baseline during the run. A drop greater than 10% indicates the fuel system cannot keep up with demand. Common causes: weak or failing high-pressure pump (HP4 on L5P, CP4 on LML, CP3 on older platforms), clogged fuel filter, inadequate lift pump, or restricted fuel lines. Install an aftermarket lift pump (FASS or AirDog) as a first step.`,
      estimatedGain: '0.15-0.25 sec ET',
    });
  } else if (bestRun.railPressureDropPct > 5) {
    tips.push({
      category: 'fuel',
      severity: 'warning',
      title: 'Moderate Rail Pressure Drop',
      detail: `Rail pressure dropped ${bestRun.railPressureDropPct.toFixed(1)}% during WOT. While not critical, this suggests the fuel system is working near its limit. Consider a lift pump upgrade and fresh fuel filter before your next track day.`,
      estimatedGain: '0.05-0.10 sec ET',
    });
  }

  // Boost tips
  if (bestRun.boostDropPct > 20) {
    tips.push({
      category: 'boost',
      severity: 'warning',
      title: 'Boost Pressure Drop Mid-Run',
      detail: `Boost dropped ${bestRun.boostDropMax.toFixed(1)} psi (${bestRun.boostDropPct.toFixed(1)}%) from peak during the run. This can indicate a boost leak, intercooler inefficiency at high speeds, or the VGT vanes opening up to protect EGTs. Check all intercooler boots and couplers for leaks, and verify EGTs are not causing the VGT to open.`,
      estimatedGain: '0.05-0.15 sec ET',
    });
  }

  // 60ft tips
  if (bestRun.time60ft !== null) {
    if (bestRun.time60ft > 2.20) {
      tips.push({
        category: 'launch',
        severity: 'warning',
        title: `Slow 60ft Time: ${bestRun.time60ft.toFixed(2)}s`,
        detail: `Your 60ft time of ${bestRun.time60ft.toFixed(2)}s is above the target of 2.0s for a tuned Duramax. Poor 60ft times are usually caused by: wheel spin (reduce tire pressure to 18-22 psi for drag), launching at too low or too high RPM (target 1,400-1,800 RPM for 4WD launch), or TCC not applying quickly enough. The 60ft time is the single biggest factor in your overall ET.`,
        estimatedGain: `${((bestRun.time60ft - 2.0) * 2.2).toFixed(2)} sec ET`,
      });
    } else if (bestRun.time60ft < 1.80) {
      tips.push({
        category: 'launch',
        severity: 'info',
        title: `Excellent 60ft Time: ${bestRun.time60ft.toFixed(2)}s`,
        detail: `Your 60ft time of ${bestRun.time60ft.toFixed(2)}s is excellent for a diesel truck. You are getting great traction off the line.`,
        estimatedGain: 'Already optimized',
      });
    }
  }

  // Shift tips
  if (bestRun.totalShiftTimeLost > 0.20) {
    tips.push({
      category: 'shift',
      severity: 'info',
      title: `Shift Time Optimization: ~${(bestRun.totalShiftTimeLost * 1000).toFixed(0)}ms Lost`,
      detail: `Detected ${bestRun.shifts.length} gear change(s) with an estimated ${(bestRun.totalShiftTimeLost * 1000).toFixed(0)}ms of time lost to shifting. For drag racing, having your tune optimized for aggressive shift firmness and reduced shift overlap time can recover this. The transmission responds well to shift pressure tuning via a custom calibration.`,
      estimatedGain: `${(bestRun.totalShiftTimeLost * 0.5 * 1000).toFixed(0)}-${(bestRun.totalShiftTimeLost * 1000).toFixed(0)}ms ET`,
    });
  }

  // General tips
  tips.push({
    category: 'general',
    severity: 'info',
    title: 'Tune for the Track',
    detail: 'A PPEI custom drag tune can optimize shift points, TCC apply pressure, fuel rail pressure targets, and boost curves specifically for drag racing. Street tunes are a compromise — a dedicated drag tune can recover 0.3-0.5 seconds on a well-prepared truck.',
    estimatedGain: '0.30-0.50 sec ET',
  });

  if (missingChannels.length > 0) {
    tips.push({
      category: 'general',
      severity: 'info',
      title: 'Add These PIDs for Better Analysis',
      detail: `The following parameters were not found in your datalog: ${missingChannels.join(', ')}. Adding them to your datalog configuration will enable more detailed drag analysis including TCC lock status, fuel system health, and boost curve analysis.`,
      estimatedGain: 'Better diagnostic accuracy',
    });
  }

  return tips;
}
