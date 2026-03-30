/**
 * Cross-Protocol Fault Correlation Engine
 * 
 * TIER 2: Maps faults and DTCs across J1939, K-Line, and OBD-II protocols.
 * Features:
 *   - J1939 DM1 SPN/FMI to OBD-II DTC mapping
 *   - K-Line fault to OBD-II DTC mapping
 *   - Root cause analysis across protocols
 *   - Correlation confidence scoring
 *   - Fault timeline reconstruction
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProtocolFault {
  protocol: 'obd2' | 'j1939' | 'kline' | 'vop';
  code: string; // DTC (OBD-II), SPN/FMI (J1939), or hex code (K-Line)
  description: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: number;
  status: 'active' | 'pending' | 'stored' | 'cleared';
  // J1939 specific
  spn?: number;
  fmi?: number;
  sourceAddress?: number;
  occurrenceCount?: number;
  // OBD-II specific
  mode?: number;
  // K-Line specific
  ecuAddress?: number;
}

export interface FaultCorrelation {
  id: string;
  primaryFault: ProtocolFault;
  correlatedFaults: ProtocolFault[];
  correlationType: 'equivalent' | 'related' | 'causal' | 'symptomatic';
  confidence: number; // 0-100
  rootCause: string;
  description: string;
  affectedSystems: string[];
  recommendedAction: string;
  timeline: { timestamp: number; event: string; protocol: string }[];
}

export interface CorrelationReport {
  createdAt: number;
  totalFaults: number;
  correlatedGroups: FaultCorrelation[];
  uncorrelatedFaults: ProtocolFault[];
  crossProtocolMatches: number;
  overallSeverity: 'none' | 'low' | 'moderate' | 'high' | 'critical';
  summary: string[];
}

// ─── J1939 SPN/FMI to OBD-II DTC Mapping ───────────────────────────────────

interface SPNMapping {
  spn: number;
  name: string;
  obdDTCs: string[];
  system: string;
  description: string;
}

const SPN_TO_OBD_MAP: SPNMapping[] = [
  // Engine
  { spn: 91, name: 'Accelerator Pedal Position', obdDTCs: ['P0120', 'P0122', 'P0123'], system: 'fuel', description: 'Throttle/Pedal Position Sensor' },
  { spn: 100, name: 'Engine Oil Pressure', obdDTCs: ['P0520', 'P0521', 'P0522', 'P0523'], system: 'engine', description: 'Engine Oil Pressure Sensor/Switch' },
  { spn: 102, name: 'Boost Pressure', obdDTCs: ['P0234', 'P0235', 'P0236', 'P0299'], system: 'turbo', description: 'Turbocharger Boost Sensor' },
  { spn: 105, name: 'Intake Manifold Temperature', obdDTCs: ['P0110', 'P0112', 'P0113'], system: 'intake', description: 'Intake Air Temperature Sensor' },
  { spn: 108, name: 'Barometric Pressure', obdDTCs: ['P0105', 'P0106', 'P0107', 'P0108'], system: 'intake', description: 'Barometric Pressure Sensor' },
  { spn: 110, name: 'Engine Coolant Temperature', obdDTCs: ['P0115', 'P0116', 'P0117', 'P0118'], system: 'cooling', description: 'Engine Coolant Temperature Sensor' },
  { spn: 157, name: 'Fuel Rail Pressure', obdDTCs: ['P0190', 'P0191', 'P0192', 'P0193'], system: 'fuel', description: 'Fuel Rail Pressure Sensor' },
  { spn: 158, name: 'Battery Voltage', obdDTCs: ['P0562', 'P0563'], system: 'electrical', description: 'System Voltage' },
  { spn: 168, name: 'Battery Potential', obdDTCs: ['P0562', 'P0563'], system: 'electrical', description: 'Battery Voltage' },
  { spn: 171, name: 'Ambient Air Temperature', obdDTCs: ['P0070', 'P0071', 'P0072', 'P0073'], system: 'intake', description: 'Ambient Air Temperature Sensor' },
  { spn: 174, name: 'Fuel Temperature', obdDTCs: ['P0180', 'P0181', 'P0182', 'P0183'], system: 'fuel', description: 'Fuel Temperature Sensor' },
  { spn: 175, name: 'Engine Oil Temperature', obdDTCs: ['P0195', 'P0196', 'P0197', 'P0198'], system: 'engine', description: 'Engine Oil Temperature Sensor' },
  { spn: 190, name: 'Engine Speed', obdDTCs: ['P0335', 'P0336', 'P0337', 'P0338'], system: 'engine', description: 'Crankshaft Position Sensor' },
  { spn: 512, name: 'Driver Demand Torque', obdDTCs: ['P2135', 'P2138'], system: 'fuel', description: 'Throttle/Pedal Position Correlation' },
  { spn: 513, name: 'Actual Engine Torque', obdDTCs: ['P0606', 'P2106'], system: 'engine', description: 'Engine Torque Control' },
  { spn: 520, name: 'Post-Turbo Exhaust Pressure', obdDTCs: ['P0470', 'P0471', 'P0472', 'P0473'], system: 'exhaust', description: 'Exhaust Pressure Sensor' },
  { spn: 544, name: 'Engine Reference Torque', obdDTCs: ['P0606'], system: 'engine', description: 'Engine Control Module' },
  { spn: 723, name: 'Secondary Engine Speed', obdDTCs: ['P0385', 'P0386', 'P0387', 'P0388'], system: 'engine', description: 'Camshaft Position Sensor' },
  { spn: 1127, name: 'Turbo Compressor Inlet Pressure', obdDTCs: ['P0105', 'P0106'], system: 'turbo', description: 'Turbo Inlet Pressure' },
  { spn: 1172, name: 'Turbo Compressor Inlet Temperature', obdDTCs: ['P0110', 'P0111'], system: 'turbo', description: 'Turbo Inlet Temperature' },
  { spn: 1176, name: 'Turbo Speed', obdDTCs: ['P0234', 'P0235'], system: 'turbo', description: 'Turbocharger Speed' },
  { spn: 1761, name: 'Aftertreatment SCR Catalyst Inlet Temperature', obdDTCs: ['P2080', 'P2081'], system: 'aftertreatment', description: 'SCR Inlet Temperature' },
  { spn: 3031, name: 'Aftertreatment DPF Differential Pressure', obdDTCs: ['P2452', 'P2453', 'P2454', 'P2455'], system: 'aftertreatment', description: 'DPF Differential Pressure' },
  { spn: 3226, name: 'Aftertreatment DPF Soot Load', obdDTCs: ['P2002', 'P2003'], system: 'aftertreatment', description: 'DPF Soot Load' },
  { spn: 3251, name: 'Aftertreatment DEF Tank Level', obdDTCs: ['P2BAD', 'P2BAE'], system: 'aftertreatment', description: 'DEF Level' },
  { spn: 3464, name: 'Aftertreatment NOx Sensor', obdDTCs: ['P2200', 'P2201', 'P229F'], system: 'aftertreatment', description: 'NOx Sensor' },
  // Transmission
  { spn: 161, name: 'Transmission Input Speed', obdDTCs: ['P0715', 'P0716', 'P0717'], system: 'transmission', description: 'Input/Turbine Speed Sensor' },
  { spn: 162, name: 'Transmission Output Speed', obdDTCs: ['P0720', 'P0721', 'P0722'], system: 'transmission', description: 'Output Speed Sensor' },
  { spn: 177, name: 'Transmission Oil Temperature', obdDTCs: ['P0710', 'P0711', 'P0712', 'P0713'], system: 'transmission', description: 'Transmission Fluid Temperature Sensor' },
];

// ─── FMI to Failure Mode Description ────────────────────────────────────────

const FMI_DESCRIPTIONS: Record<number, string> = {
  0: 'Data valid but above normal operational range (most severe)',
  1: 'Data valid but below normal operational range (most severe)',
  2: 'Data erratic, intermittent, or incorrect',
  3: 'Voltage above normal, or shorted to high source',
  4: 'Voltage below normal, or shorted to low source',
  5: 'Current below normal or open circuit',
  6: 'Current above normal or grounded circuit',
  7: 'Mechanical system not responding or out of adjustment',
  8: 'Abnormal frequency or pulse width or period',
  9: 'Abnormal update rate',
  10: 'Abnormal rate of change',
  11: 'Root cause not known',
  12: 'Bad intelligent device or component',
  13: 'Out of calibration',
  14: 'Special instructions',
  15: 'Data valid but above normal operating range (least severe)',
  16: 'Data valid but above normal operating range (moderately severe)',
  17: 'Data valid but below normal operating range (least severe)',
  18: 'Data valid but below normal operating range (moderately severe)',
  19: 'Received network data in error',
  20: 'Data drifted high',
  21: 'Data drifted low',
  31: 'Condition exists',
};

// ─── K-Line to OBD-II Mapping ───────────────────────────────────────────────

interface KLineMapping {
  klineCode: string;
  obdDTCs: string[];
  system: string;
  description: string;
}

const KLINE_TO_OBD_MAP: KLineMapping[] = [
  { klineCode: '0100', obdDTCs: ['P0100', 'P0101', 'P0102', 'P0103'], system: 'intake', description: 'MAF Sensor' },
  { klineCode: '0110', obdDTCs: ['P0110', 'P0112', 'P0113'], system: 'intake', description: 'IAT Sensor' },
  { klineCode: '0115', obdDTCs: ['P0115', 'P0117', 'P0118'], system: 'cooling', description: 'ECT Sensor' },
  { klineCode: '0120', obdDTCs: ['P0120', 'P0122', 'P0123'], system: 'fuel', description: 'TPS Sensor' },
  { klineCode: '0130', obdDTCs: ['P0130', 'P0131', 'P0132', 'P0133'], system: 'emissions', description: 'O2 Sensor Bank 1 Sensor 1' },
  { klineCode: '0170', obdDTCs: ['P0170', 'P0171', 'P0172'], system: 'fuel', description: 'Fuel Trim Bank 1' },
  { klineCode: '0300', obdDTCs: ['P0300', 'P0301', 'P0302', 'P0303', 'P0304'], system: 'ignition', description: 'Misfire Detected' },
  { klineCode: '0335', obdDTCs: ['P0335', 'P0336'], system: 'engine', description: 'Crankshaft Position Sensor' },
  { klineCode: '0340', obdDTCs: ['P0340', 'P0341'], system: 'engine', description: 'Camshaft Position Sensor' },
  { klineCode: '0400', obdDTCs: ['P0400', 'P0401', 'P0402'], system: 'emissions', description: 'EGR System' },
  { klineCode: '0420', obdDTCs: ['P0420'], system: 'emissions', description: 'Catalyst System Efficiency' },
  { klineCode: '0440', obdDTCs: ['P0440', 'P0441', 'P0442', 'P0443'], system: 'evap', description: 'EVAP System' },
  { klineCode: '0500', obdDTCs: ['P0500', 'P0501', 'P0502', 'P0503'], system: 'vehicle', description: 'Vehicle Speed Sensor' },
];

// ─── Correlation Engine ─────────────────────────────────────────────────────

/**
 * Find cross-protocol correlations for a set of faults.
 */
export function correlateFaults(faults: ProtocolFault[]): CorrelationReport {
  if (faults.length === 0) {
    return createEmptyCorrelationReport();
  }

  const correlatedGroups: FaultCorrelation[] = [];
  const processedFaults = new Set<string>();
  const uncorrelatedFaults: ProtocolFault[] = [];

  // Sort faults by timestamp
  const sortedFaults = [...faults].sort((a, b) => a.timestamp - b.timestamp);

  // Try to correlate each fault
  for (const fault of sortedFaults) {
    const faultKey = `${fault.protocol}_${fault.code}_${fault.timestamp}`;
    if (processedFaults.has(faultKey)) continue;

    const correlatedGroup = findCorrelations(fault, sortedFaults, processedFaults);

    if (correlatedGroup) {
      correlatedGroups.push(correlatedGroup);
      processedFaults.add(faultKey);
      for (const cf of correlatedGroup.correlatedFaults) {
        processedFaults.add(`${cf.protocol}_${cf.code}_${cf.timestamp}`);
      }
    } else {
      uncorrelatedFaults.push(fault);
      processedFaults.add(faultKey);
    }
  }

  // Calculate overall severity
  let overallSeverity: CorrelationReport['overallSeverity'] = 'none';
  if (faults.length === 0) overallSeverity = 'none';
  else if (faults.some(f => f.severity === 'critical') || correlatedGroups.length > 3) overallSeverity = 'critical';
  else if (faults.some(f => f.severity === 'critical') || correlatedGroups.length > 1) overallSeverity = 'high';
  else if (faults.some(f => f.severity === 'warning')) overallSeverity = 'moderate';
  else overallSeverity = 'low';

  // Generate summary
  const summary = generateCorrelationSummary(correlatedGroups, uncorrelatedFaults, faults);

  return {
    createdAt: Date.now(),
    totalFaults: faults.length,
    correlatedGroups,
    uncorrelatedFaults,
    crossProtocolMatches: correlatedGroups.filter(g =>
      g.correlatedFaults.some(cf => cf.protocol !== g.primaryFault.protocol)
    ).length,
    overallSeverity,
    summary,
  };
}

/**
 * Find correlations for a single fault against all other faults.
 */
function findCorrelations(
  fault: ProtocolFault,
  allFaults: ProtocolFault[],
  processedFaults: Set<string>
): FaultCorrelation | null {
  const correlatedFaults: ProtocolFault[] = [];
  let correlationType: FaultCorrelation['correlationType'] = 'related';
  let confidence = 0;
  let rootCause = '';
  let description = '';
  const affectedSystems = new Set<string>();
  const timeline: FaultCorrelation['timeline'] = [];

  timeline.push({
    timestamp: fault.timestamp,
    event: `${fault.protocol.toUpperCase()} fault: ${fault.code} - ${fault.description}`,
    protocol: fault.protocol,
  });

  if (fault.protocol === 'j1939' && fault.spn !== undefined) {
    // J1939 → OBD-II correlation
    const spnMapping = SPN_TO_OBD_MAP.find(m => m.spn === fault.spn);
    if (spnMapping) {
      affectedSystems.add(spnMapping.system);

      // Look for matching OBD-II DTCs
      for (const otherFault of allFaults) {
        const otherKey = `${otherFault.protocol}_${otherFault.code}_${otherFault.timestamp}`;
        if (processedFaults.has(otherKey)) continue;
        if (otherFault === fault) continue;

        if (otherFault.protocol === 'obd2' && spnMapping.obdDTCs.includes(otherFault.code)) {
          correlatedFaults.push(otherFault);
          correlationType = 'equivalent';
          confidence = 90;
          rootCause = spnMapping.description;
          description = `J1939 SPN ${fault.spn} maps directly to OBD-II ${otherFault.code} (${spnMapping.description})`;

          timeline.push({
            timestamp: otherFault.timestamp,
            event: `OBD-II DTC: ${otherFault.code} - ${otherFault.description}`,
            protocol: otherFault.protocol,
          });
        }
      }

      // Also look for K-Line equivalents
      for (const otherFault of allFaults) {
        const otherKey = `${otherFault.protocol}_${otherFault.code}_${otherFault.timestamp}`;
        if (processedFaults.has(otherKey)) continue;
        if (otherFault === fault) continue;

        if (otherFault.protocol === 'kline') {
          const klineMapping = KLINE_TO_OBD_MAP.find(m =>
            m.obdDTCs.some(dtc => spnMapping.obdDTCs.includes(dtc))
          );
          if (klineMapping) {
            correlatedFaults.push(otherFault);
            if (correlationType !== 'equivalent') correlationType = 'related';
            confidence = Math.max(confidence, 70);
            affectedSystems.add(klineMapping.system);

            timeline.push({
              timestamp: otherFault.timestamp,
              event: `K-Line fault: ${otherFault.code} - ${otherFault.description}`,
              protocol: otherFault.protocol,
            });
          }
        }
      }

      if (correlatedFaults.length === 0 && spnMapping) {
        // No direct match but we have SPN info
        rootCause = spnMapping.description;
        description = `J1939 SPN ${fault.spn} (${spnMapping.name}) - FMI ${fault.fmi}: ${FMI_DESCRIPTIONS[fault.fmi || 11] || 'Unknown failure mode'}`;
        confidence = 50;
      }
    }
  } else if (fault.protocol === 'obd2') {
    // OBD-II → J1939 correlation
    for (const spnMapping of SPN_TO_OBD_MAP) {
      if (spnMapping.obdDTCs.includes(fault.code)) {
        affectedSystems.add(spnMapping.system);

        // Look for matching J1939 faults
        for (const otherFault of allFaults) {
          const otherKey = `${otherFault.protocol}_${otherFault.code}_${otherFault.timestamp}`;
          if (processedFaults.has(otherKey)) continue;
          if (otherFault === fault) continue;

          if (otherFault.protocol === 'j1939' && otherFault.spn === spnMapping.spn) {
            correlatedFaults.push(otherFault);
            correlationType = 'equivalent';
            confidence = 90;
            rootCause = spnMapping.description;
            description = `OBD-II ${fault.code} maps to J1939 SPN ${spnMapping.spn} (${spnMapping.name})`;

            timeline.push({
              timestamp: otherFault.timestamp,
              event: `J1939 SPN ${otherFault.spn}/FMI ${otherFault.fmi}: ${otherFault.description}`,
              protocol: otherFault.protocol,
            });
          }
        }

        if (correlatedFaults.length === 0) {
          rootCause = spnMapping.description;
          description = `OBD-II ${fault.code} relates to ${spnMapping.name} system`;
          confidence = 40;
        }
        break;
      }
    }

    // OBD-II → K-Line correlation
    for (const klineMapping of KLINE_TO_OBD_MAP) {
      if (klineMapping.obdDTCs.includes(fault.code)) {
        affectedSystems.add(klineMapping.system);

        for (const otherFault of allFaults) {
          const otherKey = `${otherFault.protocol}_${otherFault.code}_${otherFault.timestamp}`;
          if (processedFaults.has(otherKey)) continue;
          if (otherFault === fault) continue;

          if (otherFault.protocol === 'kline') {
            correlatedFaults.push(otherFault);
            correlationType = 'related';
            confidence = Math.max(confidence, 65);

            timeline.push({
              timestamp: otherFault.timestamp,
              event: `K-Line fault: ${otherFault.code} - ${otherFault.description}`,
              protocol: otherFault.protocol,
            });
          }
        }
        break;
      }
    }
  } else if (fault.protocol === 'kline') {
    // K-Line → OBD-II correlation
    const klineMapping = KLINE_TO_OBD_MAP.find(m => m.klineCode === fault.code.replace('P', ''));
    if (klineMapping) {
      affectedSystems.add(klineMapping.system);

      for (const otherFault of allFaults) {
        const otherKey = `${otherFault.protocol}_${otherFault.code}_${otherFault.timestamp}`;
        if (processedFaults.has(otherKey)) continue;
        if (otherFault === fault) continue;

        if (otherFault.protocol === 'obd2' && klineMapping.obdDTCs.includes(otherFault.code)) {
          correlatedFaults.push(otherFault);
          correlationType = 'equivalent';
          confidence = 85;
          rootCause = klineMapping.description;
          description = `K-Line ${fault.code} maps to OBD-II ${otherFault.code} (${klineMapping.description})`;

          timeline.push({
            timestamp: otherFault.timestamp,
            event: `OBD-II DTC: ${otherFault.code} - ${otherFault.description}`,
            protocol: otherFault.protocol,
          });
        }
      }
    }
  }

  // Check for temporal correlation (faults within 5 seconds of each other)
  if (correlatedFaults.length === 0) {
    for (const otherFault of allFaults) {
      const otherKey = `${otherFault.protocol}_${otherFault.code}_${otherFault.timestamp}`;
      if (processedFaults.has(otherKey)) continue;
      if (otherFault === fault) continue;
      if (otherFault.protocol === fault.protocol) continue;

      const timeDiff = Math.abs(otherFault.timestamp - fault.timestamp);
      if (timeDiff < 5000) {
        correlatedFaults.push(otherFault);
        correlationType = 'symptomatic';
        confidence = Math.max(confidence, 30 + Math.max(0, 30 - timeDiff / 100));
        description = description || `Temporal correlation: faults occurred within ${(timeDiff / 1000).toFixed(1)}s of each other`;

        timeline.push({
          timestamp: otherFault.timestamp,
          event: `${otherFault.protocol.toUpperCase()} fault: ${otherFault.code} - ${otherFault.description}`,
          protocol: otherFault.protocol,
        });
      }
    }
  }

  if (correlatedFaults.length === 0 && confidence < 40) {
    return null;
  }

  // Sort timeline
  timeline.sort((a, b) => a.timestamp - b.timestamp);

  // Determine recommended action
  const recommendedAction = generateRecommendedAction(
    fault,
    correlatedFaults,
    correlationType,
    Array.from(affectedSystems)
  );

  return {
    id: `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    primaryFault: fault,
    correlatedFaults,
    correlationType,
    confidence: Math.min(100, Math.round(confidence)),
    rootCause: rootCause || fault.description,
    description: description || `${fault.protocol.toUpperCase()} fault: ${fault.code}`,
    affectedSystems: Array.from(affectedSystems),
    recommendedAction,
    timeline,
  };
}

// ─── Recommended Actions ────────────────────────────────────────────────────

function generateRecommendedAction(
  primary: ProtocolFault,
  correlated: ProtocolFault[],
  type: FaultCorrelation['correlationType'],
  systems: string[]
): string {
  const allFaults = [primary, ...correlated];
  const hasCritical = allFaults.some(f => f.severity === 'critical');

  if (hasCritical) {
    return `IMMEDIATE: Critical fault detected in ${systems.join(', ')} system(s). Stop vehicle and inspect immediately.`;
  }

  if (type === 'equivalent') {
    return `Confirmed fault across ${allFaults.length} protocol(s) in ${systems.join(', ')} system. Diagnose ${systems[0]} components and wiring.`;
  }

  if (type === 'causal') {
    return `Root cause identified in ${systems[0]} system. Address primary fault first, then verify correlated faults clear.`;
  }

  if (type === 'symptomatic') {
    return `Multiple simultaneous faults suggest common cause. Check shared wiring, grounds, and power supply for ${systems.join(', ')} system(s).`;
  }

  return `Investigate ${systems.join(', ')} system(s). ${correlated.length} related fault(s) detected across protocols.`;
}

// ─── Summary Generation ─────────────────────────────────────────────────────

function generateCorrelationSummary(
  groups: FaultCorrelation[],
  uncorrelated: ProtocolFault[],
  allFaults: ProtocolFault[]
): string[] {
  const summary: string[] = [];

  if (allFaults.length === 0) {
    summary.push('No faults detected across any protocol.');
    return summary;
  }

  summary.push(`${allFaults.length} total fault(s) detected across ${new Set(allFaults.map(f => f.protocol)).size} protocol(s).`);

  if (groups.length > 0) {
    const crossProto = groups.filter(g =>
      g.correlatedFaults.some(cf => cf.protocol !== g.primaryFault.protocol)
    );
    summary.push(`${groups.length} correlated group(s) found, ${crossProto.length} with cross-protocol matches.`);
  }

  const equivalentGroups = groups.filter(g => g.correlationType === 'equivalent');
  if (equivalentGroups.length > 0) {
    summary.push(`${equivalentGroups.length} fault(s) confirmed across multiple protocols (high confidence).`);
  }

  if (uncorrelated.length > 0) {
    summary.push(`${uncorrelated.length} fault(s) could not be correlated to other protocols.`);
  }

  // System-level summary
  const affectedSystems = new Set<string>();
  for (const g of groups) {
    for (const s of g.affectedSystems) affectedSystems.add(s);
  }
  if (affectedSystems.size > 0) {
    summary.push(`Affected systems: ${Array.from(affectedSystems).join(', ')}.`);
  }

  return summary;
}

// ─── Empty Report ───────────────────────────────────────────────────────────

function createEmptyCorrelationReport(): CorrelationReport {
  return {
    createdAt: Date.now(),
    totalFaults: 0,
    correlatedGroups: [],
    uncorrelatedFaults: [],
    crossProtocolMatches: 0,
    overallSeverity: 'none',
    summary: ['No faults detected across any protocol.'],
  };
}

// ─── Utility: Create Fault from J1939 DM1 ──────────────────────────────────

export function createJ1939Fault(
  spn: number,
  fmi: number,
  sourceAddress: number,
  occurrenceCount: number,
  timestamp: number
): ProtocolFault {
  const mapping = SPN_TO_OBD_MAP.find(m => m.spn === spn);
  const fmiDesc = FMI_DESCRIPTIONS[fmi] || 'Unknown failure mode';

  return {
    protocol: 'j1939',
    code: `SPN${spn}/FMI${fmi}`,
    description: mapping
      ? `${mapping.name}: ${fmiDesc}`
      : `SPN ${spn}: ${fmiDesc}`,
    severity: fmi <= 1 || fmi === 12 ? 'critical' : fmi <= 6 ? 'warning' : 'info',
    timestamp,
    status: 'active',
    spn,
    fmi,
    sourceAddress,
    occurrenceCount,
  };
}

/**
 * Create a fault from an OBD-II DTC string.
 */
export function createOBD2Fault(
  dtc: string,
  description: string,
  timestamp: number,
  status: ProtocolFault['status'] = 'active'
): ProtocolFault {
  const severity: ProtocolFault['severity'] =
    dtc.startsWith('P0') ? 'warning' :
    dtc.startsWith('P2') ? 'warning' :
    dtc.startsWith('U') ? 'critical' :
    'info';

  return {
    protocol: 'obd2',
    code: dtc,
    description,
    severity,
    timestamp,
    status,
  };
}

/**
 * Create a fault from a K-Line diagnostic response.
 */
export function createKLineFault(
  code: string,
  description: string,
  ecuAddress: number,
  timestamp: number
): ProtocolFault {
  return {
    protocol: 'kline',
    code,
    description,
    severity: 'warning',
    timestamp,
    status: 'active',
    ecuAddress,
  };
}

/**
 * Get FMI description for display.
 */
export function getFMIDescription(fmi: number): string {
  return FMI_DESCRIPTIONS[fmi] || `Unknown FMI (${fmi})`;
}

/**
 * Get SPN mapping info for display.
 */
export function getSPNInfo(spn: number): SPNMapping | undefined {
  return SPN_TO_OBD_MAP.find(m => m.spn === spn);
}
