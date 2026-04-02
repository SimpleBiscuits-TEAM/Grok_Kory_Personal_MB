/**
 * PCAN Flash Orchestrator — Safety-critical flash sequence engine
 * 
 * Generates flash plans from container headers, runs a simulator,
 * handles recovery, and provides fun facts during flash.
 */
import {
  type ContainerFileHeader, type ContainerBlockStruct, type EcuConfig,
  getEcuConfig, FlashStep, FLASH_STEP_DESCRIPTIONS,
} from './ecuDatabase';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type FlashPhase =
  | 'PRE_CHECK' | 'VOLTAGE_INIT' | 'SESSION_OPEN' | 'SECURITY_ACCESS'
  | 'PRE_FLASH' | 'BLOCK_TRANSFER' | 'POST_FLASH' | 'VERIFICATION'
  | 'CLEANUP' | 'RECOVERY';

export interface FlashCommand {
  id: number;
  phase: FlashPhase;
  label: string;
  canTx?: string;
  canRx?: string;
  expectedPositive?: string;
  timeoutMs: number;
  retries: number;
  blockData?: {
    blockId: number;
    blockType: 'OS' | 'CAL' | 'PATCH';
    startAddr: string;
    endAddr: string;
    totalBytes: number;
    compressed: boolean;
  };
}

export interface FlashPlan {
  ecuType: string;
  ecuName: string;
  flashMode: 'FULL_FLASH' | 'CALIBRATION' | 'PATCH_ONLY';
  vin: string;
  fileId: string;
  isValid: boolean;
  validationErrors: string[];
  warnings: string[];
  commands: FlashCommand[];
  totalBlocks: number;
  totalBytes: number;
  estimatedTimeMs: number;
  securityInfo: {
    seedLevel: number;
    algorithm: string;
    requiresHardware: boolean;
  };
}

export interface SimulatorLogEntry {
  timestamp: number;
  phase: FlashPhase;
  type: 'info' | 'success' | 'warning' | 'error' | 'can_tx' | 'can_rx' | 'nrc';
  message: string;
  blockId?: number;
  nrcCode?: number;
}

export interface RecoveryPlan {
  steps: string[];
  estimatedTimeMs: number;
  requiresPowerCycle: boolean;
  requiresReEntry: boolean;
  nrcCode?: number;
  nrcDescription?: string;
}

export interface SimulatorState {
  isRunning: boolean;
  isPaused: boolean;
  currentCommandIndex: number;
  currentPhase: FlashPhase;
  progress: number;
  blockProgress: number;
  currentBlock: number;
  totalBlocks: number;
  transferredBytes: number;
  totalBytes: number;
  elapsedMs: number;
  statusMessage: string;
  log: SimulatorLogEntry[];
  result: 'SUCCESS' | 'FAILED' | 'ABORTED' | null;
  recoveryPlan: RecoveryPlan | null;
  recoveryAttempt: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// FLASH PLAN GENERATION
// ═══════════════════════════════════════════════════════════════════════════

export function generateFlashPlan(
  header: ContainerFileHeader,
  ecuType: string,
  flashMode: 'FULL_FLASH' | 'CALIBRATION' | 'PATCH_ONLY' = 'CALIBRATION',
): FlashPlan {
  const ecuConfig = getEcuConfig(ecuType);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!header.block_struct?.length) errors.push('No blocks found in container');
  // Seed/key may be empty in PPEI containers (extracted at flash time) — warn, don't block
  if (!header.seed || !header.key) warnings.push('Seed/key not in header — will be extracted from container at flash time');
  // Unknown ECU is a warning — we can still flash with default CAN addresses
  if (!ecuConfig) warnings.push(`ECU type "${ecuType}" not in database — using default CAN addresses`);

  const txAddr = ecuConfig?.txAddr ?? 0x7E0;
  const rxAddr = ecuConfig?.rxAddr ?? 0x7E8;
  const txHex = `0x${txAddr.toString(16).toUpperCase()}`;
  const rxHex = `0x${rxAddr.toString(16).toUpperCase()}`;

  const commands: FlashCommand[] = [];
  let cmdId = 0;

  // Phase 1: PRE_CHECK
  commands.push({
    id: cmdId++, phase: 'PRE_CHECK', label: 'Verify ECU communication (TesterPresent)',
    canTx: `${txHex} 02 3E 00`, canRx: `${rxHex} 02 7E 00`,
    expectedPositive: '7E', timeoutMs: 2000, retries: 3,
  });

  // Phase 2: VOLTAGE_INIT
  commands.push({
    id: cmdId++, phase: 'VOLTAGE_INIT', label: 'Set relay board to programming voltage',
    timeoutMs: 1000, retries: 1,
  });

  // Phase 3: SESSION_OPEN
  const sessionByte = ecuConfig?.protocol === 'GMLAN' ? '02' : '02';
  commands.push({
    id: cmdId++, phase: 'SESSION_OPEN', label: 'Open Programming Session (DiagnosticSessionControl)',
    canTx: `${txHex} 02 10 ${sessionByte}`, canRx: `${rxHex} 02 50 ${sessionByte}`,
    expectedPositive: '50', timeoutMs: 5000, retries: 2,
  });

  // Phase 4: SECURITY_ACCESS
  const seedLevel = ecuConfig?.seedLevel ?? 1;
  commands.push({
    id: cmdId++, phase: 'SECURITY_ACCESS', label: `Request Seed (Level ${seedLevel})`,
    canTx: `${txHex} 02 27 ${seedLevel.toString(16).padStart(2, '0')}`,
    canRx: `${rxHex} xx 67 ...`,
    expectedPositive: '67', timeoutMs: 5000, retries: 2,
  });
  commands.push({
    id: cmdId++, phase: 'SECURITY_ACCESS', label: 'Send Key',
    canTx: `${txHex} xx 27 ${(seedLevel + 1).toString(16).padStart(2, '0')} ...`,
    canRx: `${rxHex} 02 67 ${(seedLevel + 1).toString(16).padStart(2, '0')}`,
    expectedPositive: '67', timeoutMs: 5000, retries: 1,
  });

  // Phase 5: PRE_FLASH (per-block erase + request download)
  const blocks = header.block_struct || [];
  const filteredBlocks = blocks.filter(b => {
    if (flashMode === 'CALIBRATION') return b.OS !== 'true';
    if (flashMode === 'PATCH_ONLY') return b.OS === 'patch' || b.OS === 'forcepatch';
    return true; // FULL_FLASH
  });

  let totalBytes = 0;
  for (const block of filteredBlocks) {
    const blockLen = block.block_length ? parseInt(block.block_length, 16) : 0;
    const isOS = block.OS === 'true';
    const isPatch = block.OS === 'patch' || block.OS === 'forcepatch';
    const blockType = isPatch ? 'PATCH' as const : isOS ? 'OS' as const : 'CAL' as const;

    // Erase
    if (block.erase !== '0' && block.erase !== undefined) {
      commands.push({
        id: cmdId++, phase: 'PRE_FLASH', label: `Erase Block #${block.block_id} (${blockType})`,
        canTx: `${txHex} 04 31 01 FF 00`,
        expectedPositive: '71', timeoutMs: 30000, retries: 1,
      });
    }

    // Request Download
    commands.push({
      id: cmdId++, phase: 'PRE_FLASH', label: `Request Download Block #${block.block_id}`,
      canTx: `${txHex} xx 34 00 44 ${block.start_adresse || '00000000'} ${block.block_length || '00000000'}`,
      expectedPositive: '74', timeoutMs: 5000, retries: 2,
    });

    // Block Transfer
    commands.push({
      id: cmdId++, phase: 'BLOCK_TRANSFER',
      label: `Transfer Block #${block.block_id} (${blockType}) — ${formatBytes(blockLen)}`,
      expectedPositive: '76', timeoutMs: 120000, retries: 1,
      blockData: {
        blockId: block.block_id,
        blockType,
        startAddr: block.start_adresse || '0',
        endAddr: block.end_adresse || '0',
        totalBytes: blockLen,
        compressed: !!(block.LzssLen && parseInt(block.LzssLen, 16) > 0),
      },
    });
    totalBytes += blockLen;

    // Transfer Exit
    commands.push({
      id: cmdId++, phase: 'BLOCK_TRANSFER', label: `Transfer Exit Block #${block.block_id}`,
      canTx: `${txHex} 01 37`, expectedPositive: '77', timeoutMs: 5000, retries: 1,
    });
  }

  // Phase 7: POST_FLASH
  commands.push({
    id: cmdId++, phase: 'POST_FLASH', label: 'Routine Control — Check Programming Dependencies',
    canTx: `${txHex} 04 31 01 FF 01`, expectedPositive: '71', timeoutMs: 10000, retries: 2,
  });

  // Phase 8: VERIFICATION
  commands.push({
    id: cmdId++, phase: 'VERIFICATION', label: 'Read ECU Identification (post-flash)',
    canTx: `${txHex} 03 22 F1 90`, expectedPositive: '62', timeoutMs: 5000, retries: 2,
  });

  // Phase 9: CLEANUP
  commands.push({
    id: cmdId++, phase: 'CLEANUP', label: 'ECU Reset (HardReset)',
    canTx: `${txHex} 02 11 01`, expectedPositive: '51', timeoutMs: 5000, retries: 1,
  });
  commands.push({
    id: cmdId++, phase: 'CLEANUP', label: 'Clear DTCs (Functional Address)',
    canTx: `0x7DF 04 14 FF FF FF`, expectedPositive: '54', timeoutMs: 5000, retries: 2,
  });

  const estimatedTimeMs = commands.reduce((sum, c) => {
    if (c.blockData) return sum + Math.max(c.blockData.totalBytes / 4000, 2000);
    return sum + c.timeoutMs * 0.3;
  }, 0);

  return {
    ecuType,
    ecuName: ecuConfig?.name || ecuType,
    flashMode,
    vin: header.vin || '',
    fileId: header.file_id || '',
    isValid: errors.length === 0,
    validationErrors: errors,
    warnings,
    commands,
    totalBlocks: filteredBlocks.length,
    totalBytes,
    estimatedTimeMs,
    securityInfo: {
      seedLevel,
      algorithm: ecuConfig ? 'GM_5B_AES' : 'UNKNOWN',
      requiresHardware: false,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATOR
// ═══════════════════════════════════════════════════════════════════════════

export function createSimulatorState(plan: FlashPlan): SimulatorState {
  return {
    isRunning: false,
    isPaused: false,
    currentCommandIndex: 0,
    currentPhase: 'PRE_CHECK',
    progress: 0,
    blockProgress: 0,
    currentBlock: 0,
    totalBlocks: plan.totalBlocks,
    transferredBytes: 0,
    totalBytes: plan.totalBytes,
    elapsedMs: 0,
    statusMessage: 'Ready to launch',
    log: [],
    result: null,
    recoveryPlan: null,
    recoveryAttempt: 0,
  };
}

export function advanceSimulator(
  state: SimulatorState,
  plan: FlashPlan,
  deltaMs: number,
  failAtCommand?: number,
): SimulatorState {
  if (!state.isRunning || state.isPaused || state.result) return state;

  const next = { ...state, elapsedMs: state.elapsedMs + deltaMs, log: [...state.log] };
  const cmd = plan.commands[next.currentCommandIndex];
  if (!cmd) {
    next.result = 'SUCCESS';
    next.statusMessage = 'Flash completed successfully!';
    next.progress = 100;
    next.log.push({
      timestamp: next.elapsedMs, phase: next.currentPhase,
      type: 'success', message: '✅ All commands executed successfully',
    });
    return next;
  }

  // Check for simulated failure
  if (failAtCommand !== undefined && next.currentCommandIndex === failAtCommand) {
    const nrcCode = 0x72; // generalProgrammingFailure
    next.result = 'FAILED';
    next.statusMessage = `Flash failed at command #${cmd.id}: NRC 0x${nrcCode.toString(16)}`;
    next.recoveryPlan = generateRecoveryPlan(nrcCode, cmd.phase, plan.ecuType);
    next.log.push({
      timestamp: next.elapsedMs, phase: cmd.phase,
      type: 'nrc', message: `NRC 0x${nrcCode.toString(16)} — ${getNRCDescription(nrcCode)}`,
      nrcCode,
    });
    return next;
  }

  next.currentPhase = cmd.phase;

  // Handle block transfer progress
  if (cmd.blockData) {
    const transferRate = 4000; // bytes per 100ms tick
    next.transferredBytes = Math.min(
      next.transferredBytes + transferRate,
      cmd.blockData.totalBytes + (next.transferredBytes - (next.blockProgress * cmd.blockData.totalBytes / 100)),
    );
    next.blockProgress = Math.min(next.blockProgress + (transferRate / cmd.blockData.totalBytes) * 100, 100);

    if (next.blockProgress >= 100) {
      next.log.push({
        timestamp: next.elapsedMs, phase: cmd.phase, type: 'success',
        message: `Block #${cmd.blockData.blockId} (${cmd.blockData.blockType}) transferred — ${formatBytes(cmd.blockData.totalBytes)}`,
        blockId: cmd.blockData.blockId,
      });
      next.currentBlock++;
      next.blockProgress = 0;
      next.currentCommandIndex++;
    }

    next.statusMessage = `Transferring Block #${cmd.blockData.blockId} (${cmd.blockData.blockType}) — ${next.blockProgress.toFixed(0)}%`;
  } else {
    // Non-block command: complete in one tick
    next.log.push({
      timestamp: next.elapsedMs, phase: cmd.phase, type: 'success',
      message: `✓ ${cmd.label}`,
    });
    next.currentCommandIndex++;
    next.statusMessage = cmd.label;
  }

  next.progress = (next.currentCommandIndex / plan.commands.length) * 100;
  return next;
}

// ═══════════════════════════════════════════════════════════════════════════
// RECOVERY
// ═══════════════════════════════════════════════════════════════════════════

export function generateRecoveryPlan(
  nrcCode: number,
  failedPhase: FlashPhase,
  ecuType: string,
): RecoveryPlan {
  const desc = getNRCDescription(nrcCode);
  const steps: string[] = [];
  let requiresPowerCycle = false;
  let requiresReEntry = false;

  if (nrcCode === 0x22 || nrcCode === 0x31) {
    steps.push('Conditions not correct — wait 2 seconds and retry');
    steps.push('If retry fails, power cycle ECU and re-enter programming session');
    requiresReEntry = true;
  } else if (nrcCode === 0x35 || nrcCode === 0x72) {
    steps.push('Programming failure detected — do NOT power off');
    steps.push('Attempt to re-enter programming session');
    steps.push('Re-send the failed block from the beginning');
    steps.push('If block fails again, try reducing transfer size');
    requiresReEntry = true;
  } else if (nrcCode === 0x33) {
    steps.push('Security access denied — seed/key mismatch');
    steps.push('Power cycle ECU to reset security counter');
    steps.push('Wait 10 seconds after power cycle');
    steps.push('Re-enter programming session and retry security access');
    requiresPowerCycle = true;
    requiresReEntry = true;
  } else {
    steps.push(`Unexpected NRC 0x${nrcCode.toString(16)} — ${desc}`);
    steps.push('Attempt ECU reset and re-enter programming session');
    steps.push('If issue persists, contact PPEI support');
    requiresReEntry = true;
  }

  return {
    steps,
    estimatedTimeMs: requiresPowerCycle ? 15000 : 5000,
    requiresPowerCycle,
    requiresReEntry,
    nrcCode,
    nrcDescription: desc,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// NRC DESCRIPTIONS
// ═══════════════════════════════════════════════════════════════════════════

const NRC_MAP: Record<number, string> = {
  0x10: 'General Reject',
  0x11: 'Service Not Supported',
  0x12: 'Sub-Function Not Supported',
  0x13: 'Incorrect Message Length',
  0x14: 'Response Too Long',
  0x21: 'Busy — Repeat Request',
  0x22: 'Conditions Not Correct',
  0x24: 'Request Sequence Error',
  0x25: 'No Response From Sub-Net Component',
  0x26: 'Failure Prevents Execution',
  0x31: 'Request Out Of Range',
  0x33: 'Security Access Denied',
  0x35: 'Invalid Key',
  0x36: 'Exceeded Number Of Attempts',
  0x37: 'Required Time Delay Not Expired',
  0x70: 'Upload/Download Not Accepted',
  0x71: 'Transfer Data Suspended',
  0x72: 'General Programming Failure',
  0x73: 'Wrong Block Sequence Counter',
  0x78: 'Request Correctly Received — Response Pending',
  0x7E: 'Sub-Function Not Supported In Active Session',
  0x7F: 'Service Not Supported In Active Session',
};

export function getNRCDescription(nrcCode: number): string {
  return NRC_MAP[nrcCode] || `Unknown NRC (0x${nrcCode.toString(16)})`;
}

// ═══════════════════════════════════════════════════════════════════════════
// FUN FACTS
// ═══════════════════════════════════════════════════════════════════════════

const GENERAL_FUN_FACTS = [
  'The average ECU processes over 2,000 CAN messages per second.',
  'Modern vehicles contain 70-150 ECUs communicating on multiple CAN buses.',
  'UDS (Unified Diagnostic Services) was standardized in ISO 14229 in 2006.',
  'The CAN bus protocol was invented by Bosch in 1986.',
  'A typical calibration flash transfers 256KB-2MB of data to the ECU.',
  'LZSS compression can reduce flash file sizes by 30-60%.',
  'The seed/key security handshake happens in under 50 milliseconds.',
  'GM\'s Global A architecture uses 500kbps CAN for diagnostics.',
  'Flash memory in ECUs can typically handle 100,000+ write cycles.',
  'The first automotive ECU was introduced by GM in 1981 (Cadillac).',
  'Transfer block sizes are typically 4088 bytes (0xFF8) for optimal CAN framing.',
  'NRC 0x78 (Response Pending) means the ECU is busy — patience is key.',
  'Power interruption during flash is the #1 cause of bricked ECUs.',
  'DevProg containers use a CRC32 checksum at offset 0x1000 for integrity.',
  'The VOP 3.0 relay board can switch between 12V and programming voltage in 50ms.',
];

const ECU_SPECIFIC_FACTS: Record<string, string[]> = {
  E88: [
    'The E88 (6L80/6L90) transmission controller manages 6 forward gears and reverse.',
    'E88 calibrations control shift points, line pressure, and torque converter lockup.',
    'The 6L80 transmission was introduced in 2006 in the Chevrolet Corvette.',
  ],
  E41: [
    'The E41 (L5P Duramax) ECM manages a 6.6L V8 turbodiesel producing 445hp.',
    'E41 calibrations control fuel injection timing, boost pressure, and EGR flow.',
    'The L5P Duramax uses piezo injectors capable of 5 injection events per cycle.',
  ],
  E90: [
    'The E90 (L86/L87) ECM controls the 6.2L EcoTec3 V8 with Active Fuel Management.',
    'E90 calibrations manage cylinder deactivation, variable valve timing, and direct injection.',
  ],
  E46: [
    'The E46 (LT1/LT4) ECM powers the 6.2L V8 in the C7 Corvette and Camaro SS.',
    'E46 calibrations control direct injection, variable valve timing, and Active Fuel Management.',
  ],
};

export function getAllFunFacts(ecuType: string): string[] {
  const specific = ECU_SPECIFIC_FACTS[ecuType.toUpperCase()] || [];
  return [...specific, ...GENERAL_FUN_FACTS];
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}
