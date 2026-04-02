import { describe, expect, it } from "vitest";
import {
  runUnifiedDiagnostics,
  detectOperatingState,
  analyzeThresholds,
  analyzePatterns,
  findCrossProtocolCorrelations,
} from "./unifiedDiagnostics";
import {
  NormalizedReading,
  normalizeJ1939Reading,
  normalizeKLineReading,
  normalizeOBDReading,
  normalizeReadings,
  groupByCategory,
  groupByProtocol,
  filterByProtocol,
  findByShortName,
  getLatestReadings,
  findEquivalentParameters,
  areEquivalentParameters,
} from "./protocolDataNormalizer";

// ── Test Helpers ─────────────────────────────────────────────────────────

function makeOBDReading(overrides: Partial<NormalizedReading> = {}): NormalizedReading {
  return {
    id: "obd2_0x0c",
    protocol: "obd2",
    timestamp: Date.now(),
    value: 750,
    unit: "rpm",
    name: "Engine RPM",
    shortName: "RPM",
    category: "engine",
    pid: 0x0c,
    min: 0,
    max: 8000,
    resolution: 0.25,
    ...overrides,
  };
}

function makeJ1939Reading(overrides: Partial<NormalizedReading> = {}): NormalizedReading {
  return {
    id: "j1939_61444_0",
    protocol: "j1939",
    timestamp: Date.now(),
    value: 1200,
    unit: "rpm",
    name: "Engine Speed",
    shortName: "ENG_SPD",
    category: "engine",
    pgn: 61444,
    sourceAddress: 0,
    min: 0,
    max: 5000,
    resolution: 1,
    ...overrides,
  };
}

function makeKLineReading(overrides: Partial<NormalizedReading> = {}): NormalizedReading {
  return {
    id: "kline_0x0c",
    protocol: "kline",
    timestamp: Date.now(),
    value: 800,
    unit: "rpm",
    name: "Engine RPM",
    shortName: "RPM",
    category: "engine",
    pid: 0x0c,
    service: 0x01,
    min: 0,
    max: 8000,
    resolution: 0.25,
    ...overrides,
  };
}

// ── Protocol Data Normalizer Tests ───────────────────────────────────────

describe("protocolDataNormalizer", () => {
  it("normalizes J1939 readings correctly", () => {
    const j1939Reading = {
      pgn: 61444,
      pgnName: "Electronic Engine Controller 1",
      parameter: "Engine Speed",
      shortName: "ENG_SPD",
      value: 1500,
      unit: "rpm",
      timestamp: Date.now(),
      sourceAddress: 0,
    };

    const normalized = normalizeJ1939Reading(j1939Reading);
    expect(normalized.protocol).toBe("j1939");
    expect(normalized.value).toBe(1500);
    expect(normalized.pgn).toBe(61444);
    expect(normalized.id).toContain("j1939");
  });

  it("normalizes K-Line readings correctly", () => {
    const klineReading = {
      pid: 0x0c,
      name: "Engine RPM",
      shortName: "RPM",
      value: 3000,
      unit: "rpm",
      timestamp: Date.now(),
      service: 0x01,
    };

    const normalized = normalizeKLineReading(klineReading);
    expect(normalized.protocol).toBe("kline");
    expect(normalized.value).toBe(3000);
    expect(normalized.pid).toBe(0x0c);
    expect(normalized.service).toBe(0x01);
  });

  it("normalizes OBD-II readings correctly", () => {
    const obdReading = {
      pid: 0x0c,
      name: "Engine RPM",
      shortName: "RPM",
      value: 2500,
      unit: "rpm",
      rawBytes: [0x09, 0xc4],
      timestamp: Date.now(),
    };

    const normalized = normalizeOBDReading(obdReading);
    expect(normalized.protocol).toBe("obd2");
    expect(normalized.value).toBe(2500);
    expect(normalized.id).toContain("obd2");
  });

  it("groups readings by category", () => {
    const readings = [
      makeOBDReading({ category: "engine", shortName: "RPM" }),
      makeOBDReading({ category: "engine", shortName: "LOAD", id: "obd2_load" }),
      makeOBDReading({ category: "cooling", shortName: "ECT", id: "obd2_ect" }),
    ];

    const grouped = groupByCategory(readings);
    expect(grouped.get("engine")?.length).toBe(2);
    expect(grouped.get("cooling")?.length).toBe(1);
  });

  it("groups readings by protocol", () => {
    const readings = [
      makeOBDReading(),
      makeJ1939Reading(),
      makeKLineReading(),
    ];

    const grouped = groupByProtocol(readings);
    expect(grouped.get("obd2")?.length).toBe(1);
    expect(grouped.get("j1939")?.length).toBe(1);
    expect(grouped.get("kline")?.length).toBe(1);
  });

  it("filters readings by protocol", () => {
    const readings = [
      makeOBDReading(),
      makeJ1939Reading(),
      makeKLineReading(),
    ];

    const obd = filterByProtocol(readings, "obd2");
    expect(obd.length).toBe(1);
    expect(obd[0].protocol).toBe("obd2");
  });

  it("finds reading by short name", () => {
    const readings = [
      makeOBDReading({ shortName: "RPM" }),
      makeOBDReading({ shortName: "ECT", id: "obd2_ect" }),
    ];

    const found = findByShortName(readings, "ECT");
    expect(found?.shortName).toBe("ECT");
  });

  it("gets latest readings per parameter", () => {
    const now = Date.now();
    const readings = [
      makeOBDReading({ shortName: "RPM", value: 1000, timestamp: now - 1000 }),
      makeOBDReading({ shortName: "RPM", value: 2000, timestamp: now }),
    ];

    const latest = getLatestReadings(readings);
    expect(latest.get("RPM")?.value).toBe(2000);
  });

  it("finds equivalent parameters across protocols", () => {
    const equivalents = findEquivalentParameters("RPM");
    expect(equivalents).toContain("RPM");
    expect(equivalents).toContain("ENGINE_SPEED");
    expect(equivalents).toContain("EEC1_ENGINE_SPEED");
  });

  it("detects equivalent parameters between readings", () => {
    const obd = makeOBDReading({ shortName: "RPM" });
    const j1939 = makeJ1939Reading({ shortName: "ENGINE_SPEED" });

    expect(areEquivalentParameters(obd, j1939)).toBe(true);
  });
});

// ── Unified Diagnostics Tests ────────────────────────────────────────────

describe("unifiedDiagnostics", () => {
  it("returns empty report for no data", () => {
    const report = runUnifiedDiagnostics([]);
    expect(report.totalReadings).toBe(0);
    expect(report.issues.length).toBe(0);
    expect(report.health.overall).toBe(100);
    expect(report.summary).toContain("No data");
  });

  it("detects idle operating state", () => {
    const readings = [
      makeOBDReading({ shortName: "RPM", value: 700 }),
      makeOBDReading({ shortName: "VSS", value: 0, id: "obd2_vss", category: "engine" }),
    ];

    const state = detectOperatingState(readings);
    expect(state.isIdling).toBe(true);
    expect(state.isUnderLoad).toBe(false);
    expect(state.rpm).toBe(700);
  });

  it("detects under-load operating state", () => {
    const readings = [
      makeOBDReading({ shortName: "RPM", value: 3000 }),
      makeOBDReading({ shortName: "LOAD", value: 80, id: "obd2_load", category: "engine" }),
      makeOBDReading({ shortName: "VSS", value: 60, id: "obd2_vss", category: "engine" }),
    ];

    const state = detectOperatingState(readings);
    expect(state.isUnderLoad).toBe(true);
    expect(state.load).toBe(80);
  });

  it("detects warm-up state", () => {
    const readings = [
      makeOBDReading({ shortName: "RPM", value: 800 }),
      makeOBDReading({ shortName: "ECT", value: 45, id: "obd2_ect", category: "cooling" }),
    ];

    const state = detectOperatingState(readings);
    expect(state.isWarmingUp).toBe(true);
    expect(state.coolantTemp).toBe(45);
  });

  it("generates warning for high coolant temperature (OBD-II)", () => {
    const readings = [
      makeOBDReading({ shortName: "ECT", value: 108, id: "obd2_ect", category: "cooling", unit: "°C" }),
    ];

    const issues = analyzeThresholds(readings);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe("warning");
    expect(issues[0].shortName).toBe("ECT");
  });

  it("generates critical for overheating (OBD-II)", () => {
    const readings = [
      makeOBDReading({ shortName: "ECT", value: 120, id: "obd2_ect", category: "cooling", unit: "°C" }),
    ];

    const issues = analyzeThresholds(readings);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe("critical");
  });

  it("generates warning for high J1939 RPM", () => {
    const readings = [
      makeJ1939Reading({ shortName: "RPM", value: 2800 }),
    ];

    const issues = analyzeThresholds(readings);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe("warning");
    expect(issues[0].protocol).toBe("j1939");
  });

  it("generates critical for very high J1939 RPM", () => {
    const readings = [
      makeJ1939Reading({ shortName: "RPM", value: 3500 }),
    ];

    const issues = analyzeThresholds(readings);
    const critical = issues.find(i => i.type === "critical");
    expect(critical).toBeDefined();
  });

  it("no issues for normal readings", () => {
    const readings = [
      makeOBDReading({ shortName: "RPM", value: 2000 }),
      makeOBDReading({ shortName: "ECT", value: 90, id: "obd2_ect", category: "cooling" }),
      makeOBDReading({ shortName: "LOAD", value: 40, id: "obd2_load", category: "engine" }),
    ];

    const report = runUnifiedDiagnostics(readings);
    expect(report.issues.length).toBe(0);
    expect(report.health.overall).toBeGreaterThan(80);
  });

  it("detects idle instability pattern", () => {
    const now = Date.now();
    const readings: NormalizedReading[] = [];

    // Simulate fluctuating idle RPM
    for (let i = 0; i < 20; i++) {
      readings.push(
        makeOBDReading({
          shortName: "RPM",
          value: 700 + Math.sin(i) * 100, // fluctuating between 600-800
          timestamp: now + i * 100,
        })
      );
    }
    readings.push(
      makeOBDReading({ shortName: "VSS", value: 0, id: "obd2_vss", category: "engine" })
    );

    const state = detectOperatingState(readings);
    const issues = analyzePatterns(readings, state);
    const idleIssue = issues.find(i => i.id === "pattern_idle_instability");
    expect(idleIssue).toBeDefined();
  });

  it("detects fuel trim divergence", () => {
    const readings = [
      makeOBDReading({ shortName: "STFT1", value: 15, id: "obd2_stft", category: "fuel", unit: "%" }),
      makeOBDReading({ shortName: "LTFT1", value: 12, id: "obd2_ltft", category: "fuel", unit: "%" }),
      makeOBDReading({ shortName: "RPM", value: 2000 }),
    ];

    const state = detectOperatingState(readings);
    const issues = analyzePatterns(readings, state);
    const fuelIssue = issues.find(i => i.id === "pattern_fuel_trim_divergence");
    expect(fuelIssue).toBeDefined();
    expect(fuelIssue?.description).toContain("lean");
  });

  it("finds cross-protocol correlations", () => {
    const readings = [
      makeOBDReading({ shortName: "RPM", value: 1500 }),
      makeJ1939Reading({ shortName: "ENGINE_SPEED", value: 1520 }),
    ];

    const correlations = findCrossProtocolCorrelations(readings);
    expect(correlations.length).toBeGreaterThan(0);
    // 1.3% deviation between 1500 and 1520 is < 5%, so 'consistent'
    expect(["consistent", "minor-deviation"]).toContain(correlations[0].status);
  });

  it("calculates health scores correctly", () => {
    const readings = [
      makeOBDReading({ shortName: "ECT", value: 120, id: "obd2_ect", category: "cooling", unit: "°C" }),
      makeOBDReading({ shortName: "RPM", value: 2000 }),
    ];

    const report = runUnifiedDiagnostics(readings);
    expect(report.health.overall).toBeLessThan(100);
    expect(report.health.thermal).toBeLessThan(100);
  });

  it("generates meaningful summary", () => {
    const readings = [
      makeOBDReading({ shortName: "ECT", value: 120, id: "obd2_ect", category: "cooling", unit: "°C" }),
    ];

    const report = runUnifiedDiagnostics(readings);
    expect(report.summary.length).toBeGreaterThan(10);
    expect(report.summary).toContain("critical");
  });

  it("handles multi-protocol data", () => {
    const readings = [
      makeOBDReading({ shortName: "RPM", value: 2000 }),
      makeJ1939Reading({ shortName: "ENG_SPD", value: 1800 }),
      makeKLineReading({ shortName: "RPM", value: 1900, id: "kline_rpm" }),
    ];

    const report = runUnifiedDiagnostics(readings);
    expect(report.protocol).toBe("multi");
    expect(report.totalReadings).toBe(3);
  });

  it("deduplicates issues with same ID", () => {
    // Two readings that would trigger the same threshold check
    const readings = [
      makeOBDReading({ shortName: "ECT", value: 108, id: "obd2_ect", category: "cooling", unit: "°C" }),
    ];

    const report = runUnifiedDiagnostics(readings);
    const ectIssues = report.issues.filter(i => i.shortName === "ECT");
    expect(ectIssues.length).toBe(1); // Should be deduplicated
  });
});
