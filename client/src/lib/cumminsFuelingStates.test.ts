import { describe, expect, it } from 'vitest';
import {
  CUMMINS_FUELING_STATES,
  decodeFuelingState,
  getFuelingStateName,
  getFuelingStateSeverity,
  isDerateState,
  isNormalOperation,
  getDerateStates,
  getNormalStates,
  analyzeFuelingStateTimeSeries,
  getFuelingStateTooltip,
} from './cumminsFuelingStates';

describe('Cummins Fueling Control States Database', () => {
  it('should contain at least 80 documented states', () => {
    expect(CUMMINS_FUELING_STATES.length).toBeGreaterThanOrEqual(80);
  });

  it('should have unique codes for all states', () => {
    const codes = CUMMINS_FUELING_STATES.map(s => s.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('should have all required fields for every state', () => {
    for (const state of CUMMINS_FUELING_STATES) {
      expect(state.code).toBeTypeOf('number');
      expect(state.name).toBeTypeOf('string');
      expect(state.shortName).toBeTypeOf('string');
      expect(state.description).toBeTypeOf('string');
      expect(state.description.length).toBeGreaterThan(10);
      expect(['normal', 'info', 'warning', 'derate', 'critical']).toContain(state.severity);
      expect(['core1', 'core2', 'all']).toContain(state.generation);
      expect(state.introduced).toBeTypeOf('string');
      expect(state.normalOperation).toBeTypeOf('boolean');
    }
  });
});

describe('decodeFuelingState', () => {
  it('should decode known states correctly', () => {
    const idle = decodeFuelingState(11);
    expect(idle).toBeDefined();
    expect(idle!.name).toBe('Low Speed Governor State');
    expect(idle!.severity).toBe('normal');
    expect(idle!.normalOperation).toBe(true);
  });

  it('should decode state 19 (Max Throttle / Torque Curve)', () => {
    const maxThrottle = decodeFuelingState(19);
    expect(maxThrottle).toBeDefined();
    expect(maxThrottle!.shortName).toBe('Max Throttle');
    expect(maxThrottle!.normalOperation).toBe(true);
  });

  it('should decode state 16 (AFC/OFC Derate)', () => {
    const afc = decodeFuelingState(16);
    expect(afc).toBeDefined();
    expect(afc!.name).toContain('AFC');
    expect(afc!.name).toContain('OFC');
    expect(afc!.severity).toBe('warning');
  });

  it('should decode state 91 (Inducement / DEF derate)', () => {
    const inducement = decodeFuelingState(91);
    expect(inducement).toBeDefined();
    expect(inducement!.name).toBe('Inducement');
    expect(inducement!.severity).toBe('critical');
    expect(inducement!.normalOperation).toBe(false);
    expect(inducement!.relatedFaultCodes).toBeDefined();
  });

  it('should decode state 66 (DPF Regen)', () => {
    const regen = decodeFuelingState(66);
    expect(regen).toBeDefined();
    expect(regen!.shortName).toBe('DPF Regen');
    expect(regen!.normalOperation).toBe(true);
  });

  it('should decode state 6 (Limp Home)', () => {
    const limp = decodeFuelingState(6);
    expect(limp).toBeDefined();
    expect(limp!.name).toBe('Limp Home Torque');
    expect(limp!.severity).toBe('critical');
  });

  it('should return undefined for unknown codes', () => {
    expect(decodeFuelingState(999)).toBeUndefined();
    expect(decodeFuelingState(-1)).toBeUndefined();
  });

  it('should decode special extended states (202, 256, 514)', () => {
    expect(decodeFuelingState(202)).toBeDefined();
    expect(decodeFuelingState(202)!.name).toContain('IDD');
    expect(decodeFuelingState(256)).toBeDefined();
    expect(decodeFuelingState(256)!.name).toContain('FSS Torque');
    expect(decodeFuelingState(514)).toBeDefined();
    expect(decodeFuelingState(514)!.name).toContain('EPD Fuel Temp');
  });
});

describe('getFuelingStateName', () => {
  it('should return short name for known codes', () => {
    expect(getFuelingStateName(11)).toBe('LSG / Idle');
    expect(getFuelingStateName(19)).toBe('Max Throttle');
    expect(getFuelingStateName(9)).toBe('Cruise');
    expect(getFuelingStateName(24)).toBe('Braking');
  });

  it('should return "Unknown (code)" for unknown codes', () => {
    expect(getFuelingStateName(999)).toBe('Unknown (999)');
  });
});

describe('getFuelingStateSeverity', () => {
  it('should return correct severity for known codes', () => {
    expect(getFuelingStateSeverity(11)).toBe('normal');  // Idle
    expect(getFuelingStateSeverity(16)).toBe('warning'); // AFC/OFC
    expect(getFuelingStateSeverity(46)).toBe('derate');  // Air Density Limit
    expect(getFuelingStateSeverity(6)).toBe('critical'); // Limp Home
  });

  it('should return info for unknown codes', () => {
    expect(getFuelingStateSeverity(999)).toBe('info');
  });
});

describe('isDerateState', () => {
  it('should identify derate states', () => {
    expect(isDerateState(46)).toBe(true);  // Air Density Limit
    expect(isDerateState(48)).toBe(true);  // TFC Derate
    expect(isDerateState(256)).toBe(true); // FSS Torque Derate
    expect(isDerateState(91)).toBe(true);  // Inducement (critical)
    expect(isDerateState(6)).toBe(true);   // Limp Home (critical)
  });

  it('should not flag normal states as derate', () => {
    expect(isDerateState(11)).toBe(false); // Idle
    expect(isDerateState(19)).toBe(false); // Max Throttle
    expect(isDerateState(9)).toBe(false);  // Cruise
    expect(isDerateState(8)).toBe(false);  // 4-D Governor
  });

  it('should return false for unknown codes', () => {
    expect(isDerateState(999)).toBe(false);
  });
});

describe('isNormalOperation', () => {
  it('should identify normal operation states', () => {
    expect(isNormalOperation(11)).toBe(true);  // Idle
    expect(isNormalOperation(19)).toBe(true);  // Max Throttle
    expect(isNormalOperation(9)).toBe(true);   // Cruise
    expect(isNormalOperation(8)).toBe(true);   // 4-D Governor
    expect(isNormalOperation(24)).toBe(true);  // Braking
    expect(isNormalOperation(22)).toBe(true);  // Cranking
    expect(isNormalOperation(66)).toBe(true);  // DPF Regen
  });

  it('should not flag abnormal states as normal', () => {
    expect(isNormalOperation(6)).toBe(false);   // Limp Home
    expect(isNormalOperation(91)).toBe(false);  // Inducement
    expect(isNormalOperation(46)).toBe(false);  // Air Density Limit
  });
});

describe('getDerateStates / getNormalStates', () => {
  it('should return derate states', () => {
    const derates = getDerateStates();
    expect(derates.length).toBeGreaterThan(5);
    for (const s of derates) {
      expect(['derate', 'critical']).toContain(s.severity);
    }
  });

  it('should return normal states', () => {
    const normals = getNormalStates();
    expect(normals.length).toBeGreaterThan(10);
    for (const s of normals) {
      expect(s.normalOperation).toBe(true);
    }
  });
});

describe('analyzeFuelingStateTimeSeries', () => {
  it('should analyze a typical driving time series', () => {
    // Simulate: idle(11) → accel(8) → max throttle(19) → cruise(9) → braking(24) → idle(11)
    const states = [
      ...Array(10).fill(11),  // idle
      ...Array(5).fill(8),    // 4-D governor
      ...Array(20).fill(19),  // max throttle
      ...Array(50).fill(9),   // cruise
      ...Array(5).fill(24),   // braking
      ...Array(10).fill(11),  // idle
    ];

    const analysis = analyzeFuelingStateTimeSeries(states);
    expect(analysis.totalSamples).toBe(100);
    expect(analysis.deratePercentage).toBe(0); // No derates in normal driving
    expect(analysis.derateEvents).toHaveLength(0);
    expect(analysis.stateDistribution.length).toBe(5); // 5 unique states (11, 8, 19, 9, 24)
    // Cruise should be most common
    expect(analysis.stateDistribution[0].code).toBe(9);
    expect(analysis.stateDistribution[0].count).toBe(50);
  });

  it('should detect derate events in time series', () => {
    // Simulate: idle → AFC derate → max throttle → air density derate → idle
    const states = [
      ...Array(10).fill(11),  // idle
      ...Array(15).fill(16),  // AFC derate
      ...Array(20).fill(19),  // max throttle
      ...Array(10).fill(46),  // air density limit
      ...Array(10).fill(11),  // idle
    ];

    const analysis = analyzeFuelingStateTimeSeries(states);
    expect(analysis.totalSamples).toBe(65);
    // AFC is warning not derate, so only air density counts
    // Actually AFC is severity 'warning', not 'derate', so isDerateState returns false for it
    expect(analysis.derateEvents.length).toBe(1); // Only air density limit
    expect(analysis.derateEvents[0].code).toBe(46);
    expect(analysis.derateEvents[0].duration).toBe(10);
  });

  it('should handle empty time series', () => {
    const analysis = analyzeFuelingStateTimeSeries([]);
    expect(analysis.totalSamples).toBe(0);
    expect(analysis.deratePercentage).toBe(0);
    expect(analysis.stateDistribution).toHaveLength(0);
    expect(analysis.derateEvents).toHaveLength(0);
  });

  it('should detect inducement derate (critical)', () => {
    const states = [
      ...Array(10).fill(11),  // idle
      ...Array(30).fill(91),  // inducement
      ...Array(10).fill(11),  // idle
    ];

    const analysis = analyzeFuelingStateTimeSeries(states);
    expect(analysis.derateEvents.length).toBe(1);
    expect(analysis.derateEvents[0].code).toBe(91);
    expect(analysis.derateEvents[0].name).toBe('Inducement');
    expect(analysis.deratePercentage).toBe(60); // 30/50 = 60%
  });
});

describe('getFuelingStateTooltip', () => {
  it('should return formatted tooltip for known states', () => {
    const tooltip = getFuelingStateTooltip(11);
    expect(tooltip).toContain('Low Speed Governor');
    expect(tooltip).toContain('11');
  });

  it('should return unknown tooltip for unknown codes', () => {
    const tooltip = getFuelingStateTooltip(999);
    expect(tooltip).toContain('Unknown');
    expect(tooltip).toContain('999');
  });
});

describe('Key Cummins states for RAM truck diagnostics', () => {
  it('should have state 78 (ESM Xwire) for Chrysler products', () => {
    const state = decodeFuelingState(78);
    expect(state).toBeDefined();
    expect(state!.description).toContain('Chrysler');
  });

  it('should have state 81 (Light Duty Interface) for RAM trucks', () => {
    const state = decodeFuelingState(81);
    expect(state).toBeDefined();
    expect(state!.description.toLowerCase()).toContain('light duty');
  });

  it('should have state 95 (Mobile PTO) for Chrysler vehicles', () => {
    const state = decodeFuelingState(95);
    expect(state).toBeDefined();
    expect(state!.description).toContain('Chrysler');
  });
});
