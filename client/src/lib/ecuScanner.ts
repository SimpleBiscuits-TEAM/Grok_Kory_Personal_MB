/**
 * ECU Scanner — Pre-Flash Vehicle Interrogation
 * ===============================================
 * 
 * Polls all known ECU CAN addresses, reads identifying DIDs,
 * and returns a comprehensive report of what's on the bus.
 * 
 * Supports:
 * - GM GMLAN: ReadDID 0x1A, OBD Mode 9 CalIDs, CVNs 0xC1-0xCC
 * - Ford UDS: ReadDID 0x22 with Ford-specific DIDs (F111 CVN, F113 Cal SW ID, etc.)
 * - Cummins UDS: ReadDID 0x22 with Cummins-specific DIDs (F18C ESN, F181/F182, etc.)
 * - Auto-detection of ECU type from response data
 * - Security access with key computation from container file
 * - Comparison against loaded container file
 * 
 * IMPORTANT: For GMLAN ECUs, security access (seed/key) MUST be performed
 * BEFORE reading most DIDs. The ECU will simply timeout on 0x1A reads
 * without an authenticated session. This was confirmed from the 2017 L5P
 * SPS log analysis and live bench testing.
 */

import { PCANConnection, type UDSResponse } from './pcanConnection';
import {
  ECU_DATABASE,
  type EcuConfig,
  type Protocol,
  type Manufacturer,
  type ContainerFileHeader,
} from '../../../shared/ecuDatabase';
import { computeGM5B, computeFord3B } from '../../../shared/seedKeyAlgorithms';
import { getSecurityProfileMeta, type EcuSecurityProfileMeta } from '../../../shared/seedKeyMeta';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EcuScanResult {
  /** CAN TX address that was probed */
  txAddr: number;
  /** CAN RX address where response came from */
  rxAddr: number;
  /** Whether the ECU responded at all */
  responding: boolean;
  /** Detected protocol based on response behavior */
  detectedProtocol: Protocol | 'unknown';
  /** Matched ECU config from database (if identifiable) */
  ecuConfig?: EcuConfig;
  /** VIN read from this ECU */
  vin?: string;
  /** Hardware number / ECU ID */
  hardwareId?: string;
  /** Software number */
  softwareNumber?: string;
  /** Programming state (GM: 0xA2 ReportProgrammedState) */
  programmingState?: string;
  /** All calibration part numbers (up to 9 for GM) */
  calibrationPartNumbers: string[];
  /** Calibration Verification Numbers (CRC/CVN) */
  cvns: CvnEntry[];
  /** Raw DID responses for debugging */
  rawResponses: RawDIDResponse[];
  /** Whether security access was attempted */
  securityAccessAttempted: boolean;
  /** Whether security access was granted */
  securityAccessGranted: boolean;
  /** Notes about ECU state (e.g., HPTuners-unlocked) */
  notes: string[];
  /** Scan status */
  status: 'scanning' | 'complete' | 'timeout' | 'error';
  /** Error message if scan failed */
  error?: string;
  /** Scan duration in ms */
  scanDurationMs?: number;
}

export interface CvnEntry {
  /** CVN index (1-based) */
  index: number;
  /** DID that was read (e.g., 0xC1 for GMLAN) */
  did: number;
  /** Raw hex value */
  hex: string;
  /** Numeric value */
  value: number;
}

export interface RawDIDResponse {
  did: number;
  didHex: string;
  service: number;
  data: number[];
  dataHex: string;
  positive: boolean;
  nrc?: number;
  nrcName?: string;
}

export interface VehicleScanReport {
  /** Timestamp when scan started */
  startTime: number;
  /** Timestamp when scan completed */
  endTime: number;
  /** Total scan duration in ms */
  totalDurationMs: number;
  /** All ECU scan results */
  ecus: EcuScanResult[];
  /** Number of ECUs that responded */
  respondingCount: number;
  /** VIN consensus (most common VIN across ECUs) */
  vehicleVin?: string;
  /** Whether scan is still in progress */
  scanning: boolean;
}

export interface ContainerComparison {
  /** Container file part numbers (sw_c1-sw_c9) */
  containerPartNumbers: string[];
  /** ECU current part numbers */
  ecuPartNumbers: string[];
  /** Per-slot comparison */
  slots: {
    index: number;
    containerPart: string;
    ecuPart: string;
    match: boolean;
    changed: boolean;
  }[];
  /** Overall match status */
  allMatch: boolean;
  /** Number of changed calibrations */
  changedCount: number;
}

// ── DID Definitions ─────────────────────────────────────────────────────────

/** GMLAN ReadDataByIdentifier (service 0x1A) DIDs */
const GMLAN_DIDS = {
  VIN: 0x90,
  ECU_ID: 0xB0,
  PROGRAMMING_STATUS: 0xA0,
  SW_PART_NUMBER: 0xCB,
  // CVNs are read individually
  CVN_1: 0xC1,
  CVN_2: 0xC2,
  CVN_3: 0xC3,
  CVN_4: 0xC4,
  CVN_5: 0xC5,
  CVN_6: 0xC6,
  CVN_7: 0xC9,
  CVN_8: 0xCA,
  CVN_OVERALL: 0xCC,
} as const;

/** Standard UDS ReadDataByIdentifier (service 0x22) DIDs */
const UDS_DIDS = {
  VIN: 0xF190,
  ECU_SW_NUMBER: 0xF188,
  ECU_HW_NUMBER: 0xF191,
  ECU_HW_VERSION: 0xF193,
  ECU_SUPPLIER_ID: 0xF18A,
  ECU_SW_VERSION: 0xF189,
  SYSTEM_NAME: 0xF197,
  ECU_SERIAL: 0xF18C,
  PROGRAMMING_DATE: 0xF199,
  SPARE_PART_NUMBER: 0xF187,
  CALIBRATION_ID: 0xF806,
  ACTIVE_SESSION: 0xF186,
  BOOT_SW_ID: 0xF180,
  APP_SW_ID: 0xF181,
  APP_DATA_ID: 0xF182,
  APP_SW_FINGERPRINT: 0xF184,
  APP_DATA_FINGERPRINT: 0xF185,
} as const;

/** Ford OEM-specific DIDs */
const FORD_DIDS = {
  CVN: 0xF111,
  CAL_SW_ID: 0xF113,
  MODULE_CONFIG: 0xDE00,
  AS_BUILT_DATA: 0xDE01,
  PROGRAMMING_INFO: 0xDD01,
} as const;

/** CAN address groups to scan — each group has a unique physical address */
const SCAN_ADDRESSES = [
  { tx: 0x7E0, rx: 0x7E8, label: 'ECM (Primary)' },
  { tx: 0x7E1, rx: 0x7E9, label: 'TCU (Ford)' },
  { tx: 0x7E2, rx: 0x7EA, label: 'TCM (Allison)' },
] as const;

// ── Scanner Class ────────────────────────────────────────────────────────────

export class EcuScanner {
  private connection: PCANConnection;
  private abortController: AbortController | null = null;
  /** Optional container header for key computation during security access */
  private containerHeader?: ContainerFileHeader;

  constructor(connection: PCANConnection, containerHeader?: ContainerFileHeader) {
    this.connection = connection;
    this.containerHeader = containerHeader;
  }

  /**
   * Scan all known CAN addresses and read ECU information.
   * Calls onProgress for each ECU as it's scanned.
   */
  async scanVehicle(
    onProgress?: (report: VehicleScanReport) => void,
  ): Promise<VehicleScanReport> {
    this.abortController = new AbortController();
    const startTime = Date.now();

    const report: VehicleScanReport = {
      startTime,
      endTime: 0,
      totalDurationMs: 0,
      ecus: [],
      respondingCount: 0,
      scanning: true,
    };

    // Ensure connection is open
    if (this.connection.getState() === 'disconnected' || this.connection.getState() === 'error') {
      try {
        await this.connection.connect();
      } catch (err) {
        report.scanning = false;
        report.endTime = Date.now();
        report.totalDurationMs = report.endTime - startTime;
        return report;
      }
    }

    // Allow ECU to settle after connection
    await this.delay(1000);

    // Scan each address group sequentially
    for (const addr of SCAN_ADDRESSES) {
      if (this.abortController?.signal.aborted) break;

      const ecuResult = await this.scanAddress(addr.tx, addr.rx, addr.label);
      report.ecus.push(ecuResult);

      if (ecuResult.responding) {
        report.respondingCount++;
      }

      // Update progress
      report.endTime = Date.now();
      report.totalDurationMs = report.endTime - startTime;
      onProgress?.(report);
    }

    // Determine VIN consensus
    const vins = report.ecus
      .filter(e => e.vin && e.vin.length >= 17)
      .map(e => e.vin!);
    if (vins.length > 0) {
      const vinCounts = new Map<string, number>();
      for (const v of vins) {
        vinCounts.set(v, (vinCounts.get(v) || 0) + 1);
      }
      report.vehicleVin = [...vinCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    }

    report.scanning = false;
    report.endTime = Date.now();
    report.totalDurationMs = report.endTime - startTime;
    onProgress?.(report);

    return report;
  }

  /** Abort an in-progress scan. */
  abort(): void {
    this.abortController?.abort();
  }

  /**
   * Scan a single CAN address and read all available DIDs.
   */
  private async scanAddress(
    txAddr: number,
    rxAddr: number,
    label: string,
  ): Promise<EcuScanResult> {
    const startMs = Date.now();
    const result: EcuScanResult = {
      txAddr,
      rxAddr,
      responding: false,
      detectedProtocol: 'unknown',
      calibrationPartNumbers: [],
      cvns: [],
      rawResponses: [],
      securityAccessAttempted: false,
      securityAccessGranted: false,
      notes: [],
      status: 'scanning',
    };

    console.log(`[ECU Scanner] Probing ${label} (TX: 0x${txAddr.toString(16)}, RX: 0x${rxAddr.toString(16)})...`);

    // Step 1: Probe with TesterPresent to see if anything responds
    const probeResp = await this.sendAndRecord(result, 0x3E, 0x00, [], txAddr);
    if (!probeResp) {
      // Try DiagSessionControl as fallback probe (some ECUs don't support TesterPresent)
      const diagProbe = await this.sendAndRecord(result, 0x10, 0x01, [], txAddr);
      if (!diagProbe) {
        result.status = 'timeout';
        result.scanDurationMs = Date.now() - startMs;
        console.log(`[ECU Scanner] ${label}: No response — ECU not present or not powered`);
        return result;
      }
    }

    result.responding = true;

    // Step 2: Enter programming session — required for most DIDs on GM ECUs
    // The SPS log and bench testing confirm that GMLAN ECUs need 0x10 0x02
    // (DiagSessionControl Programming) before they'll respond to 0x1A ReadDID.
    console.log(`[ECU Scanner] ${label}: ECU responding — entering programming session...`);
    const sessionResp = await this.sendAndRecord(result, 0x10, 0x02, [], txAddr);
    if (sessionResp?.positiveResponse) {
      console.log(`[ECU Scanner] ${label}: Programming session active`);
    }
    await this.delay(200);

    // Step 3: Attempt security access FIRST — before reading DIDs
    // GMLAN ECUs require security access before responding to most 0x1A DIDs.
    // This was confirmed from the 2017 L5P SPS log and live bench testing:
    // "scan needs key on command" — user confirmed this behavior.
    const securityGranted = await this.attemptSecurityAccess(result, txAddr);
    if (securityGranted) {
      console.log(`[ECU Scanner] ${label}: Security access granted — reading protected DIDs...`);
    } else {
      console.log(`[ECU Scanner] ${label}: Security access not granted — reading public DIDs only...`);
    }
    await this.delay(200);

    // Step 4: Detect protocol and read DIDs
    // Try GMLAN ReadDID first (0x1A 0x90 for VIN)
    const gmlanVinResp = await this.sendAndRecord(result, 0x1A, undefined, [GMLAN_DIDS.VIN], txAddr);
    const isGmlan = gmlanVinResp?.positiveResponse === true;

    if (isGmlan) {
      result.detectedProtocol = 'GMLAN';
      await this.scanGmlanEcu(result, txAddr);
    } else {
      // Try UDS ReadDID (0x22 0xF190)
      const udsVinResp = await this.sendAndRecord(
        result, 0x22, undefined,
        [(UDS_DIDS.VIN >> 8) & 0xFF, UDS_DIDS.VIN & 0xFF],
        txAddr,
      );
      if (udsVinResp?.positiveResponse) {
        result.detectedProtocol = 'UDS';
        // Determine manufacturer for OEM-specific DID reads
        const ecuConfig = this.matchEcuConfig(result);
        result.ecuConfig = ecuConfig;
        const manufacturer = ecuConfig?.oem;
        if (manufacturer === 'FORD') {
          await this.scanFordEcu(result, txAddr);
        } else if (manufacturer === 'DODGE') {
          await this.scanCumminsEcu(result, txAddr);
        } else {
          await this.scanGenericUdsEcu(result, txAddr);
        }
      } else {
        // ECU responds but doesn't support standard ReadDID
        result.detectedProtocol = 'unknown';
        if (gmlanVinResp && gmlanVinResp.data?.length > 0) {
          result.vin = this.extractAscii(gmlanVinResp.data);
        }
      }
    }

    // Step 5: Match against ECU database (if not already matched)
    if (!result.ecuConfig) {
      result.ecuConfig = this.matchEcuConfig(result);
    }

    // Step 6: Add notes about ECU state
    if (result.responding && result.calibrationPartNumbers.length === 0 && result.cvns.length === 0) {
      result.notes.push('ECU responded but no calibration data read — may need different security level or session');
    }
    if (result.securityAccessAttempted && !result.securityAccessGranted) {
      result.notes.push('Security access attempted but denied — ECU may require hardware unlock box or specific key');
    }

    result.status = 'complete';
    result.scanDurationMs = Date.now() - startMs;
    console.log(`[ECU Scanner] ${label}: ${result.responding ? 'FOUND' : 'N/A'} — ${result.detectedProtocol} — ${result.ecuConfig?.name || 'unknown ECU'} — ${result.scanDurationMs}ms`);

    return result;
  }

  // ── GMLAN ECU Scan ──────────────────────────────────────────────────────────

  /**
   * Full GMLAN ECU scan — reads all GM-specific DIDs.
   * Security access should already be granted before calling this.
   */
  private async scanGmlanEcu(result: EcuScanResult, txAddr: number): Promise<void> {
    // ── VIN (0x1A 0x90) ──
    const existingVin = result.rawResponses.find(r => r.service === 0x1A && r.did === 0x90 && r.positive);
    if (existingVin) {
      result.vin = this.extractAscii(existingVin.data);
    } else {
      const vinResp = await this.sendAndRecord(result, 0x1A, undefined, [GMLAN_DIDS.VIN], txAddr);
      if (vinResp?.positiveResponse && vinResp.data?.length > 0) {
        result.vin = this.extractAscii(vinResp.data);
      }
    }

    // ── ECU ID / Hardware (0x1A 0xB0) ──
    const ecuIdResp = await this.sendAndRecord(result, 0x1A, undefined, [GMLAN_DIDS.ECU_ID], txAddr);
    if (ecuIdResp?.positiveResponse && ecuIdResp.data?.length > 0) {
      result.hardwareId = ecuIdResp.data.map(b => b.toString(16).padStart(2, '0')).join(' ');
    }

    // ── Programming Status (0x1A 0xA0) ──
    const progResp = await this.sendAndRecord(result, 0x1A, undefined, [GMLAN_DIDS.PROGRAMMING_STATUS], txAddr);
    if (progResp?.positiveResponse && progResp.data?.length > 0) {
      const status = progResp.data[0];
      result.programmingState = status === 0x00 ? 'Fully Programmed' :
        status === 0x01 ? 'Partially Programmed' :
        status === 0x02 ? 'Not Programmed' :
        `Unknown (0x${status?.toString(16) || '??'})`;
    }

    // ── ReportProgrammedState (0xA2) — GM-specific ──
    const rpsResp = await this.sendAndRecord(result, 0xA2, undefined, [], txAddr);
    if (rpsResp?.positiveResponse && rpsResp.data?.length > 0) {
      const state = rpsResp.data[0];
      if (!result.programmingState || result.programmingState.startsWith('Unknown')) {
        result.programmingState = state === 0x00 ? 'Fully Programmed' :
          state === 0x01 ? 'Partially Programmed' :
          `State 0x${state.toString(16).padStart(2, '0')}`;
      }
    }

    // ── Calibration Part Numbers via OBD Mode 9 PID 0x04 ──
    const calIdResp = await this.sendAndRecord(result, 0x09, undefined, [0x04], txAddr);
    if (calIdResp?.positiveResponse && calIdResp.data?.length > 0) {
      result.calibrationPartNumbers = this.parseCalibrationIds(calIdResp.data);
    }

    // If OBD Mode 9 didn't work, try GMLAN ReadDID 0xCB (software part number)
    if (result.calibrationPartNumbers.length === 0) {
      const swResp = await this.sendAndRecord(result, 0x1A, undefined, [GMLAN_DIDS.SW_PART_NUMBER], txAddr);
      if (swResp?.positiveResponse && swResp.data?.length > 0) {
        const partNum = this.extractAscii(swResp.data).trim();
        if (partNum.length > 0) {
          result.calibrationPartNumbers.push(partNum);
        }
      }
    }

    // ── CVNs (0x1A 0xC1 through 0xCC) ──
    const cvnDids = [
      { did: GMLAN_DIDS.CVN_1, index: 1 },
      { did: GMLAN_DIDS.CVN_2, index: 2 },
      { did: GMLAN_DIDS.CVN_3, index: 3 },
      { did: GMLAN_DIDS.CVN_4, index: 4 },
      { did: GMLAN_DIDS.CVN_5, index: 5 },
      { did: GMLAN_DIDS.CVN_6, index: 6 },
      { did: GMLAN_DIDS.CVN_7, index: 7 },
      { did: GMLAN_DIDS.CVN_8, index: 8 },
      { did: GMLAN_DIDS.CVN_OVERALL, index: 9 },
    ];

    for (const { did, index } of cvnDids) {
      if (this.abortController?.signal.aborted) break;
      const cvnResp = await this.sendAndRecord(result, 0x1A, undefined, [did], txAddr);
      if (cvnResp?.positiveResponse && cvnResp.data?.length > 0) {
        const hex = cvnResp.data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        const value = cvnResp.data.reduce((acc, b) => (acc << 8) | b, 0);
        result.cvns.push({ index, did, hex, value });
      }
    }

    // ── Also try OBD Mode 9 PID 0x06 for CVNs ──
    if (result.cvns.length === 0) {
      const obdCvnResp = await this.sendAndRecord(result, 0x09, undefined, [0x06], txAddr);
      if (obdCvnResp?.positiveResponse && obdCvnResp.data?.length > 0) {
        const parsedCvns = this.parseObdCvns(obdCvnResp.data);
        if (parsedCvns.length > 0) {
          result.cvns = parsedCvns;
        }
      }
    }
  }

  // ── Ford UDS ECU Scan ───────────────────────────────────────────────────────

  /**
   * Ford-specific UDS ECU scan.
   * Ford uses standard UDS with Bosch ECUs (MG1/EDC17/MD1).
   * Typically has 1 OS + 1-3 calibration blocks (NOT 9 like GM).
   * Key Ford-specific DIDs: F111 (CVN), F113 (Cal SW ID), DE00/DE01 (As-Built).
   */
  private async scanFordEcu(result: EcuScanResult, txAddr: number): Promise<void> {
    // ── VIN (0x22 0xF190) ──
    const existingVin = result.rawResponses.find(
      r => r.service === 0x22 && r.did === UDS_DIDS.VIN && r.positive,
    );
    if (existingVin) {
      result.vin = this.extractAscii(existingVin.data);
    } else {
      const vinResp = await this.readUdsDid(result, UDS_DIDS.VIN, txAddr);
      if (vinResp?.positiveResponse && vinResp.data?.length > 0) {
        result.vin = this.extractAscii(vinResp.data);
      }
    }

    // ── ECU Software Number / Ford Calibration Part Number (0xF188) ──
    const swResp = await this.readUdsDid(result, UDS_DIDS.ECU_SW_NUMBER, txAddr);
    if (swResp?.positiveResponse && swResp.data?.length > 0) {
      result.softwareNumber = this.extractAscii(swResp.data).trim();
    }

    // ── ECU Hardware Number (0xF191) ──
    const hwResp = await this.readUdsDid(result, UDS_DIDS.ECU_HW_NUMBER, txAddr);
    if (hwResp?.positiveResponse && hwResp.data?.length > 0) {
      result.hardwareId = this.extractAscii(hwResp.data).trim();
    }

    // ── Spare Part Number (0xF187) ──
    const spareResp = await this.readUdsDid(result, UDS_DIDS.SPARE_PART_NUMBER, txAddr);
    if (spareResp?.positiveResponse && spareResp.data?.length > 0) {
      const sparePart = this.extractAscii(spareResp.data).trim();
      if (sparePart.length > 0) {
        result.notes.push(`Spare Part Number: ${sparePart}`);
      }
    }

    // ── ECU Software Version (0xF189) ──
    const swVerResp = await this.readUdsDid(result, UDS_DIDS.ECU_SW_VERSION, txAddr);
    if (swVerResp?.positiveResponse && swVerResp.data?.length > 0) {
      const swVer = this.extractAscii(swVerResp.data).trim();
      if (swVer.length > 0) {
        result.notes.push(`Software Version: ${swVer}`);
      }
    }

    // ── System Name / Engine Type (0xF197) ──
    const sysResp = await this.readUdsDid(result, UDS_DIDS.SYSTEM_NAME, txAddr);
    if (sysResp?.positiveResponse && sysResp.data?.length > 0) {
      const sysName = this.extractAscii(sysResp.data).trim();
      if (sysName.length > 0) {
        result.notes.push(`System/Engine: ${sysName}`);
      }
    }

    // ── ECU Serial Number (0xF18C) ──
    const serialResp = await this.readUdsDid(result, UDS_DIDS.ECU_SERIAL, txAddr);
    if (serialResp?.positiveResponse && serialResp.data?.length > 0) {
      const serial = this.extractAscii(serialResp.data).trim();
      if (serial.length > 0) {
        result.notes.push(`ECU Serial: ${serial}`);
      }
    }

    // ── Ford-Specific: Application Software Identification (0xF181) ──
    const appSwResp = await this.readUdsDid(result, UDS_DIDS.APP_SW_ID, txAddr);
    if (appSwResp?.positiveResponse && appSwResp.data?.length > 0) {
      const appSw = this.extractAscii(appSwResp.data).trim();
      if (appSw.length > 0) {
        result.calibrationPartNumbers.push(appSw);
      }
    }

    // ── Ford-Specific: Application Data Identification (0xF182) — cal data ID ──
    const appDataResp = await this.readUdsDid(result, UDS_DIDS.APP_DATA_ID, txAddr);
    if (appDataResp?.positiveResponse && appDataResp.data?.length > 0) {
      const appData = this.extractAscii(appDataResp.data).trim();
      if (appData.length > 0) {
        result.calibrationPartNumbers.push(appData);
      }
    }

    // ── Ford-Specific: Calibration Software ID (0xF113) ──
    const calSwResp = await this.readUdsDid(result, FORD_DIDS.CAL_SW_ID, txAddr);
    if (calSwResp?.positiveResponse && calSwResp.data?.length > 0) {
      const calSw = this.extractAscii(calSwResp.data).trim();
      if (calSw.length > 0 && !result.calibrationPartNumbers.includes(calSw)) {
        result.calibrationPartNumbers.push(calSw);
      }
    }

    // ── Ford-Specific: Calibration Verification Number (0xF111) ──
    const fordCvnResp = await this.readUdsDid(result, FORD_DIDS.CVN, txAddr);
    if (fordCvnResp?.positiveResponse && fordCvnResp.data?.length > 0) {
      // Ford CVN can be multi-entry (4 bytes each)
      const cvnData = fordCvnResp.data;
      let offset = 0;
      let index = 1;
      while (offset + 4 <= cvnData.length) {
        const cvnBytes = cvnData.slice(offset, offset + 4);
        const hex = cvnBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        const value = cvnBytes.reduce((acc, b) => (acc << 8) | b, 0);
        result.cvns.push({ index, did: FORD_DIDS.CVN, hex, value });
        index++;
        offset += 4;
      }
    }

    // ── Calibration ID via standard DID (0xF806) ──
    if (result.calibrationPartNumbers.length === 0) {
      const calResp = await this.readUdsDid(result, UDS_DIDS.CALIBRATION_ID, txAddr);
      if (calResp?.positiveResponse && calResp.data?.length > 0) {
        const calId = this.extractAscii(calResp.data).trim();
        if (calId.length > 0) {
          result.calibrationPartNumbers.push(calId);
        }
      }
    }

    // ── OBD Mode 9 fallback for CalIDs and CVNs ──
    if (result.calibrationPartNumbers.length === 0) {
      const calIdResp = await this.sendAndRecord(result, 0x09, undefined, [0x04], txAddr);
      if (calIdResp?.positiveResponse && calIdResp.data?.length > 0) {
        result.calibrationPartNumbers = this.parseCalibrationIds(calIdResp.data);
      }
    }

    if (result.cvns.length === 0) {
      const cvnResp = await this.sendAndRecord(result, 0x09, undefined, [0x06], txAddr);
      if (cvnResp?.positiveResponse && cvnResp.data?.length > 0) {
        result.cvns = this.parseObdCvns(cvnResp.data);
      }
    }

    // ── Ford As-Built Data (0xDE01) — informational ──
    const asBuiltResp = await this.readUdsDid(result, FORD_DIDS.AS_BUILT_DATA, txAddr);
    if (asBuiltResp?.positiveResponse && asBuiltResp.data?.length > 0) {
      result.notes.push(`As-Built Data: ${asBuiltResp.data.length} bytes available`);
    }
  }

  // ── Cummins UDS ECU Scan ────────────────────────────────────────────────────

  /**
   * Cummins-specific UDS ECU scan.
   * Cummins CM2350/CM2450 use standard UDS with security level 0x05.
   * Typically has 1 OS + 1-2 calibration blocks.
   * Key Cummins-specific: F18C = Engine Serial Number (ESN).
   */
  private async scanCumminsEcu(result: EcuScanResult, txAddr: number): Promise<void> {
    // ── VIN (0x22 0xF190) ──
    const existingVin = result.rawResponses.find(
      r => r.service === 0x22 && r.did === UDS_DIDS.VIN && r.positive,
    );
    if (existingVin) {
      result.vin = this.extractAscii(existingVin.data);
    } else {
      const vinResp = await this.readUdsDid(result, UDS_DIDS.VIN, txAddr);
      if (vinResp?.positiveResponse && vinResp.data?.length > 0) {
        result.vin = this.extractAscii(vinResp.data);
      }
    }

    // ── ECU Software Number (0xF188) ──
    const swResp = await this.readUdsDid(result, UDS_DIDS.ECU_SW_NUMBER, txAddr);
    if (swResp?.positiveResponse && swResp.data?.length > 0) {
      result.softwareNumber = this.extractAscii(swResp.data).trim();
    }

    // ── ECU Hardware Number (0xF191) ──
    const hwResp = await this.readUdsDid(result, UDS_DIDS.ECU_HW_NUMBER, txAddr);
    if (hwResp?.positiveResponse && hwResp.data?.length > 0) {
      result.hardwareId = this.extractAscii(hwResp.data).trim();
    }

    // ── Engine Serial Number / ESN (0xF18C) — Cummins-specific ──
    const esnResp = await this.readUdsDid(result, UDS_DIDS.ECU_SERIAL, txAddr);
    if (esnResp?.positiveResponse && esnResp.data?.length > 0) {
      const esn = this.extractAscii(esnResp.data).trim();
      if (esn.length > 0) {
        result.notes.push(`Engine Serial Number (ESN): ${esn}`);
      }
    }

    // ── System Supplier Identifier (0xF18A) — should return "CUMMINS" ──
    const supplierResp = await this.readUdsDid(result, UDS_DIDS.ECU_SUPPLIER_ID, txAddr);
    if (supplierResp?.positiveResponse && supplierResp.data?.length > 0) {
      const supplier = this.extractAscii(supplierResp.data).trim();
      if (supplier.length > 0) {
        result.notes.push(`Supplier: ${supplier}`);
      }
    }

    // ── Engine Type / System Name (0xF197) ──
    const sysResp = await this.readUdsDid(result, UDS_DIDS.SYSTEM_NAME, txAddr);
    if (sysResp?.positiveResponse && sysResp.data?.length > 0) {
      const sysName = this.extractAscii(sysResp.data).trim();
      if (sysName.length > 0) {
        result.notes.push(`Engine Type: ${sysName}`);
      }
    }

    // ── ECU Software Version (0xF189) ──
    const swVerResp = await this.readUdsDid(result, UDS_DIDS.ECU_SW_VERSION, txAddr);
    if (swVerResp?.positiveResponse && swVerResp.data?.length > 0) {
      const swVer = this.extractAscii(swVerResp.data).trim();
      if (swVer.length > 0) {
        result.notes.push(`Software Version: ${swVer}`);
      }
    }

    // ── Boot Software Identification (0xF180) ──
    const bootResp = await this.readUdsDid(result, UDS_DIDS.BOOT_SW_ID, txAddr);
    if (bootResp?.positiveResponse && bootResp.data?.length > 0) {
      const bootId = this.extractAscii(bootResp.data).trim();
      if (bootId.length > 0) {
        result.notes.push(`Boot Software: ${bootId}`);
      }
    }

    // ── Application Software Identification (0xF181) — cal ID ──
    const appSwResp = await this.readUdsDid(result, UDS_DIDS.APP_SW_ID, txAddr);
    if (appSwResp?.positiveResponse && appSwResp.data?.length > 0) {
      const appSw = this.extractAscii(appSwResp.data).trim();
      if (appSw.length > 0) {
        result.calibrationPartNumbers.push(appSw);
      }
    }

    // ── Application Data Identification (0xF182) — calibration data ID ──
    const appDataResp = await this.readUdsDid(result, UDS_DIDS.APP_DATA_ID, txAddr);
    if (appDataResp?.positiveResponse && appDataResp.data?.length > 0) {
      const appData = this.extractAscii(appDataResp.data).trim();
      if (appData.length > 0) {
        result.calibrationPartNumbers.push(appData);
      }
    }

    // ── Manufacturing Date (0xF18B) ──
    const mfgResp = await this.readUdsDid(result, 0xF18B, txAddr);
    if (mfgResp?.positiveResponse && mfgResp.data?.length > 0) {
      const mfgDate = this.extractAscii(mfgResp.data).trim();
      if (mfgDate.length > 0) {
        result.notes.push(`Manufacturing Date: ${mfgDate}`);
      }
    }

    // ── Calibration ID via standard DID (0xF806) ──
    if (result.calibrationPartNumbers.length === 0) {
      const calResp = await this.readUdsDid(result, UDS_DIDS.CALIBRATION_ID, txAddr);
      if (calResp?.positiveResponse && calResp.data?.length > 0) {
        const calId = this.extractAscii(calResp.data).trim();
        if (calId.length > 0) {
          result.calibrationPartNumbers.push(calId);
        }
      }
    }

    // ── OBD Mode 9 fallback for CalIDs and CVNs ──
    if (result.calibrationPartNumbers.length === 0) {
      const calIdResp = await this.sendAndRecord(result, 0x09, undefined, [0x04], txAddr);
      if (calIdResp?.positiveResponse && calIdResp.data?.length > 0) {
        result.calibrationPartNumbers = this.parseCalibrationIds(calIdResp.data);
      }
    }

    const cvnResp = await this.sendAndRecord(result, 0x09, undefined, [0x06], txAddr);
    if (cvnResp?.positiveResponse && cvnResp.data?.length > 0) {
      result.cvns = this.parseObdCvns(cvnResp.data);
    }
  }

  // ── Generic UDS ECU Scan ────────────────────────────────────────────────────

  /**
   * Generic UDS ECU scan for unknown manufacturer.
   * Reads standard UDS DIDs and OBD Mode 9.
   */
  private async scanGenericUdsEcu(result: EcuScanResult, txAddr: number): Promise<void> {
    // ── VIN (0x22 0xF190) ──
    const existingVin = result.rawResponses.find(
      r => r.service === 0x22 && r.did === UDS_DIDS.VIN && r.positive,
    );
    if (existingVin) {
      result.vin = this.extractAscii(existingVin.data);
    } else {
      const vinResp = await this.readUdsDid(result, UDS_DIDS.VIN, txAddr);
      if (vinResp?.positiveResponse && vinResp.data?.length > 0) {
        result.vin = this.extractAscii(vinResp.data);
      }
    }

    // ── ECU Software Number (0xF188) ──
    const swResp = await this.readUdsDid(result, UDS_DIDS.ECU_SW_NUMBER, txAddr);
    if (swResp?.positiveResponse && swResp.data?.length > 0) {
      result.softwareNumber = this.extractAscii(swResp.data).trim();
    }

    // ── ECU Hardware Number (0xF191) ──
    const hwResp = await this.readUdsDid(result, UDS_DIDS.ECU_HW_NUMBER, txAddr);
    if (hwResp?.positiveResponse && hwResp.data?.length > 0) {
      result.hardwareId = this.extractAscii(hwResp.data).trim();
    }

    // ── Calibration ID (0xF806) ──
    const calResp = await this.readUdsDid(result, UDS_DIDS.CALIBRATION_ID, txAddr);
    if (calResp?.positiveResponse && calResp.data?.length > 0) {
      const calId = this.extractAscii(calResp.data).trim();
      if (calId.length > 0) {
        result.calibrationPartNumbers.push(calId);
      }
    }

    // ── OBD Mode 9 for CalIDs and CVNs ──
    const calIdResp = await this.sendAndRecord(result, 0x09, undefined, [0x04], txAddr);
    if (calIdResp?.positiveResponse && calIdResp.data?.length > 0) {
      const calIds = this.parseCalibrationIds(calIdResp.data);
      if (calIds.length > 0 && result.calibrationPartNumbers.length === 0) {
        result.calibrationPartNumbers = calIds;
      }
    }

    const cvnResp = await this.sendAndRecord(result, 0x09, undefined, [0x06], txAddr);
    if (cvnResp?.positiveResponse && cvnResp.data?.length > 0) {
      result.cvns = this.parseObdCvns(cvnResp.data);
    }
  }

  // ── Security Access ─────────────────────────────────────────────────────────

  /**
   * Attempt security access on the ECU to unlock protected DIDs.
   * 
   * Strategy:
   * 1. Look up the ECU's security profile from the database
   * 2. Try the profile's seedSubFunction first (e.g., 0x09 for E41)
   * 3. If that fails, fall back to standard level 0x01
   * 4. If seed is all zeros, ECU is already unlocked (HPTuners)
   * 5. If we have a container file with pri_key, compute the key
   * 6. Send the key and verify security access is granted
   */
  private async attemptSecurityAccess(
    result: EcuScanResult,
    txAddr: number,
  ): Promise<boolean> {
    result.securityAccessAttempted = true;

    // Find security profile for this ECU
    // Try matching by ECU config first, then by CAN address
    let profile: EcuSecurityProfileMeta | undefined;
    const ecuConfig = result.ecuConfig || this.matchEcuConfig(result);
    if (ecuConfig) {
      profile = getSecurityProfileMeta(ecuConfig.ecuType);
    }

    // Determine seed sub-functions to try
    const seedSubsToTry: number[] = [];
    if (profile?.seedSubFunction) {
      seedSubsToTry.push(profile.seedSubFunction);
    }
    // Always include standard level 0x01 as fallback
    if (!seedSubsToTry.includes(0x01)) {
      seedSubsToTry.push(0x01);
    }
    // For Cummins, also try level 0x05
    // For Cummins ECUs (DODGE OEM), also try security level 0x05
    const isCummins = profile?.manufacturer === 'Cummins' || ecuConfig?.oem === 'DODGE';
    if (isCummins && !seedSubsToTry.includes(0x05)) {
      seedSubsToTry.push(0x05);
    }

    console.log(`[ECU Scanner] Security access — trying seed levels: ${seedSubsToTry.map(s => '0x' + s.toString(16)).join(', ')}`);

    for (const seedSub of seedSubsToTry) {
      const keySub = seedSub + 1;

      console.log(`[ECU Scanner] Requesting security seed (sub=0x${seedSub.toString(16)})...`);

      // Request seed
      const seedResp = await this.sendAndRecord(result, 0x27, seedSub, [], txAddr);
      if (!seedResp) {
        console.log(`[ECU Scanner] No response to seed request (sub=0x${seedSub.toString(16)}) — trying next level...`);
        await this.delay(200);
        continue;
      }

      if (!seedResp.positiveResponse) {
        const nrc = seedResp.nrc ?? 0;
        console.log(`[ECU Scanner] Seed request NRC 0x${nrc.toString(16)} (sub=0x${seedSub.toString(16)}) — trying next level...`);
        // NRC 0x12 = subFunctionNotSupported — try next level
        // NRC 0x22 = conditionsNotCorrect — may need different session
        // NRC 0x37 = requiredTimeDelayNotExpired — wait and retry
        if (nrc === 0x37) {
          result.notes.push('Security access: time delay not expired — ECU may be in lockout');
          await this.delay(10000); // Wait 10 seconds for lockout to expire
          continue;
        }
        await this.delay(200);
        continue;
      }

      // Extract seed data
      const seedData = seedResp.data || [];
      // Strip sub-function echo byte if present
      let rawSeed = seedData;
      if (rawSeed.length > 0 && rawSeed[0] === seedSub) {
        rawSeed = rawSeed.slice(1);
      }

      if (rawSeed.length === 0) {
        console.log(`[ECU Scanner] Empty seed response — trying next level...`);
        await this.delay(200);
        continue;
      }

      // Check if seed is all zeros (already unlocked)
      const allZeros = rawSeed.every(b => b === 0);
      if (allZeros) {
        console.log(`[ECU Scanner] ECU returned zero seed — already unlocked!`);
        result.securityAccessGranted = true;
        result.notes.push('ECU returned zero seed — already unlocked (HPTuners or similar)');
        return true;
      }

      const seedHex = rawSeed.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      console.log(`[ECU Scanner] Received seed: ${seedHex} (${rawSeed.length} bytes, level 0x${seedSub.toString(16)})`);
      result.notes.push(`Seed received (level 0x${seedSub.toString(16)}): ${seedHex}`);

      // Try to compute the key
      const seedBytes = new Uint8Array(rawSeed);
      let keyBytes: Uint8Array | null = null;

      // Source 1: Container file pri_key
      const priKey = this.containerHeader?.verify?.pri_key;

      if (seedBytes.length === 5 && priKey && priKey.length >= 16) {
        // GM 5-byte AES algorithm
        try {
          const aesKeyBytes = new Uint8Array(priKey.map(h => parseInt(h, 16)));
          keyBytes = await computeGM5B(seedBytes, aesKeyBytes);
          console.log(`[ECU Scanner] Key computed (GM_5B_AES): ${Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);
        } catch (err) {
          console.warn(`[ECU Scanner] GM_5B_AES key computation failed:`, err);
        }
      } else if (seedBytes.length === 3 && priKey && priKey.length >= 5) {
        // Ford 3-byte LFSR algorithm
        try {
          const secretBytes = new Uint8Array(priKey.slice(0, 5).map(h => parseInt(h, 16)));
          keyBytes = computeFord3B(seedBytes, secretBytes);
          console.log(`[ECU Scanner] Key computed (Ford_3B): ${Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);
        } catch (err) {
          console.warn(`[ECU Scanner] Ford_3B key computation failed:`, err);
        }
      }

      // Source 2: Pre-computed seed/key from container header
      if (!keyBytes && this.containerHeader?.seed && this.containerHeader?.key) {
        const headerSeed = hexToBytes(this.containerHeader.seed);
        const headerKey = hexToBytes(this.containerHeader.key);
        if (arraysEqual(seedBytes, new Uint8Array(headerSeed))) {
          keyBytes = new Uint8Array(headerKey);
          console.log(`[ECU Scanner] Using pre-computed key from container header (seed matches)`);
        }
      }

      if (!keyBytes) {
        console.log(`[ECU Scanner] Cannot compute key — no container file or algorithm available`);
        result.notes.push('Key computation requires container file with pri_key — load a container file and re-scan');
        continue;
      }

      // Send key
      await this.delay(100);
      const keyResp = await this.sendAndRecord(result, 0x27, keySub, Array.from(keyBytes), txAddr);
      if (keyResp?.positiveResponse) {
        console.log(`[ECU Scanner] 🔓 Security access granted (level 0x${seedSub.toString(16)})`);
        result.securityAccessGranted = true;
        result.notes.push(`Security access granted (level 0x${seedSub.toString(16)})`);
        return true;
      } else {
        const nrc = keyResp?.nrc ?? 0;
        console.log(`[ECU Scanner] Key rejected: NRC 0x${nrc.toString(16)} — trying next level...`);
        result.notes.push(`Key rejected at level 0x${seedSub.toString(16)}: NRC 0x${nrc.toString(16)}`);
        await this.delay(200);
      }
    }

    return false;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Send UDS DID read (service 0x22) */
  private async readUdsDid(
    result: EcuScanResult,
    did: number,
    txAddr: number,
  ): Promise<UDSResponse | null> {
    return this.sendAndRecord(
      result, 0x22, undefined,
      [(did >> 8) & 0xFF, did & 0xFF],
      txAddr,
    );
  }

  /** Send request and record raw response */
  private async sendAndRecord(
    result: EcuScanResult,
    service: number,
    subFunction: number | undefined,
    data: number[],
    txAddr: number,
  ): Promise<UDSResponse | null> {
    try {
      const resp = await this.connection.sendUDSRequest(service, subFunction, data, txAddr);
      if (resp) {
        let did = 0;
        if (service === 0x1A && data.length >= 1) {
          did = data[0];
        } else if (service === 0x22 && data.length >= 2) {
          did = (data[0] << 8) | data[1];
        } else if (service === 0x09 && data.length >= 1) {
          did = data[0];
        }

        result.rawResponses.push({
          did,
          didHex: `0x${did.toString(16).toUpperCase().padStart(service === 0x22 ? 4 : 2, '0')}`,
          service,
          data: resp.data || [],
          dataHex: (resp.data || []).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
          positive: resp.positiveResponse,
          nrc: resp.nrc,
          nrcName: resp.nrcName,
        });
      }
      return resp;
    } catch (err) {
      console.warn(`[ECU Scanner] Request failed: svc=0x${service.toString(16)} addr=0x${txAddr.toString(16)}`, err);
      return null;
    }
  }

  // ── Protocol-specific parsers ──────────────────────────────────────────────

  /**
   * Parse OBD Mode 9 PID 0x04 response into calibration part numbers.
   * Format: [count] [16-byte ASCII part number] [16-byte] ... repeated
   */
  private parseCalibrationIds(data: number[]): string[] {
    const partNumbers: string[] = [];
    if (data.length === 0) return partNumbers;

    let offset = 0;
    const firstByte = data[0];

    // If first byte looks like a count (1-20), skip it
    if (firstByte >= 1 && firstByte <= 20 && data.length > 16) {
      offset = 1;
    }

    // Parse 16-byte blocks
    while (offset + 16 <= data.length) {
      const block = data.slice(offset, offset + 16);
      const ascii = block
        .filter(b => b >= 0x20 && b <= 0x7E)
        .map(b => String.fromCharCode(b))
        .join('')
        .trim();
      if (ascii.length > 0) {
        partNumbers.push(ascii);
      }
      offset += 16;
    }

    // If no 16-byte blocks found, try to parse the whole thing as ASCII
    if (partNumbers.length === 0 && data.length > 0) {
      const ascii = this.extractAscii(data).trim();
      if (ascii.length > 0) {
        partNumbers.push(ascii);
      }
    }

    return partNumbers;
  }

  /**
   * Parse OBD Mode 9 PID 0x06 response into CVN entries.
   * Format: [count] [4-byte CVN] [4-byte CVN] ... repeated
   */
  private parseObdCvns(data: number[]): CvnEntry[] {
    const cvns: CvnEntry[] = [];
    if (data.length === 0) return cvns;

    let offset = 0;
    const firstByte = data[0];

    // If first byte looks like a count, skip it
    if (firstByte >= 1 && firstByte <= 20 && data.length > 4) {
      offset = 1;
    }

    let index = 1;
    while (offset + 4 <= data.length) {
      const cvnBytes = data.slice(offset, offset + 4);
      const hex = cvnBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      const value = cvnBytes.reduce((acc, b) => (acc << 8) | b, 0);
      cvns.push({ index, did: 0x06, hex, value });
      index++;
      offset += 4;
    }

    return cvns;
  }

  /** Extract printable ASCII from a byte array. */
  private extractAscii(data: number[]): string {
    return data
      .filter(b => b >= 0x20 && b <= 0x7E)
      .map(b => String.fromCharCode(b))
      .join('');
  }

  /** Match scan results against the ECU database to identify the specific ECU type. */
  private matchEcuConfig(result: EcuScanResult): EcuConfig | undefined {
    const candidates = Object.values(ECU_DATABASE).filter(ecu => {
      if (ecu.txAddr !== result.txAddr) return false;
      if (result.detectedProtocol !== 'unknown' && ecu.protocol !== result.detectedProtocol) return false;
      return true;
    });

    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];

    // Try to narrow down by hardware ID or software number
    if (result.hardwareId) {
      const hwMatch = candidates.find(ecu =>
        result.hardwareId!.toLowerCase().includes(ecu.ecuType.toLowerCase()),
      );
      if (hwMatch) return hwMatch;
    }

    if (result.softwareNumber) {
      const swMatch = candidates.find(ecu =>
        result.softwareNumber!.toLowerCase().includes(ecu.ecuType.toLowerCase()),
      );
      if (swMatch) return swMatch;
    }

    // Return first candidate as best guess
    return candidates[0];
  }

  /** Simple delay helper */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ── Utility Functions ────────────────────────────────────────────────────────

function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/\s+/g, '').replace(/^0x/i, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.substring(i, i + 2), 16));
  }
  return bytes;
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ── Container Comparison ─────────────────────────────────────────────────────

/**
 * Compare scanned ECU calibration data against a loaded container file.
 * Container slots `sw_c1`..`sw_c9` on `ContainerFileHeader` must be set — historically manual;
 * FlashContainerPanel now maps DevProg/PPEI header data + Tune Deploy analyze into these fields.
 */
export function compareWithContainer(
  scanResult: EcuScanResult,
  container: ContainerFileHeader,
): ContainerComparison {
  // Extract container part numbers from sw_c1-sw_c9
  const containerParts: string[] = [];
  for (let i = 1; i <= 9; i++) {
    const key = `sw_c${i}` as keyof ContainerFileHeader;
    const val = container[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      containerParts.push(val.trim());
    }
  }

  const ecuParts = scanResult.calibrationPartNumbers;

  // Build per-slot comparison
  const maxSlots = Math.max(containerParts.length, ecuParts.length);
  const slots: ContainerComparison['slots'] = [];

  for (let i = 0; i < maxSlots; i++) {
    const containerPart = containerParts[i] || '';
    const ecuPart = ecuParts[i] || '';
    const match = containerPart.length > 0 && ecuPart.length > 0 && containerPart === ecuPart;
    const changed = containerPart.length > 0 && ecuPart.length > 0 && containerPart !== ecuPart;
    slots.push({
      index: i + 1,
      containerPart,
      ecuPart,
      match,
      changed,
    });
  }

  const changedCount = slots.filter(s => s.changed).length;
  const allMatch = changedCount === 0 && containerParts.length > 0 && ecuParts.length > 0;

  return {
    containerPartNumbers: containerParts,
    ecuPartNumbers: ecuParts,
    slots,
    allMatch,
    changedCount,
  };
}
