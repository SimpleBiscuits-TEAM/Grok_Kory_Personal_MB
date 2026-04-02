/**
 * FlashMissionControl — Full-screen flash execution UI with real-time
 * simulation, animated progress, CAN bus log stream, and server session recording.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Play, Pause, Square, AlertTriangle, CheckCircle2, XCircle,
  Radio, ArrowLeft, RotateCcw, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  type FlashPlan, type SimulatorState, type SimulatorLogEntry,
  createSimulatorState, advanceSimulator, getAllFunFacts,
  formatBytes, formatDuration,
} from '../../../shared/pcanFlashOrchestrator';

// ── Props ──────────────────────────────────────────────────────────────────

interface FlashMissionControlProps {
  plan: FlashPlan;
  connectionMode: 'simulator' | 'pcan';
  sessionUuid: string;
  onComplete: (result: 'SUCCESS' | 'FAILED' | 'ABORTED') => void;
  onBack: () => void;
}

// ── Phase colors ───────────────────────────────────────────────────────────

const PHASE_COLORS: Record<string, string> = {
  PRE_CHECK: 'text-blue-400', VOLTAGE_INIT: 'text-cyan-400',
  SESSION_OPEN: 'text-indigo-400', SECURITY_ACCESS: 'text-amber-400',
  PRE_FLASH: 'text-orange-400', BLOCK_TRANSFER: 'text-emerald-400',
  POST_FLASH: 'text-teal-400', VERIFICATION: 'text-green-400',
  CLEANUP: 'text-zinc-400', RECOVERY: 'text-red-400',
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
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function FlashMissionControl({
  plan, connectionMode, sessionUuid, onComplete, onBack,
}: FlashMissionControlProps) {
  const [sim, setSim] = useState<SimulatorState>(() => createSimulatorState(plan));
  const [showLog, setShowLog] = useState(true);
  const [funFactIdx, setFunFactIdx] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);
  const pendingLogsRef = useRef<SimulatorLogEntry[]>([]);
  const lastFlushRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  const funFacts = useMemo(() => getAllFunFacts(plan.ecuType), [plan.ecuType]);

  const updateSession = trpc.flash.updateSession.useMutation();
  const appendLogs = trpc.flash.appendLogs.useMutation();
  const completeSession = trpc.flash.completeSession.useMutation();

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

  const handleStart = useCallback(() => {
    startTimeRef.current = Date.now();
    setSim(prev => ({ ...prev, isRunning: true }));
    updateSession.mutate({ uuid: sessionUuid, status: 'running', progress: 0 });
  }, [sessionUuid, updateSession]);

  const handlePause = useCallback(() => {
    setSim(prev => ({ ...prev, isPaused: !prev.isPaused }));
  }, []);

  const handleAbort = useCallback(() => {
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

  // Simulation tick
  useEffect(() => {
    if (!sim.isRunning || sim.isPaused || sim.result) return;
    const interval = setInterval(() => {
      setSim(prev => {
        const next = advanceSimulator(prev, plan, 100);
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
  }, [sim.isRunning, sim.isPaused, sim.result, plan, sessionUuid, flushLogs, updateSession, completeSession]);

  // Fun fact rotation
  useEffect(() => {
    if (!sim.isRunning || sim.result) return;
    const timer = setInterval(() => setFunFactIdx(prev => (prev + 1) % funFacts.length), 8000);
    return () => clearInterval(timer);
  }, [sim.isRunning, sim.result, funFacts.length]);

  // Auto-scroll log
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [sim.log.length]);

  // Notify parent on completion
  useEffect(() => {
    if (sim.result) {
      const timer = setTimeout(() => onComplete(sim.result!), 2500);
      return () => clearTimeout(timer);
    }
  }, [sim.result, onComplete]);

  return (
    <div className="relative min-h-[600px] rounded-lg border border-zinc-800 bg-black/90 overflow-hidden">
      <DataStreamBackground active={sim.isRunning && !sim.isPaused && !sim.result} />

      <div className="relative z-10 p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} disabled={sim.isRunning && !sim.result}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h3 className="font-mono text-sm font-bold tracking-wider text-zinc-100 flex items-center gap-2">
                <Radio className={`h-4 w-4 ${sim.isRunning && !sim.result ? 'text-red-500 animate-pulse' : 'text-zinc-600'}`} />
                MISSION CONTROL
              </h3>
              <p className="text-xs text-zinc-500 font-mono">
                {connectionMode.toUpperCase()} — {plan.ecuName} — {plan.flashMode.replace('_', ' ')}
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

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className={PHASE_COLORS[sim.currentPhase] || 'text-zinc-400'}>
              {sim.currentPhase.replace('_', ' ')}
            </span>
            <span className="text-zinc-500">{sim.progress.toFixed(1)}% — {formatDuration(sim.elapsedMs)}</span>
          </div>
          <Progress value={sim.progress} className="h-2 bg-zinc-800" />
          <div className="flex justify-between text-[10px] font-mono text-zinc-600">
            <span>Block {sim.currentBlock}/{sim.totalBlocks}</span>
            <span>{formatBytes(sim.transferredBytes)} / {formatBytes(sim.totalBytes)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-2">
          {!sim.isRunning && !sim.result && (
            <Button size="sm" onClick={handleStart} className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs">
              <Play className="h-3 w-3 mr-1" /> START FLASH
            </Button>
          )}
          {sim.isRunning && !sim.result && (
            <>
              <Button size="sm" variant="outline" onClick={handlePause} className="font-mono text-xs border-zinc-700">
                {sim.isPaused ? <Play className="h-3 w-3 mr-1" /> : <Pause className="h-3 w-3 mr-1" />}
                {sim.isPaused ? 'RESUME' : 'PAUSE'}
              </Button>
              <Button size="sm" variant="outline" onClick={handleAbort} className="font-mono text-xs border-red-800 text-red-400 hover:bg-red-900/30">
                <Square className="h-3 w-3 mr-1" /> ABORT
              </Button>
            </>
          )}
          {sim.result && (
            <Button size="sm" variant="outline" onClick={onBack} className="font-mono text-xs border-zinc-700">
              <ArrowLeft className="h-3 w-3 mr-1" /> BACK
            </Button>
          )}
        </div>

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
              <span className="font-mono text-sm font-bold text-zinc-200">FLASH {sim.result}</span>
            </div>
            <p className="text-xs font-mono text-zinc-400">{sim.statusMessage}</p>
            <div className="flex gap-4 mt-2 text-xs font-mono text-zinc-500">
              <span>Duration: {formatDuration(sim.elapsedMs)}</span>
              <span>Transferred: {formatBytes(sim.transferredBytes)}</span>
            </div>
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
          <button onClick={() => setShowLog(!showLog)}
            className="flex items-center gap-1 text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors mb-1">
            {showLog ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            CAN BUS LOG ({sim.log.length} entries)
          </button>
          {showLog && (
            <ScrollArea className="h-48 rounded border border-zinc-800 bg-zinc-950/80 p-2">
              <div className="space-y-0.5">
                {sim.log.slice(-100).map((entry, i) => (
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
        </div>
      </div>
    </div>
  );
}
