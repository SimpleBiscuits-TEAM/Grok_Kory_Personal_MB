/**
 * Storm Chase PID Bridge
 *
 * Maps live datalogger PID readings to the Storm Chase telemetry format.
 * When the datalogger is active and connected, this bridge converts
 * PIDReading[] from the OBD connection into TelemetryData for the
 * Storm Chase dashboard and WebSocket relay.
 *
 * Supports:
 * - Standard OBD-II PIDs (Mode 01)
 * - Extended GM/Duramax PIDs (Mode 22)
 * - Placeholder/simulated data for testing
 */

import type { PIDReading } from "./obdConnection";

// ── Storm Chase Telemetry Shape ──────────────────────────────────────────────

export interface StormChaseTelemetry {
  rpm: number | null;
  mph: number | null;
  throttlePct: number | null;
  brakePct: number | null;
  rpmPct: number | null;
  boostPsi: number | null;
  gForceX: number | null;
  gForceY: number | null;
  coolantTemp: number | null;
  transTemp: number | null;
  oilTemp: number | null;
  oilPressure: number | null;
  egt: number | null;
  fuelRailPressure: number | null;
  intakeAirTemp: number | null;
  mafRate: number | null;
  engineLoad: number | null;
}

export const EMPTY_TELEMETRY: StormChaseTelemetry = {
  rpm: null,
  mph: null,
  throttlePct: null,
  brakePct: null,
  rpmPct: null,
  boostPsi: null,
  gForceX: null,
  gForceY: null,
  coolantTemp: null,
  transTemp: null,
  oilTemp: null,
  oilPressure: null,
  egt: null,
  fuelRailPressure: null,
  intakeAirTemp: null,
  mafRate: null,
  engineLoad: null,
};

// ── PID → Telemetry Mapping ──────────────────────────────────────────────────

/**
 * Maps PID shortNames to telemetry fields.
 * Supports multiple shortName aliases for the same field.
 */
const PID_TO_TELEMETRY: Record<string, keyof StormChaseTelemetry> = {
  // Standard OBD-II
  RPM: "rpm",
  VSS: "mph",
  TPS: "throttlePct",
  ECT: "coolantTemp",
  IAT: "intakeAirTemp",
  MAF: "mafRate",
  LOAD: "engineLoad",
  MAP: "boostPsi",

  // Extended / GM-specific
  TRANS_TEMP: "transTemp",
  OIL_TEMP: "oilTemp",
  OIL_PRESS: "oilPressure",
  EGT: "egt",
  EGT1: "egt",
  FUEL_RAIL: "fuelRailPressure",
  FRP: "fuelRailPressure",
  BRAKE_POS: "brakePct",
  APP: "throttlePct", // Accelerator pedal position (preferred over TPS for diesel)

  // HP Tuners / EFI Live common names
  "ECM.RPM": "rpm",
  "ECM.VSS": "mph",
  "ECM.APP1": "throttlePct",
  "ECM.ECT": "coolantTemp",
  "ECM.EOT": "oilTemp",
  "ECM.EOP": "oilPressure",
  "ECM.FRP_ACT": "fuelRailPressure",
  "ECM.EGT1": "egt",
  "TCM.TRANS_TEMP": "transTemp",
  "TCM.TOT": "transTemp",
};

/**
 * Convert live PID readings into Storm Chase telemetry format.
 * Handles unit conversions where needed.
 */
export function pidReadingsToTelemetry(readings: PIDReading[]): StormChaseTelemetry {
  const telemetry = { ...EMPTY_TELEMETRY };

  for (const reading of readings) {
    const field = PID_TO_TELEMETRY[reading.shortName];
    if (!field) continue;

    let value = reading.value;

    // Unit conversions
    if (field === "boostPsi" && reading.unit === "kPa") {
      value = value * 0.14504 - 14.696; // kPa gauge → PSI gauge
    } else if (field === "coolantTemp" && reading.unit === "°C") {
      value = value * 9 / 5 + 32; // °C → °F
    } else if (field === "transTemp" && reading.unit === "°C") {
      value = value * 9 / 5 + 32;
    } else if (field === "oilTemp" && reading.unit === "°C") {
      value = value * 9 / 5 + 32;
    } else if (field === "intakeAirTemp" && reading.unit === "°C") {
      value = value * 9 / 5 + 32;
    } else if (field === "mph" && reading.unit === "km/h") {
      value = value * 0.621371;
    }

    telemetry[field] = value;
  }

  // Derive rpmPct from RPM (assuming 5000 RPM max for diesel)
  if (telemetry.rpm !== null) {
    telemetry.rpmPct = Math.min(100, (telemetry.rpm / 5000) * 100);
  }

  return telemetry;
}

// ── Storm Chase PID Set ──────────────────────────────────────────────────────

/**
 * The set of PID shortNames that Storm Chase needs.
 * Use this to configure the datalogger's active PID list when entering storm chase mode.
 */
export const STORM_CHASE_REQUIRED_PIDS = [
  "RPM",
  "VSS",
  "TPS",
  "ECT",
  "MAP",
  "IAT",
  "MAF",
  "LOAD",
] as const;

/**
 * Extended PIDs for GM/Duramax vehicles (Mode 22).
 * These provide richer data but require manufacturer-specific support.
 */
export const STORM_CHASE_EXTENDED_PIDS = [
  "TRANS_TEMP",
  "OIL_TEMP",
  "OIL_PRESS",
  "EGT1",
  "FRP",
  "BRAKE_POS",
  "APP",
] as const;

// ── Placeholder / Test Data Generator ────────────────────────────────────────

/**
 * Generate simulated telemetry for test mode.
 * Provides realistic-looking data that varies over time.
 */
export function generateTestTelemetry(elapsedSec: number): StormChaseTelemetry {
  const t = elapsedSec;
  const sineWave = (period: number, min: number, max: number) =>
    min + ((Math.sin(t * 2 * Math.PI / period) + 1) / 2) * (max - min);
  const jitter = (base: number, range: number) =>
    base + (Math.random() - 0.5) * range;

  return {
    rpm: Math.round(jitter(sineWave(30, 700, 3200), 50)),
    mph: Math.round(jitter(sineWave(45, 0, 85), 2)),
    throttlePct: Math.round(jitter(sineWave(20, 0, 95), 3)),
    brakePct: Math.round(Math.max(0, jitter(sineWave(60, 0, 30), 5))),
    rpmPct: null, // Derived from RPM
    boostPsi: Math.round(jitter(sineWave(25, -5, 35), 2) * 10) / 10,
    gForceX: Math.round(jitter(sineWave(15, -0.5, 0.5), 0.1) * 100) / 100,
    gForceY: Math.round(jitter(sineWave(12, -0.3, 0.3), 0.05) * 100) / 100,
    coolantTemp: Math.round(jitter(sineWave(120, 185, 215), 2)),
    transTemp: Math.round(jitter(sineWave(90, 160, 210), 3)),
    oilTemp: Math.round(jitter(sineWave(100, 200, 240), 2)),
    oilPressure: Math.round(jitter(sineWave(30, 25, 60), 3)),
    egt: Math.round(jitter(sineWave(40, 400, 1100), 20)),
    fuelRailPressure: Math.round(jitter(sineWave(20, 5000, 26000), 200)),
    intakeAirTemp: Math.round(jitter(sineWave(60, 80, 120), 3)),
    mafRate: Math.round(jitter(sineWave(25, 5, 45), 2) * 10) / 10,
    engineLoad: Math.round(jitter(sineWave(20, 10, 95), 3)),
  };
}

// ── WebSocket Integration Helper ─────────────────────────────────────────────

/**
 * Create a WebSocket connection to the Storm Chase relay for the driver role.
 * Sends telemetry data at the specified interval.
 */
export function createDriverWebSocket(
  host: string,
  streamKey: string,
  getTelemetry: () => StormChaseTelemetry,
  intervalMs: number = 200, // 5Hz default
): {
  connect: () => void;
  disconnect: () => void;
  sendEvent: (label: string, data?: Record<string, unknown>) => void;
  sendHealth: (status: "green" | "yellow" | "red") => void;
  isConnected: () => boolean;
} {
  let ws: WebSocket | null = null;
  let sendInterval: ReturnType<typeof setInterval> | null = null;

  const connect = () => {
    const protocol = host.startsWith("https") ? "wss" : "ws";
    const wsHost = host.replace(/^https?:\/\//, "");
    ws = new WebSocket(`${protocol}://${wsHost}/ws/storm-chase?key=${streamKey}&role=driver`);

    ws.onopen = () => {
      // Start sending telemetry at the configured rate
      sendInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          const data = getTelemetry();
          ws.send(JSON.stringify({ type: "telemetry", data }));
        }
      }, intervalMs);
    };

    ws.onclose = () => {
      if (sendInterval) {
        clearInterval(sendInterval);
        sendInterval = null;
      }
    };

    ws.onerror = () => {
      // Will trigger onclose
    };
  };

  const disconnect = () => {
    if (sendInterval) {
      clearInterval(sendInterval);
      sendInterval = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
  };

  const sendEvent = (label: string, data?: Record<string, unknown>) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "event", label, data: data ?? {} }));
    }
  };

  const sendHealth = (status: "green" | "yellow" | "red") => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "health", status }));
    }
  };

  const isConnected = () => ws?.readyState === WebSocket.OPEN;

  return { connect, disconnect, sendEvent, sendHealth, isConnected };
}

/**
 * Create a WebSocket connection to the Storm Chase relay for the viewer role.
 * Receives telemetry data and events.
 */
export function createViewerWebSocket(
  host: string,
  streamKey: string,
  callbacks: {
    onTelemetry?: (data: StormChaseTelemetry, ts: number) => void;
    onEvent?: (label: string, data: Record<string, unknown>, ts: number) => void;
    onHealth?: (status: "green" | "yellow" | "red", ts: number) => void;
    onViewerCount?: (count: number) => void;
    onSessionEnded?: () => void;
    onConnect?: () => void;
    onDisconnect?: () => void;
  },
): {
  connect: () => void;
  disconnect: () => void;
  isConnected: () => boolean;
} {
  let ws: WebSocket | null = null;

  const connect = () => {
    const protocol = host.startsWith("https") ? "wss" : "ws";
    const wsHost = host.replace(/^https?:\/\//, "");
    ws = new WebSocket(`${protocol}://${wsHost}/ws/storm-chase?key=${streamKey}&role=viewer`);

    ws.onopen = () => {
      callbacks.onConnect?.();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "telemetry":
            callbacks.onTelemetry?.(msg.data, msg.ts);
            break;
          case "event":
            callbacks.onEvent?.(msg.label, msg.data, msg.ts);
            break;
          case "health":
            callbacks.onHealth?.(msg.status, msg.ts);
            break;
          case "viewer_count":
            callbacks.onViewerCount?.(msg.count);
            break;
          case "session_ended":
            callbacks.onSessionEnded?.();
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      callbacks.onDisconnect?.();
    };

    ws.onerror = () => {
      // Will trigger onclose
    };
  };

  const disconnect = () => {
    if (ws) {
      ws.close();
      ws = null;
    }
  };

  const isConnected = () => ws?.readyState === WebSocket.OPEN;

  return { connect, disconnect, isConnected };
}
