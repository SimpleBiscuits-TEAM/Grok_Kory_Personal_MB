/**
 * Shared ISO-TP / bridge timing for PCAN (WebSocket) and V-OP USB CAN bridges.
 * Live OBD/UDS polling: a responsive ECU typically answers in well under 200ms.
 */

/** Mode 01/09-style single-frame OBD requests during live logging */
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
