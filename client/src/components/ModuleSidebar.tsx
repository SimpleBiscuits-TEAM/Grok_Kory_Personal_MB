/*
 * SectionSidebar — Left panel listing the 6 top-level sections with completion indicators.
 * Each section shows a mini progress bar and task count.
 * On mobile, shows as an overlay panel.
 */

import { type Task, type TopSection, TOP_SECTIONS } from "@/lib/taskData";
import { X, FlaskConical, Car, Radio, Wrench, Cpu, MoreHorizontal } from "lucide-react";

const SECTION_ICONS: Record<TopSection, typeof FlaskConical> = {
  "ANALYZER": FlaskConical,
  "VEHICLE SUPPORT": Car,
  "LIVE DATALOGGING": Radio,
  "CALIBRATION EDITOR": Wrench,
  "REVERSE ENGINEERING": Cpu,
  "MISC": MoreHorizontal,
};

interface SectionSidebarProps {
  open: boolean;
  tasks: Task[];
  activeSection: TopSection | null;
  onSelectSection: (section: TopSection | null) => void;
  onClose?: () => void;
}

export function ModuleSidebar({ open, tasks, activeSection, onSelectSection, onClose }: SectionSidebarProps) {
  return (
    <>
      {/* Mobile overlay backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`border-r border-border bg-card/95 backdrop-blur-sm overflow-y-auto transition-all duration-300 shrink-0
          ${open ? "w-64" : "w-0 border-r-0 overflow-hidden"}
          fixed top-0 left-0 h-full z-50
          lg:relative lg:top-auto lg:left-auto lg:h-auto lg:z-auto`}
      >
        <div className="p-3">
          {/* Header with close button */}
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-[10px] text-muted-foreground tracking-widest">SECTIONS</span>
            <div className="flex-1 h-px bg-border" />
            <button onClick={onClose} className="lg:hidden p-1 hover:bg-muted rounded-sm">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* ALL button */}
          <button
            onClick={() => {
              onSelectSection(null);
              if (onClose && window.innerWidth < 1024) onClose();
            }}
            className={`w-full text-left px-2.5 py-2 rounded-sm transition-all group mb-1 ${
              activeSection === null
                ? "bg-primary/10 border-l-2 border-primary"
                : "hover:bg-muted/50 border-l-2 border-transparent"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold ${activeSection === null ? "text-primary" : "text-foreground/80"}`}>
                ALL SECTIONS
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {tasks.filter((t) => t.status === "passed").length}/{tasks.length}
              </span>
            </div>
          </button>

          <div className="space-y-0.5">
            {TOP_SECTIONS.map((sec) => {
              const secTasks = tasks.filter((t) => t.topSection === sec);
              const passed = secTasks.filter((t) => t.status === "passed").length;
              const failed = secTasks.filter((t) => t.status === "failed").length;
              const total = secTasks.length;
              const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
              const isActive = activeSection === sec;
              const Icon = SECTION_ICONS[sec];

              return (
                <button
                  key={sec}
                  onClick={() => {
                    onSelectSection(sec);
                    if (onClose && window.innerWidth < 1024) onClose();
                  }}
                  className={`w-full text-left px-2.5 py-2.5 rounded-sm transition-all group ${
                    isActive
                      ? "bg-primary/10 border-l-2 border-primary"
                      : "hover:bg-muted/50 border-l-2 border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-semibold truncate flex items-center gap-1.5 ${
                        isActive ? "text-primary" : "text-foreground/80 group-hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      {sec}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0 ml-2">
                      {passed}/{total}
                    </span>
                  </div>

                  {/* Mini progress bar */}
                  <div className="h-1 bg-muted/50 rounded-sm overflow-hidden">
                    <div className="h-full flex">
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: "oklch(0.72 0.19 145)",
                        }}
                      />
                      {failed > 0 && (
                        <div
                          className="h-full transition-all duration-300"
                          style={{
                            width: `${(failed / total) * 100}%`,
                            backgroundColor: "oklch(0.62 0.24 25)",
                          }}
                        />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}
