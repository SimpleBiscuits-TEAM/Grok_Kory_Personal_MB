/**
 * Local WebSocket ↔ python-can bridge — same UDS / ISO-TP behaviour as
 * {@link VopCan2UsbConnection} via {@link createVopStyleUdsLayer}.
 *
 * The bridge pushes **every** RX as `can_frame` (see `rx_stream` in pcan_bridge.py) before
 * the request/ack path — same single-stream idea as the V-OP serial adapter. ISO-TP uses
 * only the UDS listener (no separate `can_recv` path in TS).
 */

import type { ConnectionState } from './obdConnection';
import {
  PCANConnection,
  defaultBridgeWebSocketCandidates,
  parseWsCanArbId,
  normalizeBridgeCanDataBytes,
  type UDSResponse,
} from './pcanConnection';
import { CAN_BRIDGE_DEFAULT_REQUEST_TIMEOUT_MS } from './canTransportTiming';
import type { FlashBridgeConnection } from './flashBridgeConnection';
import { createVopStyleUdsLayer, type VopStyleUdsLayer } from './vopStyleUdsCore';

interface BridgeMessage {
  type: string;
  id?: string;
  [key: string]: unknown;
}

export interface WebsocketCanBridgeConfig {
  bridgeUrl?: string;
  bridgeUrlSecure?: string;
  bridgeUrlInsecure?: string;
  reconnectAttempts?: number;
  requestTimeout?: number;
}

export class WebsocketCanBridgeConnection implements FlashBridgeConnection {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private bridgeUrlSecure: string;
  private bridgeUrlInsecure: string;
  private userSpecifiedBridgeUrl: string | null;
  private reconnectAttempts: number;
  private requestTimeout: number;
  private requestId = 0;
  private pendingRequests = new Map<
    string,
    {
      resolve: (data: BridgeMessage) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  private vopFlashUdsListener: ((arbId: number, data: Uint8Array) => void) | null = null;
  private vopUdsInFlightReject: ((err: Error) => void) | null = null;

  private readonly udsLayer: VopStyleUdsLayer;

  constructor(config: WebsocketCanBridgeConfig = {}) {
    this.bridgeUrlSecure = config.bridgeUrlSecure ?? 'wss://127.0.0.1:8766';
    this.bridgeUrlInsecure = config.bridgeUrlInsecure ?? 'ws://127.0.0.1:8765';
    this.userSpecifiedBridgeUrl = config.bridgeUrl ?? null;
    this.reconnectAttempts = config.reconnectAttempts ?? 3;
    this.requestTimeout = config.requestTimeout ?? CAN_BRIDGE_DEFAULT_REQUEST_TIMEOUT_MS;

    this.udsLayer = createVopStyleUdsLayer({
      sendCanTx: (a, e, d, w) => this.sendCanTx(a, e, d, w),
      setFlashUdsListener: cb => {
        this.vopFlashUdsListener = cb;
      },
      setUdsInFlightReject: r => {
        this.vopUdsInFlightReject = r;
      },
      isTransportReady: () => this.ws !== null && this.ws.readyState === WebSocket.OPEN,
      transportNotReadyMessage: 'WebSocket CAN bridge not connected',
    });
  }

  getState(): ConnectionState {
    return this.state;
  }

  private setState(s: ConnectionState): void {
    this.state = s;
  }

  /** Probe the local python-can WebSocket bridge (shared probe implementation). */
  static isBridgeAvailable = PCANConnection.isBridgeAvailable;

  async connect(options?: { skipVehicleInit?: boolean }): Promise<boolean> {
    void options;
    try {
      await this.disconnect();
      this.setState('connecting');
      const candidates = defaultBridgeWebSocketCandidates(this.bridgeUrlSecure, this.bridgeUrlInsecure);
      const urlsToTry = this.userSpecifiedBridgeUrl
        ? [...new Set([this.userSpecifiedBridgeUrl, ...candidates])]
        : candidates;
      let connected = false;

      for (const url of urlsToTry) {
        for (let attempt = 1; attempt <= this.reconnectAttempts; attempt++) {
          try {
            await this.openWebSocket(url);
            connected = true;
            break;
          } catch {
            if (attempt < this.reconnectAttempts) {
              await new Promise(r => setTimeout(r, 500));
            }
          }
        }
        if (connected) break;
      }

      if (!connected) {
        this.setState('disconnected');
        return false;
      }

      this.setState('ready');
      return true;
    } catch {
      this.setState('error');
      return false;
    }
  }

  private openWebSocket(bridgeUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.ws) {
          try {
            this.ws.close();
          } catch {
            /* ignore */
          }
          this.ws = null;
        }

        this.ws = new WebSocket(bridgeUrl);

        const timer = setTimeout(() => {
          this.ws?.close();
          reject(new Error('WebSocket connection timeout'));
        }, 5000);

        this.ws.onmessage = (event: MessageEvent) => {
          try {
            const msg: BridgeMessage = JSON.parse(event.data as string);

            if (msg.type === 'connected') {
              clearTimeout(timer);
              resolve();
              return;
            }

            const t = msg.type;
            if (t === 'can_frame' || t === 'bus_frame') {
              const arbId = parseWsCanArbId(
                (msg as Record<string, unknown>).arb_id ?? (msg as Record<string, unknown>).arbitration_id,
              );
              const bytes = normalizeBridgeCanDataBytes((msg as Record<string, unknown>).data);
              const u8 = new Uint8Array(bytes);
              if (this.vopFlashUdsListener) {
                this.vopFlashUdsListener(arbId, u8);
              }
            }

            if (msg.id && this.pendingRequests.has(msg.id)) {
              const pending = this.pendingRequests.get(msg.id)!;
              clearTimeout(pending.timer);
              this.pendingRequests.delete(msg.id);
              if (msg.type === 'error') {
                pending.reject(new Error(String((msg as Record<string, unknown>).message ?? 'Bridge error')));
              } else {
                pending.resolve(msg);
              }
            }
          } catch {
            /* ignore */
          }
        };

        this.ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error('WebSocket error'));
        };

        this.ws.onclose = () => {
          if (this.state === 'ready') {
            this.setState('error');
          }
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  private nextRequestId(): string {
    return `req_${++this.requestId}`;
  }

  private sendRequest(msg: BridgeMessage, timeoutOverrideMs?: number): Promise<BridgeMessage> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const id = msg.id || this.nextRequestId();
      msg.id = id;

      const deadlineMs = timeoutOverrideMs ?? this.requestTimeout;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${msg.type}`));
      }, deadlineMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify(msg));
    });
  }

  private async sendCanTx(
    canId: number,
    ext: boolean,
    data: Uint8Array,
    waitAck: boolean,
  ): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    const payload = [...data.subarray(0, 8)];
    while (payload.length < 8) payload.push(0);
    if (!waitAck) {
      this.ws.send(
        JSON.stringify({
          type: 'can_send',
          id: `tx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          arb_id: canId,
          data: payload,
          extended: ext,
        }),
      );
      return true;
    }
    try {
      const br = await this.sendRequest({
        type: 'can_send',
        id: this.nextRequestId(),
        arb_id: canId,
        data: payload,
        extended: ext,
      });
      if (br.type === 'error') return false;
      // Modern bridge: tx_ack after TX; legacy: embedded can_frame. RX also arrives via rx_stream push.
      return br.type === 'tx_ack' || br.type === 'can_frame' || br.type === 'bus_frame' || (br as { ok?: boolean }).ok === true;
    } catch {
      return false;
    }
  }

  async sendUDSRequest(
    service: number,
    subFunction?: number,
    data?: number[],
    targetAddress?: number,
    timeoutMs?: number,
    responseArbIdOverride?: number,
  ): Promise<UDSResponse | null> {
    return this.udsLayer.sendUDSRequest(
      service,
      subFunction,
      data,
      targetAddress,
      timeoutMs,
      responseArbIdOverride,
    );
  }

  async setUDSSession(sessionType: 'default' | 'programming' | 'extended'): Promise<boolean> {
    const sessionMap = { default: 0x01, programming: 0x02, extended: 0x03 };
    try {
      const response = await this.sendUDSRequest(0x10, sessionMap[sessionType]);
      return response?.positiveResponse || false;
    } catch {
      return false;
    }
  }

  async sendRawCanFrame(arbId: number, data: number[]): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    const frame = [...data];
    while (frame.length < 8) frame.push(0);
    this.ws.send(
      JSON.stringify({
        type: 'can_send',
        id: `raw_${Date.now()}`,
        arb_id: arbId,
        data: frame.slice(0, 8),
      }),
    );
  }

  isFlashTransportOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  async reconnectForFlash(): Promise<boolean> {
    if (this.isFlashTransportOpen()) return true;
    const expanded = defaultBridgeWebSocketCandidates(this.bridgeUrlSecure, this.bridgeUrlInsecure);
    const urlsToTry = this.userSpecifiedBridgeUrl
      ? [...new Set([this.userSpecifiedBridgeUrl, ...expanded])]
      : expanded;

    for (const url of urlsToTry) {
      try {
        await this.openWebSocket(url);
        this.setState('ready');
        return true;
      } catch {
        /* try next */
      }
    }
    this.setState('error');
    return false;
  }

  cancelInFlightDiagnostics(): void {
    this.udsLayer.cancelInFlightDiagnostics();
    for (const [, pending] of Array.from(this.pendingRequests.entries())) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Aborted'));
    }
    this.pendingRequests.clear();
  }

  async disconnect(): Promise<void> {
    this.cancelInFlightDiagnostics();
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'disconnect', id: this.nextRequestId() }));
        }
      } catch {
        /* ignore */
      }
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.setState('disconnected');
  }
}
