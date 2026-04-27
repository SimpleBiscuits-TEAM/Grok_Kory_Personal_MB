/**
 * Bundled Python PCAN WebSocket bridge: `client/public/pcan_bridge.py`
 * (served from the app root in dev/prod — same asset as Datalogger → PCAN-USB download).
 */
export const PCAN_BRIDGE_PY_DOWNLOAD_HREF = `${import.meta.env.BASE_URL}pcan_bridge.py`;

export const PCAN_BRIDGE_PY_DOWNLOAD_FILENAME = 'pcan_bridge.py';

export const PCAN_BRIDGE_PY_DOWNLOAD_TITLE =
  'PCAN WebSocket bridge bundled with this app (ISO-TP, ECU scan, flash — matches the running web build)';
