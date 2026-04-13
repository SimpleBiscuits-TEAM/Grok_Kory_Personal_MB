/**
 * Datalogger — Fahrzeug-Scan beim CONNECT (V-OP Referenzprozess)
 * ==============================================================
 * Transport (PCAN WebSocket-Bridge vs. V-OP USB) ist egal: dieselbe **logische**
 * ISO-15765-4 / ISO-TP Sequenz auf **physikalisch** 0x7E0 → 0x7E8.
 *
 * Reihenfolge (identisch zum V-OP-`initialize` in `vopCan2UsbConnection.ts`):
 *
 * 1. **VIN:** SAE J1979 Mode 09 PID 02 — PDU `[0x09, 0x02]` (ISO-TP Single- oder Multi-Frame).
 * 2. **PID-Bitmasken:** Mode 01 mit PID 0x00, 0x20, 0x40, 0x60 — je `[0x01, pid]`.
 *
 * **Nicht** Teil dieses Scans (historisch PCAN-Fehler / abweichende Traces vermieden):
 * - Kein `obd_request` über die Python-OBD-Schicht (kein Mischprotokoll mit 0x7DF).
 * - Kein UDS `0x3E 0x00` (TesterPresent) auf 0x7E0 vor den Bitmasken (GM liefert oft NRC 0x12).
 * - Kein `0x10 0x03` / Extended Session **vor** dem Mode-01-Bitmask-Scan — Session nur bei Bedarf für Mode 22.
 * - Kein „ELM-Katalog-Probe“-Sweep über dutzende Mode-01-PIDs während CONNECT.
 */

/** ISO-TP Mode 09 VIN (meist Multi-Frame) */
export const DATALOGGER_CONNECT_VIN_TIMEOUT_MS = 10_000;

/** Mode 01 Bitmask / später Live-Mode 01 */
export const DATALOGGER_CONNECT_MODE01_TIMEOUT_MS = 2_500;

/** GM / ISO-15765 OBD-II physikalische Tester-Adresse */
export const DATALOGGER_OBD_PHYSICAL_TX = 0x7e0;

/** SAE J1979: supported PIDs Bitmask-Abfragen (Reihenfolge wie V-OP) */
export const DATALOGGER_STANDARD_BITMASK_PIDS: readonly number[] = [0x00, 0x20, 0x40, 0x60];

/**
 * ISO-TP Flow Control (CTS), 8 Byte gepaddet — wie V-OP-Trace: `30 00 08` (FS=0, BS=0, STmin=8 ms).
 * Wird gesendet, wenn die ECU ein First Frame schickt und der Tester FC zurückgeben muss.
 */
export const ISO_TP_FLOW_CONTROL_CTS_PADDED: readonly number[] = [
  0x30, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00,
];
