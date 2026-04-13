/**
 * FlashMissionControl — Full-screen flash execution UI with real-time
 * simulation OR real hardware flash (WebSocket bridge / V-OP), animated progress, CAN bus log stream,
 * countdown timer, section names, and server session recording.
 */
import { useState, useEffect, useRef, useCallback, useMemo, type RefObject } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { analyzeFlashLogForRecommendations } from '@shared/flashLogRecommendations';
import { downloadFlashSessionXlsx } from '@/lib/flashLogExcelExport';
import {
  Play, Pause, Square, AlertTriangle, CheckCircle2, XCircle,
  Radio, ArrowLeft, RotateCcw, ChevronDown, ChevronUp, Download,
  Timer, Cpu, FileSpreadsheet,
} from 'lucide-react';
import {
  type FlashPlan, type SimulatorState, type SimulatorLogEntry,
  type UserActionType,
  createSimulatorState, advanceSimulator, getAllFunFacts,
  formatBytes, formatDuration,
} from '../../../shared/pcanFlashOrchestrator';
import { type ContainerFileHeader } from '../../../shared/ecuDatabase';
import { hexToBytes } from '../../../shared/seedKeyAlgorithms';
import { PCANFlashEngine, type FlashEngineCallbacks } from '../lib/pcanFlashEngine';
import { type FlashBridgeConnection } from '../lib/flashBridgeConnection';
import { VopCan2UsbConnection } from '../lib/vopCan2UsbConnection';

// ── Props ──────────────────────────────────────────────────────────────────

interface FlashMissionControlProps {
  plan: FlashPlan;
  connectionMode: 'simulator' | 'pcan' | 'vop_usb';
  sessionUuid: string;
  onComplete: (result: 'SUCCESS' | 'FAILED' | 'ABORTED') => void;
  onBack: () => void;
  /** WebSocket bridge or V-OP USB — optional snapshot (may be stale on first paint). */
  flashBridge?: FlashBridgeConnection | null;
  /** Read at Start click — parent refs do not trigger re-renders; this fixes intermittent null snapshot. */
  flashBridgeRef?: RefObject<FlashBridgeConnection | null>;
  /** Raw container file data — required for real hardware flash */
  containerData?: ArrayBuffer | null;
  /** Parsed container header — required for real hardware flash */
  containerHeader?: ContainerFileHeader | null;
  /** Dry run mode — skips destructive commands (erase/transfer/write) */
  dryRun?: boolean;
}

// ── Phase colors ───────────────────────────────────────────────────────────

const PHASE_COLORS: Record<string, string> = {
  PRE_CHECK: 'text-blue-400', VOLTAGE_INIT: 'text-cyan-400',
  SESSION_OPEN: 'text-indigo-400', SECURITY_ACCESS: 'text-amber-400',
  PRE_FLASH: 'text-orange-400', BLOCK_TRANSFER: 'text-emerald-400',
  POST_FLASH: 'text-teal-400', VERIFICATION: 'text-green-400',
  KEY_CYCLE: 'text-yellow-400', CLEANUP: 'text-zinc-400', RECOVERY: 'text-red-400',
};

const LOG_TYPE_COLORS: Record<string, string> = {
  info: 'text-zinc-400', success: 'text-emerald-400', warning: 'text-amber-400',
  error: 'text-red-400', can_tx: 'text-cyan-300', can_rx: 'text-blue-300', nrc: 'text-red-300',
};

// ── Data stream background ─────────────────────────────────────────────────

function DataStreamBackground({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animId: number;
    const chars = '01ABCDEF';
    const columns = Math.floor(canvas.width / 14);
    const drops = new Array(columns).fill(0).map(() => Math.random() * canvas.height / 14);
    function draw() {
      if (!ctx || !canvas) return;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = active ? 'rgba(0, 255, 100, 0.15)' : 'rgba(100, 100, 100, 0.08)';
      ctx.font = '12px monospace';
      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * 14, drops[i] * 14);
        if (drops[i] * 14 > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i] += active ? 0.5 : 0.1;
      }
      animId = requestAnimationFrame(draw);
    }
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, [active]);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-30 pointer-events-none" />;
}

// ── Validation panel ───────────────────────────────────────────────────────

function ValidationPanel({ plan }: { plan: FlashPlan }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        {[
          ['ECU', plan.ecuName], ['Mode', plan.flashMode.replace('_', ' ')],
          ['Blocks', String(plan.totalBlocks)], ['Data', formatBytes(plan.totalBytes)],
          ['Security', `Level ${plan.securityInfo.seedLevel}`], ['Est. Time', formatDuration(plan.estimatedTimeMs)],
        ].map(([label, value]) => (
          <div key={label} className="p-2 rounded bg-zinc-800/50 border border-zinc-700">
            <span className="text-zinc-500">{label}</span>
            <div className="text-zinc-200">{value}</div>
          </div>
        ))}
      </div>
      {plan.validationErrors.length > 0 && (
        <div className="p-2 rounded border border-red-500/30 bg-red-500/5 text-red-400 text-xs font-mono">
          {plan.validationErrors.map((e, i) => <div key={i}>⚠ {e}</div>)}
        </div>
      )}
      {plan.warnings && plan.warnings.length > 0 && (
        <div className="p-2 rounded border border-amber-500/30 bg-amber-500/5 text-amber-400 text-xs font-mono">
          {plan.warnings.map((w, i) => <div key={i}>ℹ {w}</div>)}
        </div>
      )}
    </div>
  );
}

// ── Key Cycle Prompt ───────────────────────────────────────────────────────

interface KeyCyclePromptState {
  type: UserActionType;
  prompt: string;
  autoConfirm: boolean;
}

function KeyCyclePrompt({ state, countdown, onConfirm }: {
  state: KeyCyclePromptState;
  countdown: number;
  onConfirm: () => void;
}) {
  const isKeyOff = state.type === 'KEY_OFF';
  const isKeyOn = state.type === 'KEY_ON';
  const isKeyOnStart = state.type === 'KEY_ON_START';
  const isKeyAction = isKeyOff || isKeyOn || isKeyOnStart;

  // Distinct theming per action type
  const theme = isKeyOff
    ? { icon: '🔴', title: 'TURN KEY OFF', border: 'border-red-500', bg: 'bg-red-500/15',
        titleColor: 'text-red-400', btn: 'bg-red-600 hover:bg-red-500',
        confirmText: 'I HAVE TURNED THE KEY OFF' }
    : isKeyOnStart
    ? { icon: '🔑', title: 'IGNITION CHECK', border: 'border-amber-500', bg: 'bg-amber-500/15',
        titleColor: 'text-amber-400', btn: 'bg-amber-600 hover:bg-amber-500',
        confirmText: 'IGNITION IS ON — START' }
    : isKeyOn
    ? { icon: '🟢', title: 'TURN KEY ON', border: 'border-emerald-500', bg: 'bg-emerald-500/15',
        titleColor: 'text-emerald-400', btn: 'bg-emerald-600 hover:bg-emerald-500',
        confirmText: 'I HAVE TURNED THE KEY ON' }
    : { icon: '⏳', title: 'WAITING FOR ECU BOOT', border: 'border-cyan-500/50', bg: 'bg-cyan-500/10',
        titleColor: 'text-cyan-400', btn: '', confirmText: '' };

  return (
    <div className={`p-5 rounded-lg border-2 ${theme.border} ${theme.bg} ${isKeyAction ? 'animate-pulse' : ''}`}>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{theme.icon}</span>
        <span className={`font-mono text-sm font-bold ${theme.titleColor} tracking-wider`}>{theme.title}</span>
      </div>
      <p className="text-sm font-mono text-zinc-200 mb-4 leading-relaxed">{state.prompt}</p>
      {isKeyAction ? (
        <Button
          size="sm"
          onClick={onConfirm}
          className={`w-full ${theme.btn} text-white font-mono text-sm font-bold py-3 tracking-wide`}
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          {theme.confirmText}
        </Button>
      ) : (
        <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
          <Timer className="h-4 w-4 animate-spin" />
          <span>ECU booting... {Math.ceil(countdown / 1000)}s remaining</span>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

const SPEED_OPTIONS = [1, 2, 5, 10] as const;
type SpeedMultiplier = typeof SPEED_OPTIONS[number];

function csvEscapeCell(s: string): string {
  const t = s.replace(/"/g, '""');
  return `"${t}"`;
}

/** Excel-friendly UTF-8 CSV of flash / dry-run CAN log (timestamp_ms, phase, type, message, block_id, nrc_code). */
function buildFlashCanLogCsv(
  log: SimulatorLogEntry[],
  plan: FlashPlan,
  connectionMode: string,
  sessionUuid: string,
  result: SimulatorState['result'],
  dryRun: boolean,
  elapsedMs: number,
): string {
  const headerLines = [
    '# V-OP flash CAN / UDS recording',
    `# ECU: ${plan.ecuName}`,
    `# Mode: ${plan.flashMode}`,
    `# Connection: ${connectionMode}`,
    `# Session: ${sessionUuid}`,
    `# Result: ${result ?? 'in_progress'}`,
    `# Dry_run: ${dryRun}`,
    `# Elapsed_ms: ${elapsedMs}`,
    `# Entries: ${log.length}`,
  ];
  const cols = ['timestamp_ms', 'phase', 'type', 'message', 'block_id', 'nrc_code'];
  const dataRows = log.map((e) =>
    [
      String(Math.round(e.timestamp)),
      csvEscapeCell(e.phase),
      csvEscapeCell(e.type),
      csvEscapeCell(e.message),
      e.blockId != null ? String(e.blockId) : '',
      e.nrcCode != null ? String(e.nrcCode) : '',
    ].join(','),
  );
  return `\ufeff${headerLines.join('\n')}\n${cols.join(',')}\n${dataRows.join('\n')}\n`;
}

export default function FlashMissionControl({
  plan, connectionMode, sessionUuid, onComplete, onBack,
  flashBridge, flashBridgeRef, containerData, containerHeader, dryRun = false,
}: FlashMissionControlProps) {
  const [sim, setSim] = useState<SimulatorState>(() => createSimulatorState(plan));
  const [showLog, setShowLog] = useState(true);
  const [funFactIdx, setFunFactIdx] = useState(0);
  const [keyCycleState, setKeyCycleState] = useState<KeyCyclePromptState | null>(null);
  const [keyCycleCountdown, setKeyCycleCountdown] = useState(0);
  const keyCycleResolveRef = useRef<(() => void) | null>(null);
  const [speedMultiplier, setSpeedMultiplier] = useState<SpeedMultiplier>(1);
  const [mcTab, setMcTab] = useState<'run' | 'export'>('run');
  const [recoFixNote, setRecoFixNote] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);
  const pendingLogsRef = useRef<SimulatorLogEntry[]>([]);
  const lastFlushRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const flashEngineRef = useRef<PCANFlashEngine | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const funFacts = useMemo(() => getAllFunFacts(plan.ecuType), [plan.ecuType]);
  const isRealFlash = connectionMode === 'pcan' || connectionMode === 'vop_usb';
  const isDryRun = dryRun && isRealFlash;
  /** Active run with no final result yet (simulator or hardware). */
  const flashLocked = sim.isRunning && !sim.result;
  /** Real hardware flash: lock UI so side interactions do not disturb CAN timing. */
  const hardwareFlashLocked = flashLocked && isRealFlash;
  /** User switched away or blurred — show high-visibility warning (timers/USB may throttle). */
  const [flashBackgroundWarning, setFlashBackgroundWarning] = useState(false);

  const updateSession = trpc.flash.updateSession.useMutation();
  const appendLogs = trpc.flash.appendLogs.useMutation();
  const completeSession = trpc.flash.completeSession.useMutation();
  const computeSecurityKeyMutation = trpc.flash.computeSecurityKey.useMutation();
  const { data: recoAggregates } = trpc.flash.recoLearningAggregates.useQuery(undefined, {
    staleTime: 60_000,
  });
  const recoSubmit = trpc.flash.recoLearningSubmit.useMutation();

  // Hardware flash: keep RUN tab — export UI can steal focus and main-thread time.
  useEffect(() => {
    if (hardwareFlashLocked) setMcTab('run');
  }, [hardwareFlashLocked]);

  // Real hardware: prominent warning when the user leaves this tab/window (timing/CAN risk).
  useEffect(() => {
    if (!hardwareFlashLocked) {
      setFlashBackgroundWarning(false);
      return;
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        setFlashBackgroundWarning(true);
        toast.custom(
          () => (
            <div className="w-[min(100vw-2rem,28rem)] rounded-lg border-2 border-amber-500 bg-zinc-950 p-4 text-left shadow-2xl">
              <div className="font-mono text-sm font-bold tracking-wide text-amber-200">FLASH TAB IN BACKGROUND</div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-200">
                A live flash is running. Keep this tab in the foreground — background tabs may throttle JavaScript and USB/serial, which can disrupt CAN timing.
              </p>
            </div>
          ),
          { duration: 15000, id: 'flash-tab-background' },
        );
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification('Flash in progress', {
              body: 'Return to the flash tab. Background operation may disrupt CAN/USB timing.',
              tag: 'flash-tab-bg',
            });
          } catch {
            /* ignore */
          }
        }
      } else {
        setFlashBackgroundWarning(false);
      }
    };
    const onBlur = () => setFlashBackgroundWarning(true);
    const onFocus = () => {
      if (document.visibilityState === 'visible') setFlashBackgroundWarning(false);
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [hardwareFlashLocked]);

  // ── Safety: beforeunload warning during flash ──────────────────────────
  useEffect(() => {
    if (!sim.isRunning || sim.result) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Flash in progress! Closing this page may brick the ECU. Are you sure?';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [sim.isRunning, sim.result]);

  // ── Safety: wake lock to prevent sleep during flash ────────────────────
  useEffect(() => {
    if (!sim.isRunning || sim.result) {
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
      return;
    }
    const acquireWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch {
        // Wake lock not supported or denied — continue anyway
      }
    };
    acquireWakeLock();
    return () => {
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [sim.isRunning, sim.result]);

  const flushLogs = useCallback(() => {
    if (pendingLogsRef.current.length === 0) return;
    const logsToSend = pendingLogsRef.current.splice(0);
    appendLogs.mutate({
      sessionUuid,
      logs: logsToSend.map(l => ({
        timestampMs: l.timestamp,
        phase: l.phase,
        type: l.type,
        message: l.message,
        blockId: l.blockId,
        nrcCode: l.nrcCode,
      })),
    });
  }, [sessionUuid, appendLogs]);

  // ── Server session sync for real flash ─────────────────────────────────
  const syncToServer = useCallback((state: SimulatorState) => {
    const newLogs = state.log.slice(pendingLogsRef.current.length > 0 ? 0 : sim.log.length);
    if (newLogs.length > 0) pendingLogsRef.current.push(...newLogs);
    const now = Date.now();
    if (now - lastFlushRef.current > 2000 && pendingLogsRef.current.length > 0) {
      lastFlushRef.current = now;
      flushLogs();
    }
    if (Math.floor(state.progress / 5) > Math.floor(sim.progress / 5)) {
      updateSession.mutate({ uuid: sessionUuid, progress: Math.round(state.progress) });
    }
  }, [sessionUuid, sim.log.length, sim.progress, flushLogs, updateSession]);

  // ── Start flash (simulator or real) ────────────────────────────────────
  const handleStart = useCallback(async () => {
    startTimeRef.current = Date.now();
    updateSession.mutate({ uuid: sessionUuid, status: 'running', progress: 0 });

    const bridge = flashBridgeRef?.current ?? flashBridge ?? null;

    if (isRealFlash && bridge && containerData && containerHeader) {
      let skipConnect = false;
      if (connectionMode === 'vop_usb') {
        const vop = bridge as VopCan2UsbConnection;
        const usbOk = await vop.connect({ skipVehicleInit: true });
        if (!usbOk) {
          updateSession.mutate({ uuid: sessionUuid, status: 'pending', progress: 0 });
          setSim(prev => ({
            ...prev,
            isRunning: false,
            result: null,
            statusMessage: 'USB CAN bridge connect failed — grant serial access and press Start again.',
          }));
          return;
        }
        skipConnect = true;
      }

      const callbacks: FlashEngineCallbacks = {
        onStateUpdate: (newState) => {
          setSim(newState);
          syncToServer(newState);
        },
        onComplete: (result) => {
          if (!completedRef.current) {
            completedRef.current = true;
            flushLogs();
            const duration = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
            completeSession.mutate({
              uuid: sessionUuid,
              status: result === 'SUCCESS' ? 'success' : result === 'ABORTED' ? 'aborted' : 'failed',
              progress: result === 'SUCCESS' ? 100 : Math.round(sim.progress),
              durationMs: duration,
              errorMessage: result === 'FAILED' ? sim.statusMessage : undefined,
            });
          }
          // Release Web Serial port so Datalogger / OS can reopen the adapter without unplugging USB.
          if (connectionMode === 'vop_usb' && bridge) {
            void (bridge as VopCan2UsbConnection).disconnect();
          }
        },
        onUserAction: async (action, waitMs) => {
          setKeyCycleState(action);
          setKeyCycleCountdown(waitMs);

          if (action.autoConfirm) {
            // WAIT_BOOT: auto-countdown and resolve
            const interval = setInterval(() => {
              setKeyCycleCountdown(prev => {
                if (prev <= 1000) {
                  clearInterval(interval);
                  setKeyCycleState(null);
                  return 0;
                }
                return prev - 1000;
              });
            }, 1000);
            await new Promise(resolve => setTimeout(resolve, waitMs));
            clearInterval(interval);
            setKeyCycleState(null);
            setKeyCycleCountdown(0);
          } else {
            // KEY_OFF / KEY_ON: block until user clicks confirm
            await new Promise<void>(resolve => {
              keyCycleResolveRef.current = resolve;
            });
            setKeyCycleState(null);
            setKeyCycleCountdown(0);
          }
        },
      };

      const engine = new PCANFlashEngine({
        connection: bridge,
        skipConnect,
        plan,
        containerData,
        header: containerHeader,
        callbacks,
        dryRun,
        computeSecurityKey: async ({ ecuType, seed }) => {
          const seedHex = Array.from(seed)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          const r = await computeSecurityKeyMutation.mutateAsync({ ecuType, seedHex });
          if (r.ok && "keyHex" in r && r.keyHex) {
            return hexToBytes(r.keyHex);
          }
          return null;
        },
      });
      flashEngineRef.current = engine;
      setSim(prev => ({ ...prev, isRunning: true }));
      engine.execute(); // Fire and forget — callbacks handle state updates
    } else if (isRealFlash) {
      updateSession.mutate({ uuid: sessionUuid, status: 'pending', progress: 0 });
      const reason = !bridge
        ? 'CAN adapter not ready. Return to Hardware Flash, confirm the local bridge or V-OP USB, then launch again.'
        : !containerData || !containerHeader
          ? 'Container data is missing. Reload the file and try again.'
          : 'Cannot start real flash.';
      toast.error(reason);
      setSim(prev => ({
        ...prev,
        isRunning: false,
        result: null,
        statusMessage: reason,
      }));
    } else {
      // Simulator mode
      setSim(prev => ({ ...prev, isRunning: true }));
    }
  }, [sessionUuid, updateSession, isRealFlash, connectionMode, flashBridge, flashBridgeRef, containerData, containerHeader, plan, flushLogs, completeSession, syncToServer, sim.progress, sim.statusMessage, dryRun, computeSecurityKeyMutation]);

  const handlePause = useCallback(() => {
    setSim(prev => ({ ...prev, isPaused: !prev.isPaused }));
  }, []);

  const handleAbort = useCallback(() => {
    // Abort real flash engine if running
    if (flashEngineRef.current) {
      flashEngineRef.current.abort();
    }
    setSim(prev => {
      const duration = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
      flushLogs();
      if (!completedRef.current) {
        completedRef.current = true;
        completeSession.mutate({
          uuid: sessionUuid, status: 'aborted', progress: Math.round(prev.progress),
          durationMs: duration, errorMessage: 'Aborted by user',
        });
      }
      return { ...prev, isRunning: false, result: 'ABORTED' as const, statusMessage: 'Flash aborted by user' };
    });
  }, [sessionUuid, flushLogs, completeSession]);

  // ── Simulator tick (only for simulator mode) ───────────────────────────
  useEffect(() => {
    if (isRealFlash) return; // Real flash uses engine callbacks, not tick
    if (!sim.isRunning || sim.isPaused || sim.result) return;
    const interval = setInterval(() => {
      setSim(prev => {
        const next = advanceSimulator(prev, plan, 100 * speedMultiplier);
        const newLogs = next.log.slice(prev.log.length);
        if (newLogs.length > 0) pendingLogsRef.current.push(...newLogs);
        const now = Date.now();
        if (now - lastFlushRef.current > 2000 && pendingLogsRef.current.length > 0) {
          lastFlushRef.current = now;
          flushLogs();
        }
        if (Math.floor(next.progress / 5) > Math.floor(prev.progress / 5)) {
          updateSession.mutate({ uuid: sessionUuid, progress: Math.round(next.progress) });
        }
        if (next.result && !prev.result && !completedRef.current) {
          completedRef.current = true;
          flushLogs();
          const duration = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
          completeSession.mutate({
            uuid: sessionUuid,
            status: next.result === 'SUCCESS' ? 'success' : 'failed',
            progress: Math.round(next.progress),
            durationMs: duration,
            errorMessage: next.result === 'FAILED' ? next.statusMessage : undefined,
          });
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isRealFlash, sim.isRunning, sim.isPaused, sim.result, plan, sessionUuid, flushLogs, updateSession, completeSession, speedMultiplier]);

  // Fun fact rotation
  useEffect(() => {
    if (!sim.isRunning || sim.result) return;
    const timer = setInterval(() => setFunFactIdx(prev => (prev + 1) % funFacts.length), 8000);
    return () => clearInterval(timer);
  }, [sim.isRunning, sim.result, funFacts.length]);

  // Auto-scroll log
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [sim.log.length]);

  // Auto-expand log when flash completes
  useEffect(() => {
    if (sim.result && !showLog) setShowLog(true);
  }, [sim.result]);

  const exportSlug = `${isDryRun ? 'dry-run-' : ''}${sessionUuid.slice(0, 8)}-${sim.result?.toLowerCase() || (sim.isRunning ? 'in-progress' : 'ready')}`;

  const recoAnalysis = useMemo(
    () =>
      analyzeFlashLogForRecommendations(
        sim.log,
        plan,
        {
          result: sim.result,
          statusMessage: sim.statusMessage,
          elapsedMs: sim.elapsedMs,
          dryRun: isDryRun,
          isRunning: sim.isRunning,
        },
        { aggregates: recoAggregates ?? undefined },
      ),
    [
      sim.log,
      plan,
      sim.result,
      sim.statusMessage,
      sim.elapsedMs,
      isDryRun,
      sim.isRunning,
      recoAggregates,
    ],
  );

  // Download log as text file
  const handleDownloadLog = useCallback(() => {
    const lines = sim.log.map(e => {
      const ts = (e.timestamp / 1000).toFixed(3).padStart(10);
      const phase = e.phase.padEnd(16);
      const type = e.type.padEnd(8);
      return `[${ts}s] ${phase} ${type} ${e.message}`;
    });
    const header = [
      `=== FLASH SESSION LOG ===`,
      `ECU: ${plan.ecuName}`,
      `Mode: ${plan.flashMode}`,
      `Connection: ${connectionMode}`,
      `Dry run: ${isDryRun}`,
      `Session: ${sessionUuid}`,
      `Result: ${sim.result}`,
      `Duration: ${formatDuration(sim.elapsedMs)}`,
      `Transferred: ${formatBytes(sim.transferredBytes)} / ${formatBytes(sim.totalBytes)}`,
      `Total Log Entries: ${sim.log.length}`,
      `${'='.repeat(60)}`,
      '',
    ];
    const blob = new Blob([header.join('\n') + lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flash-can-log-${exportSlug}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sim, plan, connectionMode, sessionUuid, isDryRun, exportSlug]);

  const handleDownloadCsv = useCallback(() => {
    const csv = buildFlashCanLogCsv(
      sim.log,
      plan,
      connectionMode,
      sessionUuid,
      sim.result,
      isDryRun,
      sim.elapsedMs,
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flash-can-log-${exportSlug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sim.log, sim.result, sim.elapsedMs, plan, connectionMode, sessionUuid, isDryRun, exportSlug]);

  const handleDownloadXlsx = useCallback(() => {
    try {
      downloadFlashSessionXlsx({
        filenameBase: `flash-session-${exportSlug}`,
        log: sim.log,
        plan,
        meta: {
          connectionMode,
          sessionUuid,
          result: sim.result,
          dryRun: isDryRun,
          elapsedMs: sim.elapsedMs,
        },
        analysis: recoAnalysis,
      });
    } catch (e) {
      console.error(e);
      toast.error('Could not build Excel workbook. Try CSV export.');
    }
  }, [
    sim.log,
    plan,
    connectionMode,
    sessionUuid,
    sim.result,
    isDryRun,
    sim.elapsedMs,
    exportSlug,
    recoAnalysis,
  ]);

  const submitRecoFeedback = useCallback(
    (helpful: boolean) => {
      recoSubmit.mutate(
        {
          patternKey: recoAnalysis.primaryPatternKey,
          helpful,
          fixApplied: recoFixNote.trim() || undefined,
          sessionUuid,
        },
        {
          onSuccess: (r) => {
            if (r.ok) {
              toast.success('Thanks — this improves future export hints.');
              setRecoFixNote('');
            } else {
              toast.error('Could not save feedback (database unavailable).');
            }
          },
          onError: () => toast.error('Could not save feedback.'),
        },
      );
    },
    [recoSubmit, recoAnalysis.primaryPatternKey, recoFixNote, sessionUuid],
  );

  return (
    <div className="relative min-h-[600px] rounded-lg border border-zinc-800 bg-black/90 overflow-hidden">
      <DataStreamBackground active={sim.isRunning && !sim.isPaused && !sim.result} />

      {hardwareFlashLocked && flashBackgroundWarning && (
        <div
          className="pointer-events-none fixed inset-0 z-[95] flex items-center justify-center bg-red-950/80 px-4 backdrop-blur-[2px]"
          role="alert"
          aria-live="assertive"
        >
          <div className="max-w-lg rounded-xl border-4 border-red-500 bg-black/95 p-6 text-center shadow-2xl">
            <AlertTriangle className="mx-auto mb-3 h-14 w-14 text-red-400" />
            <p className="font-mono text-lg font-bold uppercase tracking-wide text-red-100">Do not leave this tab</p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-200">
              Flash is active. Switching away can throttle the browser and disturb USB/CAN timing. Return here immediately and keep this window focused.
            </p>
          </div>
        </div>
      )}

      <div className={cn('relative z-10 p-4 space-y-4', hardwareFlashLocked && 'pb-24')}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} disabled={hardwareFlashLocked}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h3 className="font-mono text-sm font-bold tracking-wider text-zinc-100 flex items-center gap-2">
                <Radio className={`h-4 w-4 ${sim.isRunning && !sim.result ? 'text-red-500 animate-pulse' : 'text-zinc-600'}`} />
                MISSION CONTROL
                {isDryRun && (
                  <Badge variant="outline" className="text-[10px] border-yellow-500/50 text-yellow-400 ml-1 animate-pulse">
                    🧪 DRY RUN
                  </Badge>
                )}
                {isRealFlash && !isDryRun && (
                  <Badge variant="outline" className="text-[10px] border-red-500/50 text-red-400 ml-1">
                    LIVE
                  </Badge>
                )}
              </h3>
              <p className="text-xs text-zinc-500">
                {isDryRun
                  ? 'DRY RUN — Non-destructive test'
                  : connectionMode === 'pcan'
                    ? 'Real bridge (WebSocket) flash'
                    : connectionMode === 'vop_usb'
                      ? 'V-OP USB2CAN Bridge Flash'
                      : 'Simulator Mode'}{' '}
                — {plan.ecuName}
              </p>
            </div>
          </div>
          <Badge variant="outline" className={`font-mono text-xs ${
            sim.result === 'SUCCESS' ? 'border-emerald-500/50 text-emerald-400' :
            sim.result === 'FAILED' ? 'border-red-500/50 text-red-400' :
            sim.result === 'ABORTED' ? 'border-amber-500/50 text-amber-400' :
            sim.isRunning ? 'border-cyan-500/50 text-cyan-400' : 'border-zinc-600 text-zinc-400'
          }`}>
            {sim.result || (sim.isRunning ? (sim.isPaused ? 'PAUSED' : 'RUNNING') : 'READY')}
          </Badge>
        </div>

        {/* RUN vs EXPORT — CAN log export for Excel / post-mortem (dry run + live) */}
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-2">
          <button
            type="button"
            disabled={hardwareFlashLocked}
            onClick={() => setMcTab('run')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold tracking-wide transition-colors disabled:opacity-40 disabled:pointer-events-none ${
              mcTab === 'run'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-zinc-500 border border-transparent hover:text-zinc-300'
            }`}
          >
            RUN
          </button>
          <button
            type="button"
            disabled={hardwareFlashLocked}
            onClick={() => setMcTab('export')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold tracking-wide transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none ${
              mcTab === 'export'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-zinc-500 border border-transparent hover:text-zinc-300'
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            EXPORT
            {sim.log.length > 0 && (
              <span className="text-[10px] opacity-80 tabular-nums">({sim.log.length})</span>
            )}
          </button>
        </div>

        {mcTab === 'export' ? (
          <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
            <div>
              <h4 className="text-sm font-mono font-bold text-zinc-200 mb-1">CAN / UDS recording</h4>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Download everything captured during simulator, dry run, or live flash.{' '}
                <span className="text-zinc-400">Excel (.xls)</span> workbook puts <span className="text-zinc-400">Recommendations</span>{' '}
                first (what failed, when, heuristic fixes + disclaimer), then <span className="text-zinc-400">CAN_log</span>.{' '}
                <span className="text-zinc-400">CSV</span> is UTF-8 for a single-sheet log.{' '}
                <span className="text-zinc-400">TXT</span> is the human-readable session log. Partial export is allowed while running.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={hardwareFlashLocked || sim.log.length === 0}
                onClick={handleDownloadXlsx}
                className="font-mono text-xs border-cyan-700/50 text-cyan-300 hover:bg-cyan-950/50"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
                DOWNLOAD EXCEL (2 SHEETS)
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={hardwareFlashLocked || sim.log.length === 0}
                onClick={handleDownloadCsv}
                className="font-mono text-xs border-emerald-700/50 text-emerald-300 hover:bg-emerald-950/50"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
                DOWNLOAD CSV (EXCEL)
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={hardwareFlashLocked || sim.log.length === 0}
                onClick={handleDownloadLog}
                className="font-mono text-xs border-zinc-600"
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                DOWNLOAD TXT LOG
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={hardwareFlashLocked}
                onClick={() => setMcTab('run')}
                className="font-mono text-xs text-zinc-500"
              >
                ← Back to run
              </Button>
            </div>
            <div className="rounded-md border border-zinc-800 bg-black/30 p-3 space-y-2">
              <h5 className="text-xs font-mono font-bold text-zinc-300">Improve recommendations (optional)</h5>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Anonymous feedback is tied to the current session&apos;s primary issue key{' '}
                <span className="text-zinc-400 font-mono break-all">{recoAnalysis.primaryPatternKey}</span>.
                If a suggestion was wrong, say so; if you fixed the problem, describe what worked (voltage, cable, session, etc.).
              </p>
              <Textarea
                value={recoFixNote}
                onChange={(e) => setRecoFixNote(e.target.value)}
                placeholder="What actually fixed it (optional, max ~2000 chars)…"
                className="min-h-[72px] text-xs font-mono bg-zinc-950 border-zinc-700"
                maxLength={2000}
                disabled={hardwareFlashLocked}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={hardwareFlashLocked || recoSubmit.isPending}
                  onClick={() => submitRecoFeedback(true)}
                  className="font-mono text-xs"
                >
                  Mark hints helpful
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={hardwareFlashLocked || recoSubmit.isPending}
                  onClick={() => submitRecoFeedback(false)}
                  className="font-mono text-xs border-zinc-600"
                >
                  Hints not helpful
                </Button>
              </div>
            </div>
            <div className="text-[10px] font-mono text-zinc-600">
              Session <span className="text-zinc-400">{sessionUuid.slice(0, 8)}…</span>
              {' · '}
              {isDryRun ? 'Dry run' : connectionMode === 'pcan' ? 'Local bridge' : connectionMode === 'vop_usb' ? 'V-OP USB' : 'Simulator'}
              {' · '}
              {sim.log.length} entries
              {sim.result && ` · ${sim.result}`}
            </div>
            {sim.log.length > 0 && (
              <ScrollArea className="h-48 rounded border border-zinc-800 bg-black/40 p-2">
                <div className="space-y-0.5 font-mono text-[10px] text-zinc-500">
                  {sim.log.slice(-40).map((entry, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-zinc-600 w-14 shrink-0">{Math.round(entry.timestamp)}ms</span>
                      <span className={LOG_TYPE_COLORS[entry.type] || 'text-zinc-400'}>{entry.message}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        ) : (
          <>
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className={PHASE_COLORS[sim.currentPhase] || 'text-zinc-400'}>
              {sim.currentPhase.replace(/_/g, ' ')}
              {sim.currentSectionName && ` — ${sim.currentSectionName}`}
            </span>
            <span className="text-zinc-500">{sim.progress.toFixed(1)}%</span>
          </div>
          <Progress value={sim.progress} className="h-2 bg-zinc-800" />
          <div className="flex justify-between text-[10px] font-mono text-zinc-600">
            <span>Block {sim.currentBlock}/{sim.totalBlocks}</span>
            <span>{formatBytes(sim.transferredBytes)} / {formatBytes(sim.totalBytes)}</span>
          </div>
          {/* Countdown timer and elapsed time */}
          <div className="flex justify-between text-[10px] font-mono">
            <span className="text-zinc-500 flex items-center gap-1">
              <Timer className="h-3 w-3" />
              Elapsed: {formatDuration(sim.elapsedMs)}
            </span>
            {sim.isRunning && !sim.result && sim.estimatedRemainingMs > 0 && (
              <span className="text-cyan-500 flex items-center gap-1">
                <Timer className="h-3 w-3" />
                Remaining: ~{formatDuration(sim.estimatedRemainingMs)}
              </span>
            )}
          </div>
        </div>

        {/* Key cycle prompt — above fixed emergency bar so confirm stays clickable */}
        {keyCycleState && (
          <div className="relative z-[110]">
            <KeyCyclePrompt
              state={keyCycleState}
              countdown={keyCycleCountdown}
              onConfirm={() => {
                if (keyCycleResolveRef.current) {
                  keyCycleResolveRef.current();
                  keyCycleResolveRef.current = null;
                }
              }}
            />
          </div>
        )}

        {/* Controls — during hardware flash, only the fixed emergency bar is used */}
        <div className="flex flex-wrap gap-2">
          {!sim.isRunning && !sim.result && (
            <Button size="sm" onClick={handleStart} className={`text-white font-mono text-xs ${
              isDryRun ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}>
              <Play className="h-3 w-3 mr-1" /> {isDryRun ? 'START DRY RUN' : isRealFlash ? 'START REAL FLASH' : 'START FLASH'}
            </Button>
          )}
          {/* Simulator: pause / export allowed; hardware flash uses only the fixed emergency bar */}
          {flashLocked && !isRealFlash && (
            <>
              <Button size="sm" variant="outline" onClick={handlePause} className="font-mono text-xs border-zinc-700">
                {sim.isPaused ? <Play className="h-3 w-3 mr-1" /> : <Pause className="h-3 w-3 mr-1" />}
                {sim.isPaused ? 'RESUME' : 'PAUSE'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleAbort}
                className="font-mono text-xs border-red-800 text-red-400 hover:bg-red-900/30"
              >
                <Square className="h-3 w-3 mr-1" /> ABORT
              </Button>
              {sim.log.length > 0 && (
                <>
                  <Button size="sm" variant="outline" onClick={handleDownloadCsv} className="font-mono text-xs border-emerald-800/60 text-emerald-400">
                    <FileSpreadsheet className="h-3 w-3 mr-1" /> CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setMcTab('export')} className="font-mono text-xs border-zinc-600 text-zinc-400">
                    EXPORT
                  </Button>
                </>
              )}
            </>
          )}
          {sim.result && (
            <>
              <Button size="sm" onClick={() => onComplete(sim.result!)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" /> DONE
              </Button>
              <Button size="sm" variant="outline" onClick={handleDownloadCsv} disabled={sim.log.length === 0} className="font-mono text-xs border-emerald-800 text-emerald-300">
                <FileSpreadsheet className="h-3 w-3 mr-1" /> CSV
              </Button>
              <Button size="sm" variant="outline" onClick={handleDownloadLog} disabled={sim.log.length === 0} className="font-mono text-xs border-zinc-700">
                <Download className="h-3 w-3 mr-1" /> TXT LOG
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMcTab('export')} className="font-mono text-xs border-zinc-700">
                EXPORT TAB
              </Button>
              <Button size="sm" variant="outline" onClick={onBack} className="font-mono text-xs border-zinc-700">
                <ArrowLeft className="h-3 w-3 mr-1" /> BACK
              </Button>
            </>
          )}
        </div>

        {/* Simulator speed multiplier */}
        {!isRealFlash && sim.isRunning && !sim.result && (
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-zinc-500">Speed:</span>
            {SPEED_OPTIONS.map(s => (
              <button
                key={s}
                type="button"
                disabled={hardwareFlashLocked}
                onClick={() => setSpeedMultiplier(s)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all disabled:opacity-40 disabled:pointer-events-none ${
                  speedMultiplier === s
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                    : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        )}

        {/* Safety warning for real flash */}
        {isRealFlash && !isDryRun && sim.isRunning && !sim.result && (
          <div className="p-2 rounded border border-red-500/30 bg-red-500/5 text-red-400 text-[10px] font-mono flex items-center gap-2">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>LIVE FLASH — Do NOT close this tab, disconnect power, or turn off the vehicle during flash.</span>
          </div>
        )}

        {/* Validation panel (pre-start) */}
        {!sim.isRunning && !sim.result && <ValidationPanel plan={plan} />}

        {/* Fun fact */}
        {sim.isRunning && !sim.result && funFacts.length > 0 && (
          <div className="p-2 rounded bg-zinc-800/30 border border-zinc-700/50 text-xs font-mono text-zinc-500 italic">
            {funFacts[funFactIdx]}
          </div>
        )}

        {/* Result banner */}
        {sim.result && (
          <div className={`p-4 rounded-lg border ${
            sim.result === 'SUCCESS' ? 'border-emerald-500/30 bg-emerald-500/5' :
            sim.result === 'FAILED' ? 'border-red-500/30 bg-red-500/5' :
            'border-amber-500/30 bg-amber-500/5'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {sim.result === 'SUCCESS' ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> :
               sim.result === 'FAILED' ? <XCircle className="h-5 w-5 text-red-400" /> :
               <AlertTriangle className="h-5 w-5 text-amber-400" />}
              <span className="font-mono text-sm font-bold text-zinc-200">
                {isDryRun ? 'DRY RUN' : isRealFlash ? 'ECU' : 'SIMULATED'} FLASH {sim.result}
              </span>
            </div>
            <p className="text-xs font-mono text-zinc-400">{sim.statusMessage}</p>
            <div className="flex gap-4 mt-2 text-xs font-mono text-zinc-500">
              <span>Duration: {formatDuration(sim.elapsedMs)}</span>
              <span>Transferred: {formatBytes(sim.transferredBytes)}</span>
            </div>
            {sim.result === 'SUCCESS' && isDryRun && (
              <div className="mt-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-xs font-mono text-yellow-400">
                <Cpu className="h-3 w-3 inline mr-1" />
                Dry run passed — ECU communication verified, seed/key exchange tested. No data was written to ECU flash.
                You can now proceed with a real flash if all checks passed.
              </div>
            )}
            {sim.result === 'SUCCESS' && isRealFlash && !isDryRun && (
              <div className="mt-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-400">
                <Cpu className="h-3 w-3 inline mr-1" />
                ECU has been flashed successfully. Verify operation by starting the vehicle and checking for DTCs.
              </div>
            )}
            {sim.recoveryPlan && (
              <div className="mt-3 p-2 rounded bg-zinc-800/50 border border-zinc-700">
                <div className="text-xs font-mono text-amber-400 mb-1 flex items-center gap-1">
                  <RotateCcw className="h-3 w-3" /> RECOVERY PLAN
                </div>
                {sim.recoveryPlan.steps.map((step, i) => (
                  <div key={i} className="text-xs font-mono text-zinc-400 pl-4">{i + 1}. {step}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Log stream */}
        <div>
          <button
            type="button"
            disabled={hardwareFlashLocked}
            onClick={() => setShowLog(!showLog)}
            className="flex items-center gap-1 text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors mb-1 disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed"
          >
            {showLog ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            CAN BUS LOG ({sim.log.length} entries)
          </button>
          {showLog && (
            <ScrollArea className={`${sim.result ? 'h-72' : 'h-48'} rounded border border-zinc-800 bg-zinc-950/80 p-2`}>
              <div className="space-y-0.5">
                {(sim.result ? sim.log : sim.log.slice(-100)).map((entry, i) => (
                  <div key={i} className="flex gap-2 text-[11px] font-mono leading-tight">
                    <span className="text-zinc-600 w-16 shrink-0">{(entry.timestamp / 1000).toFixed(1)}s</span>
                    <span className={`w-20 shrink-0 ${PHASE_COLORS[entry.phase] || 'text-zinc-500'}`}>
                      {entry.phase.slice(0, 10)}
                    </span>
                    <span className={LOG_TYPE_COLORS[entry.type] || 'text-zinc-400'}>{entry.message}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </ScrollArea>
          )}
          {sim.log.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={hardwareFlashLocked}
                onClick={() => setMcTab('export')}
                className="h-7 text-[10px] font-mono text-emerald-400/90 hover:text-emerald-300 px-2"
              >
                <FileSpreadsheet className="h-3 w-3 mr-1" />
                Export tab (CSV / TXT)
              </Button>
            </div>
          )}
        </div>
          </>
        )}
      </div>

      {/* During hardware flash: only emergency abort remains interactive (fixed bar). */}
      {hardwareFlashLocked && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          aria-live="polite"
        >
          <div className="pointer-events-auto w-full max-w-lg px-2">
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={handleAbort}
              className={`w-full font-mono text-sm font-bold shadow-lg ${
                isRealFlash
                  ? 'border-2 border-red-500 bg-red-950/90 text-red-100 hover:bg-red-900/90'
                  : 'border-red-800 bg-zinc-950/95 text-red-300 hover:bg-red-950/50'
              }`}
            >
              <Square className="h-4 w-4 mr-2 shrink-0" />
              {isRealFlash ? 'EMERGENCY ABORT' : 'ABORT'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
