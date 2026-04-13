/*
 * ModuleSidebar — Left panel listing all functional sections with completion indicators.
 * Each section shows a mini progress bar and task count.
 * On mobile, shows as an overlay panel.
 */

import { type Task } from "@/lib/taskData";
import { modules } from "@/lib/taskData";
import { X } from "lucide-react";

interface ModuleSidebarProps {
  open: boolean;
  tasks: Task[];
  activeModule: number | null;
  onSelectModule: (moduleId: number) => void;
  onClose?: () => void;
}

export function ModuleSidebar({ open, tasks, activeModule, onSelectModule, onClose }: ModuleSidebarProps) {
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

          <div className="space-y-0.5">
            {modules.map((mod) => {
              const modTasks = tasks.filter((t) => t.module === mod.id);
              const passed = modTasks.filter((t) => t.status === "passed").length;
              const failed = modTasks.filter((t) => t.status === "failed").length;
              const total = modTasks.length;
              const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
              const isActive = activeModule === mod.id;

              return (
                <button
                  key={mod.id}
                  onClick={() => {
                    onSelectModule(mod.id);
                    if (onClose && window.innerWidth < 1024) onClose();
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-sm transition-all group ${
                    isActive
                      ? "bg-primary/10 border-l-2 border-primary"
                      : "hover:bg-muted/50 border-l-2 border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-semibold truncate ${
                        isActive ? "text-primary" : "text-foreground/80 group-hover:text-foreground"
                      }`}
                    >
                      <span className="font-mono text-[10px] text-muted-foreground mr-1.5">{mod.id}.</span>
                      {mod.name}
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
