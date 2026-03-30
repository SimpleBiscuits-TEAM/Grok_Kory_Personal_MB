/**
 * Protocol Auto-Detection System
 * 
 * Automatically detects which protocol(s) a vehicle supports and returns
 * confidence scores for each. Follows detection sequence: OBD-II → J1939 → K-Line
 */

import { OBDConnection, PIDDefinition, STANDARD_PIDS } from './obdConnection';

export type DetectedProtocol = 'obd2' | 'j1939' | 'kline' | 'vop';

export interface ProtocolDetectionResult {
  protocol: DetectedProtocol;
  confidence: number; // 0-1, higher = more confident
  responseTime: number; // ms
  supportedFeatures: string[]; // e.g., ['standard_pids', 'extended_pids', 'dtc_read', 'dtc_clear']
  vehicleInfo?: {
    make?: string;
    model?: string;
    year?: number;
    engineType?: string;
  };
  error?: string;
}

export interface AutoDetectionOptions {
  timeout?: number; // ms per protocol test
  prioritize?: DetectedProtocol[]; // order to test protocols
  requireVehicleInfo?: boolean; // fail if VIN can't be read
}

// ─── OBD-II Detection ──────────────────────────────────────────────────────

/**
 * Detect OBD-II protocol support
 */
export async function detectOBD2(
  connection: OBDConnection,
  timeout: number = 5000
): Promise<ProtocolDetectionResult> {
  const startTime = performance.now();

  try {
    // Try to read a standard PID (Engine RPM - 0x0C)
    // Use the STANDARD_PIDS constant from obdConnection module
    const rpmPid = STANDARD_PIDS.find((p: PIDDefinition) => p.shortName === 'RPM');
    if (!rpmPid) {
      throw new Error('RPM PID not found in standard PIDs');
    }

    const response = await Promise.race([
      connection.readPid(rpmPid),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OBD-II detection timeout')), timeout)
      ),
    ]);

    const responseTime = performance.now() - startTime;
    const confidence = responseTime < 500 ? 1.0 : responseTime < 2000 ? 0.9 : 0.7;

    // Try to get vehicle info from connection (if available)
    let vehicleInfo: ProtocolDetectionResult['vehicleInfo'] | undefined;
    // Note: vehicleInfo is private on OBDConnection, so we can't access it directly
    // In a real implementation, we would expose a getter method
    // For now, we'll just indicate detection was successful

    return {
      protocol: 'obd2',
      confidence,
      responseTime,
      supportedFeatures: ['standard_pids', 'extended_pids', 'dtc_read', 'dtc_clear', 'live_data'],
      vehicleInfo: undefined, // Would be populated if connection exposed vehicleInfo getter
    };
  } catch (error) {
    return {
      protocol: 'obd2',
      confidence: 0,
      responseTime: performance.now() - startTime,
      supportedFeatures: [],
      error: `OBD-II detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ─── J1939 Detection ──────────────────────────────────────────────────────

/**
 * Detect J1939 protocol support (placeholder for future CAN implementation)
 */
export async function detectJ1939(
  timeout: number = 5000
): Promise<ProtocolDetectionResult> {
  const startTime = performance.now();

  try {
    // Future: Implement actual J1939 CAN detection
    // For now, return not detected
    throw new Error('J1939 CAN interface not yet implemented');
  } catch (error) {
    return {
      protocol: 'j1939',
      confidence: 0,
      responseTime: performance.now() - startTime,
      supportedFeatures: [],
      error: `J1939 detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ─── K-Line Detection ─────────────────────────────────────────────────────

/**
 * Detect K-Line protocol support (placeholder for future serial implementation)
 */
export async function detectKLine(
  timeout: number = 5000
): Promise<ProtocolDetectionResult> {
  const startTime = performance.now();

  try {
    // Future: Implement actual K-Line serial detection
    // For now, return not detected
    throw new Error('K-Line serial interface not yet implemented');
  } catch (error) {
    return {
      protocol: 'kline',
      confidence: 0,
      responseTime: performance.now() - startTime,
      supportedFeatures: [],
      error: `K-Line detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ─── V-OP Detection ───────────────────────────────────────────────

/**
 * Detect V-OP protocol support (placeholder — protocol arriving soon)
 */
export async function detectVOP(
  timeout: number = 5000
): Promise<ProtocolDetectionResult> {
  const startTime = performance.now();

  try {
    // Future: Implement actual V-OP proprietary protocol detection
    // Protocol details arriving next week
    throw new Error('V-OP protocol not yet implemented — coming soon');
  } catch (error) {
    return {
      protocol: 'vop',
      confidence: 0,
      responseTime: performance.now() - startTime,
      supportedFeatures: [],
      error: `V-OP detection: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ─── Auto-Detection Orchestrator ──────────────────────────────────────────

export interface DetectionResults {
  detected: ProtocolDetectionResult[];
  primary: ProtocolDetectionResult | null;
  secondary: ProtocolDetectionResult[];
  allFailed: boolean;
}

/**
 * Automatically detect all supported protocols
 */
export async function autoDetectProtocols(
  obd2Connection: OBDConnection | null,
  options: AutoDetectionOptions = {}
): Promise<DetectionResults> {
  const {
    timeout = 5000,
    prioritize = ['obd2', 'j1939', 'kline', 'vop'],
    requireVehicleInfo = false,
  } = options;

  const results: ProtocolDetectionResult[] = [];

  // Test protocols in priority order
  for (const protocol of prioritize) {
    if (protocol === 'obd2' && obd2Connection) {
      const result = await detectOBD2(obd2Connection, timeout);
      if (result.confidence > 0) {
        results.push(result);
      }
    } else if (protocol === 'j1939') {
      const result = await detectJ1939(timeout);
      if (result.confidence > 0) {
        results.push(result);
      }
    } else if (protocol === 'kline') {
      const result = await detectKLine(timeout);
      if (result.confidence > 0) {
        results.push(result);
      }
    } else if (protocol === 'vop') {
      const result = await detectVOP(timeout);
      if (result.confidence > 0) {
        results.push(result);
      }
    }
  }

  // Sort by confidence
  results.sort((a, b) => b.confidence - a.confidence);

  // Filter by vehicle info requirement
  const filtered = requireVehicleInfo ? results.filter(r => r.vehicleInfo) : results;

  return {
    detected: filtered,
    primary: filtered.length > 0 ? filtered[0] : null,
    secondary: filtered.slice(1),
    allFailed: filtered.length === 0,
  };
}

// ─── Confidence Scoring ────────────────────────────────────────────────────

/**
 * Calculate overall protocol confidence based on multiple factors
 */
export function calculateProtocolConfidence(result: ProtocolDetectionResult): number {
  let confidence = result.confidence;

  // Boost confidence if vehicle info was detected
  if (result.vehicleInfo) {
    confidence = Math.min(1.0, confidence + 0.1);
  }

  // Reduce confidence if response time is very high
  if (result.responseTime > 3000) {
    confidence *= 0.8;
  }

  // Reduce confidence if many features are missing
  if (result.supportedFeatures.length < 3) {
    confidence *= 0.9;
  }

  return Math.max(0, Math.min(1, confidence));
}

// ─── Protocol Recommendation ──────────────────────────────────────────────

export interface ProtocolRecommendation {
  recommended: DetectedProtocol;
  reason: string;
  alternatives: DetectedProtocol[];
  confidence: number;
}

/**
 * Recommend best protocol based on detection results
 */
export function recommendProtocol(
  results: DetectionResults
): ProtocolRecommendation | null {
  if (!results.primary) {
    return null;
  }

  const primary = results.primary;
  const alternatives = results.secondary.map(r => r.protocol);

  let reason = '';
  switch (primary.protocol) {
    case 'obd2':
      reason = 'OBD-II detected with high confidence. Universal standard for all vehicles.';
      break;
    case 'j1939':
      reason = 'J1939 detected. Optimal for heavy-duty trucks with advanced diagnostics.';
      break;
    case 'kline':
      reason = 'K-Line detected. Best for legacy European and Asian vehicles.';
      break;
    case 'vop':
      reason = 'V-OP detected. Proprietary PPEI protocol for advanced vehicle optimization.';
      break;
  }

  return {
    recommended: primary.protocol,
    reason,
    alternatives,
    confidence: calculateProtocolConfidence(primary),
  };
}

// ─── UI Helper: Format Detection Results ────────────────────────────────────

export function formatDetectionResult(result: ProtocolDetectionResult): string {
  const protocol = result.protocol.toUpperCase();
  const confidence = Math.round(result.confidence * 100);
  const responseTime = Math.round(result.responseTime);

  if (result.error) {
    return `${protocol}: Failed (${result.error})`;
  }

  return `${protocol}: ${confidence}% confidence (${responseTime}ms)`;
}

/**
 * Get protocol-specific icon/color for UI display
 */
export function getProtocolStyle(protocol: DetectedProtocol): {
  color: string;
  icon: string;
  label: string;
} {
  switch (protocol) {
    case 'obd2':
      return {
        color: 'oklch(0.70 0.18 200)', // Blue
        icon: '📡',
        label: 'OBD-II',
      };
    case 'j1939':
      return {
        color: 'oklch(0.60 0.20 300)', // Purple
        icon: '🚛',
        label: 'J1939',
      };
    case 'kline':
      return {
        color: 'oklch(0.65 0.20 55)', // Orange
        icon: '🔧',
        label: 'K-Line',
      };
    case 'vop':
      return {
        color: 'oklch(0.52 0.22 25)', // Red (PPEI brand)
        icon: '⚡',
        label: 'V-OP',
      };
  }
}
