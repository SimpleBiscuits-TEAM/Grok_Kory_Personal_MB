/**
 * Knox Engine Fundamentals Knowledge — Integration Tests
 * ========================================================
 * Verifies that the engine fundamentals knowledge module is properly
 * integrated into the Knox knowledge system and contains all required
 * topic areas for both diesel and petrol engine diagnostics/tuning.
 */

import { describe, it, expect } from 'vitest';
import { KNOX_ENGINE_FUNDAMENTALS } from '../shared/knoxEngineKnowledge';
import { getFullKnoxKnowledge, getSanitizedKnoxKnowledge } from './lib/knoxKnowledgeServer';

describe('Knox Engine Fundamentals — Module Structure', () => {
  it('exports a non-empty string', () => {
    expect(typeof KNOX_ENGINE_FUNDAMENTALS).toBe('string');
    expect(KNOX_ENGINE_FUNDAMENTALS.length).toBeGreaterThan(5000);
  });

  it('is included in the full Knox knowledge base', () => {
    const full = getFullKnoxKnowledge();
    expect(full).toContain('Engine Fundamentals');
    expect(full).toContain('compression-ignition');
    expect(full).toContain('spark-ignition');
  });

  it('is included in the sanitized Knox knowledge base (client-safe)', () => {
    const sanitized = getSanitizedKnoxKnowledge();
    expect(sanitized).toContain('Engine Fundamentals');
    expect(sanitized).toContain('compression-ignition');
  });

  it('does NOT contain any secret material', () => {
    const text = KNOX_ENGINE_FUNDAMENTALS;
    // Should not contain seed/key secrets, hex algorithm constants, or PPEI proprietary data
    expect(text).not.toContain('0xA7, 0xC2');
    expect(text).not.toContain('cucakeysB');
    expect(text).not.toContain('HMAC-SHA1');
    expect(text).not.toContain('CONFIDENTIAL');
    expect(text).not.toContain('Server-Only');
  });
});

describe('Knox Engine Fundamentals — Four-Stroke Cycle Coverage', () => {
  it('covers all four strokes', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Intake');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Compression');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Power');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Exhaust');
  });

  it('explains Volumetric Efficiency (VE)', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Volumetric Efficiency');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('VE');
  });

  it('explains compression ratio differences between diesel and petrol', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('9:1 to 13:1');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('15:1 to 23:1');
  });
});

describe('Knox Engine Fundamentals — Combustion Knowledge', () => {
  it('explains spark-initiated flame-front propagation (petrol)', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('flame front');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('spark plug');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('MBT');
  });

  it('explains compression-initiated diffusion combustion (diesel)', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('auto-ignition');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Premixed phase');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Diffusion phase');
  });

  it('explains knock / detonation in petrol engines', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('knock');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('detonation');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('knock sensor');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('octane');
  });

  it('explains the NOx-vs-soot tradeoff in diesel', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('NOx');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('soot');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('NOx-vs-soot');
  });
});

describe('Knox Engine Fundamentals — Air-Fuel Ratio & Lambda', () => {
  it('defines stoichiometric ratio for gasoline (14.7:1)', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('14.7:1');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('stoichiometric');
  });

  it('explains Lambda as the universal metric', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Lambda');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('λ = 1.0');
  });

  it('explains fuel trims (STFT / LTFT) for petrol diagnostics', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Short Term Fuel Trim');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Long Term Fuel Trim');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('STFT');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('LTFT');
  });

  it('explains why petrol runs rich at WOT', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('WOT');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('0.82-0.88');
  });

  it('explains why diesel always runs lean overall', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('diesel engines always run lean');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('smoke limiter');
  });
});

describe('Knox Engine Fundamentals — Fuel Systems', () => {
  it('covers Port Fuel Injection (PFI)', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Port Fuel Injection');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('PFI');
  });

  it('covers Gasoline Direct Injection (GDI)', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Gasoline Direct Injection');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('GDI');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('carbon buildup on intake valves');
  });

  it('covers Common Rail diesel injection', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Common Rail');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Pilot');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Main');
  });

  it('explains multiple injection events and their purposes', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Pilot 1');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Pilot 2');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Post');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('DPF regeneration');
  });
});

describe('Knox Engine Fundamentals — Ignition Systems', () => {
  it('covers Coil-On-Plug (COP) ignition for petrol', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Coil-On-Plug');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('dwell');
  });

  it('covers glow plugs for diesel cold start', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Glow plug');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('cold start');
  });

  it('explains spark plug gap importance for boosted engines', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('spark plug gap');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('tighter gaps');
  });
});

describe('Knox Engine Fundamentals — Forced Induction', () => {
  it('covers turbocharger operation', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Turbocharger');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('turbine');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('compressor');
  });

  it('explains VGT (Variable Geometry Turbo)', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Variable Geometry Turbo');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('VGT');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('vanes');
  });

  it('explains boost-to-drive pressure ratio', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Pressure ratio');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('drive pressure');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('1.5:1 to 2.5:1');
  });

  it('covers supercharger types', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Supercharger');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Roots');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('twin-screw');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('centrifugal');
  });

  it('explains intercooling and charge temperature', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Intercool');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Charge Temperature');
  });
});

describe('Knox Engine Fundamentals — Emissions Systems', () => {
  it('covers three-way catalytic converter (petrol)', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Three-Way Catalytic Converter');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('platinum');
  });

  it('covers DPF (Diesel Particulate Filter)', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Diesel Particulate Filter');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('DPF');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('regeneration');
  });

  it('covers SCR (Selective Catalytic Reduction)', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Selective Catalytic Reduction');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('SCR');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('urea');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('DEF');
  });

  it('covers EGR and its effects', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Exhaust Gas Recirculation');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('EGR');
  });
});

describe('Knox Engine Fundamentals — ECU / Engine Management', () => {
  it('explains open-loop vs closed-loop control', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Open-loop');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Closed-loop');
  });

  it('covers key petrol ECU maps', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('VE / Fuel');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Spark Advance');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Knock Retard');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Target AFR');
  });

  it('covers key diesel ECU maps', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain("Driver's Wish");
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Torque-to-IQ');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Smoke Limiter');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('SOI');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Rail Pressure Target');
  });
});

describe('Knox Engine Fundamentals — Sensor Diagnostics', () => {
  it('covers all major engine sensors', () => {
    const sensors = ['MAF', 'MAP', 'IAT', 'ECT', 'O2', 'Knock Sensor', 'CKP', 'CMP', 'EGT', 'TPS', 'APP'];
    for (const sensor of sensors) {
      expect(KNOX_ENGINE_FUNDAMENTALS).toContain(sensor);
    }
  });

  it('explains cross-referencing sensors for diagnostics', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Cross-Referencing Sensors');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('MAF vs MAP');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Desired vs Actual');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Bank-to-Bank');
  });
});

describe('Knox Engine Fundamentals — Common Failure Modes', () => {
  it('covers petrol-specific failures', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Ignition coil failure');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Spark plug fouling');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('LSPI');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('P0420');
  });

  it('covers diesel-specific failures', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Injector failure');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('CP4');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('DPF clogging');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('EGR cooler failure');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Glow plug failure');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Injector leak-back');
  });
});

describe('Knox Engine Fundamentals — Tuning Principles', () => {
  it('covers the three petrol tuning levers', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Fuel (VE table');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Spark Timing');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Boost (turbocharged)');
  });

  it('covers the four diesel tuning levers', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Injection Quantity (IQ)');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Injection Timing (SOI)');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Rail Pressure');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Boost / VGT Calibration');
  });

  it('explains the interaction between diesel tuning parameters', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('deeply interconnected');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('coordinated way');
  });
});

describe('Knox Engine Fundamentals — Diagnostic Reasoning Framework', () => {
  it('provides a diesel vs petrol decision matrix', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Decision Matrix');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Low power complaint');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Rough idle');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Black smoke');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('White smoke');
  });

  it('provides a diagnostic reasoning hierarchy', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Identify the engine type');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Establish baseline');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Check air first');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Check fuel second');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Check combustion third');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Check outputs last');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Cross-reference everything');
  });
});

describe('Knox Engine Fundamentals — Heat Management', () => {
  it('covers combustion temperature relationships', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Heat Management');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Carnot');
  });

  it('covers coolant temperature diagnostics', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('thermostat');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('85-105');
  });

  it('covers oil temperature significance', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Oil Temperature');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('viscosity');
  });
});
