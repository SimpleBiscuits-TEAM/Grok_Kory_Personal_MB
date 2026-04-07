/**
 * UDS Transport Layer — Raw UDS operations over PCAN WebSocket Bridge
 *
 * Provides typed, promise-based UDS service calls:
 *  - DiagnosticSessionControl ($10)
 *  - SecurityAccess ($27)
 *  - ReadDataByIdentifier ($22)
 *  - WriteDataByIdentifier ($2E)
 *  - RoutineControl ($31)
 *  - ECUReset ($11)
 *  - TesterPresent ($3E)
 *
 * Uses the existing PCAN bridge's `can_send` message type for raw CAN frames.
 * Handles ISO-TP single-frame and multi-frame responses.
 *
 * This is the foundation for the CAN-am VIN changer, DESS key learn,
 * and any future UDS-based tool.
 */

import { NRC_CODES } from './udsReference';

// ─── Types ──────────────────────────────────────────────────────────────────

export type UDSSessionType = 'default' | 'extended' | 'programming';

export interface UDSResponse {
  success: boolean;
  serviceId: number;
  subFunction?: number;
  data: number[];
  rawFrame?: number[];
  nrc?: number;
  nrcName?: string;
  nrcDescription?: string;
}

export interface UDSTransportConfig {
  requestId: number;     // CAN arbitration ID for requests (e.g., 0x7E0)
  responseId: number;    // Expected response CAN ID (e.g., 0x7E8)
  isExtendedId: boolean; // 29-bit extended CAN IDs
  timeout: number;       // Response timeout in ms
}

type BridgeMessage = {
  type: string;
  id?: string;
  [key: string]: unknown;
};

type EventCallback = (event: { type: string; data?: unknown; message?: string }) => void;

// ─── UDS Transport Class ────────────────────────────────────────────────────

export class UDSTransport {
  private ws: WebSocket | null = null;
  private config: UDSTransportConfig;
  private requestId = 0;
  private pendingRequests: Map<string, {
    resolve: (data: BridgeMessage) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();
  private listeners: EventCallback[] = [];
  private testerPresentInterval: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  /** When false, fall back to raw `can_send` (single-frame RX only — no ISO-TP reassembly). */
  private preferNativeIsoTp = true;
  private nativeIsoTpRejected = false;

  constructor(config: Partial<UDSTransportConfig> = {}) {
    this.config = {
      requestId: config.requestId ?? 0x7E0,
      responseId: config.responseId ?? 0x7E8,
      isExtendedId: config.isExtendedId ?? false,
      timeout: config.timeout ?? 5000,
    };
  }

  // ─── Event System ─────────────────────────────────────────────────────────

  onLog(callback: EventCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private log(message: string, data?: unknown): void {
    this.listeners.forEach(l => l({ type: 'log', data, message }));
  }

  // ─── Connection ───────────────────────────────────────────────────────────

  async connect(bridgeUrl?: string): Promise<boolean> {
    const urlsToTry = bridgeUrl
      ? [bridgeUrl]
      : ['wss://localhost:8766', 'ws://localhost:8765'];

    for (const url of urlsToTry) {
      try {
        this.log(`Connecting to PCAN bridge at ${url}...`);
        await this.openWebSocket(url);
        this.connected = true;
        this.log(`Connected to PCAN bridge via ${url}`);
        return true;
      } catch (e) {
        this.log(`Failed to connect to ${url}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    this.log('Could not connect to PCAN bridge. Make sure pcan_bridge.py is running.');
    return false;
  }

  private openWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);
        const timer = setTimeout(() => {
          this.ws?.close();
          reject(new Error('Connection timeout'));
        }, 5000);

        this.ws.onopen = () => {
          // Wait for 'connected' message
        };

        this.ws.onmessage = (event) => {
          try {
            const msg: BridgeMessage = JSON.parse(event.data);

            if (msg.type === 'connected') {
              clearTimeout(timer);
              resolve();
              return;
            }

            // Route responses to pending requests
            if (msg.id && this.pendingRequests.has(msg.id)) {
              const pending = this.pendingRequests.get(msg.id)!;
              clearTimeout(pending.timer);
              this.pendingRequests.delete(msg.id);
              if (msg.type === 'error') {
                pending.reject(new Error(msg.message as string || 'Unknown error'));
              } else {
                pending.resolve(msg);
              }
            }
          } catch {
            // ignore parse errors
          }
        };

        this.ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error('WebSocket error'));
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.stopTesterPresent();
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  disconnect(): void {
    this.stopTesterPresent();
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  // ─── Raw CAN Frame Send ───────────────────────────────────────────────────

  private nextId(): string {
    return `uds_${++this.requestId}`;
  }

  private sendRaw(arbId: number, data: number[]): Promise<BridgeMessage> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to PCAN bridge'));
        return;
      }

      const id = this.nextId();
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('UDS response timeout'));
      }, this.config.timeout);

      this.pendingRequests.set(id, { resolve, reject, timer });

      this.ws.send(JSON.stringify({
        type: 'can_send',
        id,
        arb_id: arbId,
        data,
      }));
    });
  }

  /**
   * Send `uds_request` so the PCAN bridge performs full ISO-TP (multi-frame, flow control, NRC 0x78).
   * The reference bridge expects `sub`, not `sub_function`.
   */
  private async sendUdsRequestNative(
    serviceId: number,
    sub: number | undefined,
    data: number[],
  ): Promise<BridgeMessage> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to PCAN bridge'));
        return;
      }

      const id = this.nextId();
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('UDS response timeout'));
      }, this.config.timeout);

      this.pendingRequests.set(id, { resolve, reject, timer });

      const msg: Record<string, unknown> = {
        type: 'uds_request',
        id,
        service: serviceId,
        data,
        target: this.config.requestId,
      };
      if (sub !== undefined) msg.sub = sub;
      this.ws.send(JSON.stringify(msg));
    });
  }

  private mapNativeUdsResponse(msg: BridgeMessage, expectedServiceId: number): UDSResponse {
    if (msg.type === 'error') {
      return {
        success: false,
        serviceId: expectedServiceId,
        data: [],
        nrc: 0x10,
        nrcName: 'bridgeError',
        nrcDescription: (msg.message as string) || 'Bridge error',
      };
    }

    if (msg.type !== 'uds_response') {
      return {
        success: false,
        serviceId: expectedServiceId,
        data: [],
        nrcDescription: `Unexpected bridge response: ${String(msg.type)}`,
      };
    }

    const positive = msg.positive !== false;
    const raw = (msg.data as number[]) || [];
    const nrcVal = msg.nrc as number | undefined;

    if (!positive || nrcVal != null) {
      const nrc = nrcVal ?? 0x10;
      const nrcInfo = NRC_CODES[nrc] || { name: 'unknown', description: `Unknown NRC: 0x${nrc.toString(16)}` };
      const rejected = raw.length > 1 ? raw[1] : expectedServiceId;
      return {
        success: false,
        serviceId: rejected,
        data: raw,
        nrc,
        nrcName: (msg.nrc_name as string) || nrcInfo.name,
        nrcDescription: nrcInfo.description,
      };
    }

    const syntheticPayload = [expectedServiceId + 0x40, ...raw];
    return {
      success: true,
      serviceId: expectedServiceId,
      subFunction: syntheticPayload[1],
      data: syntheticPayload.slice(1),
      rawFrame: undefined,
    };
  }

  /**
   * Try native ISO-TP UDS on the bridge; fall back to raw `can_send` if unsupported or failed once.
   */
  private async exchangeUds(
    expectedServiceId: number,
    serviceId: number,
    sub: number | undefined,
    payload: number[],
  ): Promise<UDSResponse> {
    if (this.preferNativeIsoTp && !this.nativeIsoTpRejected) {
      try {
        const msg = await this.sendUdsRequestNative(serviceId, sub, payload);
        if (msg.type === 'error') {
          const m = String((msg as BridgeMessage).message || '');
          if (/unknown|not supported|uds_request/i.test(m)) {
            this.nativeIsoTpRejected = true;
          } else {
            return this.mapNativeUdsResponse(msg, expectedServiceId);
          }
        } else {
          return this.mapNativeUdsResponse(msg, expectedServiceId);
        }
      } catch (e) {
        this.log(`Native UDS exchange failed: ${e instanceof Error ? e.message : String(e)}`);
        this.nativeIsoTpRejected = true;
      }
    }

    const frame = sub !== undefined
      ? this.buildSingleFrame(serviceId, sub, ...payload)
      : this.buildSingleFrame(serviceId, ...payload);
    const response = await this.sendRaw(this.config.requestId, frame);
    return this.parseResponse(response, expectedServiceId);
  }

  // ─── UDS Frame Builder ────────────────────────────────────────────────────

  private buildSingleFrame(serviceId: number, ...payload: number[]): number[] {
    const length = 1 + payload.length;
    const frame = [length, serviceId, ...payload];
    // Pad to 8 bytes
    while (frame.length < 8) frame.push(0x00);
    return frame;
  }

  private parseResponse(msg: BridgeMessage, expectedServiceId: number): UDSResponse {
    const rawData = (msg.data as number[]) || (msg as any).data || [];
    // The bridge returns the full CAN frame data
    const frameData = Array.isArray(rawData) ? rawData : [];

    if (frameData.length === 0) {
      return {
        success: false,
        serviceId: expectedServiceId,
        data: [],
        nrc: 0x10,
        nrcName: 'noData',
        nrcDescription: 'No data in response frame',
      };
    }

    // Parse ISO-TP PCI
    const pciType = (frameData[0] >> 4) & 0x0F;
    let payload: number[];

    if (pciType === 0) {
      // Single frame
      const length = frameData[0] & 0x0F;
      payload = frameData.slice(1, 1 + length);
    } else {
      // Multi-frame or other — just use raw data
      payload = frameData.slice(1);
    }

    if (payload.length === 0) {
      return { success: false, serviceId: expectedServiceId, data: [], rawFrame: frameData };
    }

    const responseServiceId = payload[0];

    // Negative response
    if (responseServiceId === 0x7F) {
      const rejectedService = payload[1];
      const nrc = payload[2];
      const nrcInfo = NRC_CODES[nrc] || { name: 'unknown', description: `Unknown NRC: 0x${nrc.toString(16)}` };
      return {
        success: false,
        serviceId: rejectedService,
        data: payload,
        rawFrame: frameData,
        nrc,
        nrcName: nrcInfo.name,
        nrcDescription: nrcInfo.description,
      };
    }

    // Positive response (service ID + 0x40)
    if (responseServiceId === expectedServiceId + 0x40) {
      return {
        success: true,
        serviceId: expectedServiceId,
        subFunction: payload[1],
        data: payload.slice(1), // Everything after the response service ID
        rawFrame: frameData,
      };
    }

    // Unexpected response
    return {
      success: false,
      serviceId: expectedServiceId,
      data: payload,
      rawFrame: frameData,
    };
  }

  // ─── UDS Services ─────────────────────────────────────────────────────────

  /**
   * $10 — DiagnosticSessionControl
   * Switch to default (01), extended (03), or programming (02) session.
   */
  async diagnosticSessionControl(session: UDSSessionType): Promise<UDSResponse> {
    const subFn = session === 'default' ? 0x01 : session === 'programming' ? 0x02 : 0x03;
    this.log(`$10 DiagnosticSessionControl → ${session} (sub=${subFn.toString(16)})`);
    return this.exchangeUds(0x10, 0x10, subFn, []);
  }

  /**
   * $27 — SecurityAccess: Request Seed
   * Returns the seed bytes from the ECU for the given level.
   */
  async securityAccessRequestSeed(level: number): Promise<UDSResponse> {
    this.log(`$27 SecurityAccess RequestSeed (sub=0x${level.toString(16)})`);
    return this.exchangeUds(0x27, 0x27, level, []);
  }

  /**
   * $27 — SecurityAccess: Send Key
   * Send the computed key back to the ECU.
   */
  /**
   * @param seedRequestSub — Sub-function used for RequestSeed (e.g. 0x01 for level 1). SendKey uses seedRequestSub + 1.
   */
  async securityAccessSendKey(seedRequestSub: number, key: number[]): Promise<UDSResponse> {
    const sendKeySub = seedRequestSub + 1;
    this.log(`$27 SecurityAccess SendKey (sub=0x${sendKeySub.toString(16)}, ${key.length} key bytes)`);
    return this.exchangeUds(0x27, 0x27, sendKeySub, key);
  }

  /**
   * $22 — ReadDataByIdentifier
   * Read a DID value from the ECU.
   */
  async readDataByIdentifier(did: number): Promise<UDSResponse> {
    const didHi = (did >> 8) & 0xFF;
    const didLo = did & 0xFF;
    this.log(`$22 ReadDataByIdentifier (DID=0x${did.toString(16).toUpperCase().padStart(4, '0')})`);
    return this.exchangeUds(0x22, 0x22, undefined, [didHi, didLo]);
  }

  /**
   * $2E — WriteDataByIdentifier
   * Write data to a DID (requires security access).
   */
  async writeDataByIdentifier(did: number, data: number[]): Promise<UDSResponse> {
    const didHi = (did >> 8) & 0xFF;
    const didLo = did & 0xFF;
    this.log(`$2E WriteDataByIdentifier (DID=0x${did.toString(16).toUpperCase().padStart(4, '0')}, ${data.length} bytes)`);

    if (this.preferNativeIsoTp && !this.nativeIsoTpRejected) {
      return this.exchangeUds(0x2E, 0x2E, undefined, [didHi, didLo, ...data]);
    }

    // For short writes (fits in single frame: 8 - 1(PCI) - 1(SID) - 2(DID) = 4 bytes max)
    if (data.length <= 4) {
      const frame = this.buildSingleFrame(0x2E, didHi, didLo, ...data);
      const response = await this.sendRaw(this.config.requestId, frame);
      return this.parseResponse(response, 0x2E);
    }

    // Multi-frame write (ISO-TP first frame + consecutive frames)
    // Total payload: SID(1) + DID(2) + data
    const totalPayload = [0x2E, didHi, didLo, ...data];
    const totalLength = totalPayload.length;

    // First frame: PCI(2) + first 6 bytes of payload
    const firstFrame = [
      0x10 | ((totalLength >> 8) & 0x0F),
      totalLength & 0xFF,
      ...totalPayload.slice(0, 6),
    ];
    while (firstFrame.length < 8) firstFrame.push(0x00);

    // Send first frame
    await this.sendRaw(this.config.requestId, firstFrame);

    // Wait a bit for flow control (the bridge handles this automatically)
    await new Promise(r => setTimeout(r, 50));

    // Send consecutive frames
    let offset = 6;
    let seqNum = 1;
    while (offset < totalPayload.length) {
      const chunk = totalPayload.slice(offset, offset + 7);
      const cf = [0x20 | (seqNum & 0x0F), ...chunk];
      while (cf.length < 8) cf.push(0x00);

      // For the last consecutive frame, wait for the response
      if (offset + 7 >= totalPayload.length) {
        const response = await this.sendRaw(this.config.requestId, cf);
        return this.parseResponse(response, 0x2E);
      }

      // Intermediate frames: just send, don't wait for response
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'can_send',
          id: this.nextId(),
          arb_id: this.config.requestId,
          data: cf,
        }));
      }

      offset += 7;
      seqNum++;
      await new Promise(r => setTimeout(r, 10)); // Inter-frame delay
    }

    return { success: false, serviceId: 0x2E, data: [], nrcDescription: 'Multi-frame write failed' };
  }

  /**
   * $31 — RoutineControl
   * Start (01), stop (02), or get results (03) of a routine.
   */
  async routineControl(subFunction: 0x01 | 0x02 | 0x03, routineId: number, params: number[] = []): Promise<UDSResponse> {
    const routineHi = (routineId >> 8) & 0xFF;
    const routineLo = routineId & 0xFF;
    const subNames = { 0x01: 'Start', 0x02: 'Stop', 0x03: 'GetResult' };
    this.log(`$31 RoutineControl ${subNames[subFunction]} (routine=0x${routineId.toString(16).padStart(4, '0')})`);
    return this.exchangeUds(0x31, 0x31, subFunction, [routineHi, routineLo, ...params]);
  }

  /**
   * $11 — ECUReset
   * Reset the ECU (01=hard, 02=key-off-on, 03=soft).
   */
  async ecuReset(resetType: 0x01 | 0x02 | 0x03 = 0x01): Promise<UDSResponse> {
    const names = { 0x01: 'Hard Reset', 0x02: 'Key Off/On', 0x03: 'Soft Reset' };
    this.log(`$11 ECUReset → ${names[resetType]}`);
    return this.exchangeUds(0x11, 0x11, resetType, []);
  }

  /**
   * $3E — TesterPresent (single shot)
   * Keeps the diagnostic session alive.
   */
  async testerPresent(): Promise<UDSResponse> {
    try {
      return await this.exchangeUds(0x3E, 0x3E, 0x00, []);
    } catch {
      return { success: false, serviceId: 0x3E, data: [] };
    }
  }

  /**
   * Start periodic TesterPresent to keep session alive.
   * Sends $3E 00 every 2 seconds.
   */
  startTesterPresent(intervalMs: number = 2000): void {
    this.stopTesterPresent();
    this.testerPresentInterval = setInterval(() => {
      if (this.isConnected()) {
        this.testerPresent().catch(() => {});
      }
    }, intervalMs);
    this.log('TesterPresent heartbeat started');
  }

  stopTesterPresent(): void {
    if (this.testerPresentInterval) {
      clearInterval(this.testerPresentInterval);
      this.testerPresentInterval = null;
      this.log('TesterPresent heartbeat stopped');
    }
  }

  /**
   * $14 — ClearDiagnosticInformation
   * Clear all DTCs.
   */
  async clearDTCs(): Promise<UDSResponse> {
    this.log('$14 ClearDiagnosticInformation (all DTCs)');
    return this.exchangeUds(0x14, 0x14, undefined, [0xFF, 0xFF, 0xFF]);
  }

  /**
   * $2F — IOControlByIdentifier
   * Control ECU outputs.
   */
  async ioControl(did: number, controlOption: number, controlData: number[] = []): Promise<UDSResponse> {
    const didHi = (did >> 8) & 0xFF;
    const didLo = did & 0xFF;
    this.log(`$2F IOControl (DID=0x${did.toString(16).padStart(4, '0')}, option=${controlOption})`);
    return this.exchangeUds(0x2F, 0x2F, undefined, [didHi, didLo, controlOption, ...controlData]);
  }

  // ─── High-Level Helpers ───────────────────────────────────────────────────

  /**
   * Read the VIN from the ECU via DID F190.
   */
  async readVIN(): Promise<string | null> {
    const response = await this.readDataByIdentifier(0xF190);
    if (response.success && response.data.length >= 19) {
      // data[0] = DID_HI, data[1] = DID_LO, data[2..18] = VIN ASCII
      const vinBytes = response.data.slice(2, 19);
      return String.fromCharCode(...vinBytes.filter(b => b >= 0x20 && b <= 0x7E));
    }
    return null;
  }

  /**
   * Read ECU software number via DID F188.
   */
  async readECUSoftwareNumber(): Promise<string | null> {
    const response = await this.readDataByIdentifier(0xF188);
    if (response.success && response.data.length > 2) {
      const bytes = response.data.slice(2);
      return String.fromCharCode(...bytes.filter(b => b >= 0x20 && b <= 0x7E));
    }
    return null;
  }

  /**
   * Read active diagnostic session via DID F186.
   */
  async readActiveSession(): Promise<number | null> {
    const response = await this.readDataByIdentifier(0xF186);
    if (response.success && response.data.length > 2) {
      return response.data[2];
    }
    return null;
  }

  // ─── Configuration ────────────────────────────────────────────────────────

  setTargetECU(requestId: number, responseId: number, isExtended: boolean = false): void {
    this.config.requestId = requestId;
    this.config.responseId = responseId;
    this.config.isExtendedId = isExtended;
    this.log(`Target ECU: TX=0x${requestId.toString(16)} RX=0x${responseId.toString(16)} ${isExtended ? '(29-bit)' : '(11-bit)'}`);
  }

  setTimeout(timeoutMs: number): void {
    this.config.timeout = timeoutMs;
  }
}
