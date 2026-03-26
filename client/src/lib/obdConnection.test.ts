import { describe, expect, it } from 'vitest';
import {
  STANDARD_PIDS,
  PID_PRESETS,
  exportSessionToCSV,
  sessionToAnalyzerCSV,
  LogSession,
  PIDDefinition,
  PIDReading,
} from './obdConnection';

// ─── PID Formula Tests ──────────────────────────────────────────────────────

describe('STANDARD_PIDS', () => {
  it('contains expected core PIDs', () => {
    const pidNumbers = STANDARD_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x05); // ECT
    expect(pidNumbers).toContain(0x0C); // RPM
    expect(pidNumbers).toContain(0x0D); // Speed
    expect(pidNumbers).toContain(0x0B); // MAP
    expect(pidNumbers).toContain(0x10); // MAF
    expect(pidNumbers).toContain(0x23); // FRP diesel
    expect(pidNumbers).toContain(0x78); // EGT
    expect(pidNumbers).toContain(0x42); // Voltage
  });

  it('has unique PIDs', () => {
    const pidNumbers = STANDARD_PIDS.map(p => p.pid);
    const unique = new Set(pidNumbers);
    expect(unique.size).toBe(pidNumbers.length);
  });

  it('all PIDs have required fields', () => {
    for (const pid of STANDARD_PIDS) {
      expect(pid.pid).toBeGreaterThanOrEqual(0);
      expect(pid.name).toBeTruthy();
      expect(pid.shortName).toBeTruthy();
      expect(pid.unit).toBeDefined();
      expect(pid.bytes).toBeGreaterThan(0);
      expect(typeof pid.formula).toBe('function');
      expect(pid.category).toBeTruthy();
    }
  });
});

describe('PID formulas', () => {
  const findPid = (id: number) => STANDARD_PIDS.find(p => p.pid === id)!;

  it('ECT (0x05): A - 40', () => {
    const pid = findPid(0x05);
    expect(pid.formula([0])).toBe(-40);
    expect(pid.formula([40])).toBe(0);
    expect(pid.formula([140])).toBe(100);
    expect(pid.formula([255])).toBe(215);
  });

  it('RPM (0x0C): ((A*256)+B)/4', () => {
    const pid = findPid(0x0C);
    expect(pid.formula([0, 0])).toBe(0);
    expect(pid.formula([0x1A, 0xF8])).toBe(1726); // ~1726 RPM
    expect(pid.formula([0xFF, 0xFF])).toBeCloseTo(16383.75);
  });

  it('Vehicle Speed (0x0D): A', () => {
    const pid = findPid(0x0D);
    expect(pid.formula([0])).toBe(0);
    expect(pid.formula([100])).toBe(100);
    expect(pid.formula([255])).toBe(255);
  });

  it('MAP (0x0B): A (kPa)', () => {
    const pid = findPid(0x0B);
    expect(pid.formula([0])).toBe(0);
    expect(pid.formula([101])).toBe(101); // ~1 atm
    expect(pid.formula([255])).toBe(255);
  });

  it('MAF (0x10): ((A*256)+B)/100', () => {
    const pid = findPid(0x10);
    expect(pid.formula([0, 0])).toBe(0);
    expect(pid.formula([1, 0])).toBe(2.56);
    expect(pid.formula([0xFF, 0xFF])).toBeCloseTo(655.35);
  });

  it('Throttle (0x11): (A*100)/255', () => {
    const pid = findPid(0x11);
    expect(pid.formula([0])).toBe(0);
    expect(pid.formula([255])).toBeCloseTo(100);
    expect(pid.formula([128])).toBeCloseTo(50.2, 0);
  });

  it('Load (0x04): (A*100)/255', () => {
    const pid = findPid(0x04);
    expect(pid.formula([0])).toBe(0);
    expect(pid.formula([255])).toBeCloseTo(100);
  });

  it('STFT (0x06): ((A-128)*100)/128', () => {
    const pid = findPid(0x06);
    expect(pid.formula([128])).toBe(0);     // 0% trim
    expect(pid.formula([0])).toBe(-100);    // -100% trim
    expect(pid.formula([255])).toBeCloseTo(99.2, 0); // +99.2%
  });

  it('Fuel Rail Pressure diesel (0x23): ((A*256)+B)*10', () => {
    const pid = findPid(0x23);
    expect(pid.formula([0, 0])).toBe(0);
    expect(pid.formula([0xFF, 0xFF])).toBe(655350);
  });

  it('Barometric (0x33): A', () => {
    const pid = findPid(0x33);
    expect(pid.formula([101])).toBe(101);
  });

  it('Catalyst Temp (0x3C): ((A*256)+B)/10 - 40', () => {
    const pid = findPid(0x3C);
    expect(pid.formula([0, 0])).toBe(-40);
    expect(pid.formula([0x01, 0x90])).toBe(0); // 400/10 - 40 = 0
  });

  it('Module Voltage (0x42): ((A*256)+B)/1000', () => {
    const pid = findPid(0x42);
    expect(pid.formula([0x37, 0xDC])).toBeCloseTo(14.3, 0); // 14300/1000
  });
});

// ─── PID Presets Tests ──────────────────────────────────────────────────────

describe('PID_PRESETS', () => {
  it('has expected preset names', () => {
    const names = PID_PRESETS.map(p => p.name);
    expect(names).toContain('Engine Basics');
    expect(names).toContain('Duramax Turbo');
    expect(names).toContain('Fuel System');
    expect(names).toContain('Emissions');
    expect(names).toContain('Full Duramax');
    expect(names).toContain('Transmission');
  });

  it('all preset PIDs exist in STANDARD_PIDS', () => {
    const validPids = new Set(STANDARD_PIDS.map(p => p.pid));
    for (const preset of PID_PRESETS) {
      for (const pid of preset.pids) {
        expect(validPids.has(pid)).toBe(true);
      }
    }
  });

  it('all presets include RPM (0x0C)', () => {
    for (const preset of PID_PRESETS) {
      expect(preset.pids).toContain(0x0C);
    }
  });

  it('Full Duramax preset has the most PIDs', () => {
    const fullDuramax = PID_PRESETS.find(p => p.name === 'Full Duramax')!;
    for (const preset of PID_PRESETS) {
      if (preset.name !== 'Full Duramax') {
        expect(fullDuramax.pids.length).toBeGreaterThanOrEqual(preset.pids.length);
      }
    }
  });
});

// ─── CSV Export Tests ───────────────────────────────────────────────────────

function createMockSession(): LogSession {
  const rpmPid: PIDDefinition = STANDARD_PIDS.find(p => p.pid === 0x0C)!;
  const ectPid: PIDDefinition = STANDARD_PIDS.find(p => p.pid === 0x05)!;

  const readings = new Map<number, PIDReading[]>();
  readings.set(0x0C, [
    { pid: 0x0C, name: 'Engine RPM', shortName: 'RPM', value: 800, unit: 'rpm', rawBytes: [0x0C, 0x80], timestamp: 1000 },
    { pid: 0x0C, name: 'Engine RPM', shortName: 'RPM', value: 1200, unit: 'rpm', rawBytes: [0x12, 0xC0], timestamp: 1200 },
    { pid: 0x0C, name: 'Engine RPM', shortName: 'RPM', value: 2500, unit: 'rpm', rawBytes: [0x27, 0x10], timestamp: 1400 },
  ]);
  readings.set(0x05, [
    { pid: 0x05, name: 'Engine Coolant Temperature', shortName: 'ECT', value: 85, unit: '°C', rawBytes: [0x7D], timestamp: 1000 },
    { pid: 0x05, name: 'Engine Coolant Temperature', shortName: 'ECT', value: 87, unit: '°C', rawBytes: [0x7F], timestamp: 1200 },
    { pid: 0x05, name: 'Engine Coolant Temperature', shortName: 'ECT', value: 90, unit: '°C', rawBytes: [0x82], timestamp: 1400 },
  ]);

  return {
    id: 'test-session-1',
    startTime: 1000,
    endTime: 1400,
    sampleRate: 200,
    pids: [rpmPid, ectPid],
    readings,
  };
}

describe('exportSessionToCSV', () => {
  it('generates valid CSV with headers', () => {
    const session = createMockSession();
    const csv = exportSessionToCSV(session);
    const lines = csv.split('\n');

    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toContain('Timestamp (ms)');
    expect(lines[0]).toContain('Elapsed (s)');
    expect(lines[0]).toContain('RPM (rpm)');
    expect(lines[0]).toContain('ECT (°C)');
  });

  it('has correct number of data rows', () => {
    const session = createMockSession();
    const csv = exportSessionToCSV(session);
    const lines = csv.split('\n');

    // Header + 3 data rows
    expect(lines.length).toBe(4);
  });

  it('contains correct values', () => {
    const session = createMockSession();
    const csv = exportSessionToCSV(session);
    const lines = csv.split('\n');

    // First data row should have RPM=800, ECT=85
    expect(lines[1]).toContain('800');
    expect(lines[1]).toContain('85');
  });
});

describe('sessionToAnalyzerCSV', () => {
  it('generates HP Tuners compatible format with unit row', () => {
    const session = createMockSession();
    const csv = sessionToAnalyzerCSV(session);
    const lines = csv.split('\n');

    expect(lines.length).toBeGreaterThan(2);
    // Header row
    expect(lines[0]).toContain('Time');
    expect(lines[0]).toContain('Engine RPM');
    expect(lines[0]).toContain('Engine Coolant Temperature');
    // Unit row
    expect(lines[1]).toContain('s');
    expect(lines[1]).toContain('rpm');
    expect(lines[1]).toContain('°C');
  });

  it('has elapsed time in seconds', () => {
    const session = createMockSession();
    const csv = sessionToAnalyzerCSV(session);
    const lines = csv.split('\n');

    // First data row: elapsed time from startTime
    const firstDataRow = lines[2].split(',');
    expect(firstDataRow[0]).toBe('0.000'); // (1000 - 1000) / 1000
  });
});
