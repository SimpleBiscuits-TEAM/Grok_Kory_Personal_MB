/*
 * TaskTable — Dense task list grouped by top section / subsection.
 * Features:
 *   - Click-to-cycle status icon
 *   - "Move to..." section dropdown on hover
 *   - Click row to expand → shows debugging notes textarea (auto-saves on blur)
 *   - Notes indicator dot on rows that have notes
 */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  type Task,
  type Status,
  type Priority,
  type TopSection,
  TOP_SECTIONS,
} from "@/lib/taskData";
import {
  CircleDot,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  ChevronDown,
  ChevronRight,
  StickyNote,
  MessageSquare,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TaskTableProps {
  tasks: Task[];
  onStatusChange: (taskId: string, status: Status) => void;
  onMoveTask?: (taskId: string, newSection: TopSection) => void;
  onUpdateNotes?: (taskId: string, notes: string) => void;
  getNotes?: (taskId: string) => string;
}

const statusCycle: Status[] = [
  "not_started",
  "in_progress",
  "passed",
  "failed",
  "blocked",
];

function nextStatus(current: Status): Status {
  const idx = statusCycle.indexOf(current);
  return statusCycle[(idx + 1) % statusCycle.length];
}

const statusConfig: Record<
  Status,
  { icon: typeof CircleDot; label: string; color: string; bg: string }
> = {
  not_started: {
    icon: CircleDot,
    label: "Not Started",
    color: "text-muted-foreground",
    bg: "",
  },
  in_progress: {
    icon: Clock,
    label: "In Progress",
    color: "text-[oklch(0.75_0.15_85)]",
    bg: "bg-[oklch(0.75_0.15_85)]/5",
  },
  passed: {
    icon: CheckCircle2,
    label: "Passed",
    color: "text-[oklch(0.72_0.19_145)]",
    bg: "bg-[oklch(0.72_0.19_145)]/5",
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    color: "text-[oklch(0.62_0.24_25)]",
    bg: "bg-[oklch(0.62_0.24_25)]/5",
  },
  blocked: {
    icon: Ban,
    label: "Blocked",
    color: "text-[oklch(0.55_0.15_300)]",
    bg: "bg-[oklch(0.55_0.15_300)]/5",
  },
};

const priorityConfig: Record<Priority, { color: string }> = {
  P1: { color: "bg-[oklch(0.52_0.22_25)] text-white" },
  P2: { color: "bg-[oklch(0.75_0.15_85)] text-black" },
  P3: { color: "bg-[oklch(0.65_0.15_200)] text-white" },
  P4: { color: "bg-muted text-muted-foreground" },
};

export function TaskTable({
  tasks,
  onStatusChange,
  onMoveTask,
  onUpdateNotes,
  getNotes,
}: TaskTableProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  // Group tasks by topSection then subsection
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { topSection: TopSection; subsection: string; tasks: Task[] }
    >();
    for (const task of tasks) {
      const key = `${task.topSection}::${task.subsection}`;
      if (!map.has(key)) {
        map.set(key, {
          topSection: task.topSection,
          subsection: task.subsection,
          tasks: [],
        });
      }
      map.get(key)!.tasks.push(task);
    }
    return Array.from(map.values()).sort((a, b) => {
      const ai = TOP_SECTIONS.indexOf(a.topSection);
      const bi = TOP_SECTIONS.indexOf(b.topSection);
      if (ai !== bi) return ai - bi;
      return a.subsection.localeCompare(b.subsection);
    });
  }, [tasks]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleExpand = useCallback((taskId: string) => {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
  }, []);

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
        const key = `${group.topSection}::${group.subsection}`;
        const isCollapsed = collapsedGroups.has(key);
        const passed = group.tasks.filter(
          (t) => t.status === "passed"
        ).length;
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
              <span className="text-xs font-semibold text-foreground/90 truncate">
                {group.subsection}
              </span>
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
                  <TaskRow
                    key={task.id}
                    task={task}
                    isExpanded={expandedTaskId === task.id}
                    onToggleExpand={toggleExpand}
                    onStatusChange={onStatusChange}
                    onMoveTask={onMoveTask}
                    onUpdateNotes={onUpdateNotes}
                    getNotes={getNotes}
                  />
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
  isExpanded,
  onToggleExpand,
  onStatusChange,
  onMoveTask,
  onUpdateNotes,
  getNotes,
}: {
  task: Task;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onStatusChange: (id: string, status: Status) => void;
  onMoveTask?: (id: string, newSection: TopSection) => void;
  onUpdateNotes?: (id: string, notes: string) => void;
  getNotes?: (id: string) => string;
}) {
  const sc = statusConfig[task.status];
  const pc = priorityConfig[task.priority];
  const Icon = sc.icon;
  const notes = getNotes ? getNotes(task.id) : "";
  const hasNotes = notes.length > 0;

  return (
    <div className="border-b border-border/20">
      {/* Main row */}
      <div
        className={`flex items-center gap-3 px-4 py-1.5 hover:bg-muted/10 transition-colors group cursor-pointer ${sc.bg} ${isExpanded ? "bg-muted/15" : ""}`}
        onClick={(e) => {
          // Don't expand when clicking on interactive elements
          const target = e.target as HTMLElement;
          if (
            target.closest("button") ||
            target.closest("select") ||
            target.tagName === "SELECT" ||
            target.tagName === "OPTION"
          ) {
            return;
          }
          onToggleExpand(task.id);
        }}
      >
        {/* Status button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange(task.id, nextStatus(task.status));
              }}
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
        <span className="font-mono text-[11px] text-muted-foreground shrink-0 w-12">
          {task.id}
        </span>

        {/* Priority badge */}
        <span
          className={`font-mono text-[9px] font-bold px-1.5 py-0.5 shrink-0 rounded-sm ${pc.color}`}
        >
          {task.priority}
        </span>

        {/* Task name */}
        <span className="text-sm text-foreground/90 truncate flex-1 min-w-0">
          {task.name}
        </span>

        {/* Notes indicator */}
        {hasNotes && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0">
                <MessageSquare className="w-3.5 h-3.5 text-[oklch(0.65_0.15_200)] opacity-70" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="font-mono text-xs max-w-[200px]">
              Has notes — click row to view
            </TooltipContent>
          </Tooltip>
        )}

        {/* Expand indicator */}
        <span className="shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </span>

        {/* Move to section dropdown */}
        {onMoveTask && (
          <Tooltip>
            <TooltipTrigger asChild>
              <select
                value={task.topSection}
                onChange={(e) => {
                  e.stopPropagation();
                  onMoveTask(task.id, e.target.value as TopSection);
                }}
                onClick={(e) => e.stopPropagation()}
                className="font-mono text-[9px] bg-transparent border border-border/30 rounded-sm px-1 py-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 shrink-0 max-w-[100px] cursor-pointer"
              >
                {TOP_SECTIONS.map((s) => (
                  <option
                    key={s}
                    value={s}
                    className="bg-card text-foreground text-[10px]"
                  >
                    {s}
                  </option>
                ))}
              </select>
            </TooltipTrigger>
            <TooltipContent side="left" className="font-mono text-xs">
              Move to another section
            </TooltipContent>
          </Tooltip>
        )}

        {/* Status dropdown for direct selection */}
        <select
          value={task.status}
          onChange={(e) => {
            e.stopPropagation();
            onStatusChange(task.id, e.target.value as Status);
          }}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-[10px] bg-transparent border border-border/30 rounded-sm px-1 py-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 shrink-0"
        >
          {statusCycle.map((s) => (
            <option key={s} value={s} className="bg-card text-foreground">
              {statusConfig[s].label}
            </option>
          ))}
        </select>
      </div>

      {/* Expanded notes panel */}
      {isExpanded && (
        <ExpandedNotesPanel
          taskId={task.id}
          taskName={task.name}
          status={task.status}
          notes={notes}
          onUpdateNotes={onUpdateNotes}
        />
      )}
    </div>
  );
}

function ExpandedNotesPanel({
  taskId,
  taskName,
  status,
  notes,
  onUpdateNotes,
}: {
  taskId: string;
  taskName: string;
  status: Status;
  notes: string;
  onUpdateNotes?: (id: string, notes: string) => void;
}) {
  const [localNotes, setLocalNotes] = useState(notes);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync with prop changes (e.g., when DB data arrives after panel is expanded)
  useEffect(() => {
    setLocalNotes(notes);
  }, [notes]);

  const handleChange = (value: string) => {
    setLocalNotes(value);

    // Debounced auto-save (1.5s after last keystroke)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      onUpdateNotes?.(taskId, value);
    }, 1500);
  };

  const handleBlur = () => {
    // Immediate save on blur
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (localNotes !== notes) {
      onUpdateNotes?.(taskId, localNotes);
    }
  };

  const sc = statusConfig[status];

  return (
    <div className="px-4 pb-3 pt-1 bg-muted/5 border-t border-border/10">
      <div className="flex items-center gap-2 mb-2">
        <StickyNote className="w-3.5 h-3.5 text-muted-foreground/60" />
        <span className="text-[11px] font-mono text-muted-foreground/70 uppercase tracking-wider">
          Debugging Notes
        </span>
        <span className={`text-[10px] font-mono ${sc.color} ml-auto`}>
          {sc.label}
        </span>
      </div>
      <textarea
        ref={textareaRef}
        value={localNotes}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        placeholder={`Add debugging notes for "${taskName}"...\n\nExamples:\n- Root cause found: missing null check in parser\n- Blocked by Tobi's PCAN bridge update\n- Works on LBZ, fails on L5P — needs ECU-specific handling`}
        className="w-full min-h-[100px] max-h-[300px] resize-y bg-background/50 border border-border/30 rounded-md px-3 py-2 text-sm text-foreground/90 font-mono placeholder:text-muted-foreground/30 placeholder:text-xs focus:outline-none focus:ring-1 focus:ring-[oklch(0.65_0.15_200)]/50 focus:border-[oklch(0.65_0.15_200)]/30 transition-colors"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-muted-foreground/40 font-mono">
          Auto-saves on blur or after 1.5s idle
        </span>
        <span className="text-[10px] text-muted-foreground/40 font-mono">
          {localNotes.length > 0 ? `${localNotes.length} chars` : "empty"}
        </span>
      </div>
    </div>
  );
}
