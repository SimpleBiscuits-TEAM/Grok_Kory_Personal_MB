/**
 * Tasks Page — V-OP QA Task Tracker
 * Organized by 6 top-level sections: Analyzer, Vehicle Support, Live Datalogging,
 * Calibration Editor, Reverse Engineering, MISC
 */

import { useState } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import PpeiHeader from '@/components/PpeiHeader';
import { useTaskStore } from '@/hooks/useTaskStore';
import { StatsBar } from '@/components/StatsBar';
import { FilterBar } from '@/components/FilterBar';
import { TaskTable } from '@/components/TaskTable';
import { ModuleSidebar } from '@/components/ModuleSidebar';
import type { TopSection } from '@/lib/taskData';
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
import { RotateCcw, PanelLeftOpen, PanelLeftClose } from 'lucide-react';

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

/**
 * TasksContent — Embeddable version for use inside Advanced tabs (no header/wrapper)
 */
export function TasksContent() {
  const { loading } = useAuth();
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
                  <AlertDialogDescription className="text-muted-foreground">This will reset all task statuses and section moves back to defaults. This action cannot be undone.</AlertDialogDescription>
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
      <StatsBar stats={store.stats} />
      <div className="flex-1 flex overflow-hidden">
        <ModuleSidebar
          open={sidebarOpen}
          tasks={store.tasks}
          activeSection={store.filters.topSection}
          onSelectSection={(s: TopSection | null) => store.setFilters((prev) => ({ ...prev, topSection: s }))}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="flex-1 min-w-0 flex flex-col">
          <FilterBar filters={store.filters} setFilters={store.setFilters} />
          <TaskTable tasks={store.filteredTasks} onStatusChange={store.updateStatus} onMoveTask={store.moveTask} onUpdateNotes={store.updateNotes} getNotes={store.getNotes} />
        </main>
      </div>
    </div>
  );
}

export default function Tasks() {
  const { loading } = useAuth();
  const store = useTaskStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-sm transition-colors"
              style={{ color: sColor.textDim }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'oklch(0.16 0.008 260)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
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
              v0.04
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span style={{
              fontFamily: sFont.mono,
              fontSize: '0.6rem',
              color: sColor.textDim,
            }} className="hidden md:block">
              PPEI Engineering
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
                    This will reset all task statuses and section moves back to defaults. This action cannot be undone.
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

      {/* Stats Bar */}
      <StatsBar stats={store.stats} />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Section Sidebar */}
        <ModuleSidebar
          open={sidebarOpen}
          tasks={store.tasks}
          activeSection={store.filters.topSection}
          onSelectSection={(s: TopSection | null) => store.setFilters((prev) => ({ ...prev, topSection: s }))}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Task List */}
        <main className="flex-1 min-w-0 flex flex-col">
          <FilterBar filters={store.filters} setFilters={store.setFilters} />
          <TaskTable tasks={store.filteredTasks} onStatusChange={store.updateStatus} onMoveTask={store.moveTask} onUpdateNotes={store.updateNotes} getNotes={store.getNotes} />
        </main>
      </div>
    </div>
  );
}
