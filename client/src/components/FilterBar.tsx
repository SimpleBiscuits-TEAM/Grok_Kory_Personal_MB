/*
 * FilterBar — Horizontal filter strip with search, priority, week, and status filters.
 * Styled like tuning controls: instant response, monospaced labels.
 */

import { type Filters } from "@/hooks/useTaskStore";
import { type Priority, type Week, type Status } from "@/lib/taskData";
import { Search, X } from "lucide-react";

interface FilterBarProps {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
}

export function FilterBar({ filters, setFilters }: FilterBarProps) {
  const priorities: Priority[] = ["P1", "P2", "P3"];
  const weeks: Week[] = [1, 2, 3, 4];
  const statuses: { value: Status; label: string }[] = [
    { value: "not_started", label: "NOT STARTED" },
    { value: "in_progress", label: "IN PROGRESS" },
    { value: "passed", label: "PASSED" },
    { value: "failed", label: "FAILED" },
    { value: "blocked", label: "BLOCKED" },
  ];

  const priorityColors: Record<Priority, string> = {
    P1: "bg-[oklch(0.52_0.22_25)] text-white",
    P2: "bg-[oklch(0.75_0.15_85)] text-black",
    P3: "bg-[oklch(0.65_0.15_200)] text-white",
    P4: "bg-muted text-muted-foreground",
  };

  const hasFilters = filters.search || filters.priority || filters.week || filters.status;

  return (
    <div className="border-b border-border bg-card/30 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tasks, IDs, modules..."
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            className="w-full bg-input border border-border rounded-sm pl-8 pr-3 py-1.5 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-border hidden sm:block" />

        {/* Priority filters */}
        <div className="flex items-center gap-1">
          <span className="font-mono text-[10px] text-muted-foreground mr-1 hidden sm:inline">PRI:</span>
          {priorities.map((p) => (
            <button
              key={p}
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  priority: prev.priority === p ? null : p,
                }))
              }
              className={`font-mono text-[11px] px-2 py-0.5 rounded-sm transition-all ${
                filters.priority === p
                  ? priorityColors[p]
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-border hidden sm:block" />

        {/* Week filters */}
        <div className="flex items-center gap-1">
          <span className="font-mono text-[10px] text-muted-foreground mr-1 hidden sm:inline">WK:</span>
          {weeks.map((w) => (
            <button
              key={w}
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  week: prev.week === w ? null : w,
                }))
              }
              className={`font-mono text-[11px] px-2 py-0.5 rounded-sm transition-all ${
                filters.week === w
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              W{w}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-border hidden sm:block" />

        {/* Status filters */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="font-mono text-[10px] text-muted-foreground mr-1 hidden sm:inline">STATUS:</span>
          {statuses.map((s) => (
            <button
              key={s.value}
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  status: prev.status === s.value ? null : s.value,
                }))
              }
              className={`font-mono text-[10px] px-2 py-0.5 rounded-sm transition-all ${
                filters.status === s.value
                  ? "bg-accent text-accent-foreground ring-1 ring-primary"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={() =>
              setFilters({ search: "", module: null, priority: null, week: null, status: null })
            }
            className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-destructive transition-colors ml-auto"
          >
            <X className="w-3 h-3" />
            CLEAR
          </button>
        )}
      </div>
    </div>
  );
}
