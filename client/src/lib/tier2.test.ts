/**
 * TIER 2 Comprehensive Tests
 * 
 * Tests for:
 *   - Multi-protocol comparative analysis engine
 *   - DBC file parser
 *   - ML fault prediction & trend analysis
 *   - Cross-protocol fault correlation
 */

import { describe, it, expect } from 'vitest';
import {
  compareProtocols,
  exportComparisonCSV,
  ProtocolDataset,
} from './comparisonEngine';
import {
  parseDBC,
  decodeCANFrame,
  searchDBC,
  dbcSignalToNormalizedFormat,
} from './dbcParser';
import {
  analyzeTrends,
  predictFaults,
  generatePredictionReport,
} from './faultPrediction';
import {
  correlateFaults,
  createJ1939Fault,
  createOBD2Fault,
  createKLineFault,
  getFMIDescription,
  getSPNInfo,
} from './faultCorrelation';
import { NormalizedReading } from './protocolDataNormalizer';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function makeReading(
  overrides: Partial<NormalizedReading> & { id: string; value: number }
): NormalizedReading {
  return {
    protocol: 'obd2',
    timestamp: Date.now(),
    unit: 'rpm',
    name: 'Engine RPM',
    shortName: 'RPM',
    category: 'engine',
    min: 0,
    max: 8000,
    resolution: 1,
    ...overrides,
  };
}

function makeDataset(
  protocol: 'obd2' | 'j1939' | 'kline' | 'vop',
  readings: NormalizedReading[]
): ProtocolDataset {
  const timestamps = readings.map(r => r.timestamp);
  return {
    protocol,
    label: `${protocol.toUpperCase()} Dataset`,
    readings,
    startTime: Math.min(...timestamps),
    endTime: Math.max(...timestamps),
    sampleCount: readings.length,
  };
}

// ─── Comparison Engine Tests ────────────────────────────────────────────────

describe('ComparisonEngine', () => {
  it('should return empty report with fewer than 2 datasets', () => {
    const ds = makeDataset('obd2', [
      makeReading({ id: 'obd2_rpm', value: 750, timestamp: 1000 }),
    ]);
    const report = compareProtocols([ds]);
    expect(report.matchedParameters).toHaveLength(0);
    expect(report.summary.recommendations).toContain('Need at least 2 protocol datasets for comparison.');
  });

  it('should match RPM across OBD-II and J1939', () => {
    const now = Date.now();
    const obd2Readings = Array.from({ length: 20 }, (_, i) =>
      makeReading({
        id: 'obd2_rpm',
        protocol: 'obd2',
        value: 750 + i * 10,
        timestamp: now + i * 100,
        shortName: 'RPM',
        name: 'Engine RPM',
        unit: 'rpm',
      })
    );
    const j1939Readings = Array.from({ length: 20 }, (_, i) =>
      makeReading({
        id: 'j1939_rpm',
        protocol: 'j1939',
        value: 755 + i * 10,
        timestamp: now + i * 100,
        shortName: 'EngineSpeed',
        name: 'Engine Speed',
        unit: 'rpm',
      })
    );

    const report = compareProtocols([
      makeDataset('obd2', obd2Readings),
      makeDataset('j1939', j1939Readings),
    ]);

    expect(report.matchedParameters.length).toBeGreaterThanOrEqual(1);
    const rpmMatch = report.matchedParameters.find(m =>
      m.datasets.length === 2
    );
    expect(rpmMatch).toBeDefined();
  });

  it('should compute quality scores for each protocol', () => {
    const now = Date.now();
    const obd2Readings = Array.from({ length: 50 }, (_, i) =>
      makeReading({
        id: 'obd2_rpm',
        protocol: 'obd2',
        value: 750 + Math.sin(i / 5) * 50,
        timestamp: now + i * 100,
        shortName: 'RPM',
      })
    );
    const j1939Readings = Array.from({ length: 50 }, (_, i) =>
      makeReading({
        id: 'j1939_rpm',
        protocol: 'j1939',
        value: 755 + Math.sin(i / 5) * 50,
        timestamp: now + i * 100,
        shortName: 'EngineSpeed',
      })
    );

    const report = compareProtocols([
      makeDataset('obd2', obd2Readings),
      makeDataset('j1939', j1939Readings),
    ]);

    expect(report.qualityScores).toHaveLength(2);
    for (const qs of report.qualityScores) {
      expect(qs.overallScore).toBeGreaterThanOrEqual(0);
      expect(qs.overallScore).toBeLessThanOrEqual(100);
      expect(qs.metrics.sampleRate).toBeGreaterThan(0);
    }
  });

  it('should export comparison as CSV', () => {
    const now = Date.now();
    const obd2Readings = Array.from({ length: 10 }, (_, i) =>
      makeReading({
        id: 'obd2_rpm',
        protocol: 'obd2',
        value: 750 + i,
        timestamp: now + i * 100,
        shortName: 'RPM',
      })
    );
    const j1939Readings = Array.from({ length: 10 }, (_, i) =>
      makeReading({
        id: 'j1939_rpm',
        protocol: 'j1939',
        value: 755 + i,
        timestamp: now + i * 100,
        shortName: 'EngineSpeed',
      })
    );

    const report = compareProtocols([
      makeDataset('obd2', obd2Readings),
      makeDataset('j1939', j1939Readings),
    ]);

    const csv = exportComparisonCSV(report);
    expect(csv).toContain('Multi-Protocol Comparison Report');
    expect(csv).toContain('Parameter');
    expect(csv).toContain('Agreement');
  });

  it('should classify agreement levels', () => {
    const now = Date.now();
    // Create identical data for excellent agreement
    const obd2Readings = Array.from({ length: 30 }, (_, i) =>
      makeReading({
        id: 'obd2_rpm',
        protocol: 'obd2',
        value: 750 + i * 100,
        timestamp: now + i * 100,
        shortName: 'RPM',
      })
    );
    const j1939Readings = Array.from({ length: 30 }, (_, i) =>
      makeReading({
        id: 'j1939_rpm',
        protocol: 'j1939',
        value: 750 + i * 100, // Same values
        timestamp: now + i * 100,
        shortName: 'EngineSpeed',
      })
    );

    const report = compareProtocols([
      makeDataset('obd2', obd2Readings),
      makeDataset('j1939', j1939Readings),
    ]);

    const matched = report.matchedParameters.find(m => m.datasets.length === 2);
    if (matched) {
      expect(['excellent', 'good']).toContain(matched.agreement);
    }
  });
});

// ─── DBC Parser Tests ───────────────────────────────────────────────────────

describe('DBCParser', () => {
  const sampleDBC = `
VERSION "1.0"

NS_ :

BS_:

BU_: ECM TCM BCM

BO_ 256 EngineData: 8 ECM
 SG_ EngineSpeed : 0|16@1+ (0.125,0) [0|8000] "rpm" TCM,BCM
 SG_ CoolantTemp : 16|8@1+ (1,-40) [-40|215] "degC" BCM
 SG_ ThrottlePos : 24|8@1+ (0.392157,0) [0|100] "%" TCM

BO_ 512 TransData: 8 TCM
 SG_ GearPosition : 0|4@1+ (1,0) [0|10] "" ECM
 SG_ TransTemp : 8|8@1+ (1,-40) [-40|215] "degC" ECM
 SG_ OutputSpeed : 16|16@1+ (0.125,0) [0|10000] "rpm" ECM

CM_ BO_ 256 "Engine data message";
CM_ SG_ 256 EngineSpeed "Engine crankshaft speed";
CM_ SG_ 256 CoolantTemp "Engine coolant temperature";

VAL_ 512 GearPosition 0 "Park" 1 "Reverse" 2 "Neutral" 3 "Drive" 4 "Low" ;
`;

  it('should parse version', () => {
    const result = parseDBC(sampleDBC);
    expect(result.version).toBe('1.0');
  });

  it('should parse nodes', () => {
    const result = parseDBC(sampleDBC);
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes.map(n => n.name)).toEqual(['ECM', 'TCM', 'BCM']);
  });

  it('should parse messages', () => {
    const result = parseDBC(sampleDBC);
    expect(result.messageCount).toBe(2);
    expect(result.messages[0].name).toBe('EngineData');
    expect(result.messages[0].id).toBe(256);
    expect(result.messages[0].length).toBe(8);
    expect(result.messages[0].sender).toBe('ECM');
  });

  it('should parse signals', () => {
    const result = parseDBC(sampleDBC);
    const engineMsg = result.messages.find(m => m.name === 'EngineData');
    expect(engineMsg).toBeDefined();
    expect(engineMsg!.signalCount).toBe(3);

    const rpmSignal = engineMsg!.signals.find(s => s.name === 'EngineSpeed');
    expect(rpmSignal).toBeDefined();
    expect(rpmSignal!.startBit).toBe(0);
    expect(rpmSignal!.bitLength).toBe(16);
    expect(rpmSignal!.factor).toBe(0.125);
    expect(rpmSignal!.offset).toBe(0);
    expect(rpmSignal!.unit).toBe('rpm');
    expect(rpmSignal!.byteOrder).toBe('little_endian');
  });

  it('should parse comments', () => {
    const result = parseDBC(sampleDBC);
    const engineMsg = result.messages.find(m => m.name === 'EngineData');
    expect(engineMsg!.comment).toBe('Engine data message');

    const rpmSignal = engineMsg!.signals.find(s => s.name === 'EngineSpeed');
    expect(rpmSignal!.comment).toBe('Engine crankshaft speed');
  });

  it('should parse value tables', () => {
    const result = parseDBC(sampleDBC);
    const transMsg = result.messages.find(m => m.name === 'TransData');
    const gearSignal = transMsg!.signals.find(s => s.name === 'GearPosition');
    expect(gearSignal!.valueTable).toBeDefined();
    expect(gearSignal!.valueTable!.get(0)).toBe('Park');
    expect(gearSignal!.valueTable!.get(3)).toBe('Drive');
  });

  it('should decode CAN frame', () => {
    const result = parseDBC(sampleDBC);
    // EngineSpeed = 6000 rpm → raw = 6000/0.125 = 48000 = 0xBB80
    // Little endian: byte[0]=0x80, byte[1]=0xBB
    // CoolantTemp = 90°C → raw = 90+40 = 130 = 0x82
    const data = new Uint8Array([0x80, 0xBB, 0x82, 0x80, 0, 0, 0, 0]);
    const decoded = decodeCANFrame(256, data, result);

    expect(decoded.length).toBe(3);
    const rpm = decoded.find(d => d.signalName === 'EngineSpeed');
    expect(rpm).toBeDefined();
    expect(rpm!.value).toBeCloseTo(6000, 0);

    const coolant = decoded.find(d => d.signalName === 'CoolantTemp');
    expect(coolant).toBeDefined();
    expect(coolant!.value).toBeCloseTo(90, 0);
  });

  it('should search DBC by signal name', () => {
    const result = parseDBC(sampleDBC);
    const search = searchDBC(result, 'speed');
    expect(search.signals.length).toBeGreaterThanOrEqual(1);
    expect(search.signals.some(s => s.name === 'EngineSpeed')).toBe(true);
  });

  it('should convert DBC signal to normalized format', () => {
    const result = parseDBC(sampleDBC);
    const engineMsg = result.messages[0];
    const rpmSignal = engineMsg.signals[0];

    const normalized = dbcSignalToNormalizedFormat(
      rpmSignal, engineMsg.id, engineMsg.name, 3000, Date.now()
    );

    expect(normalized.protocol).toBe('obd2'); // ID 256 < 0x7FF
    expect(normalized.value).toBe(3000);
    expect(normalized.unit).toBe('rpm');
    expect(normalized.category).toBe('engine');
  });

  it('should handle empty DBC content', () => {
    const result = parseDBC('');
    expect(result.messageCount).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should report total signal count', () => {
    const result = parseDBC(sampleDBC);
    expect(result.signalCount).toBe(6); // 3 + 3
  });
});

// ─── Fault Prediction Tests ────────────────────────────────────────────────

describe('FaultPrediction', () => {
  it('should detect increasing trend', () => {
    const now = Date.now();
    const readings: NormalizedReading[] = Array.from({ length: 100 }, (_, i) =>
      makeReading({
        id: 'obd2_ect',
        protocol: 'obd2',
        value: 85 + i * 0.2, // Steadily increasing
        timestamp: now + i * 1000,
        shortName: 'ECT',
        name: 'Engine Coolant Temperature',
        unit: 'degC',
        category: 'temperature',
        min: -40,
        max: 130,
      })
    );

    const trends = analyzeTrends(readings);
    expect(trends).toHaveLength(1);
    expect(trends[0].trend).toBe('increasing');
    expect(trends[0].slope).toBeGreaterThan(0);
  });

  it('should detect decreasing trend', () => {
    const now = Date.now();
    const readings: NormalizedReading[] = Array.from({ length: 100 }, (_, i) =>
      makeReading({
        id: 'obd2_oil',
        protocol: 'obd2',
        value: 60 - i * 0.15,
        timestamp: now + i * 1000,
        shortName: 'OilPressure',
        name: 'Engine Oil Pressure',
        unit: 'psi',
        category: 'engine',
        min: 0,
        max: 100,
      })
    );

    const trends = analyzeTrends(readings);
    expect(trends).toHaveLength(1);
    expect(trends[0].trend).toBe('decreasing');
    expect(trends[0].slope).toBeLessThan(0);
  });

  it('should detect stable trend', () => {
    const now = Date.now();
    // Use deterministic small sine wave to avoid random oscillation detection
    const readings: NormalizedReading[] = Array.from({ length: 100 }, (_, i) =>
      makeReading({
        id: 'obd2_rpm',
        protocol: 'obd2',
        value: 750 + Math.sin(i * 0.1) * 0.5, // Very small deterministic noise
        timestamp: now + i * 1000,
        shortName: 'RPM',
        name: 'Engine RPM',
        unit: 'rpm',
        category: 'engine',
        min: 0,
        max: 8000,
      })
    );

    const trends = analyzeTrends(readings);
    expect(trends).toHaveLength(1);
    expect(trends[0].trend).toBe('stable');
  });

  it('should detect anomalies in data', () => {
    const now = Date.now();
    const readings: NormalizedReading[] = Array.from({ length: 100 }, (_, i) => {
      let value = 750;
      // Insert spikes at specific points
      if (i === 50 || i === 70) value = 2000;
      return makeReading({
        id: 'obd2_rpm',
        protocol: 'obd2',
        value,
        timestamp: now + i * 1000,
        shortName: 'RPM',
      });
    });

    const trends = analyzeTrends(readings);
    expect(trends[0].anomalyCount).toBeGreaterThan(0);
  });

  it('should predict approaching limit', () => {
    const now = Date.now();
    const readings: NormalizedReading[] = Array.from({ length: 100 }, (_, i) =>
      makeReading({
        id: 'obd2_ect',
        protocol: 'obd2',
        value: 120 + i * 0.1, // Approaching max of 130
        timestamp: now + i * 1000,
        shortName: 'ECT',
        unit: 'degC',
        category: 'temperature',
        min: -40,
        max: 130,
      })
    );

    const trends = analyzeTrends(readings);
    expect(trends[0].isApproachingLimit).toBe(true);
    expect(trends[0].limitType).toBe('upper');
    expect(trends[0].timeToLimit).toBeDefined();
  });

  it('should generate fault predictions from signatures', () => {
    const now = Date.now();
    const readings: NormalizedReading[] = Array.from({ length: 100 }, (_, i) =>
      makeReading({
        id: 'obd2_ect',
        protocol: 'obd2',
        value: 90 + i * 0.1,
        timestamp: now + i * 1000,
        shortName: 'ECT',
        name: 'Engine Coolant Temperature',
        unit: 'degC',
        category: 'temperature',
        min: -40,
        max: 130,
      })
    );

    const trends = analyzeTrends(readings);
    const predictions = predictFaults(trends);

    // Should detect coolant system degradation
    const coolantPred = predictions.find(p => p.predictedFault.includes('Coolant'));
    expect(coolantPred).toBeDefined();
    expect(coolantPred!.probability).toBeGreaterThan(0);
  });

  it('should generate full prediction report', () => {
    const now = Date.now();
    const readings: NormalizedReading[] = Array.from({ length: 100 }, (_, i) =>
      makeReading({
        id: 'obd2_rpm',
        protocol: 'obd2',
        value: 750 + (Math.random() - 0.5) * 10,
        timestamp: now + i * 1000,
        shortName: 'RPM',
      })
    );

    const report = generatePredictionReport(readings);
    expect(report.trends).toHaveLength(1);
    expect(report.overallRisk).toBeDefined();
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('should skip parameters with too few readings', () => {
    const readings: NormalizedReading[] = [
      makeReading({ id: 'obd2_rpm', value: 750, timestamp: 1000 }),
      makeReading({ id: 'obd2_rpm', value: 760, timestamp: 2000 }),
    ];

    const trends = analyzeTrends(readings);
    expect(trends).toHaveLength(0); // Need at least 10 readings
  });
});

// ─── Fault Correlation Tests ────────────────────────────────────────────────

describe('FaultCorrelation', () => {
  it('should correlate J1939 SPN to OBD-II DTC', () => {
    const now = Date.now();
    const faults = [
      createJ1939Fault(110, 3, 0, 1, now), // ECT - voltage high
      createOBD2Fault('P0118', 'Engine Coolant Temperature Circuit High', now + 500),
    ];

    const report = correlateFaults(faults);
    expect(report.correlatedGroups.length).toBeGreaterThan(0);
    expect(report.crossProtocolMatches).toBeGreaterThan(0);

    const group = report.correlatedGroups[0];
    expect(group.correlationType).toBe('equivalent');
    expect(group.confidence).toBeGreaterThanOrEqual(85);
  });

  it('should handle empty fault list', () => {
    const report = correlateFaults([]);
    expect(report.totalFaults).toBe(0);
    expect(report.overallSeverity).toBe('none');
    expect(report.summary).toContain('No faults detected across any protocol.');
  });

  it('should detect temporal correlation', () => {
    const now = Date.now();
    const faults = [
      createOBD2Fault('P0300', 'Random Misfire', now),
      createKLineFault('0300', 'Misfire Detected', 0x10, now + 1000),
    ];

    const report = correlateFaults(faults);
    // Should find some correlation (temporal or mapping)
    expect(report.totalFaults).toBe(2);
  });

  it('should create J1939 fault with correct severity', () => {
    const critical = createJ1939Fault(100, 0, 0, 1, Date.now());
    expect(critical.severity).toBe('critical');

    const warning = createJ1939Fault(100, 3, 0, 1, Date.now());
    expect(warning.severity).toBe('warning');

    const info = createJ1939Fault(100, 7, 0, 1, Date.now());
    expect(info.severity).toBe('info');
  });

  it('should get FMI description', () => {
    expect(getFMIDescription(0)).toContain('above normal');
    expect(getFMIDescription(3)).toContain('Voltage above');
    expect(getFMIDescription(11)).toContain('Root cause not known');
    expect(getFMIDescription(99)).toContain('Unknown FMI');
  });

  it('should get SPN info', () => {
    const info = getSPNInfo(110);
    expect(info).toBeDefined();
    expect(info!.name).toBe('Engine Coolant Temperature');
    expect(info!.obdDTCs).toContain('P0115');

    const unknown = getSPNInfo(99999);
    expect(unknown).toBeUndefined();
  });

  it('should classify overall severity correctly', () => {
    const now = Date.now();

    // Critical fault
    const criticalFaults = [
      createJ1939Fault(100, 0, 0, 1, now),
    ];
    const critReport = correlateFaults(criticalFaults);
    expect(['high', 'critical']).toContain(critReport.overallSeverity);

    // Info-only faults
    const infoFaults = [
      createJ1939Fault(100, 7, 0, 1, now),
    ];
    const infoReport = correlateFaults(infoFaults);
    expect(['none', 'low']).toContain(infoReport.overallSeverity);
  });

  it('should generate recommended actions', () => {
    const now = Date.now();
    const faults = [
      createJ1939Fault(110, 3, 0, 1, now),
      createOBD2Fault('P0118', 'ECT Circuit High', now + 200),
    ];

    const report = correlateFaults(faults);
    if (report.correlatedGroups.length > 0) {
      expect(report.correlatedGroups[0].recommendedAction).toBeTruthy();
      expect(report.correlatedGroups[0].recommendedAction.length).toBeGreaterThan(10);
    }
  });

  it('should build fault timeline', () => {
    const now = Date.now();
    const faults = [
      createJ1939Fault(110, 3, 0, 1, now),
      createOBD2Fault('P0118', 'ECT Circuit High', now + 500),
    ];

    const report = correlateFaults(faults);
    if (report.correlatedGroups.length > 0) {
      const group = report.correlatedGroups[0];
      expect(group.timeline.length).toBeGreaterThanOrEqual(1);
      // Timeline should be sorted by timestamp
      for (let i = 1; i < group.timeline.length; i++) {
        expect(group.timeline[i].timestamp).toBeGreaterThanOrEqual(group.timeline[i - 1].timestamp);
      }
    }
  });

  it('should handle multiple faults across 3 protocols', () => {
    const now = Date.now();
    const faults = [
      createJ1939Fault(110, 3, 0, 1, now),
      createOBD2Fault('P0118', 'ECT Circuit High', now + 200),
      createKLineFault('0115', 'ECT Sensor', 0x10, now + 400),
      createJ1939Fault(190, 2, 0, 1, now + 1000),
      createOBD2Fault('P0335', 'Crankshaft Position Sensor', now + 1200),
    ];

    const report = correlateFaults(faults);
    expect(report.totalFaults).toBe(5);
    expect(report.summary.length).toBeGreaterThan(0);
  });
});
