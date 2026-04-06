/**
 * Tasks Page — V-OP QA Task Tracker
 * Access gated by @ppei email address
 * Integrates the full task tracker dashboard from the standalone project
 */

import { useState } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import PpeiHeader from '@/components/PpeiHeader';
import { useTaskStore } from '@/hooks/useTaskStore';
import { StatsBar } from '@/components/StatsBar';
import { FilterBar } from '@/components/FilterBar';
import { TaskTable } from '@/components/TaskTable';
import { SprintTimeline } from '@/components/SprintTimeline';
import { ModuleSidebar } from '@/components/ModuleSidebar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { RotateCcw, PanelLeftOpen, PanelLeftClose, ShieldAlert } from 'lucide-react';

const STORAGE_KEY = 'ppei_tasks_unlocked';

const sFont = {
  heading: '"Bebas Neue", "Impact", "Arial Black", sans-serif',
  body: '"Rajdhani", "Segoe UI", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

const sColor = {
  red: 'oklch(0.52 0.22 25)',
  bg: 'oklch(0.08 0.004 260)',
  border: 'oklch(0.20 0.008 260)',
  textDim: 'oklch(0.60 0.010 260)',
};

/** Check if user email ends with @ppei (case-insensitive) */
function isPpeiEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  // Match @ppei.com, @ppei.ai, or just @ppei as domain
  return lower.endsWith('@ppei.com') || lower.endsWith('@ppei.ai') || lower.endsWith('@ppei');
}

/** Access Gate — requires sign-in with @ppei email */
function TasksAccessGate() {
  const { user, loading } = useAuth();
  const [emailInput, setEmailInput] = useState('');
  const [error, setError] = useState('');

  // Loading state
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: sColor.bg }}>
        <PpeiHeader />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 120px)',
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: `3px solid ${sColor.red}40`,
            borderTop: `3px solid ${sColor.red}`,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // Signed in but not admin — show restricted message
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  if (!isAdmin) {
    return (
      <div style={{ minHeight: '100vh', background: sColor.bg }}>
        <PpeiHeader />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 120px)',
          padding: '2rem',
        }}>
          <div style={{
            maxWidth: '460px',
            width: '100%',
            textAlign: 'center',
            padding: '3rem 2rem',
            border: `1px solid ${sColor.border}`,
            background: 'oklch(0.10 0.004 260)',
          }}>
            <ShieldAlert style={{ width: 48, height: 48, color: sColor.red, margin: '0 auto 1.5rem' }} />
            <h2 style={{
              fontFamily: sFont.heading,
              fontSize: '1.8rem',
              letterSpacing: '0.08em',
              color: 'white',
              margin: '0 0 0.5rem 0',
            }}>ADMIN ACCESS ONLY</h2>
            <p style={{
              fontFamily: sFont.body,
              fontSize: '0.9rem',
              color: sColor.textDim,
              margin: '0 0 0.75rem 0',
              lineHeight: 1.6,
            }}>
              The QA Task Tracker is restricted to administrators.
              Contact a PPEI admin if you need access.
            </p>
            <p style={{
              fontFamily: sFont.mono,
              fontSize: '0.7rem',
              color: 'oklch(0.50 0.010 260)',
              margin: '0 0 1.5rem 0',
            }}>
              Signed in as: {user.email || user.name || 'Unknown'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Should not reach here — admin check passed above
  return null;
}

/** Main Tasks Dashboard */
/**
 * TasksContent — Embeddable version for use inside Advanced tabs (no header/wrapper)
 */
export function TasksContent() {
  const { user, isAuthenticated, loading } = useAuth();
  const store = useTaskStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  if (loading) return <div style={{ fontFamily: sFont.mono, color: sColor.textDim, fontSize: '0.8rem', padding: '2rem', textAlign: 'center' }}>LOADING...</div>;

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 200px)' }}>
      {/* Tasks Header Bar */}
      <div style={{ borderBottom: `1px solid ${sColor.border}`, background: 'oklch(0.10 0.004 260)' }}>
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-sm transition-colors" style={{ color: sColor.textDim }}>
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>
            <div className="flex items-center gap-2">
              <div style={{ width: '3px', height: '24px', background: sColor.red }} />
              <h2 style={{ fontFamily: sFont.heading, fontSize: '1.4rem', letterSpacing: '0.08em', color: 'white', lineHeight: 1, margin: 0, paddingTop: '2px' }}>V-OP QA TRACKER</h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim }} className="hidden md:block">PPEI Engineering</span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs border-border/60 hover:border-destructive hover:text-destructive" style={{ fontFamily: sFont.mono }}>
                  <RotateCcw className="w-3 h-3" /> RESET
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card border-border">
                <AlertDialogHeader>
                  <AlertDialogTitle style={{ fontFamily: sFont.heading, fontSize: '1.2rem', letterSpacing: '0.06em' }}>RESET ALL PROGRESS?</AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground">This will reset all task statuses back to "Not Started". This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel style={{ fontFamily: sFont.mono, fontSize: '0.7rem' }}>CANCEL</AlertDialogCancel>
                  <AlertDialogAction onClick={store.resetAll} className="bg-destructive text-destructive-foreground" style={{ fontFamily: sFont.mono, fontSize: '0.7rem' }}>RESET ALL</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
      <SprintTimeline />
      <StatsBar stats={store.stats} />
      <div className="flex-1 flex overflow-hidden">
        <ModuleSidebar open={sidebarOpen} tasks={store.tasks} activeModule={store.filters.module} onSelectModule={(m: number) => store.setFilters((prev) => ({ ...prev, module: prev.module === m ? null : m }))} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 min-w-0 flex flex-col">
          <FilterBar filters={store.filters} setFilters={store.setFilters} />
          <TaskTable tasks={store.filteredTasks} onStatusChange={store.updateStatus} />
        </main>
      </div>
    </div>
  );
}

export default function Tasks() {
  const { user, isAuthenticated, loading } = useAuth();
  const store = useTaskStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Admin-only access: only admin/super_admin roles can view Tasks
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  // Show gate if no access
  if (loading || !isAuthenticated || !isAdmin) {
    return <TasksAccessGate />;
  }

  return (
    <div style={{ minHeight: '100vh', background: sColor.bg }} className="flex flex-col">
      <PpeiHeader />

      {/* Tasks Header Bar */}
      <div style={{
        borderBottom: `1px solid ${sColor.border}`,
        background: 'oklch(0.10 0.004 260)',
      }}>
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Sidebar toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-sm transition-colors"
              style={{ color: sColor.textDim }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'oklch(0.16 0.008 260)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4" />
              )}
            </button>
            <div className="flex items-center gap-2">
              <div style={{ width: '3px', height: '24px', background: sColor.red }} />
              <h2 style={{
                fontFamily: sFont.heading,
                fontSize: '1.4rem',
                letterSpacing: '0.08em',
                color: 'white',
                lineHeight: 1,
                margin: 0,
                paddingTop: '2px',
              }}>
                V-OP QA TRACKER
              </h2>
            </div>
            <span style={{
              fontFamily: sFont.mono,
              fontSize: '0.6rem',
              color: sColor.textDim,
              background: 'oklch(0.14 0.006 260)',
              padding: '2px 8px',
              border: `1px solid ${sColor.border}`,
            }}>
              v0.03
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span style={{
              fontFamily: sFont.mono,
              fontSize: '0.6rem',
              color: sColor.textDim,
            }} className="hidden md:block">
              PPEI Engineering — Sprint Mar 31 – Apr 27, 2026
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs border-border/60 hover:border-destructive hover:text-destructive" style={{ fontFamily: sFont.mono }}>
                  <RotateCcw className="w-3 h-3" />
                  RESET
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card border-border">
                <AlertDialogHeader>
                  <AlertDialogTitle style={{ fontFamily: sFont.heading, fontSize: '1.2rem', letterSpacing: '0.06em' }}>RESET ALL PROGRESS?</AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground">
                    This will reset all task statuses back to "Not Started". This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel style={{ fontFamily: sFont.mono, fontSize: '0.7rem' }}>CANCEL</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={store.resetAll}
                    className="bg-destructive text-destructive-foreground"
                    style={{ fontFamily: sFont.mono, fontSize: '0.7rem' }}
                  >
                    RESET ALL
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Sprint Timeline */}
      <SprintTimeline />

      {/* Stats Bar */}
      <StatsBar stats={store.stats} />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Module Sidebar */}
        <ModuleSidebar
          open={sidebarOpen}
          tasks={store.tasks}
          activeModule={store.filters.module}
          onSelectModule={(m: number) =>
            store.setFilters((prev) => ({
              ...prev,
              module: prev.module === m ? null : m,
            }))
          }
          onClose={() => setSidebarOpen(false)}
        />

        {/* Task List */}
        <main className="flex-1 min-w-0 flex flex-col">
          <FilterBar filters={store.filters} setFilters={store.setFilters} />
          <TaskTable tasks={store.filteredTasks} onStatusChange={store.updateStatus} />
        </main>
      </div>
    </div>
  );
}
