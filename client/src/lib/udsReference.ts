/**
 * UDS Reference Library — Comprehensive Unified Diagnostic Services database
 *
 * Contains:
 *  - Complete DID tables (standard + manufacturer-specific)
 *  - Security access procedures per ECU family
 *  - Routine control definitions
 *  - IO control definitions
 *  - Module address database
 *  - UDS service definitions
 *
 * This powers the tiered datalogger, CAN-am VIN changer, and Erika's knowledge.
 */

// ─── UDS Service Definitions ────────────────────────────────────────────────

export interface UDSService {
  id: number;
  name: string;
  shortName: string;
  description: string;
  requestFormat: string;
  responseId: number; // positive response = id + 0x40
  securityRequired: boolean;
  minSecurityLevel?: number;
  sessionRequired: 'default' | 'extended' | 'programming' | 'any';
}

export const UDS_SERVICES: UDSService[] = [
  {
    id: 0x10, name: 'DiagnosticSessionControl', shortName: 'DSC',
    description: 'Switch diagnostic session (default/extended/programming)',
    requestFormat: '$10 <subFunction>', responseId: 0x50,
    securityRequired: false, sessionRequired: 'any',
  },
  {
    id: 0x11, name: 'ECUReset', shortName: 'ER',
    description: 'Reset ECU (hard reset, key-off-on, soft reset)',
    requestFormat: '$11 <resetType>', responseId: 0x51,
    securityRequired: true, minSecurityLevel: 1, sessionRequired: 'extended',
  },
  {
    id: 0x14, name: 'ClearDiagnosticInformation', shortName: 'CDI',
    description: 'Clear DTCs from specific or all modules',
    requestFormat: '$14 <groupOfDTC[3]>', responseId: 0x54,
    securityRequired: false, sessionRequired: 'extended',
  },
  {
    id: 0x19, name: 'ReadDTCInformation', shortName: 'RDTCI',
    description: 'Read DTCs with status mask, freeze frame, snapshot, extended data',
    requestFormat: '$19 <subFunction> [params]', responseId: 0x59,
    securityRequired: false, sessionRequired: 'any',
  },
  {
    id: 0x22, name: 'ReadDataByIdentifier', shortName: 'RDBI',
    description: 'Read data from a specific DID (live data, configuration, identifiers)',
    requestFormat: '$22 <DID_HI> <DID_LO>', responseId: 0x62,
    securityRequired: false, sessionRequired: 'any',
  },
  {
    id: 0x23, name: 'ReadMemoryByAddress', shortName: 'RMBA',
    description: 'Read raw ECU memory at a specific address (calibration verification, live tuning)',
    requestFormat: '$23 <addressAndLengthFormatId> <memoryAddress> <memorySize>', responseId: 0x63,
    securityRequired: true, minSecurityLevel: 3, sessionRequired: 'extended',
  },
  {
    id: 0x27, name: 'SecurityAccess', shortName: 'SA',
    description: 'Seed/key authentication for protected operations',
    requestFormat: '$27 <subFunction> [securityKey]', responseId: 0x67,
    securityRequired: false, sessionRequired: 'extended',
  },
  {
    id: 0x28, name: 'CommunicationControl', shortName: 'CC',
    description: 'Enable/disable CAN message transmission from ECU',
    requestFormat: '$28 <subFunction> <communicationType>', responseId: 0x68,
    securityRequired: false, sessionRequired: 'extended',
  },
  {
    id: 0x2E, name: 'WriteDataByIdentifier', shortName: 'WDBI',
    description: 'Write data to a specific DID (VIN, configuration, coding, IQA codes)',
    requestFormat: '$2E <DID_HI> <DID_LO> <data...>', responseId: 0x6E,
    securityRequired: true, minSecurityLevel: 3, sessionRequired: 'extended',
  },
  {
    id: 0x2F, name: 'IOControlByIdentifier', shortName: 'IOCBI',
    description: 'Control ECU outputs (actuator tests, forced regen, fan override)',
    requestFormat: '$2F <DID_HI> <DID_LO> <controlOptionRecord> [controlEnableMask]', responseId: 0x6F,
    securityRequired: true, minSecurityLevel: 1, sessionRequired: 'extended',
  },
  {
    id: 0x31, name: 'RoutineControl', shortName: 'RC',
    description: 'Start/stop/get results of ECU routines (DPF regen, TPMS learn, key learn)',
    requestFormat: '$31 <subFunction> <routineId_HI> <routineId_LO> [params]', responseId: 0x71,
    securityRequired: true, minSecurityLevel: 1, sessionRequired: 'extended',
  },
  {
    id: 0x34, name: 'RequestDownload', shortName: 'RD',
    description: 'Begin flash download to ECU',
    requestFormat: '$34 <dataFormatId> <addressAndLengthFormatId> <memoryAddress> <memorySize>', responseId: 0x74,
    securityRequired: true, minSecurityLevel: 5, sessionRequired: 'programming',
  },
  {
    id: 0x36, name: 'TransferData', shortName: 'TD',
    description: 'Transfer flash data blocks to ECU',
    requestFormat: '$36 <blockSequenceCounter> <transferRequestParameterRecord>', responseId: 0x76,
    securityRequired: true, minSecurityLevel: 5, sessionRequired: 'programming',
  },
  {
    id: 0x37, name: 'RequestTransferExit', shortName: 'RTE',
    description: 'End flash transfer and finalize',
    requestFormat: '$37 [transferRequestParameterRecord]', responseId: 0x77,
    securityRequired: true, minSecurityLevel: 5, sessionRequired: 'programming',
  },
  {
    id: 0x3D, name: 'WriteMemoryByAddress', shortName: 'WMBA',
    description: 'Write raw ECU memory (live tuning, calibration modification)',
    requestFormat: '$3D <addressAndLengthFormatId> <memoryAddress> <memorySize> <data>', responseId: 0x7D,
    securityRequired: true, minSecurityLevel: 5, sessionRequired: 'extended',
  },
  {
    id: 0x3E, name: 'TesterPresent', shortName: 'TP',
    description: 'Keep diagnostic session alive (heartbeat)',
    requestFormat: '$3E <subFunction>', responseId: 0x7E,
    securityRequired: false, sessionRequired: 'any',
  },
  {
    id: 0x85, name: 'ControlDTCSetting', shortName: 'CDTCS',
    description: 'Enable/disable DTC setting (used during flash/calibration)',
    requestFormat: '$85 <subFunction>', responseId: 0xC5,
    securityRequired: false, sessionRequired: 'extended',
  },
];

// ─── UDS Negative Response Codes ────────────────────────────────────────────

export const NRC_CODES: Record<number, { name: string; description: string }> = {
  0x10: { name: 'generalReject', description: 'General reject — service not supported in active session' },
  0x11: { name: 'serviceNotSupported', description: 'Service not supported by this ECU' },
  0x12: { name: 'subFunctionNotSupported', description: 'Sub-function not supported' },
  0x13: { name: 'incorrectMessageLengthOrInvalidFormat', description: 'Message length or format invalid' },
  0x14: { name: 'responseTooLong', description: 'Response would exceed transport layer limits' },
  0x22: { name: 'conditionsNotCorrect', description: 'Conditions not correct (wrong session, engine running, etc.)' },
  0x24: { name: 'requestSequenceError', description: 'Request sequence error (e.g., key before seed)' },
  0x25: { name: 'noResponseFromSubnetComponent', description: 'No response from sub-network component' },
  0x26: { name: 'failurePreventsExecutionOfRequestedAction', description: 'Failure prevents execution' },
  0x31: { name: 'requestOutOfRange', description: 'DID/address/parameter out of valid range' },
  0x33: { name: 'securityAccessDenied', description: 'Security access denied — wrong key or not unlocked' },
  0x35: { name: 'invalidKey', description: 'Invalid security key sent' },
  0x36: { name: 'exceededNumberOfAttempts', description: 'Exceeded max security access attempts — locked out' },
  0x37: { name: 'requiredTimeDelayNotExpired', description: 'Security lockout timer not expired (wait 10s)' },
  0x70: { name: 'uploadDownloadNotAccepted', description: 'Upload/download not accepted' },
  0x71: { name: 'transferDataSuspended', description: 'Transfer data suspended' },
  0x72: { name: 'generalProgrammingFailure', description: 'General programming failure' },
  0x73: { name: 'wrongBlockSequenceCounter', description: 'Wrong block sequence counter in transfer' },
  0x78: { name: 'requestCorrectlyReceivedResponsePending', description: 'Response pending — ECU is processing (wait)' },
  0x7E: { name: 'subFunctionNotSupportedInActiveSession', description: 'Sub-function not supported in current session' },
  0x7F: { name: 'serviceNotSupportedInActiveSession', description: 'Service not supported in current session' },
};

// ─── Module Address Database ────────────────────────────────────────────────

export interface ECUModule {
  name: string;
  shortName: string;
  requestId: number;
  responseId: number;
  isExtendedId: boolean;
  platform: string[];
  description: string;
}

export const ECU_MODULES: ECUModule[] = [
  // GM Duramax (11-bit standard)
  { name: 'Engine Control Module', shortName: 'ECM', requestId: 0x7E0, responseId: 0x7E8, isExtendedId: false, platform: ['GM'], description: 'Main engine controller (E38/E40/E41/E42/E46/E86/E90)' },
  { name: 'Transmission Control Module', shortName: 'TCM', requestId: 0x7E1, responseId: 0x7E9, isExtendedId: false, platform: ['GM'], description: 'Allison 1000 / 10L1000 transmission controller' },
  { name: 'Body Control Module', shortName: 'BCM', requestId: 0x7E2, responseId: 0x7EA, isExtendedId: false, platform: ['GM'], description: 'Body electronics, lighting, security' },
  { name: 'Instrument Panel Cluster', shortName: 'IPC', requestId: 0x7E4, responseId: 0x7EC, isExtendedId: false, platform: ['GM'], description: 'Gauge cluster, driver information center' },
  { name: 'Hybrid Powertrain Control Module', shortName: 'HPCM', requestId: 0x7E3, responseId: 0x7EB, isExtendedId: false, platform: ['GM'], description: 'Hybrid system controller (if equipped)' },
  { name: 'Antilock Brake System', shortName: 'ABS', requestId: 0x7E5, responseId: 0x7ED, isExtendedId: false, platform: ['GM'], description: 'ABS/ESC/traction control' },
  { name: 'Supplemental Restraint System', shortName: 'SRS', requestId: 0x7E6, responseId: 0x7EE, isExtendedId: false, platform: ['GM'], description: 'Airbag system controller' },
  { name: 'HVAC Control Module', shortName: 'HVAC', requestId: 0x7E7, responseId: 0x7EF, isExtendedId: false, platform: ['GM'], description: 'Climate control system' },

  // GM 2024+ E42 (29-bit extended)
  { name: 'ECM (E42 Extended)', shortName: 'ECM-E42', requestId: 0x14DA11F1, responseId: 0x14DAF111, isExtendedId: true, platform: ['GM-E42'], description: '2024+ L5P Gen2 ECM — requires 29-bit extended CAN IDs' },

  // Ford
  { name: 'Powertrain Control Module', shortName: 'PCM', requestId: 0x7E0, responseId: 0x7E8, isExtendedId: false, platform: ['Ford'], description: 'Ford PCM (MG1/EDC17)' },
  { name: 'Transmission Control Module', shortName: 'TCM', requestId: 0x7E1, responseId: 0x7E9, isExtendedId: false, platform: ['Ford'], description: 'Ford TCM (10R80/6R140)' },
  { name: 'ABS Module', shortName: 'ABS', requestId: 0x760, responseId: 0x768, isExtendedId: false, platform: ['Ford'], description: 'Ford ABS/AdvanceTrac' },

  // CAN-am / BRP
  { name: 'ECM (CAN-am)', shortName: 'ECM-BRP', requestId: 0x7E0, responseId: 0x7E8, isExtendedId: false, platform: ['CAN-am'], description: 'CAN-am ECM (MED17.8.5 / MG1CA920)' },
  { name: 'Cluster (CAN-am)', shortName: 'CLU-BRP', requestId: 0x7A0, responseId: 0x7A8, isExtendedId: false, platform: ['CAN-am'], description: 'CAN-am instrument cluster / gauge' },

  // Cummins
  { name: 'ECM (Cummins)', shortName: 'ECM-CUM', requestId: 0x7E0, responseId: 0x7E8, isExtendedId: false, platform: ['Cummins'], description: 'Cummins CM2350B/CM2450B ECM' },
  { name: 'TCM (Cummins)', shortName: 'TCM-CUM', requestId: 0x7E1, responseId: 0x7E9, isExtendedId: false, platform: ['Cummins'], description: 'Aisin AS69RC / 68RFE TCM' },

  // BMW
  { name: 'DME (BMW)', shortName: 'DME', requestId: 0x7E0, responseId: 0x7E8, isExtendedId: false, platform: ['BMW'], description: 'BMW Digital Motor Electronics' },
  { name: 'EGS (BMW)', shortName: 'EGS', requestId: 0x7E1, responseId: 0x7E9, isExtendedId: false, platform: ['BMW'], description: 'BMW Electronic Transmission Control (ZF 8HP)' },
  { name: 'DSC (BMW)', shortName: 'DSC', requestId: 0x7D0, responseId: 0x7D8, isExtendedId: false, platform: ['BMW'], description: 'BMW Dynamic Stability Control' },
];

// ─── Standard UDS DIDs ──────────────────────────────────────────────────────

export interface UDSDid {
  did: number;
  name: string;
  description: string;
  dataType: 'ascii' | 'hex' | 'uint8' | 'uint16' | 'uint32' | 'int16' | 'float' | 'enum' | 'bitmask' | 'raw';
  length?: number;
  unit?: string;
  scaling?: { factor: number; offset: number };
  enumValues?: Record<number, string>;
  writable: boolean;
  securityLevel?: number;
  category: string;
  platform: string[];
  loggerLevel: 1 | 2 | 3 | 4;
}

export const UDS_DIDS: UDSDid[] = [
  // ─── Standard UDS DIDs (all platforms) ─────────────────────────────────
  { did: 0xF186, name: 'Active Diagnostic Session', description: 'Current diagnostic session type', dataType: 'enum', enumValues: { 1: 'Default', 2: 'Programming', 3: 'Extended' }, writable: false, category: 'System Info', platform: ['ALL'], loggerLevel: 2 },
  { did: 0xF187, name: 'Spare Part Number', description: 'Vehicle manufacturer spare part number', dataType: 'ascii', length: 20, writable: false, category: 'System Info', platform: ['ALL'], loggerLevel: 2 },
  { did: 0xF188, name: 'ECU Software Number', description: 'ECU software part number', dataType: 'ascii', length: 20, writable: false, category: 'System Info', platform: ['ALL'], loggerLevel: 2 },
  { did: 0xF189, name: 'ECU Software Version', description: 'ECU software version string', dataType: 'ascii', length: 20, writable: false, category: 'System Info', platform: ['ALL'], loggerLevel: 2 },
  { did: 0xF18A, name: 'System Supplier ID', description: 'System supplier identifier (Bosch, Delphi, etc.)', dataType: 'ascii', length: 10, writable: false, category: 'System Info', platform: ['ALL'], loggerLevel: 2 },
  { did: 0xF18B, name: 'ECU Manufacturing Date', description: 'ECU manufacturing date (BCD)', dataType: 'hex', length: 4, writable: false, category: 'System Info', platform: ['ALL'], loggerLevel: 2 },
  { did: 0xF18C, name: 'ECU Serial Number', description: 'ECU serial number', dataType: 'ascii', length: 20, writable: true, securityLevel: 5, category: 'System Info', platform: ['ALL'], loggerLevel: 2 },
  { did: 0xF190, name: 'VIN', description: 'Vehicle Identification Number (17 chars)', dataType: 'ascii', length: 17, writable: true, securityLevel: 3, category: 'Vehicle ID', platform: ['ALL'], loggerLevel: 1 },
  { did: 0xF191, name: 'ECU Hardware Number', description: 'ECU hardware part number', dataType: 'ascii', length: 20, writable: false, category: 'System Info', platform: ['ALL'], loggerLevel: 2 },
  { did: 0xF192, name: 'Supplier HW Number', description: 'System supplier ECU hardware number', dataType: 'ascii', length: 20, writable: false, category: 'System Info', platform: ['ALL'], loggerLevel: 2 },
  { did: 0xF193, name: 'Supplier HW Version', description: 'System supplier ECU hardware version', dataType: 'ascii', length: 10, writable: false, category: 'System Info', platform: ['ALL'], loggerLevel: 2 },
  { did: 0xF194, name: 'Supplier SW Number', description: 'System supplier ECU software number', dataType: 'ascii', length: 20, writable: false, category: 'System Info', platform: ['ALL'], loggerLevel: 2 },
  { did: 0xF195, name: 'Supplier SW Version', description: 'System supplier ECU software version', dataType: 'ascii', length: 10, writable: false, category: 'System Info', platform: ['ALL'], loggerLevel: 2 },

  // ─── GM Duramax Mode 22 DIDs (from P654 documentation) ────────────────

  // Per-Cylinder Health (UNIQUE — no consumer tool has this)
  { did: 0x162F, name: 'Cyl 1 Balance Rate', description: 'Cylinder 1 fuel balance rate — deviation from mean indicates injector health', dataType: 'int16', unit: 'mm³/st', scaling: { factor: 1/64, offset: -512 }, writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 2 },
  { did: 0x1630, name: 'Cyl 2 Balance Rate', description: 'Cylinder 2 fuel balance rate', dataType: 'int16', unit: 'mm³/st', scaling: { factor: 1/64, offset: -512 }, writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 2 },
  { did: 0x1631, name: 'Cyl 3 Balance Rate', description: 'Cylinder 3 fuel balance rate', dataType: 'int16', unit: 'mm³/st', scaling: { factor: 1/64, offset: -512 }, writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 2 },
  { did: 0x1632, name: 'Cyl 4 Balance Rate', description: 'Cylinder 4 fuel balance rate', dataType: 'int16', unit: 'mm³/st', scaling: { factor: 1/64, offset: -512 }, writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 2 },
  { did: 0x1633, name: 'Cyl 5 Balance Rate', description: 'Cylinder 5 fuel balance rate', dataType: 'int16', unit: 'mm³/st', scaling: { factor: 1/64, offset: -512 }, writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 2 },
  { did: 0x1634, name: 'Cyl 6 Balance Rate', description: 'Cylinder 6 fuel balance rate', dataType: 'int16', unit: 'mm³/st', scaling: { factor: 1/64, offset: -512 }, writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 2 },
  { did: 0x1635, name: 'Cyl 7 Balance Rate', description: 'Cylinder 7 fuel balance rate (V8 only)', dataType: 'int16', unit: 'mm³/st', scaling: { factor: 1/64, offset: -512 }, writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 2 },
  { did: 0x1636, name: 'Cyl 8 Balance Rate', description: 'Cylinder 8 fuel balance rate (V8 only)', dataType: 'int16', unit: 'mm³/st', scaling: { factor: 1/64, offset: -512 }, writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 2 },

  // Per-Cylinder Injection Timing
  { did: 0x20AC, name: 'Cyl 1 Injection Time', description: 'Total injection time for cylinder 1', dataType: 'uint16', unit: 'µs', writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 3 },
  { did: 0x20AD, name: 'Cyl 2 Injection Time', description: 'Total injection time for cylinder 2', dataType: 'uint16', unit: 'µs', writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 3 },
  { did: 0x20AE, name: 'Cyl 3 Injection Time', description: 'Total injection time for cylinder 3', dataType: 'uint16', unit: 'µs', writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 3 },
  { did: 0x20AF, name: 'Cyl 4 Injection Time', description: 'Total injection time for cylinder 4', dataType: 'uint16', unit: 'µs', writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 3 },
  { did: 0x20B0, name: 'Cyl 5 Injection Time', description: 'Total injection time for cylinder 5', dataType: 'uint16', unit: 'µs', writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 3 },
  { did: 0x20B1, name: 'Cyl 6 Injection Time', description: 'Total injection time for cylinder 6', dataType: 'uint16', unit: 'µs', writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 3 },
  { did: 0x20B2, name: 'Cyl 7 Injection Time', description: 'Total injection time for cylinder 7', dataType: 'uint16', unit: 'µs', writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 3 },
  { did: 0x20B3, name: 'Cyl 8 Injection Time', description: 'Total injection time for cylinder 8', dataType: 'uint16', unit: 'µs', writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 3 },

  // Per-Cylinder SOI (Start of Injection)
  { did: 0x20B4, name: 'Cyl 1 SOI', description: 'Start of main injection for cylinder 1', dataType: 'int16', unit: '°BTDC', writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 3 },
  { did: 0x20B5, name: 'Cyl 2 SOI', description: 'Start of main injection for cylinder 2', dataType: 'int16', unit: '°BTDC', writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 3 },
  { did: 0x20B6, name: 'Cyl 3 SOI', description: 'Start of main injection for cylinder 3', dataType: 'int16', unit: '°BTDC', writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 3 },
  { did: 0x20B7, name: 'Cyl 4 SOI', description: 'Start of main injection for cylinder 4', dataType: 'int16', unit: '°BTDC', writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 3 },
  { did: 0x20B8, name: 'Cyl 5 SOI', description: 'Start of main injection for cylinder 5', dataType: 'int16', unit: '°BTDC', writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 3 },
  { did: 0x20B9, name: 'Cyl 6 SOI', description: 'Start of main injection for cylinder 6', dataType: 'int16', unit: '°BTDC', writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 3 },
  { did: 0x20BA, name: 'Cyl 7 SOI', description: 'Start of main injection for cylinder 7', dataType: 'int16', unit: '°BTDC', writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 3 },
  { did: 0x20BB, name: 'Cyl 8 SOI', description: 'Start of main injection for cylinder 8', dataType: 'int16', unit: '°BTDC', writable: false, category: 'Per-Cylinder Health', platform: ['GM'], loggerLevel: 3 },

  // Turbo / VGT Health
  { did: 0x1689, name: 'VGT Open Learned Offset', description: 'VGT vane open position learned offset — increasing = vane wear or carbon buildup', dataType: 'int16', unit: '%', writable: false, category: 'Turbo Health', platform: ['GM'], loggerLevel: 2 },
  { did: 0x168A, name: 'VGT Close Learned Offset', description: 'VGT vane close position learned offset', dataType: 'int16', unit: '%', writable: false, category: 'Turbo Health', platform: ['GM'], loggerLevel: 2 },
  { did: 0x1540, name: 'VGT Desired Position', description: 'Commanded VGT vane position', dataType: 'uint16', unit: '%', writable: false, category: 'Turbo Health', platform: ['GM'], loggerLevel: 2 },
  { did: 0x1543, name: 'VGT Actual Position', description: 'Actual VGT vane position (from position sensor)', dataType: 'uint16', unit: '%', writable: false, category: 'Turbo Health', platform: ['GM'], loggerLevel: 2 },
  { did: 0x2041, name: 'VGT Duty Cycle', description: 'VGT actuator duty cycle', dataType: 'uint8', unit: '%', writable: false, category: 'Turbo Health', platform: ['GM'], loggerLevel: 2 },
  { did: 0x328A, name: 'Desired Turbo Boost', description: 'Target boost pressure from boost controller', dataType: 'uint16', unit: 'kPa', writable: false, category: 'Turbo Health', platform: ['GM'], loggerLevel: 2 },

  // DPF / Emissions
  { did: 0x303E, name: 'DPF Regen Status', description: 'DPF regeneration demand/completion state machine', dataType: 'enum', enumValues: { 0: 'No Regen Needed', 1: 'Fuel Consumption', 2: 'Operating Time', 3: 'Distance', 4: 'Soot Model', 5: 'Service Regen', 6: 'Forced Regen' }, writable: false, category: 'DPF / Emissions', platform: ['GM'], loggerLevel: 2 },
  { did: 0x3337, name: 'DPF Delta Pressure', description: 'Differential pressure across DPF (soot load indicator)', dataType: 'uint16', unit: 'kPa', writable: false, category: 'DPF / Emissions', platform: ['GM'], loggerLevel: 2 },
  { did: 0x3311, name: 'SCR Service Status', description: 'SCR system service status', dataType: 'uint8', writable: false, category: 'DPF / Emissions', platform: ['GM'], loggerLevel: 3 },
  { did: 0x331B, name: 'SCR Fluid Level', description: 'DEF fluid level and quality', dataType: 'uint16', unit: '%', writable: false, category: 'DPF / Emissions', platform: ['GM'], loggerLevel: 2 },
  { did: 0x331C, name: 'SCR Average Efficiency', description: 'SCR catalyst average NOx conversion efficiency', dataType: 'uint8', unit: '%', writable: false, category: 'DPF / Emissions', platform: ['GM'], loggerLevel: 3 },
  { did: 0x334B, name: 'NH3 Load in SCR', description: 'Ammonia storage level in SCR catalyst', dataType: 'uint16', unit: 'g', writable: false, category: 'DPF / Emissions', platform: ['GM'], loggerLevel: 3 },
  { did: 0x3348, name: 'Average DEF Consumption', description: 'Average DEF consumption rate', dataType: 'uint16', unit: 'L/h', writable: false, category: 'DPF / Emissions', platform: ['GM'], loggerLevel: 3 },
  { did: 0x3349, name: 'DEF Tank Mass', description: 'DEF tank remaining mass', dataType: 'uint16', unit: 'kg', writable: false, category: 'DPF / Emissions', platform: ['GM'], loggerLevel: 2 },

  // Performance / Torque
  { did: 0x1A2D, name: 'Actual Steady State Torque', description: 'Engine actual steady state torque output', dataType: 'uint16', unit: 'Nm', scaling: { factor: 0.25, offset: 0 }, writable: false, category: 'Performance', platform: ['GM'], loggerLevel: 2 },
  { did: 0x1638, name: 'Fuel Rate', description: 'Actual fuel consumption rate', dataType: 'uint16', unit: 'mm³/st', writable: false, category: 'Performance', platform: ['GM'], loggerLevel: 2 },
  { did: 0x1639, name: 'Main Injection Timing', description: 'Actual main injection timing', dataType: 'int16', unit: '°BTDC', writable: false, category: 'Performance', platform: ['GM'], loggerLevel: 2 },
  { did: 0x20BC, name: 'Fuel Injection Status', description: 'Current injection mode state', dataType: 'enum', writable: false, category: 'Performance', platform: ['GM'], loggerLevel: 3 },

  // Cooling / Thermal
  { did: 0x156B, name: 'Startup Fuel Temperature', description: 'Fuel temperature at engine startup', dataType: 'int16', unit: '°C', scaling: { factor: 1, offset: -40 }, writable: false, category: 'Cooling / Thermal', platform: ['GM'], loggerLevel: 2 },
  { did: 0x162B, name: 'Actual Fan Speed', description: 'Actual cooling fan speed', dataType: 'uint16', unit: 'RPM', scaling: { factor: 16, offset: 0 }, writable: false, category: 'Cooling / Thermal', platform: ['GM'], loggerLevel: 2 },
  { did: 0x163F, name: 'Desired Fan Speed', description: 'Commanded cooling fan speed', dataType: 'uint16', unit: 'RPM', writable: false, category: 'Cooling / Thermal', platform: ['GM'], loggerLevel: 2 },
  { did: 0x1641, name: 'Fan Commanded %', description: 'Percent fan duty cycle commanded', dataType: 'uint8', unit: '%', writable: false, category: 'Cooling / Thermal', platform: ['GM'], loggerLevel: 2 },

  // Humidity / Environmental
  { did: 0x2300, name: 'Humidity IAT Frequency', description: 'Humidity sensor IAT frequency signal', dataType: 'uint16', unit: 'Hz', writable: false, category: 'Environmental', platform: ['GM'], loggerLevel: 3 },
  { did: 0x2301, name: 'Relative Humidity', description: 'Ambient relative humidity', dataType: 'uint8', unit: '%', writable: false, category: 'Environmental', platform: ['GM'], loggerLevel: 2 },
  { did: 0x2303, name: 'Water in Air %', description: 'Weight percent water in intake air', dataType: 'uint16', unit: '%', writable: false, category: 'Environmental', platform: ['GM'], loggerLevel: 3 },

  // Transmission
  { did: 0x1942, name: 'Trans Output Speed', description: 'Transmission output shaft speed', dataType: 'uint16', unit: 'RPM', scaling: { factor: 0.125, offset: 0 }, writable: false, category: 'Transmission', platform: ['GM'], loggerLevel: 2 },

  // MAP / Intake
  { did: 0x2000, name: 'MAP A/D Raw', description: 'Intake manifold absolute pressure A/D converter raw value', dataType: 'uint8', unit: '%5V', scaling: { factor: 100/255, offset: 0 }, writable: false, category: 'Intake', platform: ['GM'], loggerLevel: 3 },
  { did: 0x208A, name: 'Extended Range MAP', description: 'Extended range MAP sensor for high-boost applications', dataType: 'uint16', unit: 'kPa', writable: false, category: 'Intake', platform: ['GM'], loggerLevel: 2 },
  { did: 0x20DB, name: 'Desired Intake Valve Position', description: 'Desired intake air flow valve (throttle) position', dataType: 'uint16', unit: '%', writable: false, category: 'Intake', platform: ['GM'], loggerLevel: 3 },
  { did: 0x20DC, name: 'Actual Intake Valve Position', description: 'Actual intake air flow valve position', dataType: 'uint16', unit: '%', writable: false, category: 'Intake', platform: ['GM'], loggerLevel: 3 },

  // Fuel Injector Data (per-injector)
  { did: 0x3309, name: 'Fuel Injector 1 Data', description: 'Fuel injector 1 extended data', dataType: 'raw', writable: false, category: 'Fuel System', platform: ['GM'], loggerLevel: 3 },
  { did: 0x330A, name: 'Fuel Injector 2 Data', description: 'Fuel injector 2 extended data', dataType: 'raw', writable: false, category: 'Fuel System', platform: ['GM'], loggerLevel: 3 },
  { did: 0x330B, name: 'Fuel Injector 3 Data', description: 'Fuel injector 3 extended data', dataType: 'raw', writable: false, category: 'Fuel System', platform: ['GM'], loggerLevel: 3 },
  { did: 0x330C, name: 'Fuel Injector 4 Data', description: 'Fuel injector 4 extended data', dataType: 'raw', writable: false, category: 'Fuel System', platform: ['GM'], loggerLevel: 3 },
  { did: 0x330D, name: 'Fuel Injector 5 Data', description: 'Fuel injector 5 extended data', dataType: 'raw', writable: false, category: 'Fuel System', platform: ['GM'], loggerLevel: 3 },
  { did: 0x330E, name: 'Fuel Injector 6 Data', description: 'Fuel injector 6 extended data', dataType: 'raw', writable: false, category: 'Fuel System', platform: ['GM'], loggerLevel: 3 },
  { did: 0x330F, name: 'Fuel Injector 7 Data', description: 'Fuel injector 7 extended data', dataType: 'raw', writable: false, category: 'Fuel System', platform: ['GM'], loggerLevel: 3 },
  { did: 0x3310, name: 'Fuel Injector 8 Data', description: 'Fuel injector 8 extended data', dataType: 'raw', writable: false, category: 'Fuel System', platform: ['GM'], loggerLevel: 3 },
  { did: 0x3240, name: 'Fuel Rail Actual', description: 'Actual fuel rail pressure (extended precision)', dataType: 'uint16', unit: 'bar', writable: false, category: 'Fuel System', platform: ['GM'], loggerLevel: 2 },
  { did: 0x3308, name: 'VGT Extended Data', description: 'VGT extended status and diagnostic data', dataType: 'raw', writable: false, category: 'Turbo Health', platform: ['GM'], loggerLevel: 3 },
];

// ─── Security Access Procedures ─────────────────────────────────────────────

export interface SecurityAccessProcedure {
  platform: string;
  ecuFamily: string;
  levels: { level: number; purpose: string; seedSize: number; keySize: number }[];
  algorithm: string;
  description: string;
  notes: string[];
}

export const SECURITY_ACCESS_PROCEDURES: SecurityAccessProcedure[] = [
  {
    platform: 'GM',
    ecuFamily: 'Global B (E42/E86)',
    levels: [
      { level: 1, purpose: 'Basic diagnostic access', seedSize: 31, keySize: 12 },
      { level: 3, purpose: 'Extended diagnostic access', seedSize: 31, keySize: 12 },
      { level: 5, purpose: 'Programming access', seedSize: 31, keySize: 12 },
      { level: 9, purpose: 'Manufacturing access', seedSize: 31, keySize: 12 },
    ],
    algorithm: 'CMAC-based (AES-128 CMAC)',
    description: 'GM Global B uses CMAC-based authentication with module-specific secret keys. 31-byte seed provides high entropy — brute force not feasible.',
    notes: [
      'Mode $22 reads do NOT require security access',
      'IOControl ($2F) requires Level 1-3 in Extended Session',
      'WriteDataByIdentifier ($2E) requires Level 3-5',
      'RequestDownload ($34) requires Level 5 in Programming Session',
      'Each module has its own CMAC key — ECM key differs from IPC key',
      'EFILive/HP Tuners have licensed implementations for ECM access',
    ],
  },
  {
    platform: 'Ford',
    ecuFamily: 'MG1 / EDC17',
    levels: [
      { level: 1, purpose: 'Standard diagnostic', seedSize: 3, keySize: 3 },
      { level: 3, purpose: 'Extended diagnostic', seedSize: 3, keySize: 3 },
      { level: 5, purpose: 'Programming', seedSize: 3, keySize: 3 },
    ],
    algorithm: 'LFSR (Linear Feedback Shift Register)',
    description: '24-bit seed, 24-bit key using LFSR with 5 secret bytes per ECU variant.',
    notes: [
      'MG1 secrets: {0x62, 0x74, 0x53, 0x47, 0xA1}',
      'EDC17CP05 secrets: {0xA7, 0xC2, 0xE9, 0x19, 0x92}',
      'Algorithm: bit extraction from seed → LFSR shift register → XOR chain',
    ],
  },
  {
    platform: 'Cummins',
    ecuFamily: 'CM2350B / CM2450B',
    levels: [
      { level: 1, purpose: 'Standard diagnostic', seedSize: 4, keySize: 4 },
      { level: 3, purpose: 'Extended diagnostic', seedSize: 4, keySize: 4 },
    ],
    algorithm: 'Byte-swap + rotate + XOR',
    description: '32-bit seed, 32-bit key. Algorithm: byte-swap seed → rotate-left 11 bits → XOR with two 32-bit secrets.',
    notes: [
      'CM2350B secrets: 0x40DA1B97, 0x9E5B2C4F',
      'CM2450B secrets: 0x2148F227, 0xB163BBBE',
    ],
  },
  {
    platform: 'CAN-am',
    ecuFamily: 'MED17.8.5 / MG1CA920',
    levels: [
      { level: 1, purpose: 'Standard diagnostic', seedSize: 2, keySize: 2 },
      { level: 3, purpose: 'Extended diagnostic (VIN write, key learn)', seedSize: 2, keySize: 2 },
    ],
    algorithm: 'Lookup table (cucakeysB matrix)',
    description: '16-bit seed, 16-bit key. Seed bits select index into cucakeysB[8][4] matrix, multiply by ~seed, shift right 6.',
    notes: [
      'cuakeyA = {0x212, 0x428, 0x205, 0x284} (4 key levels)',
      'Key level 3 (standard diagnostic) maps to index 1',
      'VIN write requires Level 3',
      'DESS key learn requires Level 3',
    ],
  },
  {
    platform: 'BRP',
    ecuFamily: 'Dash / Cluster',
    levels: [
      { level: 1, purpose: 'Diagnostic access', seedSize: 2, keySize: 2 },
    ],
    algorithm: 'Bit extraction + conditional rotation + XOR',
    description: '16-bit seed, 16-bit key with fixed constants.',
    notes: [
      'Constants: 0x22F9, 0x20D9, 0x626B',
    ],
  },
  {
    platform: 'Polaris',
    ecuFamily: 'Generic',
    levels: [
      { level: 1, purpose: 'Diagnostic access', seedSize: 2, keySize: 2 },
    ],
    algorithm: 'Polynomial with rotating coefficients',
    description: '16-bit seed, 16-bit key using coefficient array.',
    notes: [
      'Coefficients: {0xB3, 0x6A, 0x35, 0x9A, 0xCD, 0xE6, 0x73, 0x39}',
    ],
  },
  {
    platform: 'Ford',
    ecuFamily: 'TCU 10R80',
    levels: [
      { level: 1, purpose: 'Transmission diagnostic', seedSize: 0, keySize: 18 },
    ],
    algorithm: 'HMAC-SHA1',
    description: 'Variable seed, 18-byte key using HMAC-SHA1 with fixed 12-byte key.',
    notes: [
      'Signature: "JaKe" embedded in response',
    ],
  },
];

// ─── Routine Control Definitions ────────────────────────────────────────────

export interface RoutineDefinition {
  routineId: number;
  name: string;
  description: string;
  platform: string[];
  securityLevel: number;
  sessionRequired: 'extended' | 'programming';
  parameters?: { name: string; type: string; description: string }[];
  dangerLevel: 'safe' | 'caution' | 'danger';
  notes?: string;
}

export const ROUTINE_CONTROLS: RoutineDefinition[] = [
  {
    routineId: 0xFF00, name: 'Erase Memory', description: 'Erase flash memory block (used before reflash)',
    platform: ['GM', 'Ford', 'Cummins'], securityLevel: 5, sessionRequired: 'programming',
    dangerLevel: 'danger', notes: 'Will brick ECU if interrupted. Requires full flash write after erase.',
  },
  {
    routineId: 0x0203, name: 'DPF Forced Regeneration', description: 'Force a DPF regeneration cycle',
    platform: ['GM', 'Ford', 'Cummins'], securityLevel: 1, sessionRequired: 'extended',
    parameters: [{ name: 'regenType', type: 'uint8', description: '1=service regen, 2=forced regen' }],
    dangerLevel: 'caution', notes: 'Vehicle must be stationary. Exhaust temps will exceed 600°C. Keep clear of exhaust.',
  },
  {
    routineId: 0x0204, name: 'TPMS Sensor Learn', description: 'Learn new TPMS sensor IDs',
    platform: ['GM'], securityLevel: 1, sessionRequired: 'extended',
    dangerLevel: 'safe', notes: 'Requires deflating/inflating each tire in sequence to trigger sensor transmission.',
  },
  {
    routineId: 0x0205, name: 'Injector Coding', description: 'Program IQA (Injector Quantity Adjustment) codes',
    platform: ['GM', 'Ford'], securityLevel: 3, sessionRequired: 'extended',
    parameters: [
      { name: 'cylinderNumber', type: 'uint8', description: 'Cylinder number (1-8)' },
      { name: 'iqaCode', type: 'ascii', description: 'IQA code from injector label (alphanumeric)' },
    ],
    dangerLevel: 'caution', notes: 'Wrong IQA codes cause rough idle, smoke, and potential injector damage.',
  },
  {
    routineId: 0x0301, name: 'Cylinder Balance Test', description: 'Run cylinder contribution/balance test',
    platform: ['GM', 'Ford', 'Cummins'], securityLevel: 1, sessionRequired: 'extended',
    dangerLevel: 'safe', notes: 'Engine must be at operating temperature and idle.',
  },
  {
    routineId: 0x0302, name: 'Injector Buzz Test', description: 'Activate individual injectors for audible verification',
    platform: ['GM', 'Ford'], securityLevel: 1, sessionRequired: 'extended',
    parameters: [{ name: 'cylinderNumber', type: 'uint8', description: 'Cylinder to buzz (1-8, 0=all sequential)' }],
    dangerLevel: 'safe', notes: 'Engine must be off. Listen for click at each injector.',
  },
  {
    routineId: 0x0401, name: 'DESS Key Learn', description: 'Learn a new DESS key to ECM (CAN-am)',
    platform: ['CAN-am'], securityLevel: 3, sessionRequired: 'extended',
    dangerLevel: 'caution', notes: 'Place DESS key on RF post before starting. Up to 8 keys can be stored.',
  },
  {
    routineId: 0x0402, name: 'DESS Key Erase', description: 'Erase a DESS key from ECM memory (CAN-am)',
    platform: ['CAN-am'], securityLevel: 3, sessionRequired: 'extended',
    dangerLevel: 'caution', notes: 'Erasing all keys will lock out the vehicle.',
  },
  {
    routineId: 0x0501, name: 'Oil Life Reset', description: 'Reset oil life monitor to 100%',
    platform: ['GM', 'Ford'], securityLevel: 0, sessionRequired: 'extended',
    dangerLevel: 'safe',
  },
  {
    routineId: 0x0502, name: 'Transmission Adaptive Reset', description: 'Reset transmission adaptive learning values',
    platform: ['GM', 'Ford'], securityLevel: 1, sessionRequired: 'extended',
    dangerLevel: 'caution', notes: 'Shifts may be harsh for 50-100 miles while TCM re-learns.',
  },
];

// ─── IO Control Definitions ─────────────────────────────────────────────────

export interface IOControlDefinition {
  did: number;
  name: string;
  description: string;
  platform: string[];
  securityLevel: number;
  controlOptions: { value: number; name: string; description: string }[];
  dangerLevel: 'safe' | 'caution' | 'danger';
  notes?: string;
}

export const IO_CONTROLS: IOControlDefinition[] = [
  {
    did: 0x0100, name: 'Cooling Fan Override', description: 'Override cooling fan speed',
    platform: ['GM', 'Ford'], securityLevel: 1,
    controlOptions: [
      { value: 0x00, name: 'Return Control', description: 'Return to ECM control' },
      { value: 0x03, name: 'Short Term Adjust', description: 'Set fan speed (0-100%)' },
    ],
    dangerLevel: 'caution', notes: 'Forcing fan off while driving can cause overheating.',
  },
  {
    did: 0x0200, name: 'VGT Position Override', description: 'Override VGT vane position',
    platform: ['GM'], securityLevel: 1,
    controlOptions: [
      { value: 0x00, name: 'Return Control', description: 'Return to ECM control' },
      { value: 0x03, name: 'Short Term Adjust', description: 'Set vane position (0-100%)' },
    ],
    dangerLevel: 'caution', notes: 'Forcing VGT fully closed at high RPM can cause turbo overspin/surge.',
  },
  {
    did: 0x0300, name: 'EGR Valve Override', description: 'Override EGR valve position',
    platform: ['GM', 'Ford'], securityLevel: 1,
    controlOptions: [
      { value: 0x00, name: 'Return Control', description: 'Return to ECM control' },
      { value: 0x03, name: 'Short Term Adjust', description: 'Set EGR position (0=closed, 100=open)' },
    ],
    dangerLevel: 'safe', notes: 'Useful for EGR flow testing.',
  },
  {
    did: 0x0400, name: 'Glow Plug Activation', description: 'Activate individual glow plugs',
    platform: ['GM', 'Ford', 'Cummins'], securityLevel: 1,
    controlOptions: [
      { value: 0x00, name: 'Return Control', description: 'Return to ECM control' },
      { value: 0x03, name: 'Short Term Adjust', description: 'Activate glow plug (bitmask: bit0=cyl1, etc.)' },
    ],
    dangerLevel: 'caution', notes: 'Extended activation can damage glow plugs. Engine must be off.',
  },
];

// ─── CAN-am Seed/Key Algorithm ──────────────────────────────────────────────

/** CAN-am seed/key lookup tables (from reverse-engineered source) */
export const CANAM_CUAKEYA = [0x212, 0x428, 0x205, 0x284];

export const CANAM_CUCAKEYSB: number[][] = [
  [0x0A31, 0x1463, 0x28C5, 0x518B],
  [0x0C37, 0x186F, 0x30DD, 0x61BB],
  [0x0E3D, 0x1C7B, 0x38F5, 0x71EB],
  [0x1043, 0x2087, 0x410D, 0x821B],
  [0x1249, 0x2493, 0x4925, 0x924B],
  [0x144F, 0x289F, 0x513D, 0xA27B],
  [0x1655, 0x2CAB, 0x5955, 0xB2AB],
  [0x1861, 0x30C3, 0x6185, 0xC30B],
];

/**
 * Compute CAN-am security access key from seed.
 * Algorithm: extract 3 bits from seed using cuakeyA mask → index cucakeysB → multiply by ~seed → shift right 6
 *
 * @param seed - 16-bit seed from ECU ($27 03 response)
 * @param level - Security access level (1 or 3, maps to cuakeyA index)
 * @returns 16-bit key to send back ($27 04)
 */
export function computeCanamKey(seed: number, level: number = 3): number {
  // Level to cuakeyA index mapping
  const levelIndex = level === 1 ? 0 : level === 3 ? 1 : level === 5 ? 2 : 3;
  const mask = CANAM_CUAKEYA[levelIndex];

  // Extract 3 bits from seed using mask
  let idx = 0;
  for (let bit = 0; bit < 16; bit++) {
    if (mask & (1 << bit)) {
      if (seed & (1 << bit)) {
        idx |= (1 << (bit % 3));
      }
    }
  }
  idx &= 0x07; // 3-bit index (0-7)

  // Look up value from cucakeysB matrix
  const lookupValue = CANAM_CUCAKEYSB[idx][levelIndex];

  // Compute key: multiply by ~seed, shift right 6
  const invertedSeed = (~seed) & 0xFFFF;
  const product = (lookupValue * invertedSeed) & 0xFFFFFFFF;
  const key = (product >> 6) & 0xFFFF;

  return key;
}

/**
 * Compute BRP Dash security access key from seed.
 * Algorithm: bit extraction + conditional rotation + XOR with fixed constants
 */
export function computeBrpDashKey(seed: number): number {
  const c1 = 0x22F9;
  const c2 = 0x20D9;
  const c3 = 0x626B;

  let key = seed ^ c1;
  // Conditional rotation based on bit 7
  if (key & 0x80) {
    key = ((key << 3) | (key >> 13)) & 0xFFFF;
  } else {
    key = ((key << 5) | (key >> 11)) & 0xFFFF;
  }
  key ^= c2;
  key = ((key + c3) & 0xFFFF);

  return key;
}

/**
 * Compute Polaris security access key from seed.
 * Polynomial-based with rotating coefficients.
 */
export function computePolarisKey(seed: number): number {
  const coeffs = [0xB3, 0x6A, 0x35, 0x9A, 0xCD, 0xE6, 0x73, 0x39];
  let key = seed;

  for (let i = 0; i < 8; i++) {
    key = ((key * coeffs[i]) + coeffs[(i + 1) % 8]) & 0xFFFF;
  }

  return key;
}

/**
 * Compute Ford MG1/EDC17 security access key from seed.
 * LFSR-based: 24-bit seed, 24-bit key with 5 secret bytes.
 */
export function computeFordMG1Key(seed: number, secrets: number[] = [0x62, 0x74, 0x53, 0x47, 0xA1]): number {
  let lfsr = seed & 0xFFFFFF;

  for (let round = 0; round < 5; round++) {
    const secret = secrets[round];
    for (let bit = 0; bit < 8; bit++) {
      const feedback = ((lfsr >> 23) ^ (lfsr >> 17) ^ (lfsr >> 5) ^ (lfsr >> 0)) & 1;
      lfsr = ((lfsr << 1) | feedback) & 0xFFFFFF;
      if (secret & (1 << bit)) {
        lfsr ^= (seed & 0xFFFFFF);
      }
    }
  }

  return lfsr & 0xFFFFFF;
}

/**
 * Compute Cummins CM2350B/CM2450B security access key from seed.
 * Algorithm: byte-swap → rotate-left 11 → XOR with two secrets.
 */
export function computeCumminsKey(
  seed: number,
  secret1: number = 0x40DA1B97,
  secret2: number = 0x9E5B2C4F
): number {
  // Byte-swap seed
  let key = ((seed & 0xFF) << 24) |
            (((seed >> 8) & 0xFF) << 16) |
            (((seed >> 16) & 0xFF) << 8) |
            ((seed >> 24) & 0xFF);

  // Rotate left 11 bits
  key = ((key << 11) | (key >>> 21)) >>> 0;

  // XOR with secrets
  key = (key ^ secret1) >>> 0;
  key = (key ^ secret2) >>> 0;

  return key;
}

// ─── Logger Level Definitions ───────────────────────────────────────────────

export interface LoggerLevel {
  level: 1 | 2 | 3 | 4;
  name: string;
  description: string;
  hardwareRequired: string;
  capabilities: string[];
  pidCount: number;
}

export const LOGGER_LEVELS: LoggerLevel[] = [
  {
    level: 1, name: 'Basic OBD-II', description: 'Standard OBD-II Mode 01 PIDs — works with any ELM327',
    hardwareRequired: 'Any ELM327 adapter (Bluetooth, WiFi, USB)',
    capabilities: ['Standard PIDs (RPM, speed, coolant, MAF, boost, etc.)', 'DTC read/clear', 'Freeze frame data', 'VIN read'],
    pidCount: 96,
  },
  {
    level: 2, name: 'Extended DIDs', description: 'Manufacturer-specific Mode 22 DIDs — per-cylinder health, VGT offsets, DPF state',
    hardwareRequired: 'OBDLink EX/MX+ or ELM327 v2.1+',
    capabilities: ['All Level 1 PIDs', 'Per-cylinder balance rates', 'VGT learned offsets', 'DPF regen state', 'Actual torque output', 'Fan speed/demand', 'Humidity data', 'Extended MAP'],
    pidCount: 180,
  },
  {
    level: 3, name: 'Raw CAN + TX', description: 'Raw CAN bus signals from DBC definitions + transmit commands',
    hardwareRequired: 'PCAN-USB, Kvaser, or CANable adapter',
    capabilities: ['All Level 1-2 PIDs', 'Raw CAN frame capture', 'BCM serial data (steering, wheel speeds, ACC)', 'CAN bus gateway bridging', 'DPF forced regen command', 'TPMS reset', 'Injector buzz test'],
    pidCount: 500,
  },
  {
    level: 4, name: 'Full UDS Expert', description: 'Complete UDS protocol access — ReadMemoryByAddress, IOControl, live tuning',
    hardwareRequired: 'PCAN-USB with security access capability',
    capabilities: ['All Level 1-3 capabilities', 'ReadMemoryByAddress (A2L live reads)', 'WriteMemoryByAddress (live tuning)', 'IOControlByIdentifier (actuator tests)', 'RoutineControl (DPF regen, key learn)', 'SecurityAccess (seed/key unlock)', 'Flash read/write capability'],
    pidCount: 1000,
  },
];

// ─── Helper Functions ───────────────────────────────────────────────────────

/** Get all DIDs for a specific logger level and platform */
export function getDidsForLevel(level: 1 | 2 | 3 | 4, platform?: string): UDSDid[] {
  return UDS_DIDS.filter(d => {
    if (d.loggerLevel > level) return false;
    if (platform && !d.platform.includes('ALL') && !d.platform.includes(platform)) return false;
    return true;
  });
}

/** Get all DIDs grouped by category */
export function getDidsGroupedByCategory(level?: 1 | 2 | 3 | 4, platform?: string): Map<string, UDSDid[]> {
  const groups = new Map<string, UDSDid[]>();
  for (const did of UDS_DIDS) {
    if (level && did.loggerLevel > level) continue;
    if (platform && !did.platform.includes('ALL') && !did.platform.includes(platform)) continue;
    if (!groups.has(did.category)) groups.set(did.category, []);
    groups.get(did.category)!.push(did);
  }
  return groups;
}

/** Get security access procedure for a platform */
export function getSecurityProcedure(platform: string): SecurityAccessProcedure | undefined {
  return SECURITY_ACCESS_PROCEDURES.find(p =>
    p.platform.toLowerCase() === platform.toLowerCase()
  );
}

/** Get routine controls for a platform */
export function getRoutinesForPlatform(platform: string): RoutineDefinition[] {
  return ROUTINE_CONTROLS.filter(r => r.platform.includes(platform));
}

/** Get IO controls for a platform */
export function getIOControlsForPlatform(platform: string): IOControlDefinition[] {
  return IO_CONTROLS.filter(io => io.platform.includes(platform));
}

/** Format a DID value for display */
export function formatDidValue(did: UDSDid, rawBytes: number[]): string {
  if (!rawBytes || rawBytes.length === 0) return 'N/A';

  switch (did.dataType) {
    case 'ascii':
      return String.fromCharCode(...rawBytes.filter(b => b >= 0x20 && b <= 0x7E));

    case 'uint8':
      return did.scaling
        ? (rawBytes[0] * did.scaling.factor + did.scaling.offset).toFixed(2)
        : rawBytes[0].toString();

    case 'uint16': {
      const val = (rawBytes[0] << 8) | rawBytes[1];
      return did.scaling
        ? (val * did.scaling.factor + did.scaling.offset).toFixed(2)
        : val.toString();
    }

    case 'int16': {
      let val = (rawBytes[0] << 8) | rawBytes[1];
      if (val > 32767) val -= 65536;
      return did.scaling
        ? (val * did.scaling.factor + did.scaling.offset).toFixed(2)
        : val.toString();
    }

    case 'uint32': {
      const val = (rawBytes[0] << 24) | (rawBytes[1] << 16) | (rawBytes[2] << 8) | rawBytes[3];
      return did.scaling
        ? (val * did.scaling.factor + did.scaling.offset).toFixed(2)
        : val.toString();
    }

    case 'enum':
      if (did.enumValues) {
        const enumVal = rawBytes[0];
        return did.enumValues[enumVal] || `Unknown (${enumVal})`;
      }
      return rawBytes[0].toString();

    case 'hex':
      return rawBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

    case 'raw':
      return rawBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

    default:
      return rawBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
  }
}

/** Get UDS service by ID */
export function getUDSService(serviceId: number): UDSService | undefined {
  return UDS_SERVICES.find(s => s.id === serviceId);
}

/** Decode a negative response code */
export function decodeNRC(nrc: number): { name: string; description: string } {
  return NRC_CODES[nrc] || { name: 'unknown', description: `Unknown NRC: 0x${nrc.toString(16)}` };
}
