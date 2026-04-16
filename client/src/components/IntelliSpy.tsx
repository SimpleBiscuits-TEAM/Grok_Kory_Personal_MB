/**
 * IntelliSpy — AI-Powered CAN Bus Sniffer
 * =========================================
 * Real-time CAN bus monitoring with intelligent frame decoding.
 * Unlike traditional sniffers (Vehicle Spy, SavvyCAN, PCAN-View),
 * IntelliSpy cross-references live frames against known module databases,
 * DBC signal definitions, and A2L calibration data to decode and explain
 * what's happening on the bus in real-time.
 *
 * Features:
 *   - Real-time CAN frame capture via PCAN bridge (start_monitor/stop_monitor)
 *   - Automatic module identification (maps arb IDs to ECU names)
 *   - Frame rate statistics per arbitration ID
 *   - Hex + ASCII data display with byte-level change highlighting
 *   - Arbitration ID filtering (include/exclude)
 *   - Frame freeze/pause for analysis
 *   - Export captured frames to CSV
 *   - AI-powered frame analysis (ask Knox about unknown frames)
 *   - Protocol selector (OBD-II, J1939, UDS, CAN FD, Raw)
 *   - Live flash parameter decoding (UDS 0x34/0x36/0x2E operations)
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Radio, Square, Pause, Play, Trash2, Download, Filter, Search,
  Activity, Wifi, WifiOff, Eye, EyeOff, Zap, Brain, BarChart3,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle, XCircle,
  Send, Loader2, Shield, Cpu, ArrowUpDown, FlaskConical
} from 'lucide-react';
import { lookupModule, ALL_KNOWN_MODULES, type KnownModule } from '@/lib/moduleScanner';
import { ALL_PROTOCOLS, type SupportedProtocol } from '@/lib/protocolDetection';
import { trpc } from '@/lib/trpc';
import { Streamdown } from 'streamdown';
import { PCANConnection, defaultBridgeWebSocketCandidates } from '@/lib/pcanConnection';
import { VopCan2UsbConnection, getSharedVopCan2UsbConnection } from '@/lib/vopCan2UsbConnection';
import KnoxConfidenceDashboard from '@/components/KnoxConfidenceDashboard';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface CapturedFrame {
  frameNumber: number;
  timestamp: number;
  arbId: number;
  data: number[];
  dlc: number;
  isExtended: boolean;
  isRemote: boolean;
  isError: boolean;
  // Decoded info
  moduleName?: string;
  moduleAcronym?: string;
  direction?: 'request' | 'response' | 'broadcast';
  // Live flash decode
  flashDecode?: FlashDecode | null;
  /** Overwrite-by-ID view: indices that changed vs previous frame on this arb ID */
  payloadChangedBytes?: Set<number>;
  /** Overwrite-by-ID: ms since previous frame with same arb ID */
  cycleTimeMs?: number;
}

interface FlashDecode {
  type: 'request' | 'positive_response' | 'negative_response';
  service: number;
  serviceName: string;
  isFlash: boolean;
  module?: string;
  description: string;
  parameters?: Record<string, string | number>;
  nrc?: number;
  nrcName?: string;
}

interface ArbIdStats {
  arbId: number;
  count: number;
  firstSeen: number;
  lastSeen: number;
  rateHz: number;
  lastData: number[];
  prevData: number[];
  changedBytes: Set<number>;
  moduleName?: string;
  moduleAcronym?: string;
  visible: boolean;
}

type ViewMode = 'live' | 'stats' | 'decode';
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'monitoring' | 'error';

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const MAX_CAPTURED_FRAMES = 50000;
const STATS_UPDATE_INTERVAL = 500; // ms
const FRAME_DISPLAY_LIMIT = 500;   // Show last N frames in live view

function diffPayloadBytes(prev: number[] | undefined, next: number[]): Set<number> {
  const changed = new Set<number>();
  if (prev === undefined) return changed;
  const max = Math.max(prev.length, next.length);
  for (let i = 0; i < max; i++) {
    if (prev[i] !== next[i]) changed.add(i);
  }
  return changed;
}

function snapshotOverwriteFrames(map: Map<number, CapturedFrame>): CapturedFrame[] {
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, f]) => ({
      ...f,
      data: [...f.data],
      payloadChangedBytes: f.payloadChangedBytes
        ? new Set(f.payloadChangedBytes)
        : undefined,
    }));
}

// Known CAN ID ranges for direction detection
const isRequestId = (id: number) => id >= 0x700 && id <= 0x7DF;
const isResponseId = (id: number) => (id >= 0x7E8 && id <= 0x7EF) || (id >= 0x708 && id <= 0x7DF && (id & 0x08) !== 0);

// UDS flash-related service IDs for live decode
const FLASH_SERVICES = new Set([0x10, 0x27, 0x2E, 0x31, 0x34, 0x36, 0x37, 0x11]);
const UDS_SERVICE_NAMES: Record<number, string> = {
  0x10: 'DiagnosticSessionControl',
  0x11: 'ECUReset',
  0x14: 'ClearDTC',
  0x19: 'ReadDTC',
  0x22: 'ReadDataByIdentifier',
  0x23: 'ReadMemoryByAddress',
  0x27: 'SecurityAccess',
  0x28: 'CommunicationControl',
  0x2E: 'WriteDataByIdentifier',
  0x2F: 'InputOutputControl',
  0x31: 'RoutineControl',
  0x34: 'RequestDownload',
  0x35: 'RequestUpload',
  0x36: 'TransferData',
  0x37: 'RequestTransferExit',
  0x3E: 'TesterPresent',
};
const NRC_NAMES: Record<number, string> = {
  0x10: 'General Reject',
  0x11: 'Service Not Supported',
  0x12: 'Sub-Function Not Supported',
  0x13: 'Incorrect Message Length',
  0x21: 'Busy — Repeat Request',
  0x22: 'Conditions Not Correct',
  0x24: 'Request Sequence Error',
  0x31: 'Request Out Of Range',
  0x33: 'Security Access Denied',
  0x35: 'Invalid Key',
  0x36: 'Exceeded Number Of Attempts',
  0x37: 'Required Time Delay Not Expired',
  0x70: 'Upload/Download Not Accepted',
  0x71: 'Transfer Data Suspended',
  0x72: 'General Programming Failure',
  0x73: 'Wrong Block Sequence Counter',
  0x78: 'Response Pending',
  0x7E: 'Sub-Function Not Supported In Active Session',
  0x7F: 'Service Not Supported In Active Session',
};

// Protocol display info
const PROTOCOL_OPTIONS: { value: SupportedProtocol; label: string; icon: string; color: string }[] = [
  { value: 'obd2', label: 'OBD-II', icon: '⚡', color: 'text-blue-400 border-blue-700' },
  { value: 'j1939', label: 'J1939', icon: '🚛', color: 'text-orange-400 border-orange-700' },
  { value: 'uds', label: 'UDS', icon: '🔧', color: 'text-purple-400 border-purple-700' },
  { value: 'canfd', label: 'CAN FD', icon: '⚡', color: 'text-cyan-400 border-cyan-700' },
  { value: 'raw', label: 'Raw CAN', icon: '📡', color: 'text-zinc-400 border-zinc-600' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

function formatArbId(id: number): string {
  return '0x' + id.toString(16).toUpperCase().padStart(3, '0');
}

function formatHexByte(byte: number): string {
  return byte.toString(16).toUpperCase().padStart(2, '0');
}

function formatHexData(data: number[]): string {
  return data.map(b => formatHexByte(b)).join(' ');
}

/** Bridges differ: `bus_frame` vs `can_frame`, `arb_id` vs `arbitration_id`, string vs number. */
function parseBridgeCanArbId(msg: Record<string, unknown>): number | null {
  if (!('arb_id' in msg) && !('arbitration_id' in msg)) return null;
  const raw = msg.arb_id ?? msg.arbitration_id;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw >>> 0;
  if (typeof raw === 'string') {
    const s = raw.trim();
    const n = /^0x/i.test(s) ? parseInt(s, 16) : parseInt(s, 10);
    return Number.isFinite(n) ? (n >>> 0) : null;
  }
  return null;
}

function parseBridgeCanData(msg: Record<string, unknown>): number[] {
  const raw = msg.data;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => {
    if (typeof x === 'number' && Number.isFinite(x)) return x & 0xff;
    if (typeof x === 'string' && /^[0-9a-fA-F]{1,2}$/.test(x)) return parseInt(x, 16) & 0xff;
    const n = parseInt(String(x), 10);
    return Number.isFinite(n) ? (n & 0xff) : 0;
  });
}

function formatAsciiData(data: number[]): string {
  return data.map(b => (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.').join('');
}

/** Epoch ms → local date/time (browser locale); millisecond precision for frame ordering */
const frameTimestampFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
});

function formatFrameTimestamp(epochMs: number): string {
  return frameTimestampFormatter.format(new Date(epochMs));
}

/** Inter-frame time for same arb ID (ms since previous frame) */
function formatInterFrameMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 10) return `${ms.toFixed(1)} ms`;
  return `${ms.toFixed(3)} ms`;
}

function decodeGlobalBAddress(arbId: number): { target: number; source: number } | null {
  // 29-bit UDS addressing pattern commonly used on Global B:
  // 0x18DAxxYY where xx/yy are tester/ECU addresses.
  if ((arbId & 0x1FFF0000) !== 0x18DA0000) return null;
  const target = (arbId >> 8) & 0xFF;
  const source = arbId & 0xFF;
  return { target, source };
}

function identifyModule(arbId: number): { name: string; acronym: string } | null {
  const globalB = decodeGlobalBAddress(arbId);
  if (globalB) {
    const targetHex = globalB.target.toString(16).toUpperCase().padStart(2, '0');
    const sourceHex = globalB.source.toString(16).toUpperCase().padStart(2, '0');
    if (globalB.source === 0xF1) {
      return { name: `Global B UDS Request (Tester F1 -> ECU ${targetHex})`, acronym: `GB_REQ_${targetHex}` };
    }
    if (globalB.target === 0xF1) {
      return { name: `Global B UDS Response (ECU ${sourceHex} -> Tester F1)`, acronym: `GB_RSP_${sourceHex}` };
    }
    return { name: `Global B UDS Traffic (${sourceHex} -> ${targetHex})`, acronym: 'GB_UDS' };
  }

  // Direct lookup
  const module = lookupModule(arbId);
  if (module) return { name: module.name, acronym: module.acronym };

  // Check if it's a response address (request + 8)
  const requestAddr = arbId - 8;
  const reqModule = lookupModule(requestAddr);
  if (reqModule) return { name: `${reqModule.name} (Response)`, acronym: `${reqModule.acronym}_R` };

  // Standard OBD addresses
  if (arbId === 0x7DF) return { name: 'OBD Broadcast Request', acronym: 'OBD_BC' };
  if (arbId === 0x7E0) return { name: 'ECM/PCM Request', acronym: 'ECM_Q' };
  if (arbId === 0x7E8) return { name: 'ECM/PCM Response', acronym: 'ECM_R' };
  if (arbId === 0x7E1) return { name: 'TCM Request', acronym: 'TCM_Q' };
  if (arbId === 0x7E9) return { name: 'TCM Response', acronym: 'TCM_R' };

  return null;
}

function detectDirection(arbId: number): 'request' | 'response' | 'broadcast' {
  const globalB = decodeGlobalBAddress(arbId);
  if (globalB) {
    if (globalB.source === 0xF1) return 'request';
    if (globalB.target === 0xF1) return 'response';
    return 'broadcast';
  }
  if (arbId === 0x7DF) return 'broadcast';
  if (isRequestId(arbId)) return 'request';
  if (isResponseId(arbId)) return 'response';
  return 'broadcast';
}

/**
 * Client-side UDS frame decode for live flash monitoring.
 * Fast path — no LLM call, pure logic.
 */
function decodeUDSFrameLocal(arbId: number, data: number[]): FlashDecode | null {
  if (data.length < 2) return null;

  // ISO-TP single frame: first byte is length
  const pciType = (data[0] >> 4) & 0x0F;
  let serviceOffset = 1; // single frame
  if (pciType === 0) {
    serviceOffset = 1; // single frame: [len, SID, ...]
  } else if (pciType === 1) {
    serviceOffset = 2; // first frame: [10 len, SID, ...]
  } else if (pciType === 2) {
    return null; // consecutive frame — no service ID
  } else if (pciType === 3) {
    return null; // flow control
  }

  if (data.length <= serviceOffset) return null;
  const serviceId = data[serviceOffset];

  // Negative response (0x7F)
  if (serviceId === 0x7F && data.length >= serviceOffset + 3) {
    const rejectedService = data[serviceOffset + 1];
    const nrc = data[serviceOffset + 2];
    return {
      type: 'negative_response',
      service: rejectedService,
      serviceName: UDS_SERVICE_NAMES[rejectedService] || `0x${rejectedService.toString(16)}`,
      isFlash: FLASH_SERVICES.has(rejectedService),
      nrc,
      nrcName: NRC_NAMES[nrc] || `0x${nrc.toString(16)}`,
      description: `REJECTED: ${UDS_SERVICE_NAMES[rejectedService] || 'Unknown'} — ${NRC_NAMES[nrc] || 'Unknown NRC'}`,
    };
  }

  // UDS positive response (SID >= 0x50 means response to SID - 0x40)
  if (serviceId >= 0x50 && serviceId <= 0x7E) {
    const requestService = serviceId - 0x40;
    return buildUDSDecode(requestService, data, serviceOffset, arbId, true);
  }

  // UDS request (SID <= 0x3F)
  if (serviceId <= 0x3F && UDS_SERVICE_NAMES[serviceId]) {
    return buildUDSDecode(serviceId, data, serviceOffset, arbId, false);
  }

  return null;
}

function buildUDSDecode(
  service: number,
  data: number[],
  offset: number,
  arbId: number,
  isResponse: boolean
): FlashDecode {
  const serviceName = UDS_SERVICE_NAMES[service] || `Service 0x${service.toString(16)}`;
  const isFlash = FLASH_SERVICES.has(service);
  const module = `ECU 0x${(isResponse ? arbId - 8 : arbId).toString(16).toUpperCase()}`;

  let description = `${isResponse ? '✓' : '→'} ${serviceName}`;
  const parameters: Record<string, string | number> = {};

  switch (service) {
    case 0x10: { // DiagnosticSessionControl
      const sessions: Record<number, string> = { 1: 'Default', 2: 'Programming', 3: 'Extended' };
      const session = data[offset + 1];
      parameters.session = sessions[session] || `Custom (0x${session?.toString(16)})`;
      description += ` → ${parameters.session} Session`;
      break;
    }
    case 0x22: { // ReadDataByIdentifier
      if (data.length >= offset + 3) {
        const did = (data[offset + 1] << 8) | data[offset + 2];
        parameters.did = `0x${did.toString(16).toUpperCase()}`;
        description += ` DID ${parameters.did}`;
      }
      break;
    }
    case 0x27: { // SecurityAccess
      const subFn = data[offset + 1];
      if (subFn !== undefined) {
        const isSeedRequest = subFn % 2 === 1;
        parameters.accessLevel = Math.ceil(subFn / 2);
        parameters.operation = isSeedRequest ? 'SEED REQUEST' : 'KEY RESPONSE';
        description += ` → ${parameters.operation} (Level ${parameters.accessLevel})`;
      }
      break;
    }
    case 0x2E: { // WriteDataByIdentifier
      if (data.length >= offset + 3) {
        const did = (data[offset + 1] << 8) | data[offset + 2];
        parameters.did = `0x${did.toString(16).toUpperCase()}`;
        parameters.payloadSize = data.length - offset - 3;
        description += ` → WRITING DID ${parameters.did} (${parameters.payloadSize} bytes)`;
      }
      break;
    }
    case 0x31: { // RoutineControl
      if (data.length >= offset + 3) {
        const subFn = data[offset + 1];
        const routineId = (data[offset + 2] << 8) | (data[offset + 3] || 0);
        parameters.routineId = `0x${routineId.toString(16).toUpperCase()}`;
        parameters.subFunction = subFn === 0x01 ? 'START' : subFn === 0x02 ? 'STOP' : 'RESULTS';
        description += ` → ${parameters.subFunction} Routine ${parameters.routineId}`;
      }
      break;
    }
    case 0x34: { // RequestDownload
      if (data.length >= offset + 2) {
        parameters.dataFormat = data[offset + 1];
        description += ' → FLASH DOWNLOAD INITIATED';
      }
      break;
    }
    case 0x36: { // TransferData
      if (data.length >= offset + 2) {
        parameters.blockSequence = data[offset + 1];
        parameters.payloadSize = data.length - offset - 2;
        description += ` → BLOCK #${data[offset + 1]} (${parameters.payloadSize} bytes)`;
      }
      break;
    }
    case 0x37: { // RequestTransferExit
      description += ' → FLASH TRANSFER COMPLETE';
      break;
    }
    case 0x11: { // ECUReset
      const resetTypes: Record<number, string> = { 1: 'Hard Reset', 2: 'Key Off/On', 3: 'Soft Reset' };
      const rt = data[offset + 1];
      parameters.resetType = resetTypes[rt] || `Type ${rt}`;
      description += ` → ${parameters.resetType}`;
      break;
    }
    case 0x3E: {
      description += ' (keepalive)';
      break;
    }
  }

  return {
    type: isResponse ? 'positive_response' : 'request',
    service,
    serviceName,
    isFlash,
    module,
    description,
    parameters,
  };
}

function exportFramesToCSV(frames: CapturedFrame[]): string {
  const header = 'Frame#,Timestamp,ArbID,ArbID_Hex,DLC,Data_Hex,Data_ASCII,Module,Direction,FlashDecode\n';
  const rows = frames.map(f => {
    const hex = formatHexData(f.data);
    const ascii = formatAsciiData(f.data);
    const flash = f.flashDecode?.description || '';
    return `${f.frameNumber},${f.timestamp.toFixed(6)},${f.arbId},${formatArbId(f.arbId)},${f.dlc},"${hex}","${ascii}",${f.moduleAcronym || 'Unknown'},${f.direction || 'unknown'},"${flash}"`;
  });
  return header + rows.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Flash Progress Tracker
// ═══════════════════════════════════════════════════════════════════════════

interface FlashProgress {
  stage: 'idle' | 'session' | 'security' | 'erase' | 'download' | 'transfer' | 'verify' | 'reset' | 'complete';
  blocksTransferred: number;
  totalBytes: number;
  currentModule: string;
  startTime: number | null;
  lastActivity: number;
  errors: string[];
}

function createFlashProgress(): FlashProgress {
  return {
    stage: 'idle',
    blocksTransferred: 0,
    totalBytes: 0,
    currentModule: '',
    startTime: null,
    lastActivity: 0,
    errors: [],
  };
}

function updateFlashProgress(progress: FlashProgress, decode: FlashDecode): FlashProgress {
  if (!decode.isFlash && decode.type !== 'negative_response') return progress;

  const updated = { ...progress, lastActivity: Date.now() };
  if (!updated.startTime) updated.startTime = Date.now();
  if (decode.module) updated.currentModule = decode.module;

  if (decode.type === 'negative_response') {
    updated.errors = [...updated.errors, decode.description];
    return updated;
  }

  switch (decode.service) {
    case 0x10: updated.stage = 'session'; break;
    case 0x27: updated.stage = 'security'; break;
    case 0x31: {
      const sub = decode.parameters?.subFunction;
      if (sub === 'START') updated.stage = 'erase';
      else if (sub === 'RESULTS') updated.stage = 'verify';
      break;
    }
    case 0x34: updated.stage = 'download'; break;
    case 0x36: {
      updated.stage = 'transfer';
      updated.blocksTransferred++;
      const payloadSize = typeof decode.parameters?.payloadSize === 'number' ? decode.parameters.payloadSize : 0;
      updated.totalBytes += payloadSize;
      break;
    }
    case 0x37: updated.stage = 'complete'; break;
    case 0x11: updated.stage = 'reset'; break;
  }

  return updated;
}

const FLASH_STAGE_LABELS: Record<string, { label: string; color: string; step: number }> = {
  idle: { label: 'IDLE', color: 'text-zinc-500', step: 0 },
  session: { label: 'SESSION CONTROL', color: 'text-blue-400', step: 1 },
  security: { label: 'SECURITY ACCESS', color: 'text-yellow-400', step: 2 },
  erase: { label: 'ERASING MEMORY', color: 'text-orange-400', step: 3 },
  download: { label: 'DOWNLOAD INIT', color: 'text-purple-400', step: 4 },
  transfer: { label: 'TRANSFERRING DATA', color: 'text-red-400', step: 5 },
  verify: { label: 'VERIFYING', color: 'text-cyan-400', step: 6 },
  reset: { label: 'ECU RESET', color: 'text-green-400', step: 7 },
  complete: { label: 'COMPLETE', color: 'text-green-400', step: 8 },
};

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function IntelliSpy() {
  // Connection state
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [bridgeUrl, setBridgeUrl] = useState('wss://127.0.0.1:8766');
  const wsRef = useRef<WebSocket | null>(null);
  /** PCAN WebSocket vs V-OP USB binary bridge */
  const [spyTransport, setSpyTransport] = useState<'ws' | 'vop'>('ws');
  const vopConnRef = useRef<VopCan2UsbConnection | null>(null);
  const vopUnsubRef = useRef<(() => void) | null>(null);
  const vopFrameSeqRef = useRef(0);
  const [vopAdapterIdentity, setVopAdapterIdentity] = useState<string | null>(null);
  const handleBridgeMessageRef = useRef<(msg: Record<string, unknown>) => void>(() => {});

  // Bridge check state (matches DataloggerPanel pattern)
  const [bridgeAvailable, setBridgeAvailable] = useState<boolean | null>(null);
  const [checkingBridge, setCheckingBridge] = useState(false);
  const [detectedBridgeUrl, setDetectedBridgeUrl] = useState<string | null>(null);
  /** Invalidates in-flight availability checks when the adapter changes */
  const adapterCheckGenRef = useRef(0);

  // Protocol state
  const [activeProtocol, setActiveProtocol] = useState<SupportedProtocol>('obd2');
  const [showProtocolMenu, setShowProtocolMenu] = useState(false);

  // Capture state
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [arbIdStats, setArbIdStats] = useState<Map<number, ArbIdStats>>(new Map());
  const [isPaused, setIsPaused] = useState(false);
  const [totalFrames, setTotalFrames] = useState(0);
  const [captureStartTime, setCaptureStartTime] = useState<number | null>(null);

  // Filter state
  const [filterText, setFilterText] = useState('');
  const [hiddenArbIds, setHiddenArbIds] = useState<Set<number>>(new Set());
  const [showOnlyDiagnostic, setShowOnlyDiagnostic] = useState(false);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('live');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showAscii, setShowAscii] = useState(true);
  const [expandedStats, setExpandedStats] = useState<Set<number>>(new Set());

  // Flash progress tracking
  const [flashProgress, setFlashProgress] = useState<FlashProgress>(createFlashProgress());
  const flashProgressRef = useRef<FlashProgress>(createFlashProgress());

  // Knox AI analysis state
  const [knoxQuestion, setKnoxQuestion] = useState('');
  const [knoxAnalysis, setKnoxAnalysis] = useState<string | null>(null);
  const [selectedFramesForKnox, setSelectedFramesForKnox] = useState<Set<number>>(new Set());

  // Knox tRPC mutation
  const knoxMutation = trpc.intellispy.analyzeFrames.useMutation();

  // Knox conversational chat state
  const [knoxChatMessages, setKnoxChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; knoxMeta?: { pipeline?: string; confidence?: string; agreement?: string; durationMs?: number; agentDetails?: Record<string, unknown> } }>>([]);
  const [knoxChatInput, setKnoxChatInput] = useState('');
  const [knoxChatOpen, setKnoxChatOpen] = useState(false);
  const knoxChatMutation = trpc.intellispy.knoxChat.useMutation();
  const knoxChatScrollRef = useRef<HTMLDivElement>(null);

  // ECU Communication Loss Detection / bridge errors
  const [ecuLostReason, setEcuLostReason] = useState<string | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const lastFrameTimeRef = useRef<number>(Date.now());
  const ecuLostTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ECU_TIMEOUT_MS = 10000; // 10 seconds without frames = ECU lost

  // Refs for performance
  const frameBufferRef = useRef<CapturedFrame[]>([]);
  const statsRef = useRef<Map<number, ArbIdStats>>(new Map());
  const frameCountRef = useRef(0);
  const pausedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const updateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Live CAN list: one row per arb ID, updated in place */
  const overwriteMapRef = useRef<Map<number, CapturedFrame>>(new Map());
  const liveDisplayModeRef = useRef<'scroll' | 'overwrite'>('scroll');
  const [liveDisplayMode, setLiveDisplayMode] = useState<'scroll' | 'overwrite'>('scroll');
  const [overwriteLiveSort, setOverwriteLiveSort] = useState<{
    key: 'arbId' | 'dt';
    dir: 'asc' | 'desc';
  }>({ key: 'arbId', dir: 'asc' });
  const prevLiveDisplayModeRef = useRef(liveDisplayMode);
  liveDisplayModeRef.current = liveDisplayMode;

  // Keep paused ref in sync
  useEffect(() => { pausedRef.current = isPaused; }, [isPaused]);

  // ─── Protocol Switching ───────────────────────────────────────────────

  const switchProtocol = useCallback((protocol: SupportedProtocol) => {
    setActiveProtocol(protocol);
    setShowProtocolMenu(false);

    if (spyTransport === 'vop') return;

    // Send protocol switch to bridge if connected
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'set_protocol',
        protocol,
        bitrate: ALL_PROTOCOLS[protocol]?.defaultBitrate || 500000,
      }));
    }
  }, [spyTransport]);

  // ─── Bridge / serial availability check ───────────────────────────────

  const runAdapterAvailabilityCheck = useCallback(async (transport: 'ws' | 'vop') => {
    const gen = ++adapterCheckGenRef.current;
    setBridgeAvailable(null);
    setDetectedBridgeUrl(null);
    setCheckingBridge(true);
    try {
      if (transport === 'vop') {
        const ok = VopCan2UsbConnection.isSupported();
        if (gen !== adapterCheckGenRef.current) return;
        setBridgeAvailable(ok);
      } else {
        const result = await PCANConnection.isBridgeAvailable();
        if (gen !== adapterCheckGenRef.current) return;
        setBridgeAvailable(result.available);
        if (result.available) {
          setDetectedBridgeUrl(result.url);
        } else {
          setDetectedBridgeUrl(null);
        }
      }
    } catch {
      if (gen !== adapterCheckGenRef.current) return;
      setBridgeAvailable(false);
      setDetectedBridgeUrl(null);
    } finally {
      if (gen === adapterCheckGenRef.current) {
        setCheckingBridge(false);
      }
    }
  }, []);

  const handleCheckBridge = useCallback(() => {
    void runAdapterAvailabilityCheck(spyTransport);
  }, [spyTransport, runAdapterAvailabilityCheck]);

  useEffect(() => {
    void runAdapterAvailabilityCheck(spyTransport);
  }, [spyTransport, runAdapterAvailabilityCheck]);

  // ─── Stats Timer (batch UI updates) — must be above connect() ─────────────

  const startStatsTimer = useCallback(() => {
    if (updateTimerRef.current) return;
    updateTimerRef.current = setInterval(() => {
      if (liveDisplayModeRef.current === 'overwrite') {
        setFrames(snapshotOverwriteFrames(overwriteMapRef.current));
      } else {
        setFrames([...frameBufferRef.current.slice(-FRAME_DISPLAY_LIMIT)]);
      }
      setTotalFrames(frameCountRef.current);
      setArbIdStats(new Map(statsRef.current));
      setFlashProgress({ ...flashProgressRef.current });
    }, STATS_UPDATE_INTERVAL);
  }, []);

  const stopStatsTimer = useCallback(() => {
    if (updateTimerRef.current) {
      clearInterval(updateTimerRef.current);
      updateTimerRef.current = null;
    }
    if (liveDisplayModeRef.current === 'overwrite') {
      setFrames(snapshotOverwriteFrames(overwriteMapRef.current));
    } else {
      setFrames([...frameBufferRef.current.slice(-FRAME_DISPLAY_LIMIT)]);
    }
    setTotalFrames(frameCountRef.current);
    setArbIdStats(new Map(statsRef.current));
    setFlashProgress({ ...flashProgressRef.current });
  }, []);

  /** Push ref state to React immediately (stats timer only runs every STATS_UPDATE_INTERVAL) */
  const syncLiveUiFromRefs = useCallback(() => {
    if (liveDisplayModeRef.current === 'overwrite') {
      setFrames(snapshotOverwriteFrames(overwriteMapRef.current));
    } else {
      setFrames([...frameBufferRef.current.slice(-FRAME_DISPLAY_LIMIT)]);
    }
    setTotalFrames(frameCountRef.current);
    setArbIdStats(new Map(statsRef.current));
    setFlashProgress({ ...flashProgressRef.current });
  }, []);

  const resetCaptureData = useCallback(() => {
    frameBufferRef.current = [];
    overwriteMapRef.current.clear();
    statsRef.current.clear();
    frameCountRef.current = 0;
    vopFrameSeqRef.current = 0;
    flashProgressRef.current = createFlashProgress();
    setFlashProgress(createFlashProgress());
    setKnoxAnalysis(null);
    setSelectedFramesForKnox(new Set());
    syncLiveUiFromRefs();
  }, [syncLiveUiFromRefs]);

  useEffect(() => {
    if (liveDisplayMode === 'overwrite' && prevLiveDisplayModeRef.current !== 'overwrite') {
      if (status === 'monitoring') {
        resetCaptureData();
      } else {
        for (const [id, stat] of statsRef.current) {
          if (overwriteMapRef.current.has(id)) continue;
          const data = [...stat.lastData];
          let flashDecode: FlashDecode | null = null;
          if (id >= 0x700 && id <= 0x7ff) {
            flashDecode = decodeUDSFrameLocal(id, data);
          }
          const frame: CapturedFrame = {
            frameNumber: stat.count,
            timestamp: stat.lastSeen,
            arbId: id,
            data,
            dlc: data.length,
            isExtended: false,
            isRemote: false,
            isError: false,
            moduleName: stat.moduleName,
            moduleAcronym: stat.moduleAcronym,
            direction: detectDirection(id),
            flashDecode,
            payloadChangedBytes: new Set(),
          };
          overwriteMapRef.current.set(id, frame);
        }
        syncLiveUiFromRefs();
      }
    }
    if (liveDisplayMode === 'scroll' && prevLiveDisplayModeRef.current !== 'scroll') {
      overwriteMapRef.current.clear();
      syncLiveUiFromRefs();
    }
    prevLiveDisplayModeRef.current = liveDisplayMode;
  }, [liveDisplayMode, status, resetCaptureData, syncLiveUiFromRefs]);

  const armEcuLostTimer = useCallback(() => {
    lastFrameTimeRef.current = Date.now();
    setEcuLostReason(null);
    if (ecuLostTimerRef.current) clearInterval(ecuLostTimerRef.current);
    ecuLostTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastFrameTimeRef.current;
      if (elapsed > ECU_TIMEOUT_MS) {
        const reason = elapsed > 30000
          ? 'No CAN bus traffic for over 30 seconds. The vehicle may be off, the adapter disconnected, or the CAN bus is inactive.'
          : `No CAN frames received for ${Math.round(elapsed / 1000)}s. Possible causes: vehicle ignition off, adapter disconnected, CAN bus error, or wiring issue.`;
        setEcuLostReason(reason);
      }
    }, 2000);
  }, []);

  // ─── WebSocket / V-OP USB Connection ─────────────────────────────────

  const connect = useCallback(async () => {
    if (spyTransport === 'vop') {
      if (!VopCan2UsbConnection.isSupported()) {
        setStatus('error');
        return;
      }
      setStatus('connecting');
      try {
        if (!vopConnRef.current) vopConnRef.current = getSharedVopCan2UsbConnection({});
        const v = vopConnRef.current;
        const ok = await v.connect({ skipVehicleInit: true });
        if (!ok) {
          setStatus('error');
          setVopAdapterIdentity(null);
          return;
        }
        const vi = v.getVehicleInfo();
        setVopAdapterIdentity(
          [vi.vopDeviceName, vi.vopDeviceSerial].filter(Boolean).join(' · ') || vi.vopDeviceIdentity || null
        );
        vopUnsubRef.current?.();
        vopFrameSeqRef.current = 0;
        const unsub = v.subscribeCanMonitor((arbId, flags, data) => {
          const frameNumber = ++vopFrameSeqRef.current;
          const dataArr = [...data];
          handleBridgeMessageRef.current({
            type: 'bus_frame',
            arb_id: arbId,
            data: dataArr,
            timestamp: Date.now(),
            frame_number: frameNumber,
            dlc: dataArr.length,
            is_extended: !!(flags & 1),
            is_remote: !!(flags & 2),
            is_error: false,
          });
        });
        vopUnsubRef.current = unsub;
        setStatus('monitoring');
        setCaptureStartTime(Date.now());
        frameCountRef.current = 0;
        setFlashProgress(createFlashProgress());
        flashProgressRef.current = createFlashProgress();
        startStatsTimer();
        armEcuLostTimer();
      } catch {
        setStatus('error');
        setVopAdapterIdentity(null);
      }
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');

    // Use detected URL first, then fall back to defaults
    const fallback = defaultBridgeWebSocketCandidates();
    const urlsToTry = detectedBridgeUrl
      ? [detectedBridgeUrl, ...fallback.filter((u) => u !== detectedBridgeUrl)]
      : fallback;
    let connected = false;

    for (const url of urlsToTry) {
      try {
        const ws = await new Promise<WebSocket>((resolve, reject) => {
          const socket = new WebSocket(url);
          const timer = setTimeout(() => {
            socket.close();
            reject(new Error('timeout'));
          }, 3000);

          socket.onopen = () => {
            clearTimeout(timer);
          };

          socket.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === 'connected') {
                clearTimeout(timer);
                // Read the bridge's active protocol instead of overwriting it
                if (msg.active_protocol) {
                  const bridgeProto = msg.active_protocol as SupportedProtocol;
                  if (ALL_PROTOCOLS[bridgeProto]) {
                    setActiveProtocol(bridgeProto);
                  }
                }
                resolve(socket);
              }
            } catch { /* ignore */ }
          };

          socket.onerror = () => {
            clearTimeout(timer);
            reject(new Error('connection failed'));
          };
        });

        wsRef.current = ws;
        setBridgeUrl(url);
        setStatus('connected');
        connected = true;

        // Set up message handler
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            handleBridgeMessage(msg);
          } catch { /* ignore */ }
        };

        ws.onclose = () => {
          setStatus('disconnected');
          wsRef.current = null;
          stopStatsTimer();
        };

        ws.onerror = () => {
          setStatus('error');
        };

        // Do NOT send set_protocol on connect — it kills other clients' monitors
        // and reinitializes the CAN bus. Instead, read the bridge's active protocol
        // from the 'connected' message above. User can switch protocol manually later.

        // Auto-start bus monitoring — send both keys so older/newer bridges accept filters
        ws.send(JSON.stringify({ type: 'start_monitor', arb_ids: [], filter_ids: [] }));
        setStatus('monitoring');
        setBridgeError(null);
        setCaptureStartTime(Date.now());
        frameCountRef.current = 0;
        setFlashProgress(createFlashProgress());
        flashProgressRef.current = createFlashProgress();
        startStatsTimer();

        break;
      } catch {
        continue;
      }
    }

    if (!connected) {
      setStatus('error');
    }
  }, [spyTransport, detectedBridgeUrl, armEcuLostTimer, startStatsTimer]);

  const disconnect = useCallback(() => {
    if (spyTransport === 'vop') {
      vopUnsubRef.current?.();
      vopUnsubRef.current = null;
      void vopConnRef.current?.disconnect();
      vopConnRef.current = null;
      setVopAdapterIdentity(null);
      setStatus('disconnected');
      stopStatsTimer();
      if (ecuLostTimerRef.current) {
        clearInterval(ecuLostTimerRef.current);
        ecuLostTimerRef.current = null;
      }
      setEcuLostReason(null);
      return;
    }
    if (wsRef.current) {
      if (status === 'monitoring') {
        wsRef.current.send(JSON.stringify({ type: 'stop_monitor' }));
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
    stopStatsTimer();
  }, [spyTransport, status]);

  // ─── Monitor Control ──────────────────────────────────────────────────

  const startMonitor = useCallback((filterIds?: number[]) => {
    if (spyTransport === 'vop') {
      const v = vopConnRef.current;
      if (!v?.isFlashTransportOpen()) return;
      vopUnsubRef.current?.();
      vopFrameSeqRef.current = 0;
      const unsub = v.subscribeCanMonitor((arbId, flags, data) => {
        const frameNumber = ++vopFrameSeqRef.current;
        const dataArr = [...data];
        handleBridgeMessageRef.current({
          type: 'bus_frame',
          arb_id: arbId,
          data: dataArr,
          timestamp: Date.now(),
          frame_number: frameNumber,
          dlc: dataArr.length,
          is_extended: !!(flags & 1),
          is_remote: !!(flags & 2),
          is_error: false,
        });
      });
      vopUnsubRef.current = unsub;
      setStatus('monitoring');
      setCaptureStartTime(Date.now());
      frameCountRef.current = 0;
      setFlashProgress(createFlashProgress());
      flashProgressRef.current = createFlashProgress();
      startStatsTimer();
      armEcuLostTimer();
      return;
    }

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const msg: Record<string, unknown> = { type: 'start_monitor', arb_ids: [], filter_ids: [] };
    if (filterIds && filterIds.length > 0) {
      msg.arb_ids = filterIds;
      msg.filter_ids = filterIds;
    }

    wsRef.current.send(JSON.stringify(msg));
    setBridgeError(null);
    setStatus('monitoring');
    setCaptureStartTime(Date.now());
    frameCountRef.current = 0;
    setFlashProgress(createFlashProgress());
    flashProgressRef.current = createFlashProgress();
    startStatsTimer();
    armEcuLostTimer();
  }, [spyTransport, armEcuLostTimer, startStatsTimer]);

  const stopMonitor = useCallback(() => {
    if (spyTransport === 'vop') {
      vopUnsubRef.current?.();
      vopUnsubRef.current = null;
      setStatus('connected');
      stopStatsTimer();
      if (ecuLostTimerRef.current) {
        clearInterval(ecuLostTimerRef.current);
        ecuLostTimerRef.current = null;
      }
      setEcuLostReason(null);
      return;
    }
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'stop_monitor' }));
    setStatus('connected');
    stopStatsTimer();
    if (ecuLostTimerRef.current) {
      clearInterval(ecuLostTimerRef.current);
      ecuLostTimerRef.current = null;
    }
    setEcuLostReason(null);
  }, [spyTransport]);

  // ─── Frame Processing ─────────────────────────────────────────────────

  const handleBridgeMessage = useCallback((msg: Record<string, unknown>) => {
    const frameType = msg.type;
    if (frameType === 'bus_frame' || frameType === 'can_frame') {
      const parsedArb = parseBridgeCanArbId(msg);
      if (parsedArb === null) return;
      const arbId = parsedArb;
      const data = parseBridgeCanData(msg);
      const timestamp =
        typeof msg.timestamp === 'number' ? msg.timestamp : Date.now() / 1000;
      const frameNumber =
        typeof msg.frame_number === 'number' ? msg.frame_number : frameCountRef.current + 1;

      // Identify module
      const moduleInfo = identifyModule(arbId);
      const direction = detectDirection(arbId);

      // Live UDS flash decode
      let flashDecode: FlashDecode | null = null;
      if (arbId >= 0x700 && arbId <= 0x7FF) {
        flashDecode = decodeUDSFrameLocal(arbId, data);
        if (flashDecode) {
          flashProgressRef.current = updateFlashProgress(flashProgressRef.current, flashDecode);
        }
      }

      const prevOverwrite = overwriteMapRef.current.get(arbId);
      const payloadChangedBytes =
        liveDisplayModeRef.current === 'overwrite'
          ? diffPayloadBytes(prevOverwrite?.data, data)
          : undefined;

      const frame: CapturedFrame = {
        frameNumber,
        timestamp,
        arbId,
        data,
        dlc: msg.dlc as number || data.length,
        isExtended: msg.is_extended as boolean || false,
        isRemote: msg.is_remote as boolean || false,
        isError: msg.is_error as boolean || false,
        moduleName: moduleInfo?.name,
        moduleAcronym: moduleInfo?.acronym,
        direction,
        flashDecode,
        payloadChangedBytes,
      };

      frameCountRef.current++;

      // ECU communication recovery — we got a frame, so ECU is alive
      lastFrameTimeRef.current = Date.now();
      if (ecuLostReason) {
        setEcuLostReason(null);
      }
      setBridgeError(null);

      // Update stats
      const stats = statsRef.current;
      const existing = stats.get(arbId);
      const cycleTimeMs =
        liveDisplayModeRef.current === 'overwrite' && existing
          ? timestamp - existing.lastSeen
          : undefined;

      const frameWithCycle: CapturedFrame = { ...frame, cycleTimeMs };

      if (existing) {
        existing.prevData = [...existing.lastData];
        existing.count++;
        existing.lastSeen = timestamp;
        existing.lastData = data;
        // Track which bytes changed
        const changed = new Set<number>();
        for (let i = 0; i < data.length; i++) {
          if (existing.prevData[i] !== data[i]) changed.add(i);
        }
        existing.changedBytes = changed;
        // Calculate rate
        const elapsed = (timestamp - existing.firstSeen);
        existing.rateHz = elapsed > 0 ? existing.count / elapsed : 0;
      } else {
        stats.set(arbId, {
          arbId,
          count: 1,
          firstSeen: timestamp,
          lastSeen: timestamp,
          rateHz: 0,
          lastData: data,
          prevData: data,
          changedBytes: new Set(),
          moduleName: moduleInfo?.name,
          moduleAcronym: moduleInfo?.acronym,
          visible: true,
        });
      }

      // Buffer frames (don't update React state on every frame — too fast)
      if (!pausedRef.current) {
        if (liveDisplayModeRef.current === 'overwrite') {
          overwriteMapRef.current.set(arbId, {
            ...frameWithCycle,
            data: [...data],
            payloadChangedBytes,
          });
        } else {
          frameBufferRef.current.push(frame);
          if (frameBufferRef.current.length > MAX_CAPTURED_FRAMES) {
            frameBufferRef.current = frameBufferRef.current.slice(-MAX_CAPTURED_FRAMES);
          }
        }
      }
    } else if (msg.type === 'error') {
      const text = typeof msg.message === 'string' ? msg.message : 'Bridge error';
      setBridgeError(text);
      if (/CAN bus not available|not initialized|Failed to open/i.test(text)) {
        setEcuLostReason(text);
      }
    } else if (msg.type === 'monitor_started') {
      setStatus('monitoring');
      setBridgeError(null);
    } else if (msg.type === 'monitor_stopped') {
      setStatus('connected');
    } else if (msg.type === 'protocol_changed') {
      // Bridge confirmed protocol switch
      const proto = msg.protocol as SupportedProtocol;
      if (proto) setActiveProtocol(proto);
    }
  }, []);

  handleBridgeMessageRef.current = handleBridgeMessage;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStatsTimer();
      if (wsRef.current) {
        wsRef.current.close();
      }
      void vopConnRef.current?.disconnect();
    };
  }, []);

  // Auto-scroll (scroll stream only; overwrite list is stable per row)
  useEffect(() => {
    if (liveDisplayMode !== 'scroll') return;
    if (autoScroll && scrollRef.current && viewMode === 'live') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [frames, autoScroll, viewMode, liveDisplayMode]);

  // ─── Actions ──────────────────────────────────────────────────────────

  const clearCapture = useCallback(() => {
    resetCaptureData();
  }, [resetCaptureData]);

  const exportCapture = useCallback(() => {
    const toExport =
      liveDisplayMode === 'overwrite'
        ? snapshotOverwriteFrames(overwriteMapRef.current)
        : frameBufferRef.current;
    const csv = exportFramesToCSV(toExport);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intellispy_capture_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [liveDisplayMode]);

  const toggleArbIdVisibility = useCallback((arbId: number) => {
    setHiddenArbIds(prev => {
      const next = new Set(prev);
      if (next.has(arbId)) next.delete(arbId);
      else next.add(arbId);
      return next;
    });
  }, []);

  // ─── Knox AI Analysis ────────────────────────────────────────────────

  const askKnox = useCallback(async (question?: string) => {
    // Build frames to send — either selected frames or all unique stats
    type FrameInput = {
      arbId: number;
      arbIdHex: string;
      data: number[];
      dataHex: string;
      dlc: number;
      isExtended?: boolean;
      moduleName?: string;
      moduleAcronym?: string;
      direction?: string;
      count?: number;
      rateHz?: number;
    };
    let framesToAnalyze: FrameInput[];

    if (selectedFramesForKnox.size > 0) {
      // Send selected arb ID stats
      framesToAnalyze = Array.from(selectedFramesForKnox).map(arbId => {
        const stat = arbIdStats.get(arbId);
        return {
          arbId,
          arbIdHex: formatArbId(arbId),
          data: stat?.lastData || [],
          dataHex: stat ? formatHexData(stat.lastData) : '',
          dlc: stat?.lastData.length || 0,
          isExtended: false,
          moduleName: stat?.moduleName,
          moduleAcronym: stat?.moduleAcronym,
          count: stat?.count,
          rateHz: stat?.rateHz,
        };
      });
    } else {
      // Send all discovered stats
      framesToAnalyze = Array.from(arbIdStats.values()).map(stat => ({
        arbId: stat.arbId,
        arbIdHex: formatArbId(stat.arbId),
        data: stat.lastData,
        dataHex: formatHexData(stat.lastData),
        dlc: stat.lastData.length,
        isExtended: false,
        moduleName: stat.moduleName,
        moduleAcronym: stat.moduleAcronym,
        count: stat.count,
        rateHz: stat.rateHz,
      }));
    }

    if (framesToAnalyze.length === 0) return;

    // Limit to 200 frames max
    const limited = framesToAnalyze.slice(0, 200);

    const flashContext = flashProgress.stage !== 'idle'
      ? `Flash operation in progress: Stage=${flashProgress.stage}, Blocks=${flashProgress.blocksTransferred}, Bytes=${flashProgress.totalBytes}, Module=${flashProgress.currentModule}`
      : undefined;

    try {
      const result = await knoxMutation.mutateAsync({
        frames: limited,
        protocol: activeProtocol,
        question: question || knoxQuestion || undefined,
        context: flashContext,
      });
      setKnoxAnalysis(result.analysis);
    } catch (err) {
      setKnoxAnalysis(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [arbIdStats, selectedFramesForKnox, activeProtocol, flashProgress, knoxQuestion, knoxMutation]);

  // Knox conversational chat handler
  const sendKnoxChat = useCallback(async () => {
    const msg = knoxChatInput.trim();
    if (!msg || knoxChatMutation.isPending) return;

    const newMessages = [...knoxChatMessages, { role: 'user' as const, content: msg }];
    setKnoxChatMessages(newMessages);
    setKnoxChatInput('');

    // Build live bus context
    const liveFrames = Array.from(arbIdStats.values()).slice(0, 50).map(stat => ({
      arbIdHex: formatArbId(stat.arbId),
      moduleName: stat.moduleName || 'Unknown',
      dataHex: formatHexData(stat.lastData),
      count: stat.count,
      rateHz: stat.rateHz,
    }));

    const busContext = `${arbIdStats.size} unique arb IDs, ${frameCountRef.current} total frames captured. ${flashProgress.stage !== 'idle' ? `Flash in progress: ${flashProgress.stage}` : 'No flash active.'}`;

    try {
      const result = await knoxChatMutation.mutateAsync({
        message: msg,
        liveFrames: Array.from(arbIdStats.values()).slice(0, 100).map(stat => ({
          arbId: stat.arbId,
          arbIdHex: formatArbId(stat.arbId),
          data: stat.lastData,
          dataHex: formatHexData(stat.lastData),
          dlc: stat.lastData.length,
          isExtended: false,
          moduleName: stat.moduleName,
          moduleAcronym: stat.moduleAcronym,
          count: stat.count,
          rateHz: stat.rateHz,
        })),
        protocol: activeProtocol,
        busContext,
        history: newMessages.slice(-20),
      });
      setKnoxChatMessages(prev => [...prev, {
        role: 'assistant',
        content: result.reply,
        knoxMeta: {
          pipeline: result.pipeline,
          confidence: result.confidence,
          agreement: result.agreement,
          durationMs: result.durationMs,
          agentDetails: result.agentDetails as Record<string, unknown> | undefined,
        },
      }]);
    } catch (err) {
      setKnoxChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : String(err)}` }]);
    }

    // Auto-scroll
    setTimeout(() => knoxChatScrollRef.current?.scrollTo({ top: knoxChatScrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
  }, [knoxChatInput, knoxChatMessages, knoxChatMutation, arbIdStats, activeProtocol, flashProgress, frameCountRef]);

  const toggleFrameForKnox = useCallback((arbId: number) => {
    setSelectedFramesForKnox(prev => {
      const next = new Set(prev);
      if (next.has(arbId)) next.delete(arbId);
      else next.add(arbId);
      return next;
    });
  }, []);

  // ─── Filtered Frames ─────────────────────────────────────────────────

  const filteredFrames = useMemo(() => {
    let result = frames;

    // Apply arb ID visibility filter
    if (hiddenArbIds.size > 0) {
      result = result.filter(f => !hiddenArbIds.has(f.arbId));
    }

    // Apply diagnostic-only filter
    if (showOnlyDiagnostic) {
      result = result.filter(f => f.arbId >= 0x700 && f.arbId <= 0x7FF);
    }

    // Apply text filter
    if (filterText) {
      const lower = filterText.toLowerCase();
      result = result.filter(f =>
        formatArbId(f.arbId).toLowerCase().includes(lower) ||
        (f.moduleAcronym?.toLowerCase().includes(lower)) ||
        (f.moduleName?.toLowerCase().includes(lower)) ||
        formatHexData(f.data).toLowerCase().includes(lower) ||
        (f.flashDecode?.description.toLowerCase().includes(lower))
      );
    }

    return result;
  }, [frames, hiddenArbIds, showOnlyDiagnostic, filterText]);

  const liveTableFrames = useMemo(() => {
    if (liveDisplayMode !== 'overwrite') return filteredFrames;
    const arr = [...filteredFrames];
    const { key, dir } = overwriteLiveSort;
    const sign = dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      if (key === 'arbId') {
        const c = (a.arbId - b.arbId) * sign;
        if (c !== 0) return c;
      } else {
        const aMissing = a.cycleTimeMs == null;
        const bMissing = b.cycleTimeMs == null;
        if (aMissing && bMissing) return a.arbId - b.arbId;
        if (aMissing) return 1;
        if (bMissing) return -1;
        const c = (a.cycleTimeMs! - b.cycleTimeMs!) * sign;
        if (c !== 0) return c;
      }
      return a.arbId - b.arbId;
    });
    return arr;
  }, [filteredFrames, liveDisplayMode, overwriteLiveSort]);

  const toggleOverwriteColumnSort = useCallback((columnKey: 'arbId' | 'dt') => {
    setOverwriteLiveSort(prev =>
      prev.key === columnKey
        ? { key: columnKey, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key: columnKey, dir: 'asc' },
    );
  }, []);

  // ─── Sorted Stats ────────────────────────────────────────────────────

  const sortedStats = useMemo(() => {
    return Array.from(arbIdStats.values()).sort((a, b) => a.arbId - b.arbId);
  }, [arbIdStats]);

  // ─── Elapsed Time ────────────────────────────────────────────────────

  const elapsedStr = useMemo(() => {
    if (!captureStartTime) return '00:00';
    const elapsed = Math.floor((Date.now() - captureStartTime) / 1000);
    const min = Math.floor(elapsed / 60);
    const sec = elapsed % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }, [captureStartTime, totalFrames]); // totalFrames triggers re-render

  // ─── Flash frames count ──────────────────────────────────────────────

  const flashFrameCount = useMemo(() => {
    return liveTableFrames.filter(f => f.flashDecode?.isFlash).length;
  }, [liveTableFrames]);

  // ═══════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-white font-['Rajdhani',sans-serif]">
      {/* ─── Header Bar ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-red-900/30 bg-gradient-to-r from-[#0a0a0a] to-[#1a0505]">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-red-500" />
          <span className="font-['Bebas_Neue',sans-serif] text-lg tracking-wider text-red-500">INTELLISPY</span>
          <span className="text-xs text-zinc-500 font-['Share_Tech_Mono',monospace]">AI-POWERED CAN BUS SNIFFER</span>
        </div>

        <div className="flex-1" />

        {/* Protocol Badge */}
        <div className="relative">
          <button
            type="button"
            disabled={spyTransport === 'vop'}
            title={spyTransport === 'vop' ? 'Protocol is defined by bus / firmware when using USB CAN' : undefined}
            onClick={() => setShowProtocolMenu(!showProtocolMenu)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-['Share_Tech_Mono',monospace] transition-colors hover:bg-zinc-800/50 disabled:opacity-40 disabled:cursor-not-allowed ${
              PROTOCOL_OPTIONS.find(p => p.value === activeProtocol)?.color || 'text-zinc-400 border-zinc-700'
            }`}
          >
            <ArrowUpDown className="w-3 h-3" />
            {PROTOCOL_OPTIONS.find(p => p.value === activeProtocol)?.label || activeProtocol.toUpperCase()}
            <ChevronDown className="w-3 h-3" />
          </button>

          {showProtocolMenu && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl min-w-[220px]">
              <div className="px-3 py-1.5 border-b border-zinc-800">
                <span className="text-[10px] text-zinc-500 font-['Share_Tech_Mono',monospace]">SELECT PROTOCOL</span>
              </div>
              {PROTOCOL_OPTIONS.map(opt => {
                const proto = ALL_PROTOCOLS[opt.value];
                return (
                  <button
                    key={opt.value}
                    onClick={() => switchProtocol(opt.value)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/50 transition-colors ${
                      activeProtocol === opt.value ? 'bg-zinc-800/30' : ''
                    }`}
                  >
                    <span className="text-sm">{opt.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-['Share_Tech_Mono',monospace] ${
                        activeProtocol === opt.value ? 'text-red-400' : 'text-zinc-300'
                      }`}>
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-zinc-600 truncate">
                        {proto?.description.split('.')[0] || ''}
                      </div>
                    </div>
                    {activeProtocol === opt.value && (
                      <CheckCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Connection status */}
        <div className="flex items-center gap-2">
          {status === 'monitoring' && (
            <Badge variant="outline" className="border-red-500 text-red-400 animate-pulse font-['Share_Tech_Mono',monospace] text-xs">
              <Radio className="w-3 h-3 mr-1" /> LIVE
            </Badge>
          )}
          {status === 'connected' && (
            <Badge variant="outline" className="border-green-500 text-green-400 font-['Share_Tech_Mono',monospace] text-xs">
              <Wifi className="w-3 h-3 mr-1" /> CONNECTED
            </Badge>
          )}
          {status === 'disconnected' && (
            <Badge variant="outline" className="border-zinc-600 text-zinc-500 font-['Share_Tech_Mono',monospace] text-xs">
              <WifiOff className="w-3 h-3 mr-1" /> OFFLINE
            </Badge>
          )}
          {status === 'error' && (
            <Badge variant="outline" className="border-yellow-500 text-yellow-400 font-['Share_Tech_Mono',monospace] text-xs">
              <AlertTriangle className="w-3 h-3 mr-1" /> ERROR
            </Badge>
          )}
        </div>

        {/* Stats */}
        {totalFrames > 0 && (
          <div className="flex items-center gap-3 text-xs font-['Share_Tech_Mono',monospace] text-zinc-400">
            <span>{totalFrames.toLocaleString()} frames</span>
            <span>{arbIdStats.size} IDs</span>
            <span>{elapsedStr}</span>
          </div>
        )}
      </div>
      {/* ─── ECU Communication Lost Banner ─────────────────────────────── */}
      {ecuLostReason && (
        <div className="flex items-start gap-3 px-4 py-3 border-b border-red-900/50 bg-red-950/30" style={{ animation: 'pulse 2s infinite' }}>
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-['Bebas_Neue',sans-serif] text-sm text-red-500 tracking-wider mb-1">
              ⚠ ECU COMMUNICATION LOST
            </div>
            <div className="font-['Rajdhani',sans-serif] text-xs text-zinc-400 leading-relaxed">
              {ecuLostReason}
            </div>
            <div className="font-['Share_Tech_Mono',monospace] text-[10px] text-zinc-500 mt-2 leading-relaxed">
              • Check vehicle ignition is ON &nbsp;• Verify PCAN adapter connection &nbsp;• Check CAN bus wiring
            </div>
          </div>
        </div>
      )}

      {bridgeError && (
        <div className="flex items-start gap-3 px-4 py-2 border-b border-amber-900/50 bg-amber-950/25">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="font-['Rajdhani',sans-serif] text-xs text-amber-200/90 leading-relaxed">
            <span className="font-semibold text-amber-400">Bridge: </span>
            {bridgeError}
          </div>
        </div>
      )}

      {/* ─── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/50">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-['Share_Tech_Mono',monospace] text-zinc-500">ADAPTER</span>
          <select
            value={spyTransport}
            onChange={e => {
              const next = e.target.value as 'ws' | 'vop';
              if (next === 'ws') setVopAdapterIdentity(null);
              setSpyTransport(next);
            }}
            disabled={status === 'monitoring' || status === 'connecting' || status === 'connected'}
            className={`rounded border border-zinc-700 bg-zinc-900/80 py-1 pl-2 pr-6 text-[10px] font-['Share_Tech_Mono',monospace] ${
              spyTransport === 'vop' ? 'text-violet-300' : 'text-red-300'
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <option value="ws">PCAN-USB (WS bridge)</option>
            <option value="vop" disabled={!VopCan2UsbConnection.isSupported()}>V-OP Can2USB</option>
          </select>
          {spyTransport === 'vop' && vopAdapterIdentity && (
            <span
              className="ml-2 max-w-[min(220px,28vw)] truncate text-[9px] font-['Share_Tech_Mono',monospace] text-zinc-500"
              title={vopAdapterIdentity}
            >
              {vopAdapterIdentity}
            </span>
          )}
        </div>

        {/* Bridge Check */}
        <Button size="sm" variant="outline" onClick={handleCheckBridge} disabled={checkingBridge || status === 'monitoring'}
          className={`font-['Share_Tech_Mono',monospace] text-xs ${
            bridgeAvailable === true ? 'border-green-700 text-green-400' :
            bridgeAvailable === false ? 'border-red-700 text-red-400' :
            'border-zinc-700 text-zinc-400'
          } hover:bg-zinc-800/50`}>
          {checkingBridge ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Checking...</>
          ) : bridgeAvailable === true ? (
            <><CheckCircle className="w-3.5 h-3.5 mr-1" /> {spyTransport === 'vop' ? 'Serial OK' : 'Bridge OK'}</>
          ) : bridgeAvailable === false ? (
            <><XCircle className="w-3.5 h-3.5 mr-1" /> {spyTransport === 'vop' ? 'No Web Serial' : 'No Bridge'}</>
          ) : (
            <><Search className="w-3.5 h-3.5 mr-1" /> {spyTransport === 'vop' ? 'Check Serial' : 'Check Bridge'}</>
          )}
        </Button>

        <div className="w-px h-5 bg-zinc-800" />

        {/* Connection controls */}
        {status === 'disconnected' || status === 'error' ? (
          <Button size="sm" variant="outline" onClick={connect}
            className="border-green-700 text-green-400 hover:bg-green-900/30 font-['Share_Tech_Mono',monospace] text-xs">
            {spyTransport === 'vop' ? (
              <><Radio className="w-3.5 h-3.5 mr-1" /> Connect USB</>
            ) : (
              <><Wifi className="w-3.5 h-3.5 mr-1" /> Connect Bridge</>
            )}
          </Button>    ) : status === 'connected' ? (
          <>
            <Button size="sm" variant="outline" onClick={() => startMonitor()}
              className="border-red-700 text-red-400 hover:bg-red-900/30 font-['Share_Tech_Mono',monospace] text-xs">
              <Radio className="w-3.5 h-3.5 mr-1" /> Start Capture
            </Button>
            <Button size="sm" variant="outline" onClick={disconnect}
              className="border-zinc-700 text-zinc-400 hover:bg-zinc-800 font-['Share_Tech_Mono',monospace] text-xs">
              <WifiOff className="w-3.5 h-3.5 mr-1" /> Disconnect
            </Button>
          </>
        ) : status === 'monitoring' ? (
          <>
            <Button size="sm" variant="outline" onClick={stopMonitor}
              className="border-red-700 text-red-400 hover:bg-red-900/30 font-['Share_Tech_Mono',monospace] text-xs">
              <Square className="w-3.5 h-3.5 mr-1" /> Stop
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsPaused(!isPaused)}
              className="border-yellow-700 text-yellow-400 hover:bg-yellow-900/30 font-['Share_Tech_Mono',monospace] text-xs">
              {isPaused ? <Play className="w-3.5 h-3.5 mr-1" /> : <Pause className="w-3.5 h-3.5 mr-1" />}
              {isPaused ? 'Resume' : 'Freeze'}
            </Button>
          </>
        ) : null}

        <div className="w-px h-5 bg-zinc-800 mx-1" />

        {/* View mode tabs */}
        <div className="flex items-center bg-zinc-900/50 rounded-md p-0.5">
          {(['live', 'stats', 'decode'] as ViewMode[]).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={`px-3 py-1 text-xs font-['Share_Tech_Mono',monospace] rounded transition-colors ${
                viewMode === mode
                  ? 'bg-red-900/40 text-red-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}>
              {mode === 'live' && <Activity className="w-3 h-3 inline mr-1" />}
              {mode === 'stats' && <BarChart3 className="w-3 h-3 inline mr-1" />}
              {mode === 'decode' && <Brain className="w-3 h-3 inline mr-1" />}
              {mode.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-zinc-800 mx-1" />

        {/* Filter */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <Input
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            placeholder="Filter by ID, module, or data..."
            className="pl-7 h-7 text-xs bg-zinc-900/50 border-zinc-800 text-zinc-300 font-['Share_Tech_Mono',monospace]"
          />
        </div>

        <Button size="sm" variant="outline" onClick={() => setShowOnlyDiagnostic(!showOnlyDiagnostic)}
          className={`text-xs font-['Share_Tech_Mono',monospace] ${
            showOnlyDiagnostic ? 'border-red-700 text-red-400' : 'border-zinc-700 text-zinc-500'
          }`}>
          <Filter className="w-3 h-3 mr-1" /> {showOnlyDiagnostic ? 'DIAG ONLY' : 'ALL IDs'}
        </Button>

        <div className="flex-1" />

        {/* Actions */}
        <Button size="sm" variant="outline" onClick={clearCapture}
          className="border-zinc-700 text-zinc-500 hover:text-zinc-300 text-xs font-['Share_Tech_Mono',monospace]">
          <Trash2 className="w-3 h-3 mr-1" /> Clear
        </Button>
        <Button size="sm" variant="outline" onClick={exportCapture}
          disabled={totalFrames === 0}
          className="border-zinc-700 text-zinc-500 hover:text-zinc-300 text-xs font-['Share_Tech_Mono',monospace]">
          <Download className="w-3 h-3 mr-1" /> Export CSV
        </Button>
      </div>

      {/* ─── Flash Progress Bar (visible during flash operations) ──── */}
      {flashProgress.stage !== 'idle' && (
        <div className="px-4 py-2 border-b border-zinc-800/50 bg-gradient-to-r from-zinc-900/50 to-red-950/20">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-4 h-4 text-red-500 animate-pulse" />
            <span className="text-xs font-['Bebas_Neue',sans-serif] tracking-wider text-red-400">FLASH OPERATION DETECTED</span>
            <div className="flex-1" />
            <span className={`text-xs font-['Share_Tech_Mono',monospace] font-bold ${FLASH_STAGE_LABELS[flashProgress.stage]?.color || 'text-zinc-400'}`}>
              {FLASH_STAGE_LABELS[flashProgress.stage]?.label || flashProgress.stage.toUpperCase()}
            </span>
          </div>

          {/* Progress steps */}
          <div className="flex items-center gap-1 mt-2">
            {Object.entries(FLASH_STAGE_LABELS).filter(([k]) => k !== 'idle').map(([key, info]) => {
              const currentStep = FLASH_STAGE_LABELS[flashProgress.stage]?.step || 0;
              const isActive = info.step === currentStep;
              const isComplete = info.step < currentStep;
              return (
                <div key={key} className="flex items-center gap-1 flex-1">
                  <div className={`h-1.5 flex-1 rounded-full transition-colors ${
                    isComplete ? 'bg-green-500' :
                    isActive ? 'bg-red-500 animate-pulse' :
                    'bg-zinc-800'
                  }`} />
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4 mt-1.5 text-[10px] font-['Share_Tech_Mono',monospace] text-zinc-500">
            {flashProgress.currentModule && <span>MODULE: {flashProgress.currentModule}</span>}
            {flashProgress.blocksTransferred > 0 && <span>BLOCKS: {flashProgress.blocksTransferred}</span>}
            {flashProgress.totalBytes > 0 && <span>BYTES: {flashProgress.totalBytes.toLocaleString()}</span>}
            {flashProgress.errors.length > 0 && (
              <span className="text-red-400">ERRORS: {flashProgress.errors.length}</span>
            )}
          </div>
        </div>
      )}

      {/* ─── Main Content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left: Arb ID list / filter panel */}
        <div className="w-56 border-r border-zinc-800/50 overflow-y-auto bg-zinc-950/50">
          <div className="px-3 py-2 border-b border-zinc-800/50">
            <span className="text-xs font-['Share_Tech_Mono',monospace] text-zinc-500">
              ARBITRATION IDs ({arbIdStats.size})
            </span>
          </div>
          {sortedStats.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-zinc-600">
              {status === 'monitoring' ? 'Waiting for frames...' : 'Start capture to see IDs'}
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/30">
              {sortedStats.map(stat => (
                <div key={stat.arbId}
                  className={`px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800/30 cursor-pointer transition-colors ${
                    hiddenArbIds.has(stat.arbId) ? 'opacity-40' : ''
                  } ${selectedFramesForKnox.has(stat.arbId) ? 'bg-red-900/20 border-l-2 border-red-500' : ''}`}
                  onClick={() => toggleArbIdVisibility(stat.arbId)}
                  onDoubleClick={(e) => { e.preventDefault(); toggleFrameForKnox(stat.arbId); }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-['Share_Tech_Mono',monospace] text-xs text-red-400">
                        {formatArbId(stat.arbId)}
                      </span>
                      {stat.moduleAcronym && (
                        <span className="text-[10px] text-zinc-500 truncate">
                          {stat.moduleAcronym}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-600 font-['Share_Tech_Mono',monospace]">
                      <span>{stat.count.toLocaleString()}</span>
                      <span>{stat.rateHz.toFixed(1)} Hz</span>
                    </div>
                  </div>
                  {selectedFramesForKnox.has(stat.arbId) ? (
                    <Brain className="w-3 h-3 text-red-400 flex-shrink-0" />
                  ) : hiddenArbIds.has(stat.arbId) ? (
                    <EyeOff className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                  ) : (
                    <Eye className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Knox selection hint */}
          {sortedStats.length > 0 && (
            <div className="px-3 py-2 border-t border-zinc-800/50">
              <p className="text-[10px] text-zinc-600 leading-tight">
                Double-click IDs to select for Knox analysis.
                {selectedFramesForKnox.size > 0 && (
                  <span className="text-red-400"> {selectedFramesForKnox.size} selected</span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Right: Frame display */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {viewMode === 'live' && (
            <>
              <div className="flex items-center justify-end gap-2 px-3 py-1 border-b border-zinc-800/50 bg-zinc-900/20 text-[10px] font-['Share_Tech_Mono',monospace]">
                <span className="text-zinc-500">LIVE</span>
                <select
                  value={liveDisplayMode}
                  onChange={e => setLiveDisplayMode(e.target.value as 'scroll' | 'overwrite')}
                  className="rounded border border-zinc-700 bg-zinc-950 py-0.5 pl-1.5 pr-5 text-[10px] text-zinc-300"
                >
                  <option value="scroll">Scroll stream</option>
                  <option value="overwrite">Overwrite by ID</option>
                </select>
              </div>
              {/* Column headers (same flex + gap as rows; no toolbar here — avoids column shift) */}
              <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900/30 border-b border-zinc-800/50 text-[10px] font-['Share_Tech_Mono',monospace] text-zinc-600">
                <span className="w-16 shrink-0">{liveDisplayMode === 'overwrite' ? 'COUNT' : '#'}</span>
                <span className="w-[13.5rem] shrink-0">TIME (LOCAL)</span>
                {liveDisplayMode === 'overwrite' && (
                  <button
                    type="button"
                    onClick={() => toggleOverwriteColumnSort('dt')}
                    title="Sort by inter-frame time (Δt)"
                    className={`w-24 shrink-0 flex items-center gap-0.5 text-left hover:text-zinc-400 ${
                      overwriteLiveSort.key === 'dt' ? 'text-zinc-400' : ''
                    }`}
                  >
                    Δt
                    {overwriteLiveSort.key === 'dt' ? (
                      overwriteLiveSort.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-40" />
                    )}
                  </button>
                )}
                {liveDisplayMode === 'overwrite' ? (
                  <button
                    type="button"
                    onClick={() => toggleOverwriteColumnSort('arbId')}
                    title="Sort by arbitration ID"
                    className={`w-[4.75rem] shrink-0 flex items-center gap-0.5 text-left hover:text-zinc-400 ${
                      overwriteLiveSort.key === 'arbId' ? 'text-zinc-400' : ''
                    }`}
                  >
                    ARB ID
                    {overwriteLiveSort.key === 'arbId' ? (
                      overwriteLiveSort.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-40" />
                    )}
                  </button>
                ) : (
                  <span className="w-[4.75rem] shrink-0">ARB ID</span>
                )}
                <span className="w-20 shrink-0">MODULE</span>
                <span className="w-8 shrink-0">DLC</span>
                <span className="min-w-0 flex-1">DATA (HEX)</span>
                {showAscii && <span className="w-20 shrink-0">ASCII</span>}
                <span className="w-12 shrink-0">DIR</span>
                <span className="w-48 shrink-0 min-w-0 truncate">DECODE</span>
              </div>

              {/* Frame list */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
                {liveTableFrames.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-600">
                    {status === 'monitoring' ? (
                      <>
                        <Radio className="w-8 h-8 mb-3 animate-pulse text-red-500/50" />
                        <span className="text-sm">Listening for CAN frames...</span>
                        <span className="text-xs mt-1">Make sure the vehicle ignition is ON</span>
                      </>
                    ) : status === 'connected' ? (
                      <>
                        <Zap className="w-8 h-8 mb-3 text-zinc-700" />
                        <span className="text-sm">Bridge connected. Click "Start Capture" to begin.</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-8 h-8 mb-3 text-zinc-700" />
                        <span className="text-sm">Connect to the PCAN bridge to start sniffing.</span>
                        <span className="text-xs mt-1 text-zinc-700">
                          Click "Check Bridge" to verify your VOP Bridge is running.
                        </span>
                        {bridgeAvailable === false && (
                          <span className="text-xs mt-2 text-red-400/70">
                            Bridge not detected. Make sure the VOP Bridge installer is running.
                          </span>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  liveTableFrames.map((frame, idx) => {
                    const stat = arbIdStats.get(frame.arbId);
                    const hasFlash = frame.flashDecode?.isFlash;
                    const isNegative = frame.flashDecode?.type === 'negative_response';
                    const rowKey = liveDisplayMode === 'overwrite' ? frame.arbId : idx;
                    return (
                      <div key={rowKey}
                        className={`flex items-center gap-2 px-3 py-0.5 text-[11px] font-['Share_Tech_Mono',monospace] hover:bg-zinc-800/30 border-b border-zinc-900/30 ${
                          frame.isError ? 'bg-red-900/20 text-red-400' :
                          isNegative ? 'bg-red-900/15' :
                          hasFlash ? 'bg-yellow-900/10' : ''
                        }`}>
                        <span className="w-16 shrink-0 text-zinc-600">
                          {liveDisplayMode === 'overwrite' ? (stat?.count ?? frame.frameNumber) : frame.frameNumber}
                        </span>
                        <span className="w-[13.5rem] shrink-0 text-zinc-500 tabular-nums truncate" title={new Date(frame.timestamp).toISOString()}>
                          {formatFrameTimestamp(frame.timestamp)}
                        </span>
                        {liveDisplayMode === 'overwrite' && (
                          <span
                            className="w-24 shrink-0 text-zinc-500 tabular-nums"
                            title="Time since the previous frame with the same arbitration ID"
                          >
                            {frame.cycleTimeMs != null ? formatInterFrameMs(frame.cycleTimeMs) : '—'}
                          </span>
                        )}
                        <span className="w-[4.75rem] shrink-0 text-red-400">{formatArbId(frame.arbId)}</span>
                        <span className="w-20 shrink-0 text-zinc-500 truncate">{frame.moduleAcronym || '—'}</span>
                        <span className="w-8 shrink-0 text-zinc-600">{frame.dlc}</span>
                        <span className="min-w-0 flex-1 text-zinc-300">
                          {frame.data.map((byte, bi) => {
                            const changed = frame.payloadChangedBytes?.has(bi) ?? false;
                            return (
                              <span
                                key={bi}
                                className={
                                  changed
                                    ? 'rounded px-0.5 bg-amber-500/30 text-amber-100 font-semibold'
                                    : ''
                                }
                              >
                                {formatHexByte(byte)}{bi < frame.data.length - 1 ? ' ' : ''}
                              </span>
                            );
                          })}
                        </span>
                        {showAscii && (
                          <span className="w-20 shrink-0 text-zinc-600">{formatAsciiData(frame.data)}</span>
                        )}
                        <span className={`w-12 shrink-0 text-[10px] ${
                          frame.direction === 'request' ? 'text-blue-400' :
                          frame.direction === 'response' ? 'text-green-400' :
                          'text-zinc-600'
                        }`}>
                          {frame.direction === 'request' ? 'REQ' :
                           frame.direction === 'response' ? 'RSP' : 'BC'}
                        </span>
                        {/* Live flash decode column */}
                        <span className={`w-48 shrink-0 min-w-0 text-[10px] truncate ${
                          isNegative ? 'text-red-400' :
                          hasFlash ? 'text-yellow-400' :
                          frame.flashDecode ? 'text-cyan-400' :
                          'text-zinc-700'
                        }`}>
                          {frame.flashDecode?.description || '—'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Flash frame count indicator */}
              {flashFrameCount > 0 && (
                <div className="px-3 py-1 bg-yellow-900/10 border-t border-yellow-900/30 text-[10px] font-['Share_Tech_Mono',monospace] text-yellow-400 flex items-center gap-2">
                  <Shield className="w-3 h-3" />
                  <span>{flashFrameCount} UDS/flash frames decoded in view</span>
                </div>
              )}
            </>
          )}

          {viewMode === 'stats' && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sortedStats.map(stat => (
                  <Card key={stat.arbId}
                    className="bg-zinc-900/50 border-zinc-800/50 p-3 hover:border-red-900/30 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-['Share_Tech_Mono',monospace] text-sm text-red-400 font-bold">
                          {formatArbId(stat.arbId)}
                        </span>
                        {stat.moduleAcronym && (
                          <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">
                            {stat.moduleAcronym}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-zinc-500 font-['Share_Tech_Mono',monospace]">
                        {stat.rateHz.toFixed(1)} Hz
                      </span>
                    </div>
                    {stat.moduleName && (
                      <div className="text-xs text-zinc-500 mb-2">{stat.moduleName}</div>
                    )}
                    <div className="font-['Share_Tech_Mono',monospace] text-xs text-zinc-400 bg-zinc-950/50 rounded px-2 py-1">
                      {stat.lastData.map((byte, bi) => (
                        <span key={bi} className={stat.changedBytes.has(bi) ? 'text-yellow-400 font-bold' : ''}>
                          {formatHexByte(byte)}{bi < stat.lastData.length - 1 ? ' ' : ''}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-2 text-[10px] text-zinc-600 font-['Share_Tech_Mono',monospace]">
                      <span>{stat.count.toLocaleString()} frames</span>
                      <span>
                        {stat.changedBytes.size > 0 && (
                          <span className="text-yellow-500">{stat.changedBytes.size} bytes changing</span>
                        )}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
              {sortedStats.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 text-zinc-600">
                  <BarChart3 className="w-8 h-8 mb-3 text-zinc-700" />
                  <span className="text-sm">No statistics yet. Start a capture to see ID breakdown.</span>
                </div>
              )}
            </div>
          )}

          {viewMode === 'decode' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Knox AI Analysis Card */}
              <Card className="bg-zinc-900/50 border-zinc-800/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Brain className="w-6 h-6 text-red-500" />
                  <div className="flex-1">
                    <h3 className="font-['Bebas_Neue',sans-serif] text-lg tracking-wider text-red-400">
                      ASK KNOX
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Knox AI analyzes captured CAN frames, identifies modules, decodes flash operations, and explains bus activity.
                    </p>
                  </div>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px] font-['Share_Tech_Mono',monospace]">
                    {activeProtocol.toUpperCase()} MODE
                  </Badge>
                </div>

                {/* Question input */}
                <div className="flex gap-2 mb-4">
                  <Textarea
                    value={knoxQuestion}
                    onChange={e => setKnoxQuestion(e.target.value)}
                    placeholder="Ask Knox about the captured frames... (e.g., 'What modules are on this bus?', 'Is there a flash in progress?', 'Decode the J1939 PGNs')"
                    className="flex-1 min-h-[60px] max-h-[120px] text-xs bg-zinc-950/50 border-zinc-800 text-zinc-300 font-['Share_Tech_Mono',monospace] resize-y"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        askKnox();
                      }
                    }}
                  />
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      onClick={() => askKnox()}
                      disabled={knoxMutation.isPending || arbIdStats.size === 0}
                      className="bg-red-900/50 border border-red-700 text-red-400 hover:bg-red-800/50 font-['Share_Tech_Mono',monospace] text-xs h-8"
                    >
                      {knoxMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <Brain className="w-3.5 h-3.5 mr-1" />
                          Ask Knox
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => askKnox('Identify all modules on the bus and decode their data. Highlight any flash or calibration operations.')}
                      disabled={knoxMutation.isPending || arbIdStats.size === 0}
                      className="border-zinc-700 text-zinc-500 hover:text-zinc-300 text-[10px] h-6"
                    >
                      <Cpu className="w-3 h-3 mr-1" /> Auto-Analyze
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => askKnox('Detect and explain any flash/calibration write operations. What stage is the flash at? What ECU is being programmed?')}
                      disabled={knoxMutation.isPending || arbIdStats.size === 0}
                      className="border-zinc-700 text-zinc-500 hover:text-zinc-300 text-[10px] h-6"
                    >
                      <Shield className="w-3 h-3 mr-1" /> Flash Detect
                    </Button>
                  </div>
                </div>

                {/* Selected frames indicator */}
                {selectedFramesForKnox.size > 0 && (
                  <div className="flex items-center gap-2 mb-3 px-2 py-1.5 bg-red-900/20 rounded border border-red-900/30">
                    <Brain className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-xs text-red-400 font-['Share_Tech_Mono',monospace]">
                      Analyzing {selectedFramesForKnox.size} selected IDs: {Array.from(selectedFramesForKnox).map(id => formatArbId(id)).join(', ')}
                    </span>
                    <button onClick={() => setSelectedFramesForKnox(new Set())} className="text-zinc-500 hover:text-zinc-300 text-xs ml-auto">
                      Clear
                    </button>
                  </div>
                )}

                {/* Knox Analysis Result */}
                {knoxAnalysis && (
                  <div className="bg-zinc-950/50 rounded-lg border border-zinc-800/50 p-4 mt-2">
                    <div className="flex items-center gap-2 mb-3">
                      <Brain className="w-4 h-4 text-red-500" />
                      <span className="text-xs font-['Bebas_Neue',sans-serif] tracking-wider text-red-400">KNOX ANALYSIS</span>
                    </div>
                    <div className="text-xs text-zinc-300 leading-relaxed prose prose-invert prose-xs max-w-none">
                      <Streamdown>{knoxAnalysis}</Streamdown>
                    </div>
                  </div>
                )}

                {/* Loading state */}
                {knoxMutation.isPending && (
                  <div className="flex items-center justify-center py-8 gap-3">
                    <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
                    <span className="text-sm text-zinc-400">Knox is analyzing {arbIdStats.size} arbitration IDs...</span>
                  </div>
                )}
              </Card>

              {/* Knox Conversational Chat */}
              <Card className="bg-zinc-900/50 border-zinc-800/50">
                <button
                  onClick={() => setKnoxChatOpen(!knoxChatOpen)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-zinc-800/20 transition-colors"
                >
                  <Send className="w-5 h-5 text-red-500" />
                  <div className="flex-1 text-left">
                    <h3 className="font-['Bebas_Neue',sans-serif] text-lg tracking-wider text-red-400">
                      CHAT WITH KNOX
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Have a conversation about what's happening on the bus. Knox sees your live frames.
                    </p>
                  </div>
                  {knoxChatMessages.length > 0 && (
                    <Badge variant="outline" className="border-red-800 text-red-400 text-[10px]">
                      {knoxChatMessages.length} msgs
                    </Badge>
                  )}
                  {knoxChatOpen ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                </button>

                {knoxChatOpen && (
                  <div className="border-t border-zinc-800/50">
                    {/* Chat messages */}
                    <div
                      ref={knoxChatScrollRef}
                      className="max-h-[400px] overflow-y-auto p-4 space-y-3"
                    >
                      {knoxChatMessages.length === 0 && (
                        <div className="text-center py-8">
                          <Brain className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                          <p className="text-xs text-zinc-600">Ask Knox anything about the CAN bus activity.</p>
                          <p className="text-xs text-zinc-700 mt-1">Knox has live access to your captured frames and can reason across data, specs, and real-world experience.</p>
                        </div>
                      )}
                      {knoxChatMessages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] ${msg.role === 'user' ? '' : 'space-y-0'}`}>
                            <div className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                              msg.role === 'user'
                                ? 'bg-red-900/30 border border-red-800/30 text-zinc-200'
                                : 'bg-zinc-950/70 border border-zinc-800/30 text-zinc-300'
                            }`}>
                              {msg.role === 'assistant' ? (
                                <div className="prose prose-invert prose-xs max-w-none">
                                  <Streamdown>{msg.content}</Streamdown>
                                </div>
                              ) : msg.content}
                            </div>
                            {msg.role === 'assistant' && msg.knoxMeta && (
                              <KnoxConfidenceDashboard metadata={msg.knoxMeta as any} />
                            )}
                          </div>
                        </div>
                      ))}
                      {knoxChatMutation.isPending && (
                        <div className="flex justify-start">
                          <div className="bg-zinc-950/70 border border-zinc-800/30 rounded-lg px-3 py-2 flex items-center gap-2">
                            <Loader2 className="w-3 h-3 text-red-500 animate-spin" />
                            <span className="text-xs text-zinc-500">Knox is thinking...</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Chat input */}
                    <div className="flex gap-2 p-3 border-t border-zinc-800/30">
                      <Input
                        value={knoxChatInput}
                        onChange={e => setKnoxChatInput(e.target.value)}
                        placeholder="Ask Knox about the bus..."
                        className="flex-1 text-xs bg-zinc-950/50 border-zinc-800 text-zinc-300 font-['Share_Tech_Mono',monospace] h-8"
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendKnoxChat();
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={sendKnoxChat}
                        disabled={knoxChatMutation.isPending || !knoxChatInput.trim()}
                        className="bg-red-900/50 border border-red-700 text-red-400 hover:bg-red-800/50 h-8 px-3"
                      >
                        {knoxChatMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>

              {/* Module Map */}
              <Card className="bg-zinc-900/50 border-zinc-800/50 p-4">
                <h4 className="text-xs font-['Share_Tech_Mono',monospace] text-zinc-500 mb-3">DISCOVERED MODULES</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {sortedStats
                    .filter(s => s.moduleAcronym)
                    .map(stat => (
                      <div key={stat.arbId}
                        className={`flex items-center gap-2 bg-zinc-950/50 rounded px-2 py-1.5 cursor-pointer transition-colors ${
                          selectedFramesForKnox.has(stat.arbId) ? 'ring-1 ring-red-500' : 'hover:bg-zinc-800/30'
                        }`}
                        onClick={() => toggleFrameForKnox(stat.arbId)}>
                        <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs text-red-400 font-['Share_Tech_Mono',monospace]">
                            {formatArbId(stat.arbId)} — {stat.moduleAcronym}
                          </div>
                          <div className="text-[10px] text-zinc-600 truncate">{stat.moduleName}</div>
                        </div>
                      </div>
                    ))}
                </div>

                {/* Unknown IDs */}
                {sortedStats.filter(s => !s.moduleAcronym).length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-xs font-['Share_Tech_Mono',monospace] text-zinc-500 mb-2">
                      UNKNOWN IDs ({sortedStats.filter(s => !s.moduleAcronym).length})
                    </h4>
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                      {sortedStats
                        .filter(s => !s.moduleAcronym)
                        .map(stat => (
                          <div key={stat.arbId}
                            className={`flex items-center gap-2 bg-zinc-950/50 rounded px-2 py-1.5 cursor-pointer transition-colors ${
                              selectedFramesForKnox.has(stat.arbId) ? 'ring-1 ring-red-500' : 'hover:bg-zinc-800/30'
                            }`}
                            onClick={() => toggleFrameForKnox(stat.arbId)}>
                            <XCircle className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="text-xs text-zinc-400 font-['Share_Tech_Mono',monospace]">
                                {formatArbId(stat.arbId)}
                              </div>
                              <div className="text-[10px] text-zinc-600">
                                {stat.rateHz.toFixed(0)} Hz · {stat.count} frames
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                    <p className="text-xs text-zinc-600 mt-2">
                      Click unknown IDs to select them, then ask Knox to identify them based on data patterns.
                    </p>
                  </div>
                )}

                {sortedStats.length === 0 && (
                  <div className="text-center py-8 text-zinc-600">
                    <Brain className="w-8 h-8 mx-auto mb-3 text-zinc-700" />
                    <p className="text-sm">Capture some frames first, then switch here for AI analysis.</p>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* ─── Status Bar ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-1 border-t border-zinc-800/50 bg-zinc-950/50 text-[10px] font-['Share_Tech_Mono',monospace] text-zinc-600">
        <span>BRIDGE: {bridgeUrl} {bridgeAvailable === true ? '✔' : bridgeAvailable === false ? '✘' : ''}</span>
        <span>STATUS: {status.toUpperCase()}</span>
        <span className={PROTOCOL_OPTIONS.find(p => p.value === activeProtocol)?.color.split(' ')[0] || 'text-zinc-400'}>
          PROTO: {activeProtocol.toUpperCase()}
        </span>
        {totalFrames > 0 && (
          <>
            <span>CAPTURED: {totalFrames.toLocaleString()}</span>
            <span>VISIBLE: {liveTableFrames.length.toLocaleString()}</span>
            <span>UNIQUE IDs: {arbIdStats.size}</span>
            <span>HIDDEN: {hiddenArbIds.size}</span>
          </>
        )}
        {flashProgress.stage !== 'idle' && (
          <span className="text-yellow-400">FLASH: {flashProgress.stage.toUpperCase()}</span>
        )}
        {isPaused && <span className="text-yellow-500">FROZEN</span>}
      </div>
    </div>
  );
}
