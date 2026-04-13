/**
 * Shared ISO-TP / bridge timing for PCAN (WebSocket) and V-OP USB CAN bridges.
 * Live OBD/UDS polling: a responsive ECU typically answers in well under 200ms.
 *
 * -----------------------------------------------------------------------------
 * Gegenüberstellung V-OP vs PCAN (relevant fürs Datalogger-Tempo)
 * -----------------------------------------------------------------------------
 *
 * | Aspekt | V-OP Datalogger (`isoTpRequest` → `readIsoTpResponse`) | PCAN (`sendUDSviaRawCAN` / WebSocket) |
 * |--------|--------------------------------------------------------|----------------------------------------|
 * | Vorbedingung vor TX | `drainObdRxFrames()` — kein festes Delay | RX-Listener löschen + **CAN_UDS_PRE_TX_SETTLE_MS** (stale RX) |
 * | Pro Request (Hot Path) | Nur Bus + USB-ACK (~ms bis **CAN_USB_BRIDGE_ACK_TIMEOUT_MS**) | JSON round-trip **+** gleiche Settle-Zeit **+** `timeout` als Obergrenze |
 * | Live-Timeouts (Mode 01) | `CAN_LIVE_OBD_MODE01_TIMEOUT_MS` | identisch |
 * | Live-Timeouts (0x22) | `CAN_LIVE_UDS_DID_TIMEOUT_MS` | identisch |
 * | Connect-Scan VIN | `CAN_ISO_TP_DEFAULT_TIMEOUT_MS` (V-OP) | `DATALOGGER_CONNECT_VIN_TIMEOUT_MS` (10s) |
 * | Connect-Scan Bitmasken | `CAN_ISO_TP_DEFAULT_TIMEOUT_MS` | `DATALOGGER_CONNECT_MODE01_TIMEOUT_MS` |
 * | Logging-Intervall | `startLogging(..., intervalMs = 200)` | gleich (`intervalMs - elapsed` nach jeder Runde) |
 *
 * PCAN wirkt langsamer, weil pro PID **WebSocket-Latenz** und **Pre-TX-Settle** addieren; V-OP hat direkten
 * USB-Pfad und **kein** 150ms-Settle in `isoTpRequest`. `vopStyleUdsCore` (Flash/`sendUDSRequest` auf V-OP)
 * nutzte dieselbe Settle-Zeit wie PCAN — jetzt gemeinsam **CAN_UDS_PRE_TX_SETTLE_MS**.
 */

/** Mode 01/09-style single-frame OBD requests during live logging (max wait, kein künstliches Minimum) */
export const CAN_LIVE_OBD_MODE01_TIMEOUT_MS = 175;

/** UDS ReadDataByIdentifier (0x22) — live extended PIDs */
export const CAN_LIVE_UDS_DID_TIMEOUT_MS = 200;

/**
 * Default ISO-TP budget for VIN, bitmask PID scan, DTCs, and other non-hot-path requests
 * (still bounded so stuck buses fail fast).
 */
export const CAN_ISO_TP_DEFAULT_TIMEOUT_MS = 2000;

/** PCAN WebSocket `sendRequest` when no per-call override (connect / init / monitor) */
export const CAN_BRIDGE_DEFAULT_REQUEST_TIMEOUT_MS = 2500;

/** USB bridge ACK wait after CAN TX (device should ACK immediately on success) */
export const CAN_USB_BRIDGE_ACK_TIMEOUT_MS = 800;

/**
 * Pause after arming the ISO-TP RX listener and before CAN TX — drains stale frames on the
 * WebSocket/USB side. Historically 150ms (very conservative); hot path (live logging / UDS).
 */
export const CAN_UDS_PRE_TX_SETTLE_MS = 30;

/**
 * After successful UDS diagnostic session change on GM ECM — short bus settle before 0x22 reads.
 */
export const CAN_UDS_POST_SESSION_SETTLE_MS = 40;

/**
 * After opening the V-OP USB serial bridge — device/parser ready before first frame.
 */
export const CAN_USB_SERIAL_BRIDGE_SETTLE_MS = 75;
