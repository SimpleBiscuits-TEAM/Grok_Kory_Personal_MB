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

// ─── Section 15: Ethanol Fuels ─────────────────────────────────────────────

describe('Knox Engine Fundamentals — Ethanol Fuels (E85/E90/IGNITE RED)', () => {
  it('covers E85 fuel properties', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('E85');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('85% ethanol');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('9.8:1');
  });

  it('covers E90 fuel properties', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('E90');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('90% ethanol');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('9.5:1');
  });

  it('identifies IGNITE RED as branded E90', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('IGNITE RED');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('branded E90');
  });

  it('explains why ethanol makes more power despite lower energy density', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('energy density');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('TIMING');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('octane');
  });

  it('covers ethanol AFR and lambda targets', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Lambda and AFR Targets');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('0.80-0.85');
  });

  it('warns against comparing ethanol AFR to gasoline AFR directly', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Do NOT compare ethanol AFR numbers to gasoline AFR numbers');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('lambda for cross-fuel comparisons');
  });

  it('covers ethanol timing targets (30-35 degrees)', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('30-35');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('MBT');
  });

  it('includes real dyno reference data', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('170.7');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('146.8');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Reference Data from Real Dyno Runs');
  });

  it('covers injector requirements for ethanol', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('35% more fuel volume');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('ID1050X');
  });

  it('covers ethanol diagnostic implications', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Diagnostic Implications');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('cold start');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('seasonally');
  });
});

describe('Knox Engine Fundamentals — Turbo Kit Knowledge', () => {
  it('covers Honda Talon turbo kits section', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Honda Talon Turbo Kits');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('JR, FP, KW');
  });

  it('covers Jackson Racing (JR) turbo characteristics', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Jackson Racing (JR) Turbo Kit');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('entry-level turbo kit');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('1.40');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('1.83');
  });

  it('covers Full Performance (FP) turbo characteristics', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Full Performance (FP) Turbo Kit');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('larger, more efficient compressor');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('1.64');
  });

  it('covers Kraftwerks (KW) turbo characteristics', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Kraftwerks (KW) Turbo Kit');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('PENDING');
  });

  it('covers generic turbo fallback', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Generic Turbo');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('conservative default');
  });

  it('explains WHY turbo kit matters for BSFC', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Why Turbo Kit Matters');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('adiabatic efficiency');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('charge air temperature');
  });

  it('covers turbo kit filename patterns', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain("contains 'JR'");
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain("contains 'FP'");
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain("contains 'KW'");
  });
});

describe('Knox Engine Fundamentals — Power Commander Knowledge', () => {
  it('covers Power Commander section', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Power Commander Piggyback Controllers');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('piggyback controller');
  });

  it('explains how Power Commander works step by step', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('intercepts');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('multiplies the pulsewidth');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('MAP-referenced fuel map');
  });

  it('covers datalog channel implications', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Injector Pulsewidth Final');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Primary Injector Pulsewidth 1');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('BEFORE the Power Commander modifies it');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('AFTER the Power Commander multiplier');
  });

  it('covers diagnostic implications of Power Commander', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('roughly HALF of actual');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('multiplier above 2.5');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('multiplier below 1.2');
  });

  it('covers Power Commander identification in datalogs', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('definitive indicator');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Power Commander Fuel Trim');
  });
});

describe('Knox Engine Fundamentals — ID1300 Injector Knowledge', () => {
  it('covers ID1300 injector section', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('ID1300 Injectors');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('1300 cc/min');
  });

  it('covers when ID1300s are used', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('180+ HP on ethanol');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('85% duty cycle');
  });

  it('covers ID1300 diagnostic considerations', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('30% more than ID1050');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('massively oversized');
  });
});


describe('Knox Engine Fundamentals — KW FIC 800cc Injectors', () => {
  it('covers FIC 800cc injector specifications', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('FIC (Fuel Injector Clinic)');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('800 cc/min');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('43.5 psi');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('76 lb/hr');
  });

  it('covers flow test data from the data sheet', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('798 cc/min');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('801 cc/min');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('0.5%');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Isopar G');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('OEM Denso ECU');
  });

  it('covers HP support table at 80% duty cycle', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('244 HP');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('203 HP');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('2 Cylinders');
  });

  it('explains why 800cc is chosen for Kraftwerks', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('idle quality');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('moderate boost');
  });

  it('covers auto-detection logic', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('defaults to FIC 800cc');
  });
});

describe('Knox Engine Fundamentals — 3-Bar MAP Sensor Detection', () => {
  it('explains why a 3-bar MAP sensor is needed', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('3-bar MAP sensor');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('0-300 kPa');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('29 psi');
  });

  it('covers detection method via barometric pressure', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Barometric Pressure < 70 kPa');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('85-105 kPa');
  });

  it('covers detection method via baro sensor voltage', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('Baro Sensor Voltage < 1.8V');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('0.8-1.2V');
  });

  it('explains why MAP readings are inaccurate with 3-bar sensor', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('voltage-to-pressure');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('LOWER than the real manifold pressure');
  });

  it('covers the diagnostic decision tree', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('turbo detection from MAP data alone is unreliable');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('filename patterns instead');
  });

  it('notes that relative boost calculation may still be approximately correct', () => {
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('BOTH the MAP and baro readings are affected');
    expect(KNOX_ENGINE_FUNDAMENTALS).toContain('approximately correct in relative terms');
  });
});
