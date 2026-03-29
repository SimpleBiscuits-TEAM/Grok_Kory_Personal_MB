/**
 * Admin Debug Dashboard — Self-Healing Debug System
 * 
 * Allows admins to:
 * - Grant/revoke debug access to specific users
 * - View all debug sessions and their status
 * - Approve/reject Tier 2 fixes
 * - Monitor debug activity and token usage
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Bug, Shield, ShieldCheck, ShieldX, Users, Activity,
  CheckCircle, XCircle, AlertTriangle, Clock, Eye,
  ChevronDown, ChevronUp, Search, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Status badge colors ────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  analyzing: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  tier1_auto_fix: 'bg-green-500/20 text-green-400 border-green-500/30',
  tier2_pending: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  tier2_approved: 'bg-green-500/20 text-green-400 border-green-500/30',
  tier2_rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
  fixing: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  awaiting_retest: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  confirmed_fixed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  still_broken: 'bg-red-500/20 text-red-400 border-red-500/30',
  escalated: 'bg-red-600/20 text-red-300 border-red-600/30',
  closed: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  analyzing: 'Analyzing...',
  tier1_auto_fix: 'Tier 1 Auto-Fix',
  tier2_pending: 'Tier 2 Pending',
  tier2_approved: 'Tier 2 Approved',
  tier2_rejected: 'Tier 2 Rejected',
  fixing: 'Fixing...',
  awaiting_retest: 'Awaiting Retest',
  confirmed_fixed: 'Fixed',
  still_broken: 'Still Broken',
  escalated: 'Escalated',
  closed: 'Closed',
};

export default function DebugDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'sessions' | 'users'>('sessions');
  const [expandedSession, setExpandedSession] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Queries
  const statsQuery = trpc.debug.stats.useQuery(undefined, { refetchInterval: 15000 });
  const sessionsQuery = trpc.debug.allSessions.useQuery({}, { refetchInterval: 10000 });
  const usersQuery = trpc.debug.listUsers.useQuery(undefined, { enabled: activeTab === 'users' });

  // Mutations
  const grantAccess = trpc.debug.grantAccess.useMutation({
    onSuccess: () => { usersQuery.refetch(); toast.success('Debug access granted'); },
    onError: (e) => toast.error(e.message),
  });
  const revokeAccess = trpc.debug.revokeAccess.useMutation({
    onSuccess: () => { usersQuery.refetch(); toast.success('Debug access revoked'); },
    onError: (e) => toast.error(e.message),
  });
  const approveT2 = trpc.debug.approveT2.useMutation({
    onSuccess: () => { sessionsQuery.refetch(); toast.success('Tier 2 fix approved'); },
    onError: (e) => toast.error(e.message),
  });
  const rejectT2 = trpc.debug.rejectT2.useMutation({
    onSuccess: () => { sessionsQuery.refetch(); toast.success('Tier 2 fix rejected'); },
    onError: (e) => toast.error(e.message),
  });
  const closeSession = trpc.debug.closeSession.useMutation({
    onSuccess: () => { sessionsQuery.refetch(); toast.success('Session closed'); },
    onError: (e) => toast.error(e.message),
  });

  if (user?.role !== 'admin' && user?.role !== 'super_admin') {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-zinc-500">Admin access required</p>
      </div>
    );
  }

  const stats = statsQuery.data;
  const sessions = sessionsQuery.data ?? [];
  const usersList = usersQuery.data ?? [];

  const filteredSessions = sessions.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.session.title.toLowerCase().includes(q) ||
      s.session.description?.toLowerCase().includes(q) ||
      s.session.featureArea?.toLowerCase().includes(q) ||
      s.reporterName?.toLowerCase().includes(q) ||
      s.session.status.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bug className="w-7 h-7 text-red-500" />
          <div>
            <h1 className="text-2xl font-bold font-[Bebas_Neue] tracking-wide text-white">
              DEBUG DASHBOARD
            </h1>
            <p className="text-sm text-zinc-500 font-[Rajdhani]">
              Self-Healing Debug System — Manage permissions, review bugs, approve fixes
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { statsQuery.refetch(); sessionsQuery.refetch(); }}
          className="border-zinc-700 text-zinc-400 hover:text-white"
        >
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-zinc-900/80 border-zinc-800 p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wider font-[Share_Tech_Mono]">Total</div>
          <div className="text-2xl font-bold text-white font-[Share_Tech_Mono] mt-1">{stats?.total ?? 0}</div>
        </Card>
        <Card className="bg-zinc-900/80 border-zinc-800 p-4">
          <div className="text-xs text-yellow-500 uppercase tracking-wider font-[Share_Tech_Mono]">Open</div>
          <div className="text-2xl font-bold text-yellow-400 font-[Share_Tech_Mono] mt-1">{stats?.open ?? 0}</div>
        </Card>
        <Card className="bg-zinc-900/80 border-zinc-800 p-4">
          <div className="text-xs text-green-500 uppercase tracking-wider font-[Share_Tech_Mono]">Fixed</div>
          <div className="text-2xl font-bold text-green-400 font-[Share_Tech_Mono] mt-1">{stats?.fixed ?? 0}</div>
        </Card>
        <Card className="bg-zinc-900/80 border-zinc-800 p-4">
          <div className="text-xs text-red-500 uppercase tracking-wider font-[Share_Tech_Mono]">Escalated</div>
          <div className="text-2xl font-bold text-red-400 font-[Share_Tech_Mono] mt-1">{stats?.escalated ?? 0}</div>
        </Card>
        <Card className="bg-zinc-900/80 border-zinc-800 p-4">
          <div className="text-xs text-cyan-500 uppercase tracking-wider font-[Share_Tech_Mono]">Debuggers</div>
          <div className="text-2xl font-bold text-cyan-400 font-[Share_Tech_Mono] mt-1">{stats?.activeDebuggers ?? 0}</div>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab('sessions')}
          className={`px-4 py-2 text-sm font-[Rajdhani] font-semibold tracking-wide transition-colors ${
            activeTab === 'sessions'
              ? 'text-red-500 border-b-2 border-red-500'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Activity className="w-4 h-4 inline mr-1" /> Bug Sessions
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 text-sm font-[Rajdhani] font-semibold tracking-wide transition-colors ${
            activeTab === 'users'
              ? 'text-red-500 border-b-2 border-red-500'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Users className="w-4 h-4 inline mr-1" /> User Permissions
        </button>
      </div>

      {/* Sessions Tab */}
      {activeTab === 'sessions' && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search bugs by title, description, area, or status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-red-500/50"
            />
          </div>

          {filteredSessions.length === 0 ? (
            <Card className="bg-zinc-900/80 border-zinc-800 p-8 text-center">
              <Bug className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-500 font-[Rajdhani]">No debug sessions yet</p>
              <p className="text-xs text-zinc-600 mt-1">Bug reports from authorized users will appear here</p>
            </Card>
          ) : (
            filteredSessions.map(({ session: s, reporterName }) => (
              <Card key={s.id} className="bg-zinc-900/80 border-zinc-800 overflow-hidden">
                {/* Session Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                  onClick={() => setExpandedSession(expandedSession === s.id ? null : s.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`px-2 py-0.5 text-xs font-[Share_Tech_Mono] rounded border ${STATUS_COLORS[s.status] || STATUS_COLORS.submitted}`}>
                        {STATUS_LABELS[s.status] || s.status}
                      </span>
                      <span className="text-white font-[Rajdhani] font-semibold truncate">
                        #{s.id} — {s.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {s.tier === 'tier2' && (
                        <span className="px-2 py-0.5 text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded font-[Share_Tech_Mono]">
                          TIER 2
                        </span>
                      )}
                      <span className="text-xs text-zinc-500 font-[Share_Tech_Mono]">
                        {reporterName || 'Unknown'}
                      </span>
                      <span className="text-xs text-zinc-600 font-[Share_Tech_Mono]">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </span>
                      {expandedSession === s.id ? (
                        <ChevronUp className="w-4 h-4 text-zinc-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-zinc-500" />
                      )}
                    </div>
                  </div>
                  {s.featureArea && (
                    <div className="mt-1">
                      <span className="text-xs text-zinc-600 font-[Share_Tech_Mono]">
                        Area: {s.featureArea}
                      </span>
                    </div>
                  )}
                </div>

                {/* Expanded Details */}
                {expandedSession === s.id && (
                  <div className="border-t border-zinc-800 p-4 space-y-4">
                    {/* Bug Description */}
                    <div>
                      <h4 className="text-xs text-zinc-500 uppercase tracking-wider font-[Share_Tech_Mono] mb-1">Description</h4>
                      <p className="text-sm text-zinc-300 font-[Rajdhani]">{s.description}</p>
                    </div>

                    {s.stepsToReproduce && (
                      <div>
                        <h4 className="text-xs text-zinc-500 uppercase tracking-wider font-[Share_Tech_Mono] mb-1">Steps to Reproduce</h4>
                        <p className="text-sm text-zinc-300 font-[Rajdhani] whitespace-pre-wrap">{s.stepsToReproduce}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      {s.expectedBehavior && (
                        <div>
                          <h4 className="text-xs text-zinc-500 uppercase tracking-wider font-[Share_Tech_Mono] mb-1">Expected</h4>
                          <p className="text-sm text-zinc-300 font-[Rajdhani]">{s.expectedBehavior}</p>
                        </div>
                      )}
                      {s.actualBehavior && (
                        <div>
                          <h4 className="text-xs text-zinc-500 uppercase tracking-wider font-[Share_Tech_Mono] mb-1">Actual</h4>
                          <p className="text-sm text-zinc-300 font-[Rajdhani]">{s.actualBehavior}</p>
                        </div>
                      )}
                    </div>

                    {/* Erika's Analysis */}
                    {s.rootCause && (
                      <div className="bg-zinc-800/50 rounded p-3 border-l-2 border-purple-500">
                        <h4 className="text-xs text-purple-400 uppercase tracking-wider font-[Share_Tech_Mono] mb-1">
                          Erika's Analysis
                        </h4>
                        <p className="text-sm text-zinc-300 font-[Rajdhani]">
                          <strong>Root Cause:</strong> {s.rootCause}
                        </p>
                        {s.proposedFix && (
                          <p className="text-sm text-zinc-300 font-[Rajdhani] mt-1">
                            <strong>Proposed Fix:</strong> {s.proposedFix}
                          </p>
                        )}
                        {s.estimatedTokens && (
                          <p className="text-xs text-zinc-500 font-[Share_Tech_Mono] mt-1">
                            Est. tokens: {s.estimatedTokens}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Retest Feedback */}
                    {s.retestFeedback && (
                      <div className="bg-zinc-800/50 rounded p-3 border-l-2 border-cyan-500">
                        <h4 className="text-xs text-cyan-400 uppercase tracking-wider font-[Share_Tech_Mono] mb-1">
                          Retest Feedback (attempt #{s.retestCount})
                        </h4>
                        <p className="text-sm text-zinc-300 font-[Rajdhani]">{s.retestFeedback}</p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2 border-t border-zinc-800">
                      {s.status === 'tier2_pending' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => approveT2.mutate({ sessionId: s.id })}
                            className="bg-green-600 hover:bg-green-700 text-white"
                            disabled={approveT2.isPending}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" /> Approve Fix
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => rejectT2.mutate({ sessionId: s.id })}
                            className="border-red-600 text-red-400 hover:bg-red-600/20"
                            disabled={rejectT2.isPending}
                          >
                            <XCircle className="w-3 h-3 mr-1" /> Reject
                          </Button>
                        </>
                      )}
                      {!['confirmed_fixed', 'closed', 'tier2_rejected'].includes(s.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => closeSession.mutate({ sessionId: s.id })}
                          className="border-zinc-700 text-zinc-400 hover:text-white"
                          disabled={closeSession.isPending}
                        >
                          Close Session
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-3">
          {usersList.length === 0 ? (
            <Card className="bg-zinc-900/80 border-zinc-800 p-8 text-center">
              <Users className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-500 font-[Rajdhani]">No users found</p>
            </Card>
          ) : (
            usersList.map((u) => (
              <Card key={u.id} className="bg-zinc-900/80 border-zinc-800 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      u.debugAccess ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {u.debugAccess ? <ShieldCheck className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="text-white font-[Rajdhani] font-semibold">
                        {u.name || 'Unnamed User'}
                        {u.role === 'admin' && (
                          <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded font-[Share_Tech_Mono]">ADMIN</span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 font-[Share_Tech_Mono]">
                        {u.email || 'No email'} · Last seen: {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString() : 'Never'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.debugAccess && u.debugPermission && (
                      <span className="text-xs text-zinc-500 font-[Share_Tech_Mono]">
                        {u.debugPermission.tokensUsed}/{u.debugPermission.tokenBudget} tokens
                      </span>
                    )}
                    {u.debugAccess ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => revokeAccess.mutate({ userId: u.id })}
                        className="border-red-600/50 text-red-400 hover:bg-red-600/20"
                        disabled={revokeAccess.isPending}
                      >
                        <ShieldX className="w-3 h-3 mr-1" /> Revoke
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => grantAccess.mutate({ userId: u.id, tokenBudget: 5000 })}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        disabled={grantAccess.isPending}
                      >
                        <ShieldCheck className="w-3 h-3 mr-1" /> Grant Debug
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
