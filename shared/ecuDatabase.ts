/**
 * Comprehensive ECU Database — extracted from DevProg V2 MAUI codebase
 * 
 * Contains:
 * - Full ECU configuration (CAN addresses, protocols, transfer sizes)
 * - Flash sequence definitions per ECU type
 * - Datalogging support parameters (SAE standard bitmasks)
 * - Controller type classification (ECU, TCU, etc.)
 * - Recovery configuration structure
 */

// ── Flash Sequence Steps ───────────────────────────────────────────────────

export enum FlashStep {
  OPENPS_UDS = 'OPENPS_UDS',
  OPENPS_GMLAN = 'OPENPS_GMLAN',
  REQUEST_SEED_PS = 'REQUEST_SEED_PS',
  SEND_KEY_PS = 'SEND_KEY_PS',
  FLASH_BLOCKS = 'FLASH_BLOCKS',
  FLASH_PATCH = 'FLASH_PATCH',
  ENABLE_TP_CYCLIC = 'ENABLE_TP_CYCLIC',
  DISABLE_TP_CYCLIC = 'DISABLE_TP_CYCLIC',
  ECU_RESET_UDS = 'ECU_RESET_UDS',
  CLEAR_DTCS_FUNC_ADR = 'CLEAR_DTCS_FUNC_ADR',
  CLEAR_DTCS_PHYS_ADR = 'CLEAR_DTCS_PHYS_ADR',
  WAIT_250MS = 'WAIT_250MS',
  CUSTOM_GM_PRIRC = 'CUSTOM_GM_PRIRC',
  CLOSE_SESSION_GM = 'CLOSE_SESSION_GM',
}

export const FLASH_STEP_DESCRIPTIONS: Record<FlashStep, string> = {
  [FlashStep.OPENPS_UDS]: 'Open Programming Session (UDS DiagnosticSessionControl 0x10 0x02)',
  [FlashStep.OPENPS_GMLAN]: 'Open Programming Session (GMLAN 0xFE 0x02 0x02 via CAN ID 0x101)',
  [FlashStep.REQUEST_SEED_PS]: 'Request Security Seed (SecurityAccess 0x27 with ECU seed level)',
  [FlashStep.SEND_KEY_PS]: 'Send Computed Security Key (SecurityAccess 0x27 response)',
  [FlashStep.FLASH_BLOCKS]: 'Flash all calibration/data blocks (RequestDownload → TransferData per block)',
  [FlashStep.FLASH_PATCH]: 'Flash patch blocks only (OS patch mode)',
  [FlashStep.ENABLE_TP_CYCLIC]: 'Enable cyclic TesterPresent (0x3E) to keep session alive',
  [FlashStep.DISABLE_TP_CYCLIC]: 'Disable cyclic TesterPresent',
  [FlashStep.ECU_RESET_UDS]: 'ECU Reset via UDS (ECUReset 0x11 0x01)',
  [FlashStep.CLEAR_DTCS_FUNC_ADR]: 'Clear DTCs via functional addressing (ClearDiagnosticInformation 0x14)',
  [FlashStep.CLEAR_DTCS_PHYS_ADR]: 'Clear DTCs via physical addressing',
  [FlashStep.WAIT_250MS]: 'Wait 250ms delay between steps',
  [FlashStep.CUSTOM_GM_PRIRC]: 'Send GM-specific PriRC (priority routine control) commands',
  [FlashStep.CLOSE_SESSION_GM]: 'Close GMLAN diagnostic session (0x20)',
};

// ── Protocol Types ─────────────────────────────────────────────────────────

export type Protocol = 'UDS' | 'GMLAN' | 'CANAM' | 'CANAMOLD' | 'IVLAN';

// ── Controller Types ───────────────────────────────────────────────────────

export type ControllerType = 'ecu' | 'tcu' | 'dash' | 'pcm' | 'bcm';

// ── Manufacturer Types ─────────────────────────────────────────────────────

export type Manufacturer = 'GM' | 'FORD' | 'DODGE' | 'POLARIS' | 'CANAM' | 'SEGWAY';

// ── ECU Configuration ──────────────────────────────────────────────────────

export interface EcuConfig {
  ecuType: string;
  name: string;
  oem: Manufacturer;
  controllerType: ControllerType;
  protocol: Protocol;
  /** Transfer size in bytes per block (e.g., 0xFF8 = 4088 bytes) */
  xferSize: number | null;
  canSpeed: number;
  /** UDS Security Access seed level (sub-function for seed request) */
  seedLevel: number;
  /** CAN TX address for diagnostic requests */
  txAddr: number;
  /** CAN RX address for diagnostic responses */
  rxAddr: number;
  /** Optional TX prefix byte for extended addressing */
  txPrefix: number | null;
  /** Optional RX prefix byte for extended addressing */
  rxPrefix: number | null;
  /** SAE J1979 standard PID support */
  saeSupported: boolean;
  /** SAE request additional byte */
  saeReqAdd: number | null;
  /** Fast mode transfer support */
  fastMode: boolean;
  /** SAE standard visibility bitmasks (4 x 32-bit) */
  saeStdBitmasks: {
    vsb0: string;
    vsb20: string;
    vsb40: string;
    vsb60: string;
  };
  /** Whether patch (OS update) is required before calibration flash */
  patchNecessary: boolean;
  /** Ordered sequence of flash steps for patch operations */
  patchSequence: FlashStep[];
  /** Ordered sequence of flash steps for full flash operations */
  flashSequence: FlashStep[];
  /** Whether TransferExit (0x37) is used after block transfer */
  usesTransferExit: boolean;
}

// ── Standard Flash Sequences ───────────────────────────────────────────────

const GM_PATCH_SEQUENCE: FlashStep[] = [
  FlashStep.OPENPS_GMLAN,
  FlashStep.REQUEST_SEED_PS,
  FlashStep.SEND_KEY_PS,
  FlashStep.CUSTOM_GM_PRIRC,
  FlashStep.FLASH_PATCH,
];

const GM_FLASH_SEQUENCE: FlashStep[] = [
  FlashStep.OPENPS_GMLAN,
  FlashStep.REQUEST_SEED_PS,
  FlashStep.SEND_KEY_PS,
  FlashStep.CUSTOM_GM_PRIRC,
  FlashStep.FLASH_BLOCKS,
  FlashStep.WAIT_250MS,
  FlashStep.ECU_RESET_UDS,
  FlashStep.WAIT_250MS,
  FlashStep.WAIT_250MS,
  FlashStep.WAIT_250MS,
  FlashStep.WAIT_250MS,
  FlashStep.CLEAR_DTCS_FUNC_ADR,
  FlashStep.WAIT_250MS,
  FlashStep.WAIT_250MS,
  FlashStep.WAIT_250MS,
  FlashStep.WAIT_250MS,
  FlashStep.CLOSE_SESSION_GM,
];

const GM_TCU_FLASH_SEQUENCE: FlashStep[] = [
  FlashStep.ENABLE_TP_CYCLIC,
  FlashStep.OPENPS_GMLAN,
  FlashStep.REQUEST_SEED_PS,
  FlashStep.SEND_KEY_PS,
  FlashStep.CUSTOM_GM_PRIRC,
  FlashStep.FLASH_BLOCKS,
  FlashStep.WAIT_250MS,
  FlashStep.ECU_RESET_UDS,
  FlashStep.WAIT_250MS,
  FlashStep.WAIT_250MS,
  FlashStep.WAIT_250MS,
  FlashStep.WAIT_250MS,
  FlashStep.DISABLE_TP_CYCLIC,
  FlashStep.CLEAR_DTCS_FUNC_ADR,
  FlashStep.WAIT_250MS,
  FlashStep.WAIT_250MS,
  FlashStep.WAIT_250MS,
  FlashStep.WAIT_250MS,
  FlashStep.CLOSE_SESSION_GM,
];

const FORD_UDS_FLASH_SEQUENCE: FlashStep[] = [
  FlashStep.ECU_RESET_UDS,
  FlashStep.OPENPS_UDS,
  FlashStep.REQUEST_SEED_PS,
  FlashStep.SEND_KEY_PS,
  FlashStep.FLASH_BLOCKS,
  FlashStep.WAIT_250MS,
  FlashStep.ECU_RESET_UDS,
  FlashStep.WAIT_250MS,
  FlashStep.WAIT_250MS,
  FlashStep.WAIT_250MS,
  FlashStep.WAIT_250MS,
  FlashStep.CLEAR_DTCS_FUNC_ADR,
];

// ── Full ECU Database ──────────────────────────────────────────────────────

export const ECU_DATABASE: Record<string, EcuConfig> = {
  // ── GM Delco ECUs ────────────────────────────────────────────────────
  E41: {
    ecuType: 'E41', name: 'Bosch MG1CS111 (L5P Duramax)',
    oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
    xferSize: 0xFF8, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x087B0000', vsb20: '0x20032000', vsb40: '0x04800000', vsb60: '0x00000000' },
    patchNecessary: true, patchSequence: GM_PATCH_SEQUENCE, flashSequence: GM_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  E88: {
    ecuType: 'E88', name: 'GM-DELCO E88',
    oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
    xferSize: 0xFF8, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: true, patchSequence: GM_PATCH_SEQUENCE, flashSequence: GM_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  E90: {
    ecuType: 'E90', name: 'GM-DELCO E90',
    oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
    xferSize: 0xFF8, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: true, patchSequence: GM_PATCH_SEQUENCE, flashSequence: GM_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  E92: {
    ecuType: 'E92', name: 'GM-DELCO E92',
    oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
    xferSize: 0xFF8, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: true, patchSequence: GM_PATCH_SEQUENCE, flashSequence: GM_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  E98: {
    ecuType: 'E98', name: 'GM-DELCO E98',
    oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
    xferSize: 0xFF8, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: true, patchSequence: GM_PATCH_SEQUENCE, flashSequence: GM_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  E80: {
    ecuType: 'E80', name: 'GM-DELCO E80',
    oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
    xferSize: 0xFF8, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: true, patchSequence: GM_PATCH_SEQUENCE, flashSequence: GM_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  E83: {
    ecuType: 'E83', name: 'GM-DELCO E83',
    oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
    xferSize: 0xFF8, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: true, patchSequence: GM_PATCH_SEQUENCE, flashSequence: GM_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  E78: {
    ecuType: 'E78', name: 'GM-DELCO E78',
    oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
    xferSize: 0xFF8, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: true, patchSequence: GM_PATCH_SEQUENCE, flashSequence: GM_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  E86: {
    ecuType: 'E86', name: 'GM-DELCO E86',
    oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
    xferSize: 0xFF8, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: GM_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  E67: {
    ecuType: 'E67', name: 'GM-DELCO E67',
    oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
    xferSize: 0xFF8, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: GM_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  E39: {
    ecuType: 'E39', name: 'GM-DELCO E39',
    oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
    xferSize: 0xFF8, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: true, patchSequence: GM_PATCH_SEQUENCE, flashSequence: GM_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  E46: {
    ecuType: 'E46', name: 'GM-DELCO E46',
    oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
    xferSize: 0xFF8, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: true, patchSequence: GM_PATCH_SEQUENCE, flashSequence: GM_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  E45: {
    ecuType: 'E45', name: 'GM-DELCO E45',
    oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
    xferSize: 0xFF8, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: true, patchSequence: GM_PATCH_SEQUENCE, flashSequence: GM_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  E35A: {
    ecuType: 'E35A', name: 'GM-DELCO E35A',
    oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
    xferSize: 0xFF8, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: GM_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  E35B: {
    ecuType: 'E35B', name: 'GM-DELCO E35B',
    oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
    xferSize: 0xFF8, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: GM_FLASH_SEQUENCE,
    usesTransferExit: false,
  },

  // ── Allison TCMs ─────────────────────────────────────────────────────
  T87: {
    ecuType: 'T87', name: 'Allison TCM T87',
    oem: 'GM', controllerType: 'tcu', protocol: 'GMLAN',
    xferSize: 0xFF0, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E2, rxAddr: 0x7EA, txPrefix: null, rxPrefix: null,
    saeSupported: false, saeReqAdd: null, fastMode: false,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: GM_TCU_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  T87A: {
    ecuType: 'T87A', name: 'Allison TCM T87A',
    oem: 'GM', controllerType: 'tcu', protocol: 'GMLAN',
    xferSize: 0xFF0, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E2, rxAddr: 0x7EA, txPrefix: null, rxPrefix: null,
    saeSupported: false, saeReqAdd: null, fastMode: false,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: GM_TCU_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  TCUT87: {
    ecuType: 'TCUT87', name: 'Allison TCM TCUT87',
    oem: 'GM', controllerType: 'tcu', protocol: 'GMLAN',
    xferSize: 0xFF0, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E2, rxAddr: 0x7EA, txPrefix: null, rxPrefix: null,
    saeSupported: false, saeReqAdd: null, fastMode: false,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: GM_TCU_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  TCUT87A: {
    ecuType: 'TCUT87A', name: 'Allison TCM TCUT87A',
    oem: 'GM', controllerType: 'tcu', protocol: 'GMLAN',
    xferSize: 0xFF0, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E2, rxAddr: 0x7EA, txPrefix: null, rxPrefix: null,
    saeSupported: false, saeReqAdd: null, fastMode: false,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: GM_TCU_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  T76: {
    ecuType: 'T76', name: 'Allison TCM T76',
    oem: 'GM', controllerType: 'tcu', protocol: 'GMLAN',
    xferSize: 0xFF0, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E2, rxAddr: 0x7EA, txPrefix: null, rxPrefix: null,
    saeSupported: false, saeReqAdd: null, fastMode: false,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: GM_TCU_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  T43: {
    ecuType: 'T43', name: 'Allison TCM T43',
    oem: 'GM', controllerType: 'tcu', protocol: 'GMLAN',
    xferSize: 0xFF0, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E2, rxAddr: 0x7EA, txPrefix: null, rxPrefix: null,
    saeSupported: false, saeReqAdd: null, fastMode: false,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: GM_TCU_FLASH_SEQUENCE,
    usesTransferExit: false,
  },

  // ── Ford / Bosch ECUs ────────────────────────────────────────────────
  MG1CS015: {
    ecuType: 'MG1CS015', name: 'Bosch MG1CS015 (Ford Ecoboost)',
    oem: 'FORD', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0xFFD, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: 0xF4, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  MG1CS018: {
    ecuType: 'MG1CS018', name: 'Bosch MG1CS018 (Ford)',
    oem: 'FORD', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0xFFD, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: 0xF4, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  MG1CS019: {
    ecuType: 'MG1CS019', name: 'Bosch MG1CS019 (Ford)',
    oem: 'FORD', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0xFFD, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: 0xF4, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  MEDG17: {
    ecuType: 'MEDG17', name: 'Bosch MEDG17 (Ford Ecoboost)',
    oem: 'FORD', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0xFFD, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: 0xF4, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  EDC17CP05: {
    ecuType: 'EDC17CP05', name: 'Bosch EDC17CP05 (Ford Diesel)',
    oem: 'FORD', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0xFFD, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: 0xF4, fastMode: true,
    saeStdBitmasks: { vsb0: '0x10180002', vsb20: '0x00022000', vsb40: '0x4480001C', vsb60: '0xC1000340' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  EDC17CP65: {
    ecuType: 'EDC17CP65', name: 'Bosch EDC17CP65 (Ford Diesel)',
    oem: 'FORD', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0xFFD, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: 0xF4, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  MD1CP006: {
    ecuType: 'MD1CP006', name: 'Bosch MD1CP006 (Ford)',
    oem: 'FORD', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0xFFD, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: 0xF4, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  MD1CP062: {
    ecuType: 'MD1CP062', name: 'Bosch MD1CP062 (Ford)',
    oem: 'FORD', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0xFFD, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: 0xF4, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  TCU10R80: {
    ecuType: 'TCU10R80', name: 'Ford TCU 10R80',
    oem: 'FORD', controllerType: 'tcu', protocol: 'UDS',
    xferSize: null, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E1, rxAddr: 0x7E9, txPrefix: null, rxPrefix: null,
    saeSupported: false, saeReqAdd: 0xF4, fastMode: false,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  TCU6R140: {
    ecuType: 'TCU6R140', name: 'Ford TCU 6R140',
    oem: 'FORD', controllerType: 'tcu', protocol: 'UDS',
    xferSize: null, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E1, rxAddr: 0x7E9, txPrefix: null, rxPrefix: null,
    saeSupported: false, saeReqAdd: null, fastMode: false,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  TCU6TC277: {
    ecuType: 'TCU6TC277', name: 'Ford TCU TC277',
    oem: 'FORD', controllerType: 'tcu', protocol: 'UDS',
    xferSize: null, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E1, rxAddr: 0x7E9, txPrefix: null, rxPrefix: null,
    saeSupported: false, saeReqAdd: null, fastMode: false,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },

  // ── Cummins ECUs ─────────────────────────────────────────────────────
  CM2350B: {
    ecuType: 'CM2350B', name: 'Cummins CM2350B',
    oem: 'DODGE', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0x800, canSpeed: 500, seedLevel: 0x05,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x18190000', vsb20: '0x00022000', vsb40: '0x44000000', vsb60: '0xC0880100' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  CM2450B: {
    ecuType: 'CM2450B', name: 'Cummins CM2450B',
    oem: 'DODGE', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0x800, canSpeed: 500, seedLevel: 0x05,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  CM2100: {
    ecuType: 'CM2100', name: 'Cummins CM2100',
    oem: 'DODGE', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0x800, canSpeed: 500, seedLevel: 0x05,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  CM2200: {
    ecuType: 'CM2200', name: 'Cummins CM2200',
    oem: 'DODGE', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0x800, canSpeed: 500, seedLevel: 0x05,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },

  // ── Opel/Vauxhall Bosch ECUs ─────────────────────────────────────────
  ME762: {
    ecuType: 'ME762', name: 'Bosch ME762',
    oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
    xferSize: 0xFF8, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: GM_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  ME763: {
    ecuType: 'ME763', name: 'Bosch ME763',
    oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
    xferSize: 0xFF8, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: GM_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  ME764: {
    ecuType: 'ME764', name: 'Bosch ME764',
    oem: 'GM', controllerType: 'ecu', protocol: 'GMLAN',
    xferSize: 0xFF8, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: GM_FLASH_SEQUENCE,
    usesTransferExit: false,
  },

  // ── Bosch EDC17 (GM Diesel) ──────────────────────────────────────────
  EDC17C18: {
    ecuType: 'EDC17C18', name: 'Bosch EDC17C18',
    oem: 'GM', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0xFFD, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  EDC17C19: {
    ecuType: 'EDC17C19', name: 'Bosch EDC17C19',
    oem: 'GM', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0xFFD, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  EDC17C59: {
    ecuType: 'EDC17C59', name: 'Bosch EDC17C59',
    oem: 'GM', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0xFFD, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  EDC17CP47: {
    ecuType: 'EDC17CP47', name: 'Bosch EDC17CP47',
    oem: 'GM', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0xFFD, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },

  // ── Can-Am / Polaris / Segway ────────────────────────────────────────
  MG1CA920: {
    ecuType: 'MG1CA920', name: 'Bosch MG1CA920 (Can-Am)',
    oem: 'CANAM', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0xFFD, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  ME17CA1: {
    ecuType: 'ME17CA1', name: 'Bosch ME17CA1 (Can-Am)',
    oem: 'CANAM', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0xFFD, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
  MG1CA007: {
    ecuType: 'MG1CA007', name: 'Bosch MG1CA007 (Polaris)',
    oem: 'POLARIS', controllerType: 'ecu', protocol: 'UDS',
    xferSize: 0xFFD, canSpeed: 500, seedLevel: 0x01,
    txAddr: 0x7E0, rxAddr: 0x7E8, txPrefix: null, rxPrefix: null,
    saeSupported: true, saeReqAdd: null, fastMode: true,
    saeStdBitmasks: { vsb0: '0x00000000', vsb20: '0x00000000', vsb40: '0x00000000', vsb60: '0x00000000' },
    patchNecessary: false, patchSequence: [], flashSequence: FORD_UDS_FLASH_SEQUENCE,
    usesTransferExit: false,
  },
};

// ── Container File Format ──────────────────────────────────────────────────

export interface ContainerFileHeader {
  offset: string;
  flashernumber: number;
  udid: string;
  vin: string;
  seed: string;
  key: string;
  file_id: string;
  create_date: number;       // Unix timestamp
  expire_date: number;       // Unix timestamp
  max_flash_count: number;
  header_length: string;
  block_count: number;
  block_boot: number;
  block_erase: number;
  file_size: string;         // hex string
  comp_enc: string;          // hex string
  lzss: string;              // "true" | "false"
  xferSize: string;          // hex string
  ForceOS: string;           // "true" | "false"
  block_struct: ContainerBlockStruct[];
  ecu_type: string;
  hardware_number: string;
  sw_c1?: string;
  sw_c2?: string;
  sw_c3?: string;
  sw_c4?: string;
  sw_c5?: string;
  sw_c6?: string;
  sw_c7?: string;
  sw_c8?: string;
  sw_c9?: string;
  verify?: ContainerVerify;
}

export interface ContainerBlockStruct {
  block_id: number;
  pri_rc?: string;
  rc34?: string;
  rc36?: string;
  start_adresse?: string;
  end_adresse?: string;
  PrgByAdr?: string;
  block_length?: string;
  LzssLen?: string;
  post_rc?: string;
  comp_enc?: string;
  xferSize?: string;
  erase?: string;
  OS?: string;               // "true" | "false" | "patch" | "forcepatch"
}

export interface ContainerVerify {
  controller_type?: string;
  j1939?: string;
  canspeed?: string;
  txadr?: string;
  rxadr?: string;
  txprefix?: string[];
  rxprefix?: string[];
  pri_key?: string[];
  pri_request?: string[];
  request?: string[];
  key?: string[];
}

/**
 * Container file layout:
 * 
 * Offset 0x0000 - 0x0FFF: Reserved / padding
 * Offset 0x1000 - 0x1003: CRC32 checksum (big-endian) of all data from 0x1004 to EOF
 * Offset 0x1004 - 0x2FFF: JSON header (0x1FFC bytes, null-terminated ASCII)
 * Offset 0x3000+:         Block data (sequential, may be LZSS compressed)
 * 
 * LZSS compressed blocks format (per sub-block):
 *   4 bytes: compressed size (big-endian uint32)
 *   N bytes: compressed data
 *   2 bytes: LZSS flags (0x0000 = compressed, else raw)
 *   2 bytes: CRC16-CCITT checksum of decompressed data
 */
export const CONTAINER_LAYOUT = {
  RESERVED_SIZE: 0x1000,
  CRC32_OFFSET: 0x1000,
  CRC32_SIZE: 4,
  HEADER_OFFSET: 0x1004,
  HEADER_SIZE: 0x1FFC,
  DATA_OFFSET: 0x3000,
} as const;

// ── Datalogging Types ──────────────────────────────────────────────────────

export type TransmissionType = 'REQUESTBYID' | 'REQUESTBYADRESS' | 'BROADCAST';

export interface DatalogParameter {
  id: number;
  ecuType: string;
  os: string;
  transmissionType: TransmissionType;
  /** Data Storage Identifier — PID, memory address, or broadcast position */
  dsi: number;
  bitshift: number;
  responseLength: number;
  mask: number;
  xmit: boolean;
  rec: boolean;
  shortName: string;
  longName: string;
  factor: number;
  offset: number;
  adjPoint: number;
  bigEndian: boolean;
  signed: boolean;
  metricGaugeMin: number;
  metricGaugeMax: number;
  units: DatalogUnit[];
  dataText?: string;
}

export interface DatalogUnit {
  unitName: string;
  factor: number;
  offset: number;
  adjPoint: number;
}

// ── Flasher State Types ────────────────────────────────────────────────────

export type FlasherConnectionState =
  | 'Disconnected'
  | 'Disconnecting'
  | 'Connected'
  | 'Connecting'
  | 'DisconnectRequested'
  | 'FWUpdateDisconnect'
  | 'Connection_Lost';

export type FlashingStatus =
  | 'NOT_FLASHING'
  | 'FLASHING_IN_PROGRESS'
  | 'FLASHING_SUCCESSFUL'
  | 'FLASHING_PROBLEM'
  | 'FLASHING_FAILED';

export interface FlasherState {
  connectionState: FlasherConnectionState;
  flashingStatus: boolean;
  ledBrightness: number;
  serialNumber: string;
  firmwareVersion: string;
  hwRevision: number;
  brand: string;
  busy: boolean;
  progress: number;
  fileId: string;
}

// ── Recovery Configuration ─────────────────────────────────────────────────

export interface RecoveryConfig {
  forceRecovery: boolean;
  recoveryVehicleId: string;
  recoveryVin: string;
  recoverySeedHex: string;
  recoverySeedDec: string;
  recoveryControllerType: string;
  recoveryEcu: string;
  recoveryHw: string;
  recoverySw1: string;
  recoverySw2: string;
  recoverySw3: string;
  recoveryFileId: string;
}

// ── Utility Functions ──────────────────────────────────────────────────────

/**
 * Look up an ECU configuration by type string (case-insensitive)
 */
export function getEcuConfig(ecuType: string): EcuConfig | undefined {
  return ECU_DATABASE[ecuType.toUpperCase()] ?? ECU_DATABASE[ecuType];
}

/**
 * Get all ECU types for a given manufacturer
 */
export function getEcusByManufacturer(oem: Manufacturer): EcuConfig[] {
  return Object.values(ECU_DATABASE).filter(e => e.oem === oem);
}

/**
 * Get all ECU types that use a given protocol
 */
export function getEcusByProtocol(protocol: Protocol): EcuConfig[] {
  return Object.values(ECU_DATABASE).filter(e => e.protocol === protocol);
}

/**
 * Get human-readable flash sequence description
 */
export function describeFlashSequence(ecuType: string): string[] {
  const config = getEcuConfig(ecuType);
  if (!config) return [`Unknown ECU type: ${ecuType}`];

  const steps: string[] = [];
  const seq = config.patchNecessary
    ? [...config.patchSequence, '--- Full Flash ---', ...config.flashSequence]
    : config.flashSequence;

  for (const step of seq) {
    if (typeof step === 'string' && step.startsWith('---')) {
      steps.push(step);
    } else {
      const s = step as FlashStep;
      steps.push(`${s}: ${FLASH_STEP_DESCRIPTIONS[s] ?? 'Unknown step'}`);
    }
  }
  return steps;
}
