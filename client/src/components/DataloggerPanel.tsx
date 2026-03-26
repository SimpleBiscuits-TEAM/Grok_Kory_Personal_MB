/**
 * DataloggerPanel — Live OBD-II Datalogger for OBDLink EX
 * 
 * Features:
 * - WebSerial connection to OBDLink EX (ELM327/STN2xx protocol)
 * - PID selection with preset groups (Engine, Turbo, Fuel, Emissions, etc.)
 * - Real-time gauge display with live values
 * - Real-time scrolling chart
 * - Session recording with CSV export
 * - Direct handoff to Analyzer tab
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Wifi, WifiOff, Play, Square, Download, BarChart3,
  Settings, AlertCircle, CheckCircle, Loader2, Gauge,
  Activity, Zap, ChevronDown, ChevronRight, RefreshCw,
  Trash2, Terminal, Radio, Cpu
} from 'lucide-react';
import {
  OBDConnection, ConnectionState, PIDDefinition, PIDReading,
  LogSession, STANDARD_PIDS, PID_PRESETS, PIDPreset,
  exportSessionToCSV, sessionToAnalyzerCSV
} from '@/lib/obdConnection';

// ─── Styles ────────────────────────────────────────────────────────────────

const sFont = { heading: '"Bebas Neue", "Impact", sans-serif', body: '"Rajdhani", sans-serif', mono: '"Share Tech Mono", monospace' };
const sColor = {
  bg: 'oklch(0.10 0.005 260)', bgCard: 'oklch(0.13 0.006 260)',
  border: 'oklch(0.22 0.008 260)', borderLight: 'oklch(0.18 0.006 260)',
  red: 'oklch(0.52 0.22 25)', green: 'oklch(0.65 0.20 145)', blue: 'oklch(0.70 0.18 200)',
  yellow: 'oklch(0.75 0.18 60)', text: 'oklch(0.95 0.005 260)', textDim: 'oklch(0.55 0.010 260)',
  textMuted: 'oklch(0.45 0.008 260)',
};

// ─── Gauge Component ───────────────────────────────────────────────────────

function LiveGauge({ reading, pid }: { reading: PIDReading | null; pid: PIDDefinition }) {
  const value = reading?.value ?? 0;
  const range = pid.max - pid.min;
  const pct = Math.max(0, Math.min(100, ((value - pid.min) / range) * 100));
  
  // Color based on percentage
  const getColor = (p: number) => {
    if (p < 25) return sColor.blue;
    if (p < 50) return sColor.green;
    if (p < 75) return sColor.yellow;
    return sColor.red;
  };

  return (
    <div style={{
      background: sColor.bgCard, border: `1px solid ${sColor.border}`,
      borderLeft: `3px solid ${getColor(pct)}`, borderRadius: '3px',
      padding: '12px 16px', minWidth: '180px',
    }}>
      <div style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, letterSpacing: '0.08em', marginBottom: '4px', textTransform: 'uppercase' }}>
        {pid.shortName}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ fontFamily: sFont.mono, fontSize: '1.8rem', fontWeight: 700, color: sColor.text, lineHeight: 1 }}>
          {reading ? (Number.isInteger(value) ? value : value.toFixed(1)) : '---'}
        </span>
        <span style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.textDim }}>
          {pid.unit}
        </span>
      </div>
      {/* Mini bar */}
      <div style={{ marginTop: '6px', height: '3px', background: 'oklch(0.15 0.005 260)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: getColor(pct), transition: 'width 0.15s ease-out' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
        <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>{pid.min}</span>
        <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>{pid.max}{pid.unit}</span>
      </div>
    </div>
  );
}

// ─── Mini Chart (last N readings) ──────────────────────────────────────────

function MiniChart({ readings, pid, maxPoints = 100 }: { readings: PIDReading[]; pid: PIDDefinition; maxPoints?: number }) {
  const recent = readings.slice(-maxPoints);
  if (recent.length < 2) return null;

  const values = recent.map(r => r.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 300;
  const height = 60;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div style={{ background: 'oklch(0.08 0.004 260)', borderRadius: '3px', padding: '4px', overflow: 'hidden' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
        <polyline points={points} fill="none" stroke={sColor.red} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 4px 0' }}>
        <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>
          min: {min.toFixed(1)}
        </span>
        <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textDim }}>
          {pid.shortName}
        </span>
        <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>
          max: {max.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

// ─── Connection Status Badge ───────────────────────────────────────────────

function StatusBadge({ state }: { state: ConnectionState }) {
  const config: Record<ConnectionState, { color: string; icon: React.ReactNode; label: string }> = {
    disconnected: { color: sColor.textMuted, icon: <WifiOff style={{ width: 14, height: 14 }} />, label: 'DISCONNECTED' },
    connecting: { color: sColor.yellow, icon: <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />, label: 'CONNECTING...' },
    initializing: { color: sColor.yellow, icon: <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />, label: 'INITIALIZING...' },
    ready: { color: sColor.green, icon: <CheckCircle style={{ width: 14, height: 14 }} />, label: 'READY' },
    logging: { color: sColor.red, icon: <Radio style={{ width: 14, height: 14 }} />, label: 'LOGGING' },
    error: { color: 'oklch(0.60 0.20 25)', icon: <AlertCircle style={{ width: 14, height: 14 }} />, label: 'ERROR' },
  };

  const c = config[state];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: c.color, fontFamily: sFont.mono, fontSize: '0.75rem', letterSpacing: '0.08em' }}>
      {c.icon} {c.label}
    </div>
  );
}

// ─── PID Selector ──────────────────────────────────────────────────────────

function PIDSelector({
  selectedPids, onTogglePid, onApplyPreset, supportedPids, disabled
}: {
  selectedPids: Set<number>;
  onTogglePid: (pid: number) => void;
  onApplyPreset: (preset: PIDPreset) => void;
  supportedPids: Set<number> | null;
  disabled: boolean;
}) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>('engine');

  const categories = useMemo(() => {
    const cats = new Map<string, PIDDefinition[]>();
    for (const pid of STANDARD_PIDS) {
      const list = cats.get(pid.category) || [];
      list.push(pid);
      cats.set(pid.category, list);
    }
    return cats;
  }, []);

  const categoryIcons: Record<string, React.ReactNode> = {
    engine: <Cpu style={{ width: 14, height: 14 }} />,
    turbo: <Zap style={{ width: 14, height: 14 }} />,
    fuel: <Activity style={{ width: 14, height: 14 }} />,
    emissions: <AlertCircle style={{ width: 14, height: 14 }} />,
    transmission: <Settings style={{ width: 14, height: 14 }} />,
    electrical: <Zap style={{ width: 14, height: 14 }} />,
    other: <BarChart3 style={{ width: 14, height: 14 }} />,
  };

  return (
    <div>
      {/* Presets */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontFamily: sFont.heading, fontSize: '0.8rem', color: sColor.textDim, letterSpacing: '0.1em', marginBottom: '8px' }}>
          QUICK PRESETS
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {PID_PRESETS.map(preset => (
            <button
              key={preset.name}
              onClick={() => onApplyPreset(preset)}
              disabled={disabled}
              style={{
                fontFamily: sFont.body, fontSize: '0.75rem', padding: '4px 10px',
                background: 'oklch(0.15 0.008 260)', border: `1px solid ${sColor.border}`,
                borderRadius: '3px', color: sColor.text, cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!disabled) { (e.target as HTMLElement).style.borderColor = sColor.red; } }}
              onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = sColor.border; }}
              title={preset.description}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Category groups */}
      {Array.from(categories.entries()).map(([category, pids]) => (
        <div key={category} style={{ marginBottom: '4px' }}>
          <button
            onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
              padding: '6px 8px', background: 'transparent', border: 'none',
              color: sColor.text, cursor: 'pointer', fontFamily: sFont.body, fontSize: '0.8rem',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}
          >
            {expandedCategory === category ? <ChevronDown style={{ width: 12, height: 12 }} /> : <ChevronRight style={{ width: 12, height: 12 }} />}
            {categoryIcons[category] || null}
            {category}
            <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted, marginLeft: 'auto' }}>
              {pids.filter(p => selectedPids.has(p.pid)).length}/{pids.length}
            </span>
          </button>
          {expandedCategory === category && (
            <div style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {pids.map(pid => {
                const isSupported = supportedPids === null || supportedPids.has(pid.pid);
                const isSelected = selectedPids.has(pid.pid);
                return (
                  <label
                    key={pid.pid}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: isSupported ? 1 : 0.4,
                      borderRadius: '2px', background: isSelected ? 'oklch(0.15 0.01 25 / 0.3)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onTogglePid(pid.pid)}
                      disabled={disabled || !isSupported}
                      style={{ accentColor: sColor.red }}
                    />
                    <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted, minWidth: '32px' }}>
                      0x{pid.pid.toString(16).toUpperCase().padStart(2, '0')}
                    </span>
                    <span style={{ fontFamily: sFont.body, fontSize: '0.78rem', color: sColor.text, flex: 1 }}>
                      {pid.name}
                    </span>
                    <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim }}>
                      {pid.unit}
                    </span>
                    {!isSupported && (
                      <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>N/A</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Console Log ───────────────────────────────────────────────────────────

function ConsoleLog({ logs }: { logs: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      ref={scrollRef}
      style={{
        background: 'oklch(0.06 0.003 260)', border: `1px solid ${sColor.borderLight}`,
        borderRadius: '3px', padding: '8px', maxHeight: '150px', overflowY: 'auto',
        fontFamily: sFont.mono, fontSize: '0.65rem', lineHeight: 1.6, color: sColor.textDim,
      }}
    >
      {logs.length === 0 ? (
        <span style={{ color: sColor.textMuted }}>No log entries yet. Connect to a device to begin.</span>
      ) : (
        logs.map((log, i) => (
          <div key={i} style={{ color: log.includes('ERROR') || log.includes('error') ? 'oklch(0.60 0.20 25)' : log.includes('ready') || log.includes('Ready') || log.includes('OK') ? sColor.green : sColor.textDim }}>
            <span style={{ color: sColor.textMuted }}>[{new Date().toLocaleTimeString()}]</span> {log}
          </div>
        ))
      )}
    </div>
  );
}

// ─── Completed Sessions List ───────────────────────────────────────────────

function SessionList({
  sessions, onExportCSV, onOpenInAnalyzer, onDelete
}: {
  sessions: LogSession[];
  onExportCSV: (session: LogSession) => void;
  onOpenInAnalyzer: (session: LogSession) => void;
  onDelete: (id: string) => void;
}) {
  if (sessions.length === 0) return null;

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: sColor.text, letterSpacing: '0.1em', marginBottom: '8px' }}>
        RECORDED SESSIONS
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {sessions.map(session => {
          const duration = ((session.endTime || Date.now()) - session.startTime) / 1000;
          let totalSamples = 0;
          session.readings.forEach(arr => { totalSamples += arr.length; });

          return (
            <div key={session.id} style={{
              background: sColor.bgCard, border: `1px solid ${sColor.border}`,
              borderRadius: '3px', padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.text }}>
                  {new Date(session.startTime).toLocaleString()}
                </div>
                <div style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, marginTop: '2px' }}>
                  {session.pids.map(p => p.shortName).join(', ')} · {duration.toFixed(1)}s · {totalSamples} samples
                </div>
              </div>
              <button
                onClick={() => onOpenInAnalyzer(session)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 10px', background: 'oklch(0.15 0.01 25 / 0.4)',
                  border: `1px solid ${sColor.red}`, borderRadius: '3px',
                  color: sColor.red, fontFamily: sFont.body, fontSize: '0.7rem',
                  cursor: 'pointer', letterSpacing: '0.06em',
                }}
                title="Open in Analyzer"
              >
                <BarChart3 style={{ width: 12, height: 12 }} /> ANALYZE
              </button>
              <button
                onClick={() => onExportCSV(session)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 10px', background: 'oklch(0.15 0.008 260)',
                  border: `1px solid ${sColor.border}`, borderRadius: '3px',
                  color: sColor.text, fontFamily: sFont.body, fontSize: '0.7rem',
                  cursor: 'pointer',
                }}
                title="Export CSV"
              >
                <Download style={{ width: 12, height: 12 }} /> CSV
              </button>
              <button
                onClick={() => onDelete(session.id)}
                style={{
                  padding: '4px 6px', background: 'transparent', border: 'none',
                  color: sColor.textMuted, cursor: 'pointer',
                }}
                title="Delete session"
              >
                <Trash2 style={{ width: 14, height: 14 }} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Datalogger Panel ─────────────────────────────────────────────────

export interface DataloggerPanelProps {
  onOpenInAnalyzer?: (csvData: string, filename: string) => void;
}

export default function DataloggerPanel({ onOpenInAnalyzer }: DataloggerPanelProps) {
  // Connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [vehicleInfo, setVehicleInfo] = useState<{ vin?: string; protocol?: string; voltage?: string } | null>(null);
  const [supportedPids, setSupportedPids] = useState<Set<number> | null>(null);
  const connectionRef = useRef<OBDConnection | null>(null);

  // PID selection
  const [selectedPids, setSelectedPids] = useState<Set<number>>(new Set([0x0C, 0x0D, 0x05, 0x04, 0x11])); // Engine Basics default

  // Logging state
  const [isLogging, setIsLogging] = useState(false);
  const [liveReadings, setLiveReadings] = useState<Map<number, PIDReading>>(new Map());
  const [readingHistory, setReadingHistory] = useState<Map<number, PIDReading[]>>(new Map());
  const [sampleCount, setSampleCount] = useState(0);
  const [logDuration, setLogDuration] = useState(0);
  const logStartRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sample rate
  const [sampleRateMs, setSampleRateMs] = useState(200);

  // Console logs
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);

  // Completed sessions
  const [completedSessions, setCompletedSessions] = useState<LogSession[]>([]);

  // UI state
  const [showConsole, setShowConsole] = useState(true);
  const [showPidSelector, setShowPidSelector] = useState(true);

  // WebSerial support check
  const isWebSerialSupported = useMemo(() => OBDConnection.isSupported(), []);

  // ─── Connection handlers ──────────────────────────────────────────────

  const addLog = useCallback((msg: string) => {
    setConsoleLogs(prev => [...prev.slice(-200), msg]);
  }, []);

  const handleConnect = useCallback(async () => {
    const conn = new OBDConnection({
      protocol: '6',        // ISO 15765-4 CAN 11bit/500k (GM)
      adaptiveTiming: 2,    // Aggressive for fast logging
      echo: false,
      headers: false,
      spaces: false,
    });

    conn.on('stateChange', (e) => {
      setConnectionState(e.data as ConnectionState);
    });

    conn.on('log', (e) => {
      if (e.message) addLog(e.message);
    });

    conn.on('error', (e) => {
      if (e.message) addLog(`ERROR: ${e.message}`);
    });

    conn.on('vehicleInfo', (e) => {
      const info = e.data as { vin?: string; protocol?: string; voltage?: string };
      setVehicleInfo(info);
      addLog(`Vehicle: VIN=${info.vin || 'N/A'}, Protocol=${info.protocol || 'N/A'}, Voltage=${info.voltage || 'N/A'}`);
    });

    connectionRef.current = conn;
    addLog('Connecting to OBDLink device...');

    const success = await conn.connect();
    if (success) {
      setSupportedPids(conn.getSupportedPids());
      addLog(`Connected! ${conn.getAvailablePids().length} PIDs available`);
    }
  }, [addLog]);

  const handleDisconnect = useCallback(async () => {
    if (isLogging) {
      handleStopLogging();
    }
    if (connectionRef.current) {
      await connectionRef.current.disconnect();
      connectionRef.current = null;
    }
    setVehicleInfo(null);
    setSupportedPids(null);
    addLog('Disconnected');
  }, [isLogging, addLog]);

  // ─── Logging handlers ────────────────────────────────────────────────

  const handleStartLogging = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn || connectionState !== 'ready') return;

    const pidsToLog = STANDARD_PIDS.filter(p => selectedPids.has(p.pid));
    if (pidsToLog.length === 0) {
      addLog('ERROR: No PIDs selected for logging');
      return;
    }

    // Reset live data
    setLiveReadings(new Map());
    setReadingHistory(new Map());
    setSampleCount(0);
    setLogDuration(0);
    logStartRef.current = Date.now();

    // Start duration timer
    durationIntervalRef.current = setInterval(() => {
      setLogDuration(Math.floor((Date.now() - logStartRef.current) / 1000));
    }, 1000);

    setIsLogging(true);
    addLog(`Starting log: ${pidsToLog.map(p => p.shortName).join(', ')} @ ${sampleRateMs}ms`);

    try {
      await conn.startLogging(pidsToLog, sampleRateMs, (readings) => {
        // Update live readings
        const newLive = new Map<number, PIDReading>();
        for (const r of readings) {
          newLive.set(r.pid, r);
        }
        setLiveReadings(newLive);

        // Append to history
        setReadingHistory(prev => {
          const next = new Map(prev);
          for (const r of readings) {
            const arr = next.get(r.pid) || [];
            arr.push(r);
            // Keep last 1000 readings per PID for chart display
            if (arr.length > 1000) arr.shift();
            next.set(r.pid, [...arr]);
          }
          return next;
        });

        setSampleCount(prev => prev + 1);
      });
    } catch (err) {
      addLog(`ERROR: ${err instanceof Error ? err.message : 'Failed to start logging'}`);
      setIsLogging(false);
    }
  }, [connectionState, selectedPids, sampleRateMs, addLog]);

  const handleStopLogging = useCallback(() => {
    const conn = connectionRef.current;
    if (!conn) return;

    const session = conn.stopLogging();
    setIsLogging(false);

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    if (session) {
      setCompletedSessions(prev => [session, ...prev]);
      addLog(`Session saved: ${((session.endTime! - session.startTime) / 1000).toFixed(1)}s`);
    }
  }, [addLog]);

  // ─── PID selection handlers ──────────────────────────────────────────

  const handleTogglePid = useCallback((pid: number) => {
    setSelectedPids(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  }, []);

  const handleApplyPreset = useCallback((preset: PIDPreset) => {
    setSelectedPids(new Set(preset.pids));
    addLog(`Applied preset: ${preset.name}`);
  }, [addLog]);

  // ─── Export handlers ─────────────────────────────────────────────────

  const handleExportCSV = useCallback((session: LogSession) => {
    const csv = exportSessionToCSV(session);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `datalog_${new Date(session.startTime).toISOString().replace(/[:.]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('CSV exported');
  }, [addLog]);

  const handleOpenInAnalyzer = useCallback((session: LogSession) => {
    const csv = sessionToAnalyzerCSV(session);
    const filename = `datalog_${new Date(session.startTime).toISOString().replace(/[:.]/g, '-')}.csv`;
    if (onOpenInAnalyzer) {
      onOpenInAnalyzer(csv, filename);
    } else {
      // Fallback: download the analyzer-compatible CSV
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
    addLog('Session sent to Analyzer');
  }, [onOpenInAnalyzer, addLog]);

  const handleDeleteSession = useCallback((id: string) => {
    setCompletedSessions(prev => prev.filter(s => s.id !== id));
  }, []);

  // ─── Cleanup ─────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      if (connectionRef.current) {
        connectionRef.current.disconnect();
      }
    };
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────

  const activePids = STANDARD_PIDS.filter(p => selectedPids.has(p.pid));

  return (
    <div>
      {/* Header Bar */}
      <div style={{
        background: sColor.bgCard, border: `1px solid ${sColor.border}`,
        borderRadius: '3px', padding: '16px 20px', marginBottom: '16px',
        display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Gauge style={{ width: 20, height: 20, color: sColor.red }} />
          <span style={{ fontFamily: sFont.heading, fontSize: '1.2rem', letterSpacing: '0.12em', color: sColor.text }}>
            LIVE DATALOGGER
          </span>
        </div>

        <StatusBadge state={connectionState} />

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Sample Rate */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim }}>RATE:</span>
            <select
              value={sampleRateMs}
              onChange={e => setSampleRateMs(Number(e.target.value))}
              disabled={isLogging}
              style={{
                fontFamily: sFont.mono, fontSize: '0.7rem', padding: '2px 6px',
                background: 'oklch(0.10 0.005 260)', border: `1px solid ${sColor.border}`,
                borderRadius: '2px', color: sColor.text,
              }}
            >
              <option value={100}>100ms (10Hz)</option>
              <option value={200}>200ms (5Hz)</option>
              <option value={500}>500ms (2Hz)</option>
              <option value={1000}>1000ms (1Hz)</option>
            </select>
          </div>

          {/* Connect/Disconnect */}
          {connectionState === 'disconnected' || connectionState === 'error' ? (
            <button
              onClick={handleConnect}
              disabled={!isWebSerialSupported}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', background: sColor.green, border: 'none',
                borderRadius: '3px', color: 'oklch(0.10 0.005 260)',
                fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.1em',
                cursor: isWebSerialSupported ? 'pointer' : 'not-allowed',
                opacity: isWebSerialSupported ? 1 : 0.5,
              }}
            >
              <Wifi style={{ width: 14, height: 14 }} /> CONNECT
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              disabled={connectionState === 'connecting' || connectionState === 'initializing'}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', background: 'oklch(0.20 0.008 260)', border: `1px solid ${sColor.border}`,
                borderRadius: '3px', color: sColor.text,
                fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.1em',
                cursor: 'pointer',
              }}
            >
              <WifiOff style={{ width: 14, height: 14 }} /> DISCONNECT
            </button>
          )}

          {/* Start/Stop Logging */}
          {connectionState === 'ready' && !isLogging && (
            <button
              onClick={handleStartLogging}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', background: sColor.red, border: 'none',
                borderRadius: '3px', color: 'white',
                fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.1em',
                cursor: 'pointer',
              }}
            >
              <Play style={{ width: 14, height: 14 }} /> START LOG
            </button>
          )}
          {isLogging && (
            <button
              onClick={handleStopLogging}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', background: 'oklch(0.20 0.01 25)',
                border: `2px solid ${sColor.red}`, borderRadius: '3px', color: sColor.red,
                fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.1em',
                cursor: 'pointer', animation: 'pulse 2s infinite',
              }}
            >
              <Square style={{ width: 14, height: 14 }} /> STOP · {logDuration}s · {sampleCount} samples
            </button>
          )}
        </div>
      </div>

      {/* WebSerial Not Supported Warning */}
      {!isWebSerialSupported && (
        <div style={{
          background: 'oklch(0.15 0.02 25 / 0.3)', border: `1px solid oklch(0.40 0.15 25)`,
          borderRadius: '3px', padding: '16px 20px', marginBottom: '16px',
          display: 'flex', alignItems: 'flex-start', gap: '12px',
        }}>
          <AlertCircle style={{ width: 20, height: 20, color: 'oklch(0.60 0.20 25)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: sColor.text, letterSpacing: '0.08em', marginBottom: '4px' }}>
              WEBSERIAL NOT SUPPORTED
            </div>
            <div style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, lineHeight: 1.5 }}>
              Your browser does not support the WebSerial API. Please use <strong style={{ color: sColor.text }}>Google Chrome</strong> or <strong style={{ color: sColor.text }}>Microsoft Edge</strong> on desktop to connect to an OBDLink EX device. Safari and Firefox do not support WebSerial.
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Info Bar */}
      {vehicleInfo && (
        <div style={{
          background: 'oklch(0.12 0.01 145 / 0.2)', border: `1px solid oklch(0.30 0.10 145)`,
          borderRadius: '3px', padding: '10px 16px', marginBottom: '16px',
          display: 'flex', gap: '24px', flexWrap: 'wrap',
        }}>
          {vehicleInfo.vin && (
            <div>
              <span style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>VIN</span>
              <div style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.text }}>{vehicleInfo.vin}</div>
            </div>
          )}
          <div>
            <span style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Protocol</span>
            <div style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.text }}>{vehicleInfo.protocol || 'Auto'}</div>
          </div>
          <div>
            <span style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Voltage</span>
            <div style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.text }}>{vehicleInfo.voltage || '---'}</div>
          </div>
          <div>
            <span style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Supported PIDs</span>
            <div style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.text }}>{supportedPids?.size || 0}</div>
          </div>
        </div>
      )}

      {/* Main Content: PID Selector + Live Data */}
      <div style={{ display: 'grid', gridTemplateColumns: showPidSelector ? '280px 1fr' : '1fr', gap: '16px' }}>
        {/* Left: PID Selector */}
        {showPidSelector && (
          <div style={{
            background: sColor.bgCard, border: `1px solid ${sColor.border}`,
            borderRadius: '3px', padding: '12px', maxHeight: '600px', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontFamily: sFont.heading, fontSize: '0.85rem', color: sColor.text, letterSpacing: '0.1em' }}>
                PID SELECTION
              </span>
              <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.red }}>
                {selectedPids.size} selected
              </span>
            </div>
            <PIDSelector
              selectedPids={selectedPids}
              onTogglePid={handleTogglePid}
              onApplyPreset={handleApplyPreset}
              supportedPids={supportedPids}
              disabled={isLogging}
            />
          </div>
        )}

        {/* Right: Live Data */}
        <div>
          {/* Toggle PID panel button */}
          <button
            onClick={() => setShowPidSelector(!showPidSelector)}
            style={{
              fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim,
              background: 'transparent', border: 'none', cursor: 'pointer',
              marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            <Settings style={{ width: 12, height: 12 }} />
            {showPidSelector ? 'Hide PID Panel' : 'Show PID Panel'}
          </button>

          {/* Live Gauges */}
          {(isLogging || liveReadings.size > 0) && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontFamily: sFont.heading, fontSize: '0.85rem', color: sColor.text, letterSpacing: '0.1em', marginBottom: '8px' }}>
                LIVE DATA
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {activePids.map(pid => (
                  <LiveGauge key={pid.pid} pid={pid} reading={liveReadings.get(pid.pid) || null} />
                ))}
              </div>
            </div>
          )}

          {/* Live Charts */}
          {readingHistory.size > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontFamily: sFont.heading, fontSize: '0.85rem', color: sColor.text, letterSpacing: '0.1em', marginBottom: '8px' }}>
                LIVE CHARTS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>
                {activePids.map(pid => {
                  const history = readingHistory.get(pid.pid) || [];
                  if (history.length < 2) return null;
                  return <MiniChart key={pid.pid} readings={history} pid={pid} />;
                })}
              </div>
            </div>
          )}

          {/* Idle state */}
          {connectionState === 'disconnected' && !isLogging && liveReadings.size === 0 && (
            <div style={{
              background: sColor.bgCard, border: `1px solid ${sColor.border}`,
              borderRadius: '3px', padding: '40px 20px', textAlign: 'center',
            }}>
              <Gauge style={{ width: 48, height: 48, color: sColor.textMuted, margin: '0 auto 16px' }} />
              <div style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: sColor.text, letterSpacing: '0.1em', marginBottom: '8px' }}>
                CONNECT YOUR OBDLINK EX
              </div>
              <div style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, lineHeight: 1.6, maxWidth: '500px', margin: '0 auto' }}>
                Plug the OBDLink EX into your vehicle's OBD-II port, connect it to your computer via USB, turn the ignition to ON (engine running or KOEO), then click <strong style={{ color: sColor.green }}>CONNECT</strong> above.
              </div>
              <div style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.textMuted, marginTop: '16px', lineHeight: 1.5 }}>
                Supported: OBDLink EX, OBDLink MX+, OBDLink SX, and other ELM327-compatible adapters via USB.
                <br />Protocol: ISO 15765-4 CAN 11-bit/500k (GM/Duramax default). Auto-detect available.
              </div>
            </div>
          )}

          {/* Ready state - no logging yet */}
          {connectionState === 'ready' && !isLogging && liveReadings.size === 0 && (
            <div style={{
              background: 'oklch(0.12 0.01 145 / 0.15)', border: `1px solid oklch(0.30 0.10 145)`,
              borderRadius: '3px', padding: '24px 20px', textAlign: 'center',
            }}>
              <CheckCircle style={{ width: 36, height: 36, color: sColor.green, margin: '0 auto 12px' }} />
              <div style={{ fontFamily: sFont.heading, fontSize: '1rem', color: sColor.text, letterSpacing: '0.1em', marginBottom: '8px' }}>
                DEVICE READY
              </div>
              <div style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, lineHeight: 1.5 }}>
                Select your PIDs from the panel on the left (or use a preset), then click <strong style={{ color: sColor.red }}>START LOG</strong> to begin recording.
              </div>
            </div>
          )}

          {/* Completed Sessions */}
          <SessionList
            sessions={completedSessions}
            onExportCSV={handleExportCSV}
            onOpenInAnalyzer={handleOpenInAnalyzer}
            onDelete={handleDeleteSession}
          />
        </div>
      </div>

      {/* Console */}
      <div style={{ marginTop: '16px' }}>
        <button
          onClick={() => setShowConsole(!showConsole)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            fontFamily: sFont.heading, fontSize: '0.8rem', color: sColor.textDim,
            letterSpacing: '0.1em', background: 'transparent', border: 'none',
            cursor: 'pointer', marginBottom: '6px',
          }}
        >
          <Terminal style={{ width: 14, height: 14 }} />
          DEVICE CONSOLE
          {showConsole ? <ChevronDown style={{ width: 12, height: 12 }} /> : <ChevronRight style={{ width: 12, height: 12 }} />}
        </button>
        {showConsole && <ConsoleLog logs={consoleLogs} />}
      </div>
    </div>
  );
}
