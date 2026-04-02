/*
 * TaskTable — Dense task list grouped by module/section with click-to-cycle status.
 * Automotive warning indicator style for priority badges.
 */

import { useState, useMemo } from "react";
import { type Task, type Status, type Priority } from "@/lib/taskData";
import {
  CircleDot,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TaskTableProps {
  tasks: Task[];
  onStatusChange: (taskId: string, status: Status) => void;
}

const statusCycle: Status[] = ["not_started", "in_progress", "passed", "failed", "blocked"];

function nextStatus(current: Status): Status {
  const idx = statusCycle.indexOf(current);
  return statusCycle[(idx + 1) % statusCycle.length];
}

const statusConfig: Record<Status, { icon: typeof CircleDot; label: string; color: string; bg: string }> = {
  not_started: { icon: CircleDot, label: "Not Started", color: "text-muted-foreground", bg: "" },
  in_progress: { icon: Clock, label: "In Progress", color: "text-[oklch(0.75_0.15_85)]", bg: "bg-[oklch(0.75_0.15_85)]/5" },
  passed: { icon: CheckCircle2, label: "Passed", color: "text-[oklch(0.72_0.19_145)]", bg: "bg-[oklch(0.72_0.19_145)]/5" },
  failed: { icon: XCircle, label: "Failed", color: "text-[oklch(0.62_0.24_25)]", bg: "bg-[oklch(0.62_0.24_25)]/5" },
  blocked: { icon: Ban, label: "Blocked", color: "text-[oklch(0.55_0.15_300)]", bg: "bg-[oklch(0.55_0.15_300)]/5" },
};

const priorityConfig: Record<Priority, { color: string }> = {
  P1: { color: "bg-[oklch(0.52_0.22_25)] text-white" },
  P2: { color: "bg-[oklch(0.75_0.15_85)] text-black" },
  P3: { color: "bg-[oklch(0.65_0.15_200)] text-white" },
  P4: { color: "bg-muted text-muted-foreground" },
};

export function TaskTable({ tasks, onStatusChange }: TaskTableProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Group tasks by module then section
  const grouped = useMemo(() => {
    const map = new Map<string, { moduleName: string; moduleId: number; section: string; tasks: Task[] }>();
    for (const task of tasks) {
      const key = `${task.module}-${task.section}`;
      if (!map.has(key)) {
        map.set(key, { moduleName: task.moduleName, moduleId: task.module, section: task.section, tasks: [] });
      }
      map.get(key)!.tasks.push(task);
    }
    return Array.from(map.values());
  }, [tasks]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <CircleDot className="w-10 h-10 mb-3 opacity-30" />
        <p className="font-mono text-sm">No tasks match current filters</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {grouped.map((group) => {
        const key = `${group.moduleId}-${group.section}`;
        const isCollapsed = collapsedGroups.has(key);
        const passed = group.tasks.filter((t) => t.status === "passed").length;
        const total = group.tasks.length;

        return (
          <div key={key} className="border-b border-border/50">
            {/* Group header */}
            <button
              onClick={() => toggleGroup(key)}
              className="w-full flex items-center gap-2 px-4 py-2 bg-muted/20 hover:bg-muted/30 transition-colors text-left sticky top-0 z-10"
            >
              {isCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="font-mono text-[10px] text-primary shrink-0">M{group.moduleId}</span>
              <span className="text-xs font-semibold text-foreground/90 truncate">
                {group.moduleName}
              </span>
              <span className="text-[10px] text-muted-foreground hidden sm:inline">—</span>
              <span className="text-xs text-muted-foreground truncate hidden sm:inline">{group.section}</span>
              <div className="flex-1" />
              <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                {passed}/{total}
              </span>
              <div className="w-12 h-1 bg-muted rounded-sm overflow-hidden shrink-0">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${total > 0 ? (passed / total) * 100 : 0}%`,
                    backgroundColor: "oklch(0.72 0.19 145)",
                  }}
                />
              </div>
            </button>

            {/* Task rows */}
            {!isCollapsed && (
              <div>
                {group.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} onStatusChange={onStatusChange} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Bottom padding */}
      <div className="h-8" />
    </div>
  );
}

function TaskRow({
  task,
  onStatusChange,
}: {
  task: Task;
  onStatusChange: (id: string, status: Status) => void;
}) {
  const sc = statusConfig[task.status];
  const pc = priorityConfig[task.priority];
  const Icon = sc.icon;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-1.5 border-b border-border/20 hover:bg-muted/10 transition-colors group ${sc.bg}`}
    >
      {/* Status button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onStatusChange(task.id, nextStatus(task.status))}
            className={`shrink-0 transition-transform hover:scale-110 ${sc.color}`}
          >
            <Icon className="w-4 h-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="font-mono text-xs">
          {sc.label} — Click to cycle
        </TooltipContent>
      </Tooltip>

      {/* Task ID */}
      <span className="font-mono text-[11px] text-muted-foreground shrink-0 w-12">{task.id}</span>

      {/* Priority badge */}
      <span
        className={`font-mono text-[9px] font-bold px-1.5 py-0.5 shrink-0 rounded-sm ${pc.color}`}
      >
        {task.priority}
      </span>

      {/* Task name */}
      <span className="text-sm text-foreground/90 truncate flex-1 min-w-0">{task.name}</span>

      {/* Week badge */}
      <span className="font-mono text-[10px] text-muted-foreground shrink-0 hidden sm:block">
        W{task.week}
      </span>

      {/* Status dropdown for direct selection */}
      <select
        value={task.status}
        onChange={(e) => onStatusChange(task.id, e.target.value as Status)}
        className="font-mono text-[10px] bg-transparent border border-border/30 rounded-sm px-1 py-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 shrink-0"
      >
        {statusCycle.map((s) => (
          <option key={s} value={s} className="bg-card text-foreground">
            {statusConfig[s].label}
          </option>
        ))}
      </select>
    </div>
  );
}
