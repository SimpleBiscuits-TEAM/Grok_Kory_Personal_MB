/**
 * FlashDashboard — Session history, stats, queue, and comparison.
 * Wired to tRPC flash endpoints for real-time data.
 */
import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import {
  Activity, BarChart3, Clock, CheckCircle2, XCircle, AlertTriangle,
  Download, Trash2, RefreshCw, ChevronRight, Radio, Cpu,
} from 'lucide-react';
import { formatBytes } from '../../../shared/pcanFlashOrchestrator';

// ── Status Badge ────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success: 'bg-green-500/20 text-green-400 border-green-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    aborted: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    running: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    pending: 'bg-zinc-700/50 text-zinc-400 border-zinc-600',
    queued: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    processing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    cancelled: 'bg-zinc-700/50 text-zinc-500 border-zinc-600',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${styles[status] || styles.pending}`}>
      {status}
    </span>
  );
}

// ── Duration Format ─────────────────────────────────────────────────────
function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ── Tab Button ──────────────────────────────────────────────────────────
function TabButton({ active, onClick, icon: Icon, label, count }: {
  active: boolean; onClick: () => void; icon: typeof Activity; label: string; count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
        active ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-zinc-600 text-[10px]">{count}</span>
      )}
    </button>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────────
export default function FlashDashboard() {
  const [activeTab, setActiveTab] = useState<'sessions' | 'stats' | 'queue'>('sessions');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const sessionsQuery = trpc.flash.listSessions.useQuery({ limit: 50 });
  const statsQuery = trpc.flash.stats.useQuery();
  const queueQuery = trpc.flash.getQueue.useQuery();

  const sessions = sessionsQuery.data || [];
  const stats = statsQuery.data;
  const queue = queueQuery.data || [];

  // ── Session Detail View ─────────────────────────────────────────────
  if (selectedSession) {
    return (
      <SessionDetail
        uuid={selectedSession}
        onBack={() => setSelectedSession(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex gap-1 bg-zinc-900/50 p-1 rounded-lg border border-zinc-800">
        <TabButton active={activeTab === 'sessions'} onClick={() => setActiveTab('sessions')} icon={Clock} label="Sessions" count={sessions.length} />
        <TabButton active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} icon={BarChart3} label="Stats" />
        <TabButton active={activeTab === 'queue'} onClick={() => setActiveTab('queue')} icon={Activity} label="Queue" count={queue.filter(q => q.status === 'queued').length} />
      </div>

      {/* ── Sessions Tab ── */}
      {activeTab === 'sessions' && (
        <div className="space-y-2">
          {sessionsQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-zinc-800/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm">No flash sessions yet</p>
              <p className="text-zinc-600 text-xs mt-1">Run a flash or simulator to see session history</p>
            </div>
          ) : (
            sessions.map(session => (
              <button
                key={session.uuid}
                onClick={() => setSelectedSession(session.uuid)}
                className="w-full p-3 bg-zinc-900/60 rounded-lg border border-zinc-800 hover:border-zinc-600 transition-all text-left group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      session.connectionMode === 'pcan'
                        ? 'bg-red-500/20 border border-red-500/30'
                        : 'bg-cyan-500/20 border border-cyan-500/30'
                    }`}>
                      {session.connectionMode === 'pcan'
                        ? <Radio className="w-4 h-4 text-red-400" />
                        : <Activity className="w-4 h-4 text-cyan-400" />
                      }
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-200">{session.ecuType}</span>
                        <StatusBadge status={session.status} />
                        <span className="text-[10px] text-zinc-600 font-mono">{session.flashMode}</span>
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        {session.fileName || 'Unknown file'} · {formatDuration(session.durationMs)} · {new Date(session.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                </div>
                {session.progress !== null && session.progress !== undefined && session.progress > 0 && session.progress < 100 && (
                  <div className="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all" style={{ width: `${session.progress}%` }} />
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* ── Stats Tab ── */}
      {activeTab === 'stats' && (
        <div className="space-y-4">
          {statsQuery.isLoading ? (
            <div className="grid grid-cols-4 gap-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-20 bg-zinc-800/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : stats ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 bg-zinc-900/60 rounded-lg border border-zinc-800 text-center">
                  <div className="text-2xl font-bold text-zinc-100">{stats.totalAttempts}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Total Flashes</div>
                </div>
                <div className="p-3 bg-zinc-900/60 rounded-lg border border-zinc-800 text-center">
                  <div className="text-2xl font-bold text-green-400">{stats.totalSuccess}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Successful</div>
                </div>
                <div className="p-3 bg-zinc-900/60 rounded-lg border border-zinc-800 text-center">
                  <div className="text-2xl font-bold text-red-400">{stats.totalFail}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Failed</div>
                </div>
                <div className="p-3 bg-zinc-900/60 rounded-lg border border-zinc-800 text-center">
                  <div className="text-2xl font-bold text-cyan-400">{stats.successRate.toFixed(1)}%</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Success Rate</div>
                </div>
              </div>

              {/* Per-ECU Stats */}
              {stats.byEcu.length > 0 && (
                <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
                  <h3 className="text-sm font-medium text-zinc-200 mb-3">
                    <Cpu className="w-4 h-4 inline mr-1.5 text-amber-400" />
                    Per-ECU Statistics
                  </h3>
                  <div className="space-y-2">
                    {stats.byEcu.map(ecu => {
                      const rate = ecu.totalAttempts > 0 ? (ecu.successCount / ecu.totalAttempts) * 100 : 0;
                      return (
                        <div key={ecu.ecuType} className="flex items-center gap-3 p-2 bg-zinc-800/40 rounded-md">
                          <span className="text-xs font-mono text-zinc-300 w-16">{ecu.ecuType}</span>
                          <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                          <span className="text-xs text-zinc-400 w-20 text-right">
                            {ecu.successCount}/{ecu.totalAttempts} ({rate.toFixed(0)}%)
                          </span>
                          <span className="text-[10px] text-zinc-600 w-16 text-right">
                            avg {formatDuration(ecu.avgDurationMs)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <BarChart3 className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm">No statistics available</p>
            </div>
          )}
        </div>
      )}

      {/* ── Queue Tab ── */}
      {activeTab === 'queue' && (
        <div className="space-y-2">
          {queueQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 bg-zinc-800/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : queue.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm">Queue is empty</p>
              <p className="text-zinc-600 text-xs mt-1">Add containers to the flash queue for batch processing</p>
            </div>
          ) : (
            queue.map(item => (
              <div key={item.id} className="p-3 bg-zinc-900/60 rounded-lg border border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                      {item.priority}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-200">{item.ecuType}</span>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {item.fileName || 'Unknown'} · {item.flashMode} · {new Date(item.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Session Detail ──────────────────────────────────────────────────────
function SessionDetail({ uuid, onBack }: { uuid: string; onBack: () => void }) {
  const logsQuery = trpc.flash.getSessionLogs.useQuery({ sessionUuid: uuid, limit: 500 });
  const snapshotsQuery = trpc.flash.getSnapshots.useQuery({ sessionUuid: uuid });
  const exportQuery = trpc.flash.exportSession.useQuery({ uuid });

  const logs = logsQuery.data || [];
  const snapshots = snapshotsQuery.data || [];
  const exportData = exportQuery.data;
  const session = exportData?.session;

  const handleExport = () => {
    if (!exportData) return;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flash-session-${uuid}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded border border-zinc-700 hover:border-zinc-600 transition-all"
          >
            ← Back
          </button>
          {session && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-zinc-100">{session.ecuType}</span>
              <StatusBadge status={session.status} />
              <span className="text-[10px] text-zinc-500 font-mono">{session.connectionMode}</span>
            </div>
          )}
        </div>
        <button
          onClick={handleExport}
          disabled={!exportData}
          className="px-3 py-1.5 text-xs bg-zinc-800 text-zinc-300 rounded border border-zinc-700 hover:border-zinc-500 transition-all disabled:opacity-40"
        >
          <Download className="w-3 h-3 inline mr-1" /> Export JSON
        </button>
      </div>

      {/* Session Info */}
      {session && (
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 bg-zinc-900/60 rounded-lg border border-zinc-800 text-center">
            <div className="text-sm font-bold text-zinc-200">{session.totalBlocks || 0}</div>
            <div className="text-[10px] text-zinc-500">Blocks</div>
          </div>
          <div className="p-2 bg-zinc-900/60 rounded-lg border border-zinc-800 text-center">
            <div className="text-sm font-bold text-zinc-200">{formatBytes(session.totalBytes || 0)}</div>
            <div className="text-[10px] text-zinc-500">Data</div>
          </div>
          <div className="p-2 bg-zinc-900/60 rounded-lg border border-zinc-800 text-center">
            <div className="text-sm font-bold text-zinc-200">{formatDuration(session.durationMs)}</div>
            <div className="text-[10px] text-zinc-500">Duration</div>
          </div>
        </div>
      )}

      {/* Snapshots */}
      {snapshots.length > 0 && (
        <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-200 mb-3">ECU Snapshots</h3>
          <div className="grid grid-cols-2 gap-3">
            {snapshots.map(snap => (
              <div key={snap.id} className="p-2 bg-zinc-800/50 rounded border border-zinc-700">
                <div className="text-[10px] text-zinc-500 uppercase">{snap.snapshotType.replace('_', ' ')}</div>
                <div className="text-xs text-zinc-300 font-mono mt-1">{snap.ecuType}</div>
                {snap.vin && <div className="text-[10px] text-zinc-500 mt-0.5">VIN: {snap.vin}</div>}
                {snap.hardwareNumber && <div className="text-[10px] text-zinc-500">HW: {snap.hardwareNumber}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log Entries */}
      <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-zinc-200">Session Logs ({logs.length})</h3>
          <button
            onClick={() => logsQuery.refetch()}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        {logsQuery.isLoading ? (
          <div className="space-y-1">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-5 bg-zinc-800/50 rounded animate-pulse" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-6 text-zinc-600 text-xs">No log entries</div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto space-y-0.5 font-mono text-[11px]">
            {logs.map(log => {
              const typeColor = log.type === 'error' ? 'text-red-400'
                : log.type === 'warn' ? 'text-amber-400'
                : log.type === 'success' ? 'text-green-400'
                : 'text-zinc-400';
              return (
                <div key={log.id} className="flex gap-2 py-0.5 hover:bg-zinc-800/30 rounded px-1">
                  <span className="text-zinc-600 shrink-0">{new Date(log.timestampMs).toLocaleTimeString()}</span>
                  <span className="text-zinc-500 shrink-0 w-20 truncate">[{log.phase}]</span>
                  <span className={`${typeColor} shrink-0 w-10`}>{log.type}</span>
                  <span className="text-zinc-300 break-all">{log.message}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
