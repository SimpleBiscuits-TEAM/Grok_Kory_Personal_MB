/**
 * Shared ISO-TP / UDS request path used by {@link VopCan2UsbConnection} and
 * {@link WebsocketCanBridgeConnection}. Behaviour matches the V-OP USB bridge
 * implementation (single RX listener + {@link sendCanTx} with ACK).
 */

import {
  type UDSResponse,
  parseIsoTpDataToUdsResponse,
  parseUdsDiagnosticPayload,
} from './pcanConnection';
import { CAN_UDS_PRE_TX_SETTLE_MS } from './canTransportTiming';
import { ISO_TP_FLOW_CONTROL_CTS_PADDED } from './dataloggerVehicleScanProtocol';

export interface VopStyleUdsDeps {
  sendCanTx(canId: number, ext: boolean, data: Uint8Array, waitAck: boolean): Promise<boolean>;
  setFlashUdsListener(cb: ((arbId: number, data: Uint8Array) => void) | null): void;
  setUdsInFlightReject(reject: ((err: Error) => void) | null): void;
  isTransportReady(): boolean;
  /** V-OP: resolve all pending USB ACK waiters as false (abort). */
  abortAckWaiters?(): void;
  transportNotReadyMessage: string;
}

export interface VopStyleUdsLayer {
  sendUDSRequest(
    service: number,
    subFunction?: number,
    data?: number[],
    targetAddress?: number,
    timeoutMs?: number,
    responseArbIdOverride?: number,
  ): Promise<UDSResponse | null>;
  cancelInFlightDiagnostics(): void;
}

export function createVopStyleUdsLayer(deps: VopStyleUdsDeps): VopStyleUdsLayer {
  let udsInFlightReject: ((err: Error) => void) | null = null;

  const setFlashUdsListener = (cb: ((arbId: number, data: Uint8Array) => void) | null) => {
    deps.setFlashUdsListener(cb);
  };

  const setUdsInFlightReject = (r: ((err: Error) => void) | null) => {
    udsInFlightReject = r;
    deps.setUdsInFlightReject(r);
  };

  async function receiveIsoTpMultiFrameFromEcu(
    fcTxAddress: number,
    rxArbId: number,
    firstFrame: number[],
    timeoutMs: number,
  ): Promise<number[] | null> {
    const totalLen = ((firstFrame[0] & 0x0f) << 8) | firstFrame[1];
    if (totalLen < 1 || totalLen > 4095) return null;

    const out: number[] = [];
    for (let i = 2; i < 8 && out.length < totalLen; i++) {
      out.push(firstFrame[i] ?? 0);
    }
    if (out.length >= totalLen) {
      return out.slice(0, totalLen);
    }

    const deadline = Date.now() + timeoutMs;
    let expectedSeq = 1;
    let flowControlSent = false;
    const fc = Uint8Array.from(ISO_TP_FLOW_CONTROL_CTS_PADDED);

    while (out.length < totalLen) {
      if (Date.now() > deadline) return null;

      let cf: number[] | null = null;

      // V-OP USB and WebSocket bridge (rx_stream): all consecutive frames arrive on the same listener.
      cf = await new Promise<number[] | null>((resolve) => {
        const t = setTimeout(() => {
          setFlashUdsListener(null);
          resolve(null);
        }, Math.max(30, deadline - Date.now()));

        setFlashUdsListener((arbId, dataU8) => {
          if (arbId !== rxArbId) return;
          const fd = [...dataU8];
          if (fd.length === 0) return;
          const pci = (fd[0] >> 4) & 0x0f;
          if (pci !== 2) return;
          const seq = fd[0] & 0x0f;
          if (seq !== expectedSeq) return;
          clearTimeout(t);
          setFlashUdsListener(null);
          resolve(fd);
        });

        void (async () => {
          if (!flowControlSent) {
            flowControlSent = true;
            const ok = await deps.sendCanTx(fcTxAddress, false, fc, true);
            if (!ok) {
              clearTimeout(t);
              setFlashUdsListener(null);
              resolve(null);
            }
          }
        })();
      });

      if (!cf) return null;
      for (let j = 1; j < 8 && out.length < totalLen; j++) {
        out.push(cf[j] ?? 0);
      }
      expectedSeq = (expectedSeq + 1) & 0x0f;
    }

    return out.slice(0, totalLen);
  }

  async function sendUdsSingleFrame(
    service: number,
    subFunction: number | undefined,
    udsPayload: number[],
    targetAddress: number,
    timeoutMs: number,
    responseArbIdOverride?: number,
  ): Promise<UDSResponse | null> {
    const isFunctional = targetAddress === 0x7df;
    const responseArbId =
      responseArbIdOverride !== undefined
        ? responseArbIdOverride
        : isFunctional
          ? -1
          : targetAddress + 0x08;

    const pciLength = udsPayload.length;
    const frame: number[] = [pciLength, ...udsPayload];
    while (frame.length < 8) frame.push(0x00);

    setFlashUdsListener(null);
    await new Promise(r => setTimeout(r, CAN_UDS_PRE_TX_SETTLE_MS));

    const responsePromise = new Promise<UDSResponse | null>((resolve, reject) => {
      setUdsInFlightReject(reject);
      const timeout = setTimeout(() => {
        setUdsInFlightReject(null);
        setFlashUdsListener(null);
        resolve(null);
      }, timeoutMs);

      setFlashUdsListener((arbId, dataU8) => {
        const frameData = [...dataU8];
        if (frameData.length === 0) return;

        const isMatch = isFunctional
          ? arbId >= 0x7e8 && arbId <= 0x7ef
          : arbId === responseArbId;

        if (!isMatch) return;

        const pciType = (frameData[0] >> 4) & 0x0f;

        if (pciType === 1) {
          const rxCf = isFunctional ? arbId : responseArbId;
          const fcDest = isFunctional ? arbId - 0x08 : targetAddress;
          clearTimeout(timeout);
          setFlashUdsListener(null);
          void (async () => {
            const assembled = await receiveIsoTpMultiFrameFromEcu(
              fcDest,
              rxCf,
              frameData,
              timeoutMs,
            );
            setUdsInFlightReject(null);
            if (!assembled || assembled.length === 0) {
              resolve(null);
              return;
            }
            resolve(parseUdsDiagnosticPayload(service, subFunction, assembled));
          })();
          return;
        }

        if (pciType !== 0) return;

        const respSvcId = frameData.length > 1 ? frameData[1] : 0;
        const expectedPositive = service + 0x40;
        const isNegative = respSvcId === 0x7f;
        const isPositiveMatch = respSvcId === expectedPositive;
        const isNegativeForUs = isNegative && frameData.length > 2 && frameData[2] === service;
        const isNegativeUnknown = isNegative && frameData.length <= 2;

        if (isPositiveMatch) {
          clearTimeout(timeout);
          setFlashUdsListener(null);
          setUdsInFlightReject(null);
          resolve(parseIsoTpDataToUdsResponse(service, subFunction, frameData));
        } else if (isNegativeForUs || isNegativeUnknown) {
          const nrc = frameData.length > 3 ? frameData[3] : 0;
          if (nrc === 0x78) return;
          clearTimeout(timeout);
          setFlashUdsListener(null);
          setUdsInFlightReject(null);
          resolve(parseIsoTpDataToUdsResponse(service, subFunction, frameData));
        }
      });
    });

    const u8 = new Uint8Array(frame.slice(0, 8));
    const ok = await deps.sendCanTx(targetAddress, false, u8, true);
    if (!ok) {
      setFlashUdsListener(null);
      throw new Error('CAN TX rejected by bridge');
    }

    const udsResult = await responsePromise;
    if (!udsResult) {
      throw new Error('Timeout waiting for CAN response');
    }
    return udsResult;
  }

  async function sendUdsMultiFrame(
    service: number,
    subFunction: number | undefined,
    udsPayload: number[],
    targetAddress: number,
    timeoutMs: number,
    responseArbIdOverride?: number,
  ): Promise<UDSResponse | null> {
    if (!deps.isTransportReady()) throw new Error(deps.transportNotReadyMessage);

    const totalLength = udsPayload.length;
    const responseArbId =
      responseArbIdOverride !== undefined ? responseArbIdOverride : targetAddress + 0x08;

    setFlashUdsListener(null);
    await new Promise(r => setTimeout(r, CAN_UDS_PRE_TX_SETTLE_MS));

    const firstFrame: number[] = [
      0x10 | ((totalLength >> 8) & 0x0f),
      totalLength & 0xff,
      ...udsPayload.slice(0, 6),
    ];
    while (firstFrame.length < 8) firstFrame.push(0x00);

    const fcPromise = new Promise<{ blockSize: number; stMin: number } | null>((resolve) => {
      const fcTimeout = setTimeout(() => {
        setFlashUdsListener(null);
        resolve(null);
      }, 5000);

      setFlashUdsListener((arbId, dataU8) => {
        if (arbId !== responseArbId) return;
        const frameData = [...dataU8];
        if (frameData.length === 0) return;
        const pciType = (frameData[0] >> 4) & 0x0f;
        if (pciType === 3) {
          const blockSize = frameData[1] || 0;
          const stMin = frameData[2] || 0;
          clearTimeout(fcTimeout);
          setFlashUdsListener(null);
          resolve({ blockSize, stMin });
        } else if (pciType === 0) {
          const respSvc = frameData[1];
          if (respSvc === 0x7f) {
            clearTimeout(fcTimeout);
            setFlashUdsListener(null);
            resolve(null);
          }
        }
      });
    });

    const ffOk = await deps.sendCanTx(targetAddress, false, new Uint8Array(firstFrame.slice(0, 8)), true);
    if (!ffOk) {
      setFlashUdsListener(null);
      throw new Error('CAN TX rejected by bridge');
    }

    const fc = await fcPromise;
    if (!fc) {
      throw new Error('No Flow Control received from ECU after First Frame');
    }

    let stMinMs = 0;
    if (fc.stMin <= 0x7f) {
      stMinMs = fc.stMin;
    } else if (fc.stMin >= 0xf1 && fc.stMin <= 0xf9) {
      stMinMs = 1;
    }
    stMinMs = Math.max(stMinMs, 1);

    let offset = 6;
    let seqNum = 1;
    let framesSentSinceFC = 0;

    while (offset < udsPayload.length) {
      if (fc.blockSize > 0 && framesSentSinceFC >= fc.blockSize) {
        const nextFcPromise = new Promise<boolean>((resolve) => {
          const fcTimeout = setTimeout(() => {
            setFlashUdsListener(null);
            resolve(false);
          }, 5000);

          setFlashUdsListener((arbId, dataU8) => {
            if (arbId !== responseArbId) return;
            const frameData = [...dataU8];
            if (frameData.length > 0 && ((frameData[0] >> 4) & 0x0f) === 3) {
              clearTimeout(fcTimeout);
              setFlashUdsListener(null);
              resolve(true);
            }
          });
        });
        const gotFC = await nextFcPromise;
        if (!gotFC) throw new Error('Flow Control timeout during consecutive frames');
        framesSentSinceFC = 0;
      }

      const chunk = udsPayload.slice(offset, offset + 7);
      const cf: number[] = [0x20 | (seqNum & 0x0f), ...chunk];
      while (cf.length < 8) cf.push(0x00);

      const cfOk = await deps.sendCanTx(targetAddress, false, new Uint8Array(cf.slice(0, 8)), true);
      if (!cfOk) throw new Error('CAN TX rejected by bridge');

      offset += 7;
      seqNum++;
      framesSentSinceFC++;

      if (stMinMs > 0 && offset < udsPayload.length) {
        await new Promise(r => setTimeout(r, stMinMs));
      }
    }

    const mfTimeout = Math.min(Math.max(timeoutMs * 6, 30_000), 120_000);
    const responsePromise = new Promise<UDSResponse | null>((resolve, reject) => {
      setUdsInFlightReject(reject);
      const respTimeout = setTimeout(() => {
        setUdsInFlightReject(null);
        setFlashUdsListener(null);
        resolve(null);
      }, mfTimeout);

      setFlashUdsListener((arbId, dataU8) => {
        if (arbId !== responseArbId) return;
        const frameData = [...dataU8];
        if (frameData.length === 0) return;
        const pciType = (frameData[0] >> 4) & 0x0f;

        if (pciType === 1) {
          clearTimeout(respTimeout);
          setFlashUdsListener(null);
          void (async () => {
            const assembled = await receiveIsoTpMultiFrameFromEcu(
              targetAddress,
              responseArbId,
              frameData,
              mfTimeout,
            );
            setUdsInFlightReject(null);
            if (!assembled || assembled.length === 0) {
              resolve(null);
              return;
            }
            resolve(parseUdsDiagnosticPayload(service, subFunction, assembled));
          })();
          return;
        }

        if (pciType === 0) {
          const respSvc = frameData.length > 1 ? frameData[1] : 0;
          const expectedPositive = service + 0x40;
          const isNegativeForUs = respSvc === 0x7f && frameData.length > 2 && frameData[2] === service;
          const isPositiveMatch = respSvc === expectedPositive;

          if (isPositiveMatch) {
            clearTimeout(respTimeout);
            setFlashUdsListener(null);
            setUdsInFlightReject(null);
            resolve(parseIsoTpDataToUdsResponse(service, subFunction, frameData));
          } else if (isNegativeForUs) {
            const nrc = frameData.length > 3 ? frameData[3] : 0;
            if (nrc === 0x78) return;
            clearTimeout(respTimeout);
            setFlashUdsListener(null);
            setUdsInFlightReject(null);
            resolve(parseIsoTpDataToUdsResponse(service, subFunction, frameData));
          }
        }
      });
    });

    const udsResult = await responsePromise;
    if (!udsResult) {
      throw new Error('Timeout waiting for CAN response after multi-frame send');
    }
    return udsResult;
  }

  return {
    async sendUDSRequest(
      service: number,
      subFunction?: number,
      data?: number[],
      targetAddress = 0x7e0,
      timeoutMs = 5000,
      responseArbIdOverride?: number,
    ): Promise<UDSResponse | null> {
      if (!deps.isTransportReady()) throw new Error(deps.transportNotReadyMessage);
      const udsPayload: number[] = [service];
      if (subFunction !== undefined) udsPayload.push(subFunction);
      if (data) udsPayload.push(...data);
      if (udsPayload.length > 7) {
        return sendUdsMultiFrame(
          service,
          subFunction,
          udsPayload,
          targetAddress,
          timeoutMs,
          responseArbIdOverride,
        );
      }
      return sendUdsSingleFrame(
        service,
        subFunction,
        udsPayload,
        targetAddress,
        timeoutMs,
        responseArbIdOverride,
      );
    },

    cancelInFlightDiagnostics(): void {
      deps.setFlashUdsListener(null);
      deps.abortAckWaiters?.();
      if (udsInFlightReject) {
        const r = udsInFlightReject;
        udsInFlightReject = null;
        deps.setUdsInFlightReject(null);
        r(new Error('Aborted'));
      }
    },
  };
}
