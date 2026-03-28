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
 *   - AI-powered frame analysis (ask Erika about unknown frames)
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Radio, Square, Pause, Play, Trash2, Download, Filter, Search,
  Activity, Wifi, WifiOff, Eye, EyeOff, Zap, Brain, BarChart3,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle, XCircle
} from 'lucide-react';
import { lookupModule, ALL_KNOWN_MODULES, type KnownModule } from '@/lib/moduleScanner';

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

// Known CAN ID ranges for direction detection
const isRequestId = (id: number) => id >= 0x700 && id <= 0x7DF;
const isResponseId = (id: number) => (id >= 0x7E8 && id <= 0x7EF) || (id >= 0x708 && id <= 0x7DF && (id & 0x08) !== 0);

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

function formatAsciiData(data: number[]): string {
  return data.map(b => (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.').join('');
}

function identifyModule(arbId: number): { name: string; acronym: string } | null {
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
  if (arbId === 0x7DF) return 'broadcast';
  if (isRequestId(arbId)) return 'request';
  if (isResponseId(arbId)) return 'response';
  // Non-diagnostic CAN IDs (< 0x700) are typically broadcast/periodic
  return 'broadcast';
}

function exportFramesToCSV(frames: CapturedFrame[]): string {
  const header = 'Frame#,Timestamp,ArbID,ArbID_Hex,DLC,Data_Hex,Data_ASCII,Module,Direction\n';
  const rows = frames.map(f => {
    const hex = formatHexData(f.data);
    const ascii = formatAsciiData(f.data);
    return `${f.frameNumber},${f.timestamp.toFixed(6)},${f.arbId},${formatArbId(f.arbId)},${f.dlc},"${hex}","${ascii}",${f.moduleAcronym || 'Unknown'},${f.direction || 'unknown'}`;
  });
  return header + rows.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function IntelliSpy() {
  // Connection state
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [bridgeUrl, setBridgeUrl] = useState('wss://localhost:8766');
  const wsRef = useRef<WebSocket | null>(null);

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

  // Refs for performance
  const frameBufferRef = useRef<CapturedFrame[]>([]);
  const statsRef = useRef<Map<number, ArbIdStats>>(new Map());
  const frameCountRef = useRef(0);
  const pausedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const updateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep paused ref in sync
  useEffect(() => { pausedRef.current = isPaused; }, [isPaused]);

  // ─── WebSocket Connection ──────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');

    const urlsToTry = ['wss://localhost:8766', 'ws://localhost:8765'];
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

        break;
      } catch {
        continue;
      }
    }

    if (!connected) {
      setStatus('error');
    }
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      // Stop monitor first
      if (status === 'monitoring') {
        wsRef.current.send(JSON.stringify({ type: 'stop_monitor' }));
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
    stopStatsTimer();
  }, [status]);

  // ─── Monitor Control ──────────────────────────────────────────────────

  const startMonitor = useCallback((filterIds?: number[]) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const msg: Record<string, unknown> = { type: 'start_monitor' };
    if (filterIds && filterIds.length > 0) {
      msg.arb_ids = filterIds;
    }

    wsRef.current.send(JSON.stringify(msg));
    setStatus('monitoring');
    setCaptureStartTime(Date.now());
    frameCountRef.current = 0;
    startStatsTimer();
  }, []);

  const stopMonitor = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'stop_monitor' }));
    setStatus('connected');
    stopStatsTimer();
  }, []);

  // ─── Frame Processing ─────────────────────────────────────────────────

  const handleBridgeMessage = useCallback((msg: Record<string, unknown>) => {
    if (msg.type === 'bus_frame') {
      const arbId = msg.arb_id as number;
      const data = msg.data as number[];
      const timestamp = msg.timestamp as number;
      const frameNumber = msg.frame_number as number;

      // Identify module
      const moduleInfo = identifyModule(arbId);
      const direction = detectDirection(arbId);

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
      };

      frameCountRef.current++;

      // Update stats
      const stats = statsRef.current;
      const existing = stats.get(arbId);
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
        frameBufferRef.current.push(frame);
        if (frameBufferRef.current.length > MAX_CAPTURED_FRAMES) {
          frameBufferRef.current = frameBufferRef.current.slice(-MAX_CAPTURED_FRAMES);
        }
      }
    } else if (msg.type === 'monitor_started') {
      setStatus('monitoring');
    } else if (msg.type === 'monitor_stopped') {
      setStatus('connected');
    }
  }, []);

  // ─── Stats Timer (batch UI updates) ───────────────────────────────────

  const startStatsTimer = useCallback(() => {
    if (updateTimerRef.current) return;
    updateTimerRef.current = setInterval(() => {
      // Batch update frames
      setFrames([...frameBufferRef.current.slice(-FRAME_DISPLAY_LIMIT)]);
      setTotalFrames(frameCountRef.current);
      // Batch update stats
      setArbIdStats(new Map(statsRef.current));
    }, STATS_UPDATE_INTERVAL);
  }, []);

  const stopStatsTimer = useCallback(() => {
    if (updateTimerRef.current) {
      clearInterval(updateTimerRef.current);
      updateTimerRef.current = null;
    }
    // Final update
    setFrames([...frameBufferRef.current.slice(-FRAME_DISPLAY_LIMIT)]);
    setTotalFrames(frameCountRef.current);
    setArbIdStats(new Map(statsRef.current));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStatsTimer();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current && viewMode === 'live') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [frames, autoScroll, viewMode]);

  // ─── Actions ──────────────────────────────────────────────────────────

  const clearCapture = useCallback(() => {
    frameBufferRef.current = [];
    statsRef.current.clear();
    frameCountRef.current = 0;
    setFrames([]);
    setArbIdStats(new Map());
    setTotalFrames(0);
  }, []);

  const exportCapture = useCallback(() => {
    const csv = exportFramesToCSV(frameBufferRef.current);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intellispy_capture_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const toggleArbIdVisibility = useCallback((arbId: number) => {
    setHiddenArbIds(prev => {
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
        formatHexData(f.data).toLowerCase().includes(lower)
      );
    }

    return result;
  }, [frames, hiddenArbIds, showOnlyDiagnostic, filterText]);

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

      {/* ─── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/50">
        {/* Connection controls */}
        {status === 'disconnected' || status === 'error' ? (
          <Button size="sm" variant="outline" onClick={connect}
            className="border-green-700 text-green-400 hover:bg-green-900/30 font-['Share_Tech_Mono',monospace] text-xs">
            <Wifi className="w-3.5 h-3.5 mr-1" /> Connect Bridge
          </Button>
        ) : status === 'connected' ? (
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
                  }`}
                  onClick={() => toggleArbIdVisibility(stat.arbId)}>
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
                  {hiddenArbIds.has(stat.arbId) ? (
                    <EyeOff className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                  ) : (
                    <Eye className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Frame display */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {viewMode === 'live' && (
            <>
              {/* Column headers */}
              <div className="flex items-center px-3 py-1 bg-zinc-900/30 border-b border-zinc-800/50 text-[10px] font-['Share_Tech_Mono',monospace] text-zinc-600">
                <span className="w-16">#</span>
                <span className="w-24">TIMESTAMP</span>
                <span className="w-16">ARB ID</span>
                <span className="w-16">MODULE</span>
                <span className="w-8">DLC</span>
                <span className="flex-1">DATA (HEX)</span>
                {showAscii && <span className="w-20">ASCII</span>}
                <span className="w-12">DIR</span>
              </div>

              {/* Frame list */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
                {filteredFrames.length === 0 ? (
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
                        <span className="text-xs mt-1 text-zinc-700">Run: python pcan_bridge.py</span>
                      </>
                    )}
                  </div>
                ) : (
                  filteredFrames.map((frame, idx) => {
                    const stat = arbIdStats.get(frame.arbId);
                    return (
                      <div key={idx}
                        className={`flex items-center px-3 py-0.5 text-[11px] font-['Share_Tech_Mono',monospace] hover:bg-zinc-800/30 border-b border-zinc-900/30 ${
                          frame.isError ? 'bg-red-900/20 text-red-400' : ''
                        }`}>
                        <span className="w-16 text-zinc-600">{frame.frameNumber}</span>
                        <span className="w-24 text-zinc-500">{frame.timestamp.toFixed(4)}</span>
                        <span className="w-16 text-red-400">{formatArbId(frame.arbId)}</span>
                        <span className="w-16 text-zinc-500 truncate">{frame.moduleAcronym || '—'}</span>
                        <span className="w-8 text-zinc-600">{frame.dlc}</span>
                        <span className="flex-1 text-zinc-300">
                          {frame.data.map((byte, bi) => {
                            const changed = stat?.changedBytes.has(bi);
                            return (
                              <span key={bi} className={changed ? 'text-yellow-400 font-bold' : ''}>
                                {formatHexByte(byte)}{bi < frame.data.length - 1 ? ' ' : ''}
                              </span>
                            );
                          })}
                        </span>
                        {showAscii && (
                          <span className="w-20 text-zinc-600">{formatAsciiData(frame.data)}</span>
                        )}
                        <span className={`w-12 text-[10px] ${
                          frame.direction === 'request' ? 'text-blue-400' :
                          frame.direction === 'response' ? 'text-green-400' :
                          'text-zinc-600'
                        }`}>
                          {frame.direction === 'request' ? 'REQ' :
                           frame.direction === 'response' ? 'RSP' : 'BC'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
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
            <div className="flex-1 overflow-y-auto p-4">
              <Card className="bg-zinc-900/50 border-zinc-800/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Brain className="w-6 h-6 text-red-500" />
                  <div>
                    <h3 className="font-['Bebas_Neue',sans-serif] text-lg tracking-wider text-red-400">
                      AI FRAME DECODER
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Select frames from the live view or stats panel, then ask Erika to analyze them.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Module map summary */}
                  <div>
                    <h4 className="text-xs font-['Share_Tech_Mono',monospace] text-zinc-500 mb-2">DISCOVERED MODULES</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {sortedStats
                        .filter(s => s.moduleAcronym)
                        .map(stat => (
                          <div key={stat.arbId}
                            className="flex items-center gap-2 bg-zinc-950/50 rounded px-2 py-1.5">
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
                  </div>

                  {/* Unknown IDs */}
                  {sortedStats.filter(s => !s.moduleAcronym).length > 0 && (
                    <div>
                      <h4 className="text-xs font-['Share_Tech_Mono',monospace] text-zinc-500 mb-2">
                        UNKNOWN IDs ({sortedStats.filter(s => !s.moduleAcronym).length})
                      </h4>
                      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {sortedStats
                          .filter(s => !s.moduleAcronym)
                          .map(stat => (
                            <div key={stat.arbId}
                              className="flex items-center gap-2 bg-zinc-950/50 rounded px-2 py-1.5">
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
                        These IDs were not found in the module database. They may be manufacturer-specific
                        broadcast messages, body electronics, or proprietary modules. Ask Erika to analyze
                        the data patterns to help identify them.
                      </p>
                    </div>
                  )}

                  {sortedStats.length === 0 && (
                    <div className="text-center py-8 text-zinc-600">
                      <Brain className="w-8 h-8 mx-auto mb-3 text-zinc-700" />
                      <p className="text-sm">Capture some frames first, then switch here for AI analysis.</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* ─── Status Bar ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-1 border-t border-zinc-800/50 bg-zinc-950/50 text-[10px] font-['Share_Tech_Mono',monospace] text-zinc-600">
        <span>BRIDGE: {bridgeUrl}</span>
        <span>STATUS: {status.toUpperCase()}</span>
        {totalFrames > 0 && (
          <>
            <span>CAPTURED: {totalFrames.toLocaleString()}</span>
            <span>VISIBLE: {filteredFrames.length.toLocaleString()}</span>
            <span>UNIQUE IDs: {arbIdStats.size}</span>
            <span>HIDDEN: {hiddenArbIds.size}</span>
          </>
        )}
        {isPaused && <span className="text-yellow-500">FROZEN</span>}
      </div>
    </div>
  );
}
