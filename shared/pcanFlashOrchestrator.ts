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

/** GM short (5) / full (6) flash — part names in flash order (sw_c1..sw_c6); UI shows "Block N — …" only */
const GM_5_6_PART_NAMES = [
  'Operating System',
  'Vehicle System',
  'Fuel System',
  'Speedometer Calibration',
  'Diagnostic Calibration',
  'Engine Calibration',
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type FlashPhase =
  | 'PRE_CHECK' | 'VOLTAGE_INIT' | 'SESSION_OPEN' | 'SECURITY_ACCESS'
  | 'PRE_FLASH' | 'BLOCK_TRANSFER' | 'POST_FLASH' | 'VERIFICATION'
  | 'KEY_CYCLE' | 'CLEANUP' | 'RECOVERY';

export type UserActionType = 'KEY_OFF' | 'KEY_ON' | 'KEY_ON_START' | 'WAIT_BOOT';

export interface FlashCommand {
  id: number;
  phase: FlashPhase;
  label: string;
  canTx?: string;
  canRx?: string;
  expectedPositive?: string;
  timeoutMs: number;
  retries: number;
  /** Delay in ms to wait BEFORE sending this command. Extracted from BUSMASTER timing analysis. */
  delayBeforeMs?: number;
  /** If set, flash engine pauses and prompts user for confirmation before proceeding */
  userAction?: {
    type: UserActionType;
    prompt: string;
    /** If true, auto-proceed after timeoutMs (used for WAIT_BOOT). If false, wait for user confirmation. */
    autoConfirm?: boolean;
  };
  /** If true, timeout on this command is non-fatal — log warning and continue */
  nonFatal?: boolean;
  blockData?: {
    blockId: number;
    blockType: 'OS' | 'CAL' | 'PATCH';
    sectionName: string;
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
  /** Internal: ticks spent on the current non-block command */
  commandTickCount: number;
  /** Estimated time remaining in ms */
  estimatedRemainingMs: number;
  /** Human-readable name of the current section being flashed */
  currentSectionName: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCK SECTION NAME MAPPING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Section title for UI: **Block N** = Nth transfer in this run (1..filtered count).
 * For GM C1–C6 containers, the **part name** comes from `containerBlockId` (sw_c slot), not N — so short-flash
 * (skip C1/OS) shows e.g. "Block 1 — Vehicle System" when the first transfer is container block_id 2.
 */
function getBlockSectionName(
  sequenceIndex: number,
  containerBlockId: number,
  blockType: 'OS' | 'CAL' | 'PATCH',
  ecuType: string,
  totalBlocks: number,
): string {
  const ecuCfg = getEcuConfig(ecuType);
  const isGmlan = ecuCfg?.protocol === 'GMLAN';
  const label = (name: string) => `Block ${sequenceIndex} — ${name}`;

  if (totalBlocks === 1) {
    if (blockType === 'OS') return label('Operating System + Calibration');
    return label('Full Calibration');
  }

  if (blockType === 'PATCH') return label('OS Patch');

  if (isGmlan && (totalBlocks === 5 || totalBlocks === 6)) {
    const slot = Number(containerBlockId);
    if (slot >= 1 && slot <= GM_5_6_PART_NAMES.length) {
      return label(GM_5_6_PART_NAMES[slot - 1]);
    }
  }

  if (blockType === 'OS') return label('Operating System');

  const calNames: Record<number, string> = {
    1: 'Engine Calibration (Fuel & Spark Tables)',
    2: 'Transmission Calibration (Shift Points & Line Pressure)',
    3: 'Emissions & Diagnostics (DTC Thresholds & OBD-II)',
    4: 'Torque Management (Torque Limits & Reduction)',
    5: 'Speed Limiter & Rev Limiter',
    6: 'Idle & Cruise Control',
    7: 'Boost Control (Turbo/Supercharger)',
    8: 'Exhaust & Aftertreatment (EGR, DPF, DEF)',
  };

  return calNames[sequenceIndex]
    ? label(calNames[sequenceIndex])
    : label(`Calibration segment ${sequenceIndex}`);
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
  const isGMLAN = ecuConfig?.protocol === 'GMLAN';

  // Phase 1: PRE_CHECK
  if (!isGMLAN) {
    // Standard UDS: TesterPresent (0x3E 0x00) verifies ECU is alive
    commands.push({
      id: cmdId++, phase: 'PRE_CHECK', label: 'Verify ECU communication (TesterPresent)',
      canTx: `${txHex} 02 3E 00`, canRx: `${rxHex} 02 7E 00`,
      expectedPositive: '7E', timeoutMs: 2000, retries: 3,
    });
  }
  // GMLAN ECUs do NOT support USDT TesterPresent (0x3E 0x00) — they always
  // return NRC 0x12 (subFunctionNotSupported). The correct keepalive is the
  // UUDT broadcast (FE 01 3E on 0x101). ECU communication is verified via
  // the seed request and DID reads in PRE_CHECK instead.

  // Phase 2: VOLTAGE_INIT
  commands.push({
    id: cmdId++, phase: 'VOLTAGE_INIT', label: 'Set relay board to programming voltage',
    timeoutMs: 1000, retries: 1,
  });

  // Phase 3: SESSION_OPEN
  // ═══ BUSMASTER-PROVEN E41 Flash Broadcast Sequence ═══
  // Timing and order extracted from raw BUSMASTER CAN log of successful 18 L5P stock flash.
  // All broadcast commands use UUDT format (FE prefix) on functional address 0x101.
  // ECU does NOT respond to UUDT messages — fire-and-forget.
  // TesterPresent cyclic starts at step 8 (after A5 03) — do not inject FE 01 3E before 0x28/A5.
  if (isGMLAN) {
    // Step 1: ReturnToNormal (functional broadcast — resets all ECUs to known state)
    // BUSMASTER: first command at 0.29s
    commands.push({
      id: cmdId++, phase: 'SESSION_OPEN', label: 'ReturnToNormal — All ECUs (Functional 0x101)',
      canTx: `0x101 FE 01 20`, expectedPositive: '60', timeoutMs: 3000, retries: 2,
    });
    // Step 2: ReadDID 0xB0 (functional — read SW versions from all ECUs)
    // BUSMASTER: 1000ms after ReturnToNormal
    commands.push({
      id: cmdId++, phase: 'SESSION_OPEN', label: 'Read SW Version 0xB0 — All ECUs (Functional 0x101)',
      canTx: `0x101 FE 02 1A B0`, expectedPositive: '5A', timeoutMs: 3000, retries: 1,
      delayBeforeMs: 1000,  // BUSMASTER: 1000ms after RTN
    });
    // Step 3: DiagnosticSessionControl 0x02 (functional — put all ECUs in programming session)
    // BUSMASTER: 60ms after ReadDID B0
    commands.push({
      id: cmdId++, phase: 'SESSION_OPEN', label: 'Programming Session — All ECUs (Functional 0x101)',
      canTx: `0x101 FE 02 10 02`, expectedPositive: '50', timeoutMs: 5000, retries: 3,
      delayBeforeMs: 60,    // BUSMASTER: 60ms after ReadDID
    });
    // Step 4: DisableNormalCommunication (functional — silence the bus)
    // BUSMASTER: 50ms after DiagSessionControl
    commands.push({
      id: cmdId++, phase: 'SESSION_OPEN', label: 'Disable Normal Communication (Functional 0x101)',
      canTx: `0x101 FE 01 28`, expectedPositive: '68', timeoutMs: 3000, retries: 2,
      delayBeforeMs: 50,    // BUSMASTER: 50ms after DiagSession
    });
    // Step 5: ReportProgrammedState (functional)
    // BUSMASTER: 50ms after DisableNormalComm
    commands.push({
      id: cmdId++, phase: 'SESSION_OPEN', label: 'Report Programmed State (Functional 0x101)',
      canTx: `0x101 FE 01 A2`, expectedPositive: 'E2', timeoutMs: 3000, retries: 1,
      delayBeforeMs: 50,    // BUSMASTER: 50ms after DisableComm
    });
    // Step 6: ProgrammingMode Enable (functional)
    // BUSMASTER: 1000ms after ReportProgrammedState
    commands.push({
      id: cmdId++, phase: 'SESSION_OPEN', label: 'ProgrammingMode Enable (Functional 0x101)',
      canTx: `0x101 FE 02 A5 01`, expectedPositive: 'E5', timeoutMs: 5000, retries: 2,
      delayBeforeMs: 1000,  // BUSMASTER: 1000ms after ReportState
    });
    // Step 7: ProgrammingMode Complete (functional) — ECU REBOOTS INTO BOOTLOADER
    // BUSMASTER: 50ms after A5 01
    commands.push({
      id: cmdId++, phase: 'SESSION_OPEN', label: 'ProgrammingMode Complete (Functional 0x101)',
      canTx: `0x101 FE 02 A5 03`, expectedPositive: 'E5', timeoutMs: 5000, retries: 2,
      delayBeforeMs: 50,    // BUSMASTER: 50ms after A5 01
    });
    // Step 8: Start TesterPresent cyclic AFTER A5 03 — engine starts interval + first UUDT 3E here.
    commands.push({
      id: cmdId++, phase: 'SESSION_OPEN', label: 'Start TesterPresent Cyclic (UUDT, 500ms)',
      canTx: `0x101 FE 01 3E`, expectedPositive: '7E', timeoutMs: 3000, retries: 1,
      delayBeforeMs: 50,    // Immediately after A5 03
    });
    // NOTE: No physical session (0x10 0x02 on 0x7E0) between broadcast and security.
    // The broadcast ProgrammingSession (step 3: FE 02 10 02 on 0x101) already
    // establishes the session for all ECUs. BUSMASTER confirms no physical session.
  } else {
    // Standard UDS: simple session switch on physical address
    commands.push({
      id: cmdId++, phase: 'SESSION_OPEN', label: 'Open Programming Session (DiagnosticSessionControl)',
      canTx: `${txHex} 02 10 02`, canRx: `${rxHex} 02 50 02`,
      expectedPositive: '50', timeoutMs: 5000, retries: 3,
    });
  }

  // Phase 4: SECURITY_ACCESS
  // For GMLAN ECUs: After the SESSION_OPEN broadcast (DisableNormalCommunication 0x28
  // + ProgrammingMode A5 01/03), the ECU may stop responding to USDT commands on the
  // physical address. Security may have been granted in PRE_CHECK (before the broadcast),
  // but even if PRE_CHECK security also failed (intermittent ECU responsiveness), the
  // flash should proceed to PRE_FLASH. These commands are marked nonFatal for GMLAN.
  // The flash engine also has a belt-and-suspenders GMLAN safety net in executeCommand().
  const seedLevel = ecuConfig?.seedLevel ?? 1;
  commands.push({
    id: cmdId++, phase: 'SECURITY_ACCESS', label: `Request Seed (Level ${seedLevel})`,
    canTx: `${txHex} 02 27 ${seedLevel.toString(16).padStart(2, '0')}`,
    canRx: `${rxHex} xx 67 ...`,
    expectedPositive: '67', timeoutMs: 5000, retries: 2,
    nonFatal: isGMLAN,  // GMLAN: PRE_CHECK already granted security; post-broadcast seed may timeout
    delayBeforeMs: isGMLAN ? 4000 : undefined,  // BUSMASTER: 4.0s fixed delay after A5 03 with keepalive running (7 TP frames)
  });
  commands.push({
    id: cmdId++, phase: 'SECURITY_ACCESS', label: 'Send Key',
    canTx: `${txHex} xx 27 ${(seedLevel + 1).toString(16).padStart(2, '0')} ...`,
    canRx: `${rxHex} 02 67 ${(seedLevel + 1).toString(16).padStart(2, '0')}`,
    expectedPositive: '67', timeoutMs: 5000, retries: 1,
    nonFatal: isGMLAN,  // GMLAN: PRE_CHECK already granted security; post-broadcast key may timeout
  });

  // Phase 5: PRE_FLASH (per-block erase + request download)
  const blocks = header.block_struct || [];
  let filteredBlocks = blocks.filter(b => {
    if (flashMode === 'CALIBRATION') return b.OS !== 'true';
    if (flashMode === 'PATCH_ONLY') return b.OS === 'patch' || b.OS === 'forcepatch';
    return true; // FULL_FLASH
  });
  // If CALIBRATION mode filtered out ALL blocks (e.g., single-block L5P containers
  // where the one block has OS='true' but contains both OS+cal), flash all blocks
  if (flashMode === 'CALIBRATION' && filteredBlocks.length === 0 && blocks.length > 0) {
    filteredBlocks = blocks;
    warnings.push('All blocks marked as OS — flashing entire container in calibration mode');
  }

  // ═══ GM PriRC (SendCustomGMPriRC) ═══
  // Single-frame 05 34 00 00 0F FE after seed/key, before the first per-block 0x34.
  // Implemented in pcanFlashEngine.executeBlockTransfer() (not here) so PCAN + V-OP
  // USB share one code path. Per-block rc34 (e.g. 34 10 0F FE …) follows in the engine.

  let totalBytes = 0;
  let blockSequence = 0;
  for (const block of filteredBlocks) {
    blockSequence++;
    const blockLen = block.block_length ? parseInt(block.block_length, 16) : 0;
    const isOS = block.OS === 'true';
    const isPatch = block.OS === 'patch' || block.OS === 'forcepatch';
    const blockType = isPatch ? 'PATCH' as const : isOS ? 'OS' as const : 'CAL' as const;
    const sectionName = getBlockSectionName(
      blockSequence, block.block_id, blockType, ecuType, filteredBlocks.length,
    );

    // Erase handling:
    // GMLAN ECUs (E41, E88, etc.): NO separate erase command (0x31). The erase is
    // IMPLICIT in RequestDownload (0x34) — the ECU responds with NRC 0x78 (ResponsePending)
    // while erasing internally, then 0x74 when ready. Service 0x31 returns NRC 0x11
    // (serviceNotSupported) on E41. Confirmed by busmaster_analysis.md and shortflash_analysis.md.
    // Non-GMLAN ECUs: respect the container's erase field.
    if (!isGMLAN && block.erase !== '0' && block.erase !== undefined) {
      commands.push({
        id: cmdId++, phase: 'PRE_FLASH', label: `Erase — ${sectionName}`,
        canTx: `${txHex} 04 31 01 FF 00`,
        expectedPositive: '71', timeoutMs: 30000, retries: 1,
      });
    }

    // NOTE: Per-block RequestDownload (0x34) is NOT generated here as a separate command.
    // The executeBlockTransfer() method in the flash engine handles RequestDownload
    // using block.rc34 from the container header, which has the correct format.
    // Previously, this generated a canTx with 'xx' placeholder for the PCI length byte,
    // which the engine parsed as serviceId=0 (NaN→0), sending garbage to the ECU.
    // See flash log #8 analysis for details.

    // Block Transfer
    commands.push({
      id: cmdId++, phase: 'BLOCK_TRANSFER',
      label: `Flashing ${sectionName} — ${formatBytes(blockLen)}`,
      expectedPositive: '76', timeoutMs: 120000, retries: 1,
      blockData: {
        blockId: block.block_id,
        blockType,
        sectionName,
        startAddr: block.start_adresse || '0',
        endAddr: block.end_adresse || '0',
        totalBytes: blockLen,
        compressed: !!(block.LzssLen && parseInt(block.LzssLen, 16) > 0),
      },
    });
    totalBytes += blockLen;

    // BUSMASTER analysis: NO TransferExit (0x37) in the entire successful E41 flash.
    // Zero 0x37 commands across 504,189 CAN frames. The next RequestDownload implicitly
    // closes the current block. Only add TransferExit for non-GMLAN ECUs.
    if (!isGMLAN) {
      commands.push({
        id: cmdId++, phase: 'BLOCK_TRANSFER', label: `Transfer Exit Block #${block.block_id}`,
        canTx: `${txHex} 01 37`, expectedPositive: '77', timeoutMs: 5000, retries: 1,
      });
    }
  }

  // Phase 7: POST_FLASH — UDS RoutineControl 0x31 0x01 0xFF 0x01 (check programming dependencies).
  // Omitted for GMLAN: not supported on typical GM ECMs (would NRC or waste time).
  if (!isGMLAN) {
    commands.push({
      id: cmdId++, phase: 'POST_FLASH', label: 'Routine Control — Check Programming Dependencies',
      canTx: `${txHex} 04 31 01 FF 01`, expectedPositive: '71', timeoutMs: 10000, retries: 2,
    });
  }

  // Phase 8: VERIFICATION
  // BUSMASTER raw log post-flash sequence (exact order):
  //   1. ReturnToNormal broadcast (FE 01 20) — 1.4s after last TD response
  //   2. DeviceControl 0xAE 0x28 0x80 — 50ms after RTN (NO ECU response expected)
  //   3. TesterPresent keepalive for ~12s
  //   4. ReadDID 0x90 (VIN)
  //   5. ReadDID 0xC1-C6 (Cal IDs)
  //   6. ReadDID 0xD0 (Unlock Status)
  //   7. ReadDID 0xCC (CRC)
  //   8. ClearDTC on 0x7DF (functional)
  if (isGMLAN) {
    // Step 1: ReturnToNormal broadcast — BUSMASTER: sent 1.4s after last TD response
    commands.push({
      id: cmdId++, phase: 'VERIFICATION', label: 'ReturnToNormal — Exit Programming (0x101)',
      canTx: `0x101 FE 01 20`, expectedPositive: '60', timeoutMs: 3000, retries: 1,
      nonFatal: true, // UUDT broadcast — no response expected
    });
    // Step 2: Finalize/Reset command — MUST come BEFORE DID reads
    // BUSMASTER: sent 50ms after ReturnToNormal, ECU does NOT respond for ~12s
    commands.push({
      id: cmdId++, phase: 'VERIFICATION', label: 'Finalize Programming (0xAE 0x28 0x80)',
      canTx: `${txHex} 03 AE 28 80`, expectedPositive: 'EE', timeoutMs: 15000, retries: 1,
      nonFatal: true, // ECU does not respond — BUSMASTER shows 12s silence after this
    });
    // Step 3-7: Verification DID reads (after ~12s wait for ECU to reboot)
    commands.push({
      id: cmdId++, phase: 'VERIFICATION', label: 'Read VIN (post-flash, GMLAN DID 0x90)',
      canTx: `${txHex} 02 1A 90`, expectedPositive: '5A', timeoutMs: 15000, retries: 3,
    });
    for (const did of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']) {
      commands.push({
        id: cmdId++, phase: 'VERIFICATION', label: `Read Cal ID ${did} (post-flash)`,
        canTx: `${txHex} 02 1A ${did}`, expectedPositive: '5A', timeoutMs: 5000, retries: 2,
      });
    }
    commands.push({
      id: cmdId++, phase: 'VERIFICATION', label: 'Read Unlock Status (DID 0xD0)',
      canTx: `${txHex} 02 1A D0`, expectedPositive: '5A', timeoutMs: 5000, retries: 2,
    });
    commands.push({
      id: cmdId++, phase: 'VERIFICATION', label: 'Read Programming Counter (DID 0xCC)',
      canTx: `${txHex} 02 1A CC`, expectedPositive: '5A', timeoutMs: 5000, retries: 2,
    });
    // Step 8: ClearDTC on functional address 0x7DF
    commands.push({
      id: cmdId++, phase: 'VERIFICATION', label: 'Clear DTCs (functional broadcast)',
      canTx: `0x7DF 01 04`, expectedPositive: '44', timeoutMs: 5000, retries: 2,
      nonFatal: true, // Non-critical — DTCs can be cleared later
    });
  } else {
    // Standard UDS: Use service 0x22 with 2-byte DID 0xF190 (VIN)
    commands.push({
      id: cmdId++, phase: 'VERIFICATION', label: 'Read ECU Identification (post-flash)',
      canTx: `${txHex} 03 22 F1 90`, expectedPositive: '62', timeoutMs: 5000, retries: 2,
    });
  }

  // Phase 9: KEY_CYCLE — Required for ECU to accept new calibration
  if (!isGMLAN) {
    // Standard UDS: ECU Reset (0x11 0x01) before key cycle
    commands.push({
      id: cmdId++, phase: 'KEY_CYCLE', label: 'ECU Reset before key cycle',
      canTx: `${txHex} 02 11 01`, expectedPositive: '51', timeoutMs: 5000, retries: 1,
    });
  }
  // GMLAN E41: Service 0x11 returns NRC 0x11 (serviceNotSupported).
  // The key cycle itself (ignition off/on) performs the reset.
  commands.push({
    id: cmdId++, phase: 'KEY_CYCLE', label: 'Key Off — Turn ignition OFF',
    timeoutMs: 60000, retries: 0,
    userAction: {
      type: 'KEY_OFF',
      prompt: 'Turn the ignition key to the OFF position now. Wait until all dashboard lights are completely off, then confirm.',
      autoConfirm: false,
    },
  });
  commands.push({
    id: cmdId++, phase: 'KEY_CYCLE', label: 'Key On — Turn ignition ON',
    timeoutMs: 60000, retries: 0,
    userAction: {
      type: 'KEY_ON',
      prompt: 'Turn the ignition key to the ON position (do NOT start the engine). Wait for dashboard lights to illuminate, then confirm.',
      autoConfirm: false,
    },
  });
  commands.push({
    id: cmdId++, phase: 'KEY_CYCLE', label: 'Waiting for ECU boot-up...',
    timeoutMs: 3500, retries: 0,
    userAction: {
      type: 'WAIT_BOOT',
      prompt: 'ECU is booting up with the new calibration. Please wait...',
      autoConfirm: true,
    },
  });
  if (!isGMLAN) {
    // Standard UDS: verify ECU is alive after key cycle via TesterPresent
    commands.push({
      id: cmdId++, phase: 'KEY_CYCLE', label: 'Verify ECU communication after key cycle',
      canTx: `${txHex} 02 3E 00`, canRx: `${rxHex} 02 7E 00`,
      expectedPositive: '7E', timeoutMs: 8000, retries: 5,
    });
  }
  // GMLAN: TesterPresent USDT is not supported (NRC 0x12). Post-key-cycle
  // communication is verified by the session re-establishment in reEstablishSession().

  if (isGMLAN) {
    // GMLAN: Use service 0x1A with DID 0x90 to verify VIN/cal after key cycle
    commands.push({
      id: cmdId++, phase: 'KEY_CYCLE', label: 'Read Calibration ID (verify new cal loaded, GMLAN)',
      canTx: `${txHex} 02 1A 90`, expectedPositive: '5A', timeoutMs: 8000, retries: 4,
    });
  } else {
    commands.push({
      id: cmdId++, phase: 'KEY_CYCLE', label: 'Read Calibration ID (verify new cal loaded)',
      canTx: `${txHex} 03 22 F1 90`, expectedPositive: '62', timeoutMs: 8000, retries: 4,
    });
  }

  // Phase 10: CLEANUP
  // E88 procedure post-flash: WAIT 250ms → ECU Reset (0x11 0x01) → ClearDTC (0x04) → ReturnToNormal
  // E88 procedure includes ECU Reset (0x11 0x01) in CLEANUP, but dry run logs
  // #15-#16 confirmed E41 returns NRC 0x11 (serviceNotSupported) every time.
  // ReturnToNormal (0x20 on 0x101) at the end of CLEANUP handles the reset.
  // Keep the 250ms delay before ClearDTC to match E88 timing.
  if (!isGMLAN) {
    // Standard UDS: ECU Reset in CLEANUP
    commands.push({
      id: cmdId++, phase: 'CLEANUP', label: 'ECU Reset (0x11 0x01)',
      canTx: `${txHex} 02 11 01`, expectedPositive: '51', timeoutMs: 5000, retries: 1,
      delayBeforeMs: 250,
    });
  }
  if (isGMLAN) {
    // GMLAN uses ClearDiagnosticInformation service 0x04 (not UDS 0x14)
    // E88 procedure: CAN_SEND_USDT (0x7DF, DATA=04, post_delay=1000ms)
    // Sent on UDS functional address 0x7DF (not GMLAN 0x101)
    // 250ms delay before ClearDTC to maintain E88 timing (was after ECU Reset)
    commands.push({
      id: cmdId++, phase: 'CLEANUP', label: 'Clear DTCs (GMLAN 0x04, Functional 0x7DF)',
      canTx: `0x7DF 01 04`, expectedPositive: '44', timeoutMs: 8000, retries: 3,
      delayBeforeMs: 1000,  // E88: post_delay=1000ms
    });
  } else {
    commands.push({
      id: cmdId++, phase: 'CLEANUP', label: 'Clear DTCs (Functional Address)',
      canTx: `0x7DF 04 14 FF FF FF`, expectedPositive: '54', timeoutMs: 8000, retries: 3,
    });
  }

  if (isGMLAN) {
    // GMLAN: ReturnToNormal via functional broadcast (0x101) — UUDT format, no response expected
    commands.push({
      id: cmdId++, phase: 'CLEANUP', label: 'Return to Normal Mode — All ECUs (Functional 0x101)',
      canTx: `0x101 FE 01 20`, expectedPositive: '60', timeoutMs: 5000, retries: 2,
    });
  } else {
    commands.push({
      id: cmdId++, phase: 'CLEANUP', label: 'Return to Default Session',
      canTx: `${txHex} 02 10 01`, expectedPositive: '50', timeoutMs: 5000, retries: 2,
    });
  }

  // Realistic timing: ~4 KB/s for block transfers, phase-specific delays for commands
  const PHASE_EST: Record<string, number> = {
    PRE_CHECK: 1500, VOLTAGE_INIT: 2000, SESSION_OPEN: 2500,
    SECURITY_ACCESS: 3000, PRE_FLASH: 8000, POST_FLASH: 4000,
    VERIFICATION: 3000, KEY_CYCLE: 5000, CLEANUP: 2000,
  };
  const estimatedTimeMs = commands.reduce((sum, c) => {
    if (c.blockData) return sum + (c.blockData.totalBytes / 4000) * 1000; // 4 KB/s → ms
    return sum + (PHASE_EST[c.phase] || 1500);
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
    commandTickCount: 0,
    estimatedRemainingMs: plan.estimatedTimeMs,
    currentSectionName: '',
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

  // ── Realistic per-phase delays (ms) ──────────────────────────────────
  const PHASE_DELAY: Record<string, number> = {
    PRE_CHECK: 1500,      // TesterPresent handshake
    VOLTAGE_INIT: 2000,   // Relay board settling
    SESSION_OPEN: 2500,   // DiagnosticSessionControl
    SECURITY_ACCESS: 3000,// Seed/key exchange + computation
    PRE_FLASH: 8000,      // Erase can take 5-15s per block
    POST_FLASH: 4000,     // Dependency check
    VERIFICATION: 3000,   // Read ECU ID
    KEY_CYCLE: 10000,     // Key off/on cycle with wait
    CLEANUP: 2000,        // Reset + DTC clear
  };

  // Handle block transfer progress — realistic CAN bus UDS speed
  if (cmd.blockData) {
    // Real CAN bus at 500kbps with UDS overhead: ~3-6 KB/s
    // We simulate ~4 KB/s = 4 bytes per ms, scaled by deltaMs
    const transferRate = Math.round(4 * deltaMs);
    const prevBytes = next.transferredBytes;
    next.transferredBytes = Math.min(
      next.transferredBytes + transferRate,
      next.totalBytes,
    );
    const blockBytesTransferred = Math.min(
      (next.blockProgress / 100) * cmd.blockData.totalBytes + transferRate,
      cmd.blockData.totalBytes,
    );
    next.blockProgress = Math.min((blockBytesTransferred / cmd.blockData.totalBytes) * 100, 100);

    // Add periodic CAN TX/RX log entries (every ~5% of block)
    const prevPct = Math.floor(((blockBytesTransferred - transferRate) / cmd.blockData.totalBytes) * 20);
    const currPct = Math.floor((blockBytesTransferred / cmd.blockData.totalBytes) * 20);
    if (currPct > prevPct && currPct < 20) {
      // Extract ECU-specific CAN addresses from the plan's first command
      const txCmd = plan.commands.find(c => c.canTx);
      const txAddr = txCmd?.canTx?.split(' ')[0] || '0x7E0';
      const rxCmd = plan.commands.find(c => c.canRx);
      const rxAddr = rxCmd?.canRx?.split(' ')[0] || '0x7E8';
      const seqByte = (currPct & 0x0F).toString(16).toUpperCase().padStart(2, '0');
      next.log.push({
        timestamp: next.elapsedMs, phase: cmd.phase, type: 'can_tx',
        message: `${txAddr} 36 ${seqByte} [${transferRate} bytes] → Block #${cmd.blockData.blockId}`,
        blockId: cmd.blockData.blockId,
      });
      next.log.push({
        timestamp: next.elapsedMs + 5, phase: cmd.phase, type: 'can_rx',
        message: `${rxAddr} 76 ${seqByte} — Transfer ACK`,
        blockId: cmd.blockData.blockId,
      });
    }

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

    next.currentSectionName = cmd.blockData.sectionName;
    next.statusMessage = `Flashing ${cmd.blockData.sectionName} — ${next.blockProgress.toFixed(0)}%`;
  } else {
    // Non-block command: simulate realistic delay based on phase
    const requiredDelay = PHASE_DELAY[cmd.phase] || 1500;
    // Track accumulated time on this command via a simple heuristic:
    // Each tick is deltaMs; we need requiredDelay/deltaMs ticks to complete
    // Use elapsedMs modulo to determine if enough time has passed
    // We track this by checking if we've been on this command long enough
    const ticksNeeded = Math.ceil(requiredDelay / deltaMs);
    const ticksOnCommand = next.commandTickCount;
    next.commandTickCount = ticksOnCommand + 1;

    if (ticksOnCommand === 0) {
      // First tick: log the CAN TX (or info if no CAN data)
      if (cmd.canTx) {
        next.log.push({
          timestamp: next.elapsedMs, phase: cmd.phase, type: 'can_tx',
          message: `TX: ${cmd.canTx}`,
        });
      } else {
        next.log.push({
          timestamp: next.elapsedMs, phase: cmd.phase, type: 'info',
          message: `${cmd.label}`,
        });
      }
      next.statusMessage = `${cmd.label}...`;
    } else if (ticksOnCommand >= ticksNeeded) {
      // Command complete — log success and CAN RX
      if (cmd.canRx) {
        next.log.push({
          timestamp: next.elapsedMs, phase: cmd.phase, type: 'can_rx',
          message: `RX: ${cmd.canRx}`,
        });
      }
      next.log.push({
        timestamp: next.elapsedMs, phase: cmd.phase, type: 'success',
        message: `✓ ${cmd.label}`,
      });
      next.currentCommandIndex++;
      next.statusMessage = cmd.label;
      next.commandTickCount = 0;
    }
    // Otherwise: still waiting — don't advance
  }

  // Time-weighted progress: block transfers weighted by bytes, commands by phase delay
  // This prevents the progress bar from stalling during long block transfers
  const totalEstMs = plan.estimatedTimeMs || 1;
  let completedMs = 0;
  for (let i = 0; i < next.currentCommandIndex; i++) {
    const c = plan.commands[i];
    if (c?.blockData) {
      completedMs += (c.blockData.totalBytes / 4000) * 1000;
    } else if (c) {
      completedMs += PHASE_DELAY[c.phase] || 1500;
    }
  }
  // Add partial progress for current command
  if (cmd?.blockData && next.blockProgress > 0) {
    const blockTimeMs = (cmd.blockData.totalBytes / 4000) * 1000;
    completedMs += blockTimeMs * (next.blockProgress / 100);
  } else if (cmd && next.commandTickCount > 0) {
    const cmdDelay = PHASE_DELAY[cmd.phase] || 1500;
    const ticksNeeded = Math.ceil(cmdDelay / deltaMs);
    completedMs += cmdDelay * Math.min(next.commandTickCount / ticksNeeded, 1);
  }
  next.progress = Math.min((completedMs / totalEstMs) * 100, 99.9);
  next.estimatedRemainingMs = Math.max(totalEstMs - completedMs, 0);
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
