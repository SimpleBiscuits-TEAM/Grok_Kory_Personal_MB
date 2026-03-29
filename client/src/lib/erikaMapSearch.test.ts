/**
 * Tests for erikaMapSearch — Client-side RAG for A2L calibration maps
 */
import { describe, it, expect } from 'vitest';
import { buildMapSearchIndex, searchMaps, formatSearchResultsForContext } from './erikaMapSearch';
import type { CalibrationMap } from './editorEngine';

function makeMap(overrides: Partial<CalibrationMap> & { name: string }): CalibrationMap {
  return {
    description: '',
    type: 'VALUE',
    address: 0x1000,
    recordLayout: 'RL_VALUE',
    compuMethod: 'CM_IDENTICAL',
    lowerLimit: 0,
    upperLimit: 65535,
    annotations: [],
    axes: [],
    category: 'Other',
    subcategory: '',
    ...overrides,
  };
}

const testMaps: CalibrationMap[] = [
  makeMap({ name: 'KaDFIR_FuelRailPressureMax', description: 'Maximum fuel rail pressure limit', category: 'Fuel', subcategory: 'Rail Pressure', unit: 'bar' }),
  makeMap({ name: 'KaVGT_BoostTarget', description: 'Target boost pressure map', category: 'Turbo', subcategory: 'VGT Control', type: 'MAP', unit: 'kPa' }),
  makeMap({ name: 'KaTQE_TorqueRequest', description: 'Driver torque request table', category: 'Torque', subcategory: 'Request', type: 'MAP' }),
  makeMap({ name: 'KaEGR_FlowRate', description: 'EGR valve flow rate target', category: 'Emissions', subcategory: 'EGR', type: 'CURVE' }),
  makeMap({ name: 'KaDPF_RegenSootThreshold', description: 'DPF regeneration soot load threshold', category: 'Emissions', subcategory: 'DPF', type: 'VALUE' }),
  makeMap({ name: 'KaTCC_LockupPressure', description: 'Torque converter clutch lockup pressure', category: 'Transmission', subcategory: 'TCC', type: 'MAP' }),
  makeMap({ name: 'KaIGN_TimingAdvance', description: 'Ignition timing advance map', category: 'Ignition', subcategory: 'Timing', type: 'MAP' }),
  makeMap({ name: 'KaIDL_IdleSpeed', description: 'Idle speed target RPM', category: 'Idle', subcategory: 'Speed', type: 'CURVE' }),
  makeMap({ name: 'KaLAM_LambdaTarget', description: 'Lambda target for stoichiometric control', category: 'Fuel', subcategory: 'Lambda', type: 'MAP' }),
  makeMap({ name: 'KaSEC_SeedKeyAlgorithm', description: 'Security access seed key algorithm', category: 'Security', subcategory: 'Access', type: 'VALUE' }),
  makeMap({ name: 'KaCAN_MessageFilter', description: 'CAN bus message filter configuration', category: 'Communication', subcategory: 'CAN', type: 'VALUE' }),
  makeMap({ name: 'KaOIL_TempWarning', description: 'Oil temperature warning threshold', category: 'Engine', subcategory: 'Oil', type: 'VALUE', unit: 'degC' }),
];

describe('buildMapSearchIndex', () => {
  it('should create an index with correct entry count', () => {
    const index = buildMapSearchIndex(testMaps);
    expect(index.entries.length).toBe(testMaps.length);
    expect(index.totalDocs).toBe(testMaps.length);
  });

  it('should populate IDF values', () => {
    const index = buildMapSearchIndex(testMaps);
    expect(index.idf.size).toBeGreaterThan(0);
  });

  it('should handle empty maps array', () => {
    const index = buildMapSearchIndex([]);
    expect(index.entries.length).toBe(0);
    expect(index.totalDocs).toBe(0);
  });

  it('should handle single map', () => {
    const index = buildMapSearchIndex([testMaps[0]]);
    expect(index.entries.length).toBe(1);
    expect(index.totalDocs).toBe(1);
  });
});

describe('searchMaps', () => {
  const index = buildMapSearchIndex(testMaps);

  it('should find fuel-related maps when searching "fuel"', () => {
    const results = searchMaps(index, 'fuel rail pressure', testMaps);
    expect(results.length).toBeGreaterThan(0);
    // The fuel rail pressure map should be the top result
    expect(results[0].map.name).toBe('KaDFIR_FuelRailPressureMax');
  });

  it('should find boost-related maps when searching "boost"', () => {
    const results = searchMaps(index, 'boost target', testMaps);
    expect(results.length).toBeGreaterThan(0);
    // VGT boost target should be found via domain synonym expansion
    const boostMap = results.find(r => r.map.name === 'KaVGT_BoostTarget');
    expect(boostMap).toBeDefined();
  });

  it('should find torque maps when searching "torque"', () => {
    const results = searchMaps(index, 'torque request', testMaps);
    expect(results.length).toBeGreaterThan(0);
    const torqueMap = results.find(r => r.map.name === 'KaTQE_TorqueRequest');
    expect(torqueMap).toBeDefined();
  });

  it('should find EGR maps via synonym expansion when searching "exhaust recirculation"', () => {
    const results = searchMaps(index, 'egr flow', testMaps);
    expect(results.length).toBeGreaterThan(0);
    const egrMap = results.find(r => r.map.name === 'KaEGR_FlowRate');
    expect(egrMap).toBeDefined();
  });

  it('should find DPF maps when searching "regen"', () => {
    const results = searchMaps(index, 'dpf regen soot', testMaps);
    expect(results.length).toBeGreaterThan(0);
    const dpfMap = results.find(r => r.map.name === 'KaDPF_RegenSootThreshold');
    expect(dpfMap).toBeDefined();
  });

  it('should find transmission maps when searching "converter"', () => {
    const results = searchMaps(index, 'torque converter lockup', testMaps);
    expect(results.length).toBeGreaterThan(0);
    const tccMap = results.find(r => r.map.name === 'KaTCC_LockupPressure');
    expect(tccMap).toBeDefined();
  });

  it('should find timing maps when searching "ignition timing"', () => {
    const results = searchMaps(index, 'ignition timing advance', testMaps);
    expect(results.length).toBeGreaterThan(0);
    const timingMap = results.find(r => r.map.name === 'KaIGN_TimingAdvance');
    expect(timingMap).toBeDefined();
  });

  it('should find security maps when searching "seed key"', () => {
    const results = searchMaps(index, 'security seed key', testMaps);
    expect(results.length).toBeGreaterThan(0);
    const secMap = results.find(r => r.map.name === 'KaSEC_SeedKeyAlgorithm');
    expect(secMap).toBeDefined();
  });

  it('should return empty results for irrelevant query', () => {
    const results = searchMaps(index, 'xyzzy quantum flux capacitor', testMaps);
    expect(results.length).toBe(0);
  });

  it('should respect topN limit', () => {
    const results = searchMaps(index, 'ka', testMaps, 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('should sort results by score descending', () => {
    const results = searchMaps(index, 'fuel pressure', testMaps);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('should handle single-word queries', () => {
    const results = searchMaps(index, 'idle', testMaps);
    expect(results.length).toBeGreaterThan(0);
    const idleMap = results.find(r => r.map.name === 'KaIDL_IdleSpeed');
    expect(idleMap).toBeDefined();
  });

  it('should find CAN maps via synonym expansion', () => {
    const results = searchMaps(index, 'can bus message', testMaps);
    expect(results.length).toBeGreaterThan(0);
    const canMap = results.find(r => r.map.name === 'KaCAN_MessageFilter');
    expect(canMap).toBeDefined();
  });

  it('should find oil maps when searching "oil temperature"', () => {
    const results = searchMaps(index, 'oil temperature', testMaps);
    expect(results.length).toBeGreaterThan(0);
    const oilMap = results.find(r => r.map.name === 'KaOIL_TempWarning');
    expect(oilMap).toBeDefined();
  });
});

describe('formatSearchResultsForContext', () => {
  const index = buildMapSearchIndex(testMaps);

  it('should format results as a context string', () => {
    const results = searchMaps(index, 'fuel rail pressure', testMaps, 5);
    const context = formatSearchResultsForContext(results, 'fuel rail pressure');
    expect(context).toContain('MAPS RELEVANT TO');
    expect(context).toContain('fuel rail pressure');
    expect(context).toContain('KaDFIR_FuelRailPressureMax');
  });

  it('should return empty string for no results', () => {
    const context = formatSearchResultsForContext([], 'nothing');
    expect(context).toBe('');
  });

  it('should include map details like address and type', () => {
    const results = searchMaps(index, 'boost', testMaps, 5);
    const context = formatSearchResultsForContext(results, 'boost');
    expect(context).toContain('0x');
    expect(context).toContain('[');
  });

  it('should include values for top results when available', () => {
    // Add physValues to a map
    const mapsWithValues = [...testMaps];
    mapsWithValues[0] = { ...mapsWithValues[0], physValues: [100, 200, 300] };
    const idx = buildMapSearchIndex(mapsWithValues);
    const results = searchMaps(idx, 'fuel rail pressure', mapsWithValues, 5);
    const context = formatSearchResultsForContext(results, 'fuel rail pressure');
    expect(context).toContain('Values:');
  });
});
