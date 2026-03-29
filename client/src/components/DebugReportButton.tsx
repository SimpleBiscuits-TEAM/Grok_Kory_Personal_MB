/**
 * DebugReportButton — Floating debug button for authorized users
 * 
 * Only visible to users who have been granted debug access by an admin.
 * Provides a bug report form and shows the user's debug session history.
 */

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  Bug, X, Send, CheckCircle, XCircle, Clock,
  AlertTriangle, ChevronDown, ChevronUp, Loader2
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Status display helpers ─────────────────────────────────────────────────
const STATUS_INFO: Record<string, { label: string; color: string; icon: typeof Bug }> = {
  submitted: { label: 'Submitted', color: 'text-blue-400', icon: Clock },
  analyzing: { label: 'Erika Analyzing...', color: 'text-yellow-400', icon: Loader2 },
  tier1_auto_fix: { label: 'Auto-Fixing...', color: 'text-green-400', icon: Loader2 },
  tier2_pending: { label: 'Awaiting Admin Approval', color: 'text-orange-400', icon: Clock },
  tier2_approved: { label: 'Approved — Fixing', color: 'text-green-400', icon: CheckCircle },
  tier2_rejected: { label: 'Rejected by Admin', color: 'text-red-400', icon: XCircle },
  fixing: { label: 'Fix in Progress...', color: 'text-purple-400', icon: Loader2 },
  awaiting_retest: { label: 'Please Retest', color: 'text-cyan-400', icon: AlertTriangle },
  confirmed_fixed: { label: 'Fixed', color: 'text-emerald-400', icon: CheckCircle },
  still_broken: { label: 'Still Broken', color: 'text-red-400', icon: XCircle },
  escalated: { label: 'Escalated to Admin', color: 'text-red-300', icon: AlertTriangle },
  closed: { label: 'Closed', color: 'text-zinc-400', icon: CheckCircle },
};

const FEATURE_AREAS = [
  { value: 'analyzer', label: 'Analyzer (CSV Upload)' },
  { value: 'datalogger', label: 'Live Datalogger' },
  { value: 'editor', label: 'Calibration Editor' },
  { value: 'tune_compare', label: 'Tune Compare' },
  { value: 'binary_upload', label: 'Binary Upload' },
  { value: 'intellispy', label: 'IntelliSpy' },
  { value: 'vehicle_coding', label: 'Vehicle Coding' },
  { value: 'canam_vin', label: 'Can-Am VIN' },
  { value: 'service_procedures', label: 'Service Procedures' },
  { value: 'health_report', label: 'Health Report' },
  { value: 'dyno_charts', label: 'Dyno Charts' },
  { value: 'diagnostic_report', label: 'Diagnostic Report' },
  { value: 'drag_timeslip', label: 'Drag Timeslip' },
  { value: 'voice_commands', label: 'Voice Commands' },
  { value: 'ecu_reference', label: 'ECU Reference' },
  { value: 'dtc_search', label: 'DTC Search' },
  { value: 'pid_audit', label: 'PID Audit' },
  { value: 'live_gauges', label: 'Live Gauges' },
  { value: 'qa_checklist', label: 'QA Checklist' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'home_page', label: 'Home Page' },
  { value: 'other', label: 'Other' },
] as const;

export default function DebugReportButton() {
  const { user, isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expandedSession, setExpandedSession] = useState<number | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [actualBehavior, setActualBehavior] = useState('');
  const [featureArea, setFeatureArea] = useState<string>('');

  // Check if user has debug access
  const accessQuery = trpc.debug.checkAccess.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // Get user's debug sessions
  const sessionsQuery = trpc.debug.mySessions.useQuery(undefined, {
    enabled: isAuthenticated && (accessQuery.data?.hasAccess ?? false),
    refetchInterval: 10000,
  });

  // Submit bug report
  const submitReport = trpc.debug.submitReport.useMutation({
    onSuccess: (data) => {
      toast.success(`Bug report #${data.sessionId} submitted! Erika is analyzing...`);
      setShowForm(false);
      resetForm();
      sessionsQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  // Submit retest feedback
  const submitRetest = trpc.debug.submitRetest.useMutation({
    onSuccess: (data) => {
      toast.success(data.status === 'confirmed_fixed' ? 'Marked as fixed!' : 'Feedback submitted — Erika will re-analyze');
      sessionsQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setStepsToReproduce('');
    setExpectedBehavior('');
    setActualBehavior('');
    setFeatureArea('');
  };

  // Don't show if user doesn't have debug access
  if (!isAuthenticated || !accessQuery.data?.hasAccess) return null;

  const sessions = sessionsQuery.data ?? [];
  const awaitingRetest = sessions.filter(s => s.status === 'awaiting_retest');

  return (
    <>
      {/* Floating Debug Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-20 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 ${
          isOpen
            ? 'bg-zinc-800 text-zinc-400 rotate-45'
            : 'bg-purple-600 text-white hover:bg-purple-700'
        }`}
        title="Debug Report"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Bug className="w-5 h-5" />}
        {/* Badge for awaiting retest */}
        {!isOpen && awaitingRetest.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-cyan-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">
            {awaitingRetest.length}
          </span>
        )}
      </button>

      {/* Debug Panel */}
      {isOpen && (
        <div className="fixed bottom-36 right-6 z-50 w-[420px] max-h-[70vh] bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden flex flex-col">
          {/* Panel Header */}
          <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/95">
            <div className="flex items-center gap-2">
              <Bug className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-[Rajdhani] font-semibold text-white">Debug Reporter</span>
            </div>
            <Button
              size="sm"
              onClick={() => { setShowForm(true); }}
              className="bg-red-600 hover:bg-red-700 text-white text-xs h-7 px-3"
            >
              <Bug className="w-3 h-3 mr-1" /> New Bug Report
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* New Bug Report Form */}
            {showForm && (
              <div className="bg-zinc-800/50 rounded p-3 border border-zinc-700 space-y-3">
                <h3 className="text-sm font-[Rajdhani] font-semibold text-white">Report a Bug</h3>

                <div>
                  <label className="text-xs text-zinc-500 font-[Share_Tech_Mono] block mb-1">Title *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief description of the bug"
                    className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500/50"
                  />
                </div>

                <div>
                  <label className="text-xs text-zinc-500 font-[Share_Tech_Mono] block mb-1">Feature Area</label>
                  <select
                    value={featureArea}
                    onChange={(e) => setFeatureArea(e.target.value)}
                    className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-white focus:outline-none focus:border-purple-500/50"
                  >
                    <option value="">Select area...</option>
                    {FEATURE_AREAS.map(a => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-zinc-500 font-[Share_Tech_Mono] block mb-1">Description *</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What happened? Be as specific as possible."
                    rows={3}
                    className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs text-zinc-500 font-[Share_Tech_Mono] block mb-1">Steps to Reproduce</label>
                  <textarea
                    value={stepsToReproduce}
                    onChange={(e) => setStepsToReproduce(e.target.value)}
                    placeholder="1. Go to...\n2. Click on...\n3. See error..."
                    rows={2}
                    className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-zinc-500 font-[Share_Tech_Mono] block mb-1">Expected</label>
                    <textarea
                      value={expectedBehavior}
                      onChange={(e) => setExpectedBehavior(e.target.value)}
                      placeholder="What should happen"
                      rows={2}
                      className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 font-[Share_Tech_Mono] block mb-1">Actual</label>
                    <textarea
                      value={actualBehavior}
                      onChange={(e) => setActualBehavior(e.target.value)}
                      placeholder="What actually happens"
                      rows={2}
                      className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 resize-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setShowForm(false); resetForm(); }}
                    className="border-zinc-700 text-zinc-400 h-7 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!title.trim() || !description.trim()) {
                        toast.error('Title and description are required');
                        return;
                      }
                      submitReport.mutate({
                        title: title.trim(),
                        description: description.trim(),
                        stepsToReproduce: stepsToReproduce.trim() || undefined,
                        expectedBehavior: expectedBehavior.trim() || undefined,
                        actualBehavior: actualBehavior.trim() || undefined,
                        featureArea: (featureArea || undefined) as any,
                        browserInfo: navigator.userAgent,
                      });
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white h-7 text-xs"
                    disabled={submitReport.isPending}
                  >
                    {submitReport.isPending ? (
                      <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Submitting...</>
                    ) : (
                      <><Send className="w-3 h-3 mr-1" /> Submit Report</>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Session History */}
            {sessions.length === 0 && !showForm ? (
              <div className="text-center py-8">
                <Bug className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500 font-[Rajdhani]">No bug reports yet</p>
                <p className="text-xs text-zinc-600 mt-1">Click "New Bug Report" to submit one</p>
              </div>
            ) : (
              sessions.map((s) => {
                const info = STATUS_INFO[s.status] || STATUS_INFO.submitted;
                const StatusIcon = info.icon;
                const isExpanded = expandedSession === s.id;

                return (
                  <div key={s.id} className="bg-zinc-800/30 rounded border border-zinc-800 overflow-hidden">
                    <div
                      className="p-2.5 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                      onClick={() => setExpandedSession(isExpanded ? null : s.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <StatusIcon className={`w-3.5 h-3.5 shrink-0 ${info.color} ${
                            ['analyzing', 'tier1_auto_fix', 'fixing'].includes(s.status) ? 'animate-spin' : ''
                          }`} />
                          <span className="text-xs text-white font-[Rajdhani] font-semibold truncate">
                            #{s.id} — {s.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[10px] font-[Share_Tech_Mono] ${info.color}`}>
                            {info.label}
                          </span>
                          {isExpanded ? <ChevronUp className="w-3 h-3 text-zinc-500" /> : <ChevronDown className="w-3 h-3 text-zinc-500" />}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-zinc-800 p-2.5 space-y-2">
                        <p className="text-xs text-zinc-400 font-[Rajdhani]">{s.description}</p>

                        {s.rootCause && (
                          <div className="bg-zinc-900/50 rounded p-2 border-l-2 border-purple-500">
                            <p className="text-[10px] text-purple-400 font-[Share_Tech_Mono] uppercase">Erika's Analysis</p>
                            <p className="text-xs text-zinc-300 font-[Rajdhani] mt-0.5">{s.rootCause}</p>
                          </div>
                        )}

                        {/* Retest buttons */}
                        {s.status === 'awaiting_retest' && (
                          <div className="bg-cyan-500/10 rounded p-2 border border-cyan-500/20">
                            <p className="text-xs text-cyan-400 font-[Rajdhani] font-semibold mb-2">
                              A fix has been applied. Does it work now?
                            </p>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => submitRetest.mutate({ sessionId: s.id, isFixed: true })}
                                className="bg-green-600 hover:bg-green-700 text-white h-6 text-[10px] px-2"
                                disabled={submitRetest.isPending}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" /> Yes, Fixed!
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const feedback = prompt('What\'s still broken? (optional)');
                                  submitRetest.mutate({
                                    sessionId: s.id,
                                    isFixed: false,
                                    feedback: feedback || undefined,
                                  });
                                }}
                                className="border-red-600/50 text-red-400 hover:bg-red-600/20 h-6 text-[10px] px-2"
                                disabled={submitRetest.isPending}
                              >
                                <XCircle className="w-3 h-3 mr-1" /> Still Broken
                              </Button>
                            </div>
                          </div>
                        )}

                        <div className="text-[10px] text-zinc-600 font-[Share_Tech_Mono]">
                          {s.featureArea && <span>Area: {s.featureArea} · </span>}
                          Created: {new Date(s.createdAt).toLocaleString()}
                          {s.retestCount ? ` · Retests: ${s.retestCount}` : ''}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
}
