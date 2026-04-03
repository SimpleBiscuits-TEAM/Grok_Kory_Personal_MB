/**
 * ECU Scanner — Pre-Flash Vehicle Interrogation
 * ===============================================
 * 
 * Polls all known ECU CAN addresses, reads identifying DIDs,
 * and returns a comprehensive report of what's on the bus.
 * 
 * Supports:
 * - GM GMLAN: ReadDID 0x1A, OBD Mode 9 CalIDs, CVNs 0xC1-0xCC
 * - Ford/Cummins UDS: ReadDID 0x22, standard UDS DIDs
 * - Auto-detection of ECU type from response data
 * - Comparison against loaded container file
 */

import { PCANConnection, type UDSResponse } from './pcanConnection';
import {
  ECU_DATABASE,
  type EcuConfig,
  type Protocol,
  type Manufacturer,
  type ContainerFileHeader,
} from '../../../shared/ecuDatabase';
import {
  getSecurityProfile,
  type EcuSecurityProfile,
} from '../../../shared/seedKeyAlgorithms';

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

// ── GMLAN DID Definitions ────────────────────────────────────────────────────

/** GMLAN ReadDataByIdentifier (service 0x1A) DIDs */
const GMLAN_DIDS = {
  VIN: 0x90,
  ECU_ID: 0xB0,
  PROGRAMMING_STATUS: 0xA0,
  // Calibration Software Part Numbers (via OBD Mode 9 PID 0x04)
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

/** UDS ReadDataByIdentifier (service 0x22) DIDs */
const UDS_DIDS = {
  VIN: 0xF190,
  ECU_SW_NUMBER: 0xF188,
  ECU_HW_NUMBER: 0xF191,
  ECU_HW_VERSION: 0xF193,
  ECU_SUPPLIER_ID: 0xF18A,
  CALIBRATION_ID: 0xF806,
  ACTIVE_SESSION: 0xF186,
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

  constructor(connection: PCANConnection) {
    this.connection = connection;
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
      // Most common VIN
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

  /**
   * Abort an in-progress scan.
   */
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
      // Try GMLAN ReadDID as fallback probe
      const gmlanProbe = await this.sendAndRecord(result, 0x1A, undefined, [0x90], txAddr);
      if (!gmlanProbe) {
        result.status = 'timeout';
        result.scanDurationMs = Date.now() - startMs;
        console.log(`[ECU Scanner] ${label}: No response — ECU not present or not powered`);
        return result;
      }
    }

    result.responding = true;

    // Step 2: Detect protocol — try GMLAN ReadDID first (0x1A 0x90)
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
        await this.scanUdsEcu(result, txAddr);
      } else {
        // ECU responds but doesn't support standard ReadDID
        result.detectedProtocol = 'unknown';
        // Still try to extract VIN from whatever we got
        if (gmlanVinResp && gmlanVinResp.data?.length > 0) {
          result.vin = this.extractAscii(gmlanVinResp.data);
        }
      }
    }

    // Step 3: Match against ECU database
    result.ecuConfig = this.matchEcuConfig(result);

    // Step 4: If we got NRC 0x33 (securityAccessDenied) on any DID,
    // attempt security access and retry those DIDs.
    const hasSecurityDenied = result.rawResponses.some(r => r.nrc === 0x33);
    if (hasSecurityDenied && result.ecuConfig) {
      console.log(`[ECU Scanner] Security access denied on some DIDs — attempting security access...`);
      const granted = await this.attemptSecurityAccess(result, txAddr);
      if (granted) {
        // Retry the scan with security access granted
        console.log(`[ECU Scanner] Security access granted — retrying protected DIDs...`);
        if (result.detectedProtocol === 'GMLAN') {
          await this.scanGmlanEcu(result, txAddr);
        } else {
          await this.scanUdsEcu(result, txAddr);
        }
      }
    }

    // Step 5: Add notes about ECU state
    if (result.responding && result.calibrationPartNumbers.length === 0 && result.cvns.length === 0) {
      result.notes.push('ECU responded but no calibration data read — may need security access or different session');
    }
    if (result.securityAccessAttempted && !result.securityAccessGranted) {
      result.notes.push('Security access attempted but denied — ECU may require hardware unlock box or specific key');
    }

    result.status = 'complete';
    result.scanDurationMs = Date.now() - startMs;
    console.log(`[ECU Scanner] ${label}: ${result.responding ? 'FOUND' : 'N/A'} — ${result.detectedProtocol} — ${result.ecuConfig?.name || 'unknown ECU'} — ${result.scanDurationMs}ms`);

    return result;
  }

  /**
   * Full GMLAN ECU scan — reads all GM-specific DIDs.
   */
  private async scanGmlanEcu(result: EcuScanResult, txAddr: number): Promise<void> {
    // ── VIN (0x1A 0x90) ──
    // May have already been read during protocol detection, check rawResponses
    const existingVin = result.rawResponses.find(r => r.service === 0x1A && r.did === 0x90 && r.positive);
    if (existingVin) {
      result.vin = this.extractAscii(existingVin.data);
    } else {
      const vinResp = await this.sendAndRecord(result, 0x1A, undefined, [GMLAN_DIDS.VIN], txAddr);
      if (vinResp?.positiveResponse && vinResp.data?.length > 0) {
        // GMLAN response: 0x5A 0x90 [VIN bytes] — data already has DID echo stripped by parseISOTP
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
    // Send on functional address 0x7DF for OBD, or physical for direct
    // OBD Mode 9: service=0x09, PID=0x04 (CalibrationID)
    const calIdResp = await this.sendAndRecord(result, 0x09, undefined, [0x04], txAddr);
    if (calIdResp?.positiveResponse && calIdResp.data?.length > 0) {
      result.calibrationPartNumbers = this.parseCalibrationIds(calIdResp.data);
    }

    // If OBD Mode 9 didn't work, try reading CalIDs from the container-defined DIDs
    if (result.calibrationPartNumbers.length === 0) {
      // Try GMLAN ReadDID 0xCB (software part number) — sometimes has the cal ID
      const swResp = await this.sendAndRecord(result, 0x1A, undefined, [0xCB], txAddr);
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

  /**
   * Full UDS ECU scan — reads standard UDS DIDs.
   * Used for Ford, Cummins, and other UDS-based ECUs.
   */
  private async scanUdsEcu(result: EcuScanResult, txAddr: number): Promise<void> {
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

    // ── ECU Software Number (0x22 0xF188) ──
    const swResp = await this.readUdsDid(result, UDS_DIDS.ECU_SW_NUMBER, txAddr);
    if (swResp?.positiveResponse && swResp.data?.length > 0) {
      result.softwareNumber = this.extractAscii(swResp.data).trim();
    }

    // ── ECU Hardware Number (0x22 0xF191) ──
    const hwResp = await this.readUdsDid(result, UDS_DIDS.ECU_HW_NUMBER, txAddr);
    if (hwResp?.positiveResponse && hwResp.data?.length > 0) {
      result.hardwareId = this.extractAscii(hwResp.data).trim();
    }

    // ── Calibration ID (0x22 0xF806) — Ford/Cummins specific ──
    const calResp = await this.readUdsDid(result, UDS_DIDS.CALIBRATION_ID, txAddr);
    if (calResp?.positiveResponse && calResp.data?.length > 0) {
      const calId = this.extractAscii(calResp.data).trim();
      if (calId.length > 0) {
        result.calibrationPartNumbers.push(calId);
      }
    }

    // ── Try OBD Mode 9 for CalIDs and CVNs ──
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

  // ── Helper: Send UDS DID read (service 0x22) ──

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

  // ── Helper: Send request and record raw response ──

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
        // Determine DID from data bytes
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
   * Each part number is 16 bytes, null-padded.
   */
  private parseCalibrationIds(data: number[]): string[] {
    const partNumbers: string[] = [];
    if (data.length === 0) return partNumbers;

    // First byte might be count of CalIDs (number of 16-byte entries)
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

  /**
   * Extract printable ASCII from a byte array.
   */
  private extractAscii(data: number[]): string {
    return data
      .filter(b => b >= 0x20 && b <= 0x7E)
      .map(b => String.fromCharCode(b))
      .join('');
  }

  /**
   * Match scan results against the ECU database to identify the specific ECU type.
   */
  private matchEcuConfig(result: EcuScanResult): EcuConfig | undefined {
    const candidates = Object.values(ECU_DATABASE).filter(ecu => {
      // Must match CAN address
      if (ecu.txAddr !== result.txAddr) return false;
      // Must match protocol
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

  /**
   * Attempt security access on the ECU to unlock protected DIDs.
   * Uses the security profile from the database to determine seed/key sub-functions.
   * Note: For ECUs requiring hardware unlock box (e.g., E41), this will only work
   * if the ECU has been previously unlocked (e.g., by HPTuners).
   */
  private async attemptSecurityAccess(
    result: EcuScanResult,
    txAddr: number,
  ): Promise<boolean> {
    result.securityAccessAttempted = true;

    // Find security profile for this ECU
    const ecuType = result.ecuConfig?.ecuType;
    const profile = ecuType ? getSecurityProfile(ecuType) : undefined;

    // Default sub-functions if no profile found
    const seedSub = profile?.seedSubFunction ?? 0x01;
    const keySub = profile?.keySubFunction ?? 0x02;

    console.log(`[ECU Scanner] Requesting security seed (sub=0x${seedSub.toString(16)})...`);

    // Step 1: Enter diagnostic session (GMLAN: 0x10 0x02, UDS: 0x10 0x03)
    if (result.detectedProtocol === 'GMLAN') {
      await this.sendAndRecord(result, 0x10, 0x02, [], txAddr);
    } else {
      await this.sendAndRecord(result, 0x10, 0x03, [], txAddr);
    }
    await new Promise(r => setTimeout(r, 200));

    // Step 2: Request seed
    const seedResp = await this.sendAndRecord(result, 0x27, seedSub, [], txAddr);
    if (!seedResp?.positiveResponse || !seedResp.data || seedResp.data.length === 0) {
      console.log(`[ECU Scanner] Security seed request failed`);
      result.notes.push(`Security seed request failed (sub=0x${seedSub.toString(16)})`);
      return false;
    }

    // Check if seed is all zeros (already unlocked)
    const seedData = seedResp.data.slice(1); // skip sub-function echo
    const allZeros = seedData.every(b => b === 0);
    if (allZeros) {
      console.log(`[ECU Scanner] ECU returned zero seed — already unlocked!`);
      result.securityAccessGranted = true;
      result.notes.push('ECU returned zero seed — already unlocked (HPTuners or similar)');
      return true;
    }

    // We have a non-zero seed but computing the key requires the AES key
    // from the container file, which we may not have during a scan.
    // For now, log the seed and note that key computation is needed.
    const seedHex = seedData.map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`[ECU Scanner] Received seed: ${seedHex} — key computation not available during scan`);
    result.notes.push(`Seed received: ${seedHex} — key computation requires container file or hardware unlock box`);

    // If we have a container with pri_key, we could try computing the key here
    // but that's complex and better left to the flash engine.
    // For scan purposes, we note the seed was received.

    return false;
  }
}

// ── Container Comparison ─────────────────────────────────────────────────────

/**
 * Compare scanned ECU calibration data against a loaded container file.
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
