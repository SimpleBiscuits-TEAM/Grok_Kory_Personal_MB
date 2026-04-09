/**
 * PreFlightChecklist — Server-validated pre-flight diagnostics gate.
 * Runs ECU recognition, security profile, duplicate check, and hardware checks
 * before allowing the user to proceed to MissionControl.
 */
import { useState, useEffect, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, XCircle, Clock, SkipForward, Shield, Zap, Loader2 } from 'lucide-react';

interface PreFlightChecklistProps {
  ecuType: string;
  fileHash?: string;
  connectionMode: 'simulator' | 'pcan' | 'vop_usb';
  onAllPassed: () => void | Promise<void>;
  onCancel: () => void;
  /** Shown when starting Mission Control failed (e.g. API / DB error) */
  sessionCreateError?: string | null;
  isCreatingSession?: boolean;
}

const statusIcon = (status: string) => {
  switch (status) {
    case 'pass': return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-400" />;
    case 'fail': return <XCircle className="h-4 w-4 text-red-400" />;
    case 'skipped': return <SkipForward className="h-4 w-4 text-zinc-500" />;
    default: return <Clock className="h-4 w-4 text-zinc-500 animate-pulse" />;
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case 'pass': return 'border-emerald-500/30 bg-emerald-500/5';
    case 'warning': return 'border-amber-500/30 bg-amber-500/5';
    case 'fail': return 'border-red-500/30 bg-red-500/5';
    case 'skipped': return 'border-zinc-700 bg-zinc-800/50';
    default: return 'border-zinc-700 bg-zinc-800/50';
  }
};

export default function PreFlightChecklist({
  ecuType, fileHash, connectionMode, onAllPassed, onCancel,
  sessionCreateError, isCreatingSession,
}: PreFlightChecklistProps) {
  const [animatedChecks, setAnimatedChecks] = useState<number>(0);

  const checklistInput = useMemo(() => ({
    ecuType,
    fileHash: fileHash || undefined,
    connectionMode,
  }), [ecuType, fileHash, connectionMode]);

  const { data, isLoading, error } = trpc.flash.preFlightChecklist.useQuery(checklistInput);

  useEffect(() => {
    if (!data?.checks) return;
    setAnimatedChecks(0);
    const timer = setInterval(() => {
      setAnimatedChecks(prev => {
        if (prev >= data.checks.length) { clearInterval(timer); return prev; }
        return prev + 1;
      });
    }, 200);
    return () => clearInterval(timer);
  }, [data?.checks]);

  const allChecksShown = data?.checks && animatedChecks >= data.checks.length;
  const hasFailures = data?.checks.some(c => c.status === 'fail' && c.required);

  return (
    <Card className="border-zinc-800 bg-zinc-900/80 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-mono tracking-wide">
            <Shield className="h-5 w-5 text-cyan-400" />
            PRE-FLIGHT DIAGNOSTICS
          </CardTitle>
          <Badge variant="outline" className={`font-mono text-xs ${
            isLoading ? 'border-zinc-600 text-zinc-400' :
            hasFailures ? 'border-red-500/50 text-red-400' :
            data?.requiredPassed ? 'border-emerald-500/50 text-emerald-400' :
            'border-amber-500/50 text-amber-400'
          }`}>
            {isLoading ? 'CHECKING...' :
             hasFailures ? 'BLOCKED' :
             data?.requiredPassed ? 'ALL CLEAR' : 'WARNINGS'}
          </Badge>
        </div>
        {data?.ecuConfig && (
          <p className="text-xs text-zinc-500 font-mono mt-1">
            Target: {data.ecuConfig.name} ({data.ecuConfig.protocol}) — {connectionMode.toUpperCase()} mode
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <div className="flex items-center justify-center py-8 gap-2 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="font-mono text-sm">Running diagnostics...</span>
          </div>
        )}

        {error && (
          <div className="p-3 rounded border border-red-500/30 bg-red-500/5 text-red-400 text-sm font-mono">
            Error: {error.message}
          </div>
        )}

        {sessionCreateError && (
          <div className="p-3 rounded border border-red-500/30 bg-red-500/5 text-red-400 text-sm font-mono space-y-1">
            <div className="font-semibold">Could not open flash session</div>
            <div>{sessionCreateError}</div>
            <p className="text-zinc-500 text-xs font-normal">You can cancel to return to the file overview, or fix the issue and try Proceed again.</p>
          </div>
        )}

        {data?.checks.map((check, i) => (
          <div
            key={check.id}
            className={`flex items-center gap-3 p-2.5 rounded border transition-all duration-300 ${
              i < animatedChecks ? statusColor(check.status) : 'border-transparent bg-transparent'
            }`}
            style={{
              transform: i < animatedChecks ? 'translateX(0)' : 'translateX(-10px)',
              opacity: i < animatedChecks ? 1 : 0,
              transition: `all 0.3s ease ${i * 0.05}s`,
            }}
          >
            {statusIcon(check.status)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-zinc-200">{check.label}</span>
                {check.required && (
                  <span className="text-[10px] font-mono text-red-400/60 uppercase">required</span>
                )}
              </div>
              <p className="text-xs text-zinc-500 font-mono truncate">{check.message}</p>
            </div>
          </div>
        ))}

        {allChecksShown && (
          <div className="flex gap-2 pt-3 border-t border-zinc-800">
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="flex-1 font-mono text-xs border-zinc-700 hover:bg-zinc-800"
            >
              CANCEL
            </Button>
            <Button
              size="sm"
              onClick={() => { void onAllPassed(); }}
              disabled={!!hasFailures || !!isCreatingSession}
              className={`flex-1 font-mono text-xs ${
                hasFailures || isCreatingSession
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {isCreatingSession ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin inline" /> OPENING SESSION…
                </>
              ) : hasFailures ? (
                'BLOCKED — FIX REQUIRED CHECKS'
              ) : (
                <>
                  PROCEED TO FLASH
                  <Zap className="h-3 w-3 ml-1" />
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
