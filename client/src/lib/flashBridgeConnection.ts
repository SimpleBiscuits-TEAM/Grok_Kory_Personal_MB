import type { UDSResponse } from './pcanConnection';

/** Minimal surface for real-hardware flash (PCAN WebSocket or V-OP USB serial). */
export interface FlashBridgeConnection {
  connect(options?: { skipVehicleInit?: boolean }): Promise<boolean>;
  reconnectForFlash(): Promise<boolean>;
  isFlashTransportOpen(): boolean;
  sendUDSRequest(
    service: number,
    subFunction?: number,
    data?: number[],
    targetAddress?: number,
    timeoutMs?: number,
  ): Promise<UDSResponse | null>;
  setUDSSession(sessionType: 'default' | 'programming' | 'extended'): Promise<boolean>;
  sendRawCanFrame(arbId: number, data: number[]): Promise<void>;
  /** Drop in-flight UDS wait state immediately (emergency user abort). */
  cancelInFlightDiagnostics?: () => void;
}
