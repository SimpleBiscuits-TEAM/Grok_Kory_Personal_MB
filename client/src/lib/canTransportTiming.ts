/**
 * Shared OBD/datalogger timing: **ELM327 (WebSerial)**, **PCAN (WebSocket)**, **V-OP USB** — eine Quelle.
 * Live OBD/UDS: typisch unter 200 ms Antwort; Konstanten in `obdConnection`, `pcanConnection`, `vopCan2UsbConnection` importieren.
 *
 * -----------------------------------------------------------------------------
 * Kurzüberblick Transports (Datalogger-relevant)
 * -----------------------------------------------------------------------------
 *
 * | Aspekt | V-OP (`isoTpRequest`) | PCAN (`sendUDSviaRawCAN`) | ELM327 (`OBDConnection.sendCommand`) |
 * |--------|------------------------|---------------------------|--------------------------------------|
 * | Vorbedingung vor TX | `drain` + **CAN_UDS_PRE_TX_SETTLE_MS** | RX-Listener + gleiche **CAN_UDS_PRE_TX_SETTLE_MS** | optional gleiche Pause (z. B. DID-Scan) |
 * | Live Mode 01 / 0x22 | **CAN_LIVE_OBD_MODE01** / **CAN_LIVE_UDS_DID** | identisch | identisch (`readPid`) |
 * | Connect VIN / Bitmasken | **CAN_DATALOGGER_VIN_** / **BITMASK_** | identisch | identisch (`0902`, `0100`/`0120`/`0140`/`0160`) |
 * | Logging-Intervall | `startLogging(..., 0)` | identisch | identisch |
 * | ISO-TP RX-Floor (MF) | **CAN_ISO_TP_RX_WAIT_FLOOR_MS** | identisch | — |
 *
 * **CAN_UDS_PRE_TX_SETTLE_MS** ist typischerweise **0**; Erhöhung gilt für **alle** Transports gleichermaßen.
 *
 * Regel (Projekt): Änderungen an Timing oder Datalogger-OBD-Protokoll **immer** für ELM, PCAN und V-OP
 * umsetzen — siehe `.cursor/rules/datalogger-transport-parity.mdc`.
 */

/** Mode 01/09-style single-frame OBD requests during live logging (max wait, kein künstliches Minimum) */
export const CAN_LIVE_OBD_MODE01_TIMEOUT_MS = 175;

/** UDS ReadDataByIdentifier (0x22) — live extended PIDs */
export const CAN_LIVE_UDS_DID_TIMEOUT_MS = 200;

/**
 * Default ISO-TP budget for DTCs and generic `isoTpRequest` calls without an explicit timeout.
 */
export const CAN_ISO_TP_DEFAULT_TIMEOUT_MS = 2000;

/** Connect-Scan: Mode 09 PID 02 (VIN, oft Multi-Frame) — gleich PCAN + V-OP */
export const CAN_DATALOGGER_VIN_TIMEOUT_MS = 8000;

/** Connect-Scan: Mode 01 Bitmasken 0x00/0x20/0x40/0x60 — gleich PCAN + V-OP + ELM (`0100`/`0120`/…) */
export const CAN_DATALOGGER_BITMASK_TIMEOUT_MS = 2000;

/**
 * ELM327/STN `sendCommand` Timeout für Mehrfach-Mode-01 in einem String (z. B. `010C0D05…`).
 * Gleiches Budget wie einzelne ISO-TP-Non-hot-path-Anfragen.
 */
export const CAN_ELM_MODE01_BATCH_COMMAND_TIMEOUT_MS = CAN_ISO_TP_DEFAULT_TIMEOUT_MS;

/**
 * Untergrenze für „noch X ms bis Deadline“-Warten auf ein ISO-TP-RX-Fragment (V-OP `waitRxMatch`, PCAN MF-RX).
 */
export const CAN_ISO_TP_RX_WAIT_FLOOR_MS = 5;

/** Schrittweite beim Pollen auf passendes RX (nur V-OP `waitRxMatch`) */
export const CAN_ISO_TP_RX_POLL_MS = 1;

/** PCAN WebSocket `sendRequest` when no per-call override (connect / init / monitor) */
export const CAN_BRIDGE_DEFAULT_REQUEST_TIMEOUT_MS = 2500;

/** USB bridge ACK wait after CAN TX (device should ACK immediately on success) */
export const CAN_USB_BRIDGE_ACK_TIMEOUT_MS = 800;

/**
 * Pause after arming the ISO-TP RX listener and before CAN TX. **0** for datalogging: send the next
 * request as soon as the previous response is handled (no artificial gap between PIDs or loops).
 */
export const CAN_UDS_PRE_TX_SETTLE_MS = 0;

/**
 * After successful UDS diagnostic session change on GM ECM — short bus settle before 0x22 reads.
 */
export const CAN_UDS_POST_SESSION_SETTLE_MS = 40;

/**
 * After opening the V-OP USB serial bridge — device/parser ready before first frame.
 * (PCAN hat kein USB-Open; gleicher Wert dient nur als Referenz, falls später ergänzt.)
 */
export const CAN_USB_SERIAL_BRIDGE_SETTLE_MS = 50;
