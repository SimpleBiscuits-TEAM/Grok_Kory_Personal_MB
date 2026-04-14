import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  type Task,
  type Status,
  type Priority,
  type TopSection,
  defaultTasks,
} from "@/lib/taskData";
import { trpc } from "@/lib/trpc";

const STORAGE_KEY = "vop-task-tracker-v4";

/** What we persist per-task as an override on top of defaults */
interface TaskOverride {
  status?: Status;
  notes?: string;
  sectionOverride?: TopSection;
}

interface SavedState {
  statuses: Record<string, Status>;
  sectionMoves: Record<string, TopSection>;
  notes: Record<string, string>;
}

// ── localStorage helpers (fallback / cache) ─────────────────────────────

function loadSavedLocal(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { statuses: {}, sectionMoves: {}, notes: {} };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !parsed.statuses) {
      return {
        statuses: parsed as Record<string, Status>,
        sectionMoves: {},
        notes: {},
      };
    }
    return {
      statuses: parsed.statuses || {},
      sectionMoves: parsed.sectionMoves || {},
      notes: parsed.notes || {},
    };
  } catch {
    return { statuses: {}, sectionMoves: {}, notes: {} };
  }
}

function saveLocal(overrides: Record<string, TaskOverride>) {
  const statuses: Record<string, Status> = {};
  const sectionMoves: Record<string, TopSection> = {};
  const notes: Record<string, string> = {};

  for (const [id, ov] of Object.entries(overrides)) {
    if (ov.status) statuses[id] = ov.status;
    if (ov.sectionOverride) sectionMoves[id] = ov.sectionOverride;
    if (ov.notes) notes[id] = ov.notes;
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ statuses, sectionMoves, notes })
  );
}

// ── Merge overrides onto default tasks ──────────────────────────────────

function applyOverrides(overrides: Record<string, TaskOverride>): Task[] {
  return defaultTasks.map((t) => {
    const ov = overrides[t.id];
    if (!ov) return { ...t };
    return {
      ...t,
      status: ov.status ?? t.status,
      topSection: ov.sectionOverride ?? t.topSection,
    };
  });
}

// ── Build overrides map from localStorage ───────────────────────────────

function buildOverridesFromLocal(): Record<string, TaskOverride> {
  const saved = loadSavedLocal();
  const overrides: Record<string, TaskOverride> = {};

  for (const task of defaultTasks) {
    const status = saved.statuses[task.id];
    const section = saved.sectionMoves[task.id];
    const note = saved.notes[task.id];
    if (status || section || note) {
      overrides[task.id] = {};
      if (status && status !== task.status)
        overrides[task.id].status = status;
      if (section && section !== task.topSection)
        overrides[task.id].sectionOverride = section;
      if (note) overrides[task.id].notes = note;
    }
  }

  return overrides;
}

// ── Filters ─────────────────────────────────────────────────────────────

export interface Filters {
  search: string;
  topSection: TopSection | null;
  priority: Priority | null;
  status: Status | null;
}

// ── Main hook ───────────────────────────────────────────────────────────

export function useTaskStore() {
  const [overrides, setOverrides] = useState<Record<string, TaskOverride>>(
    buildOverridesFromLocal
  );
  const [filters, setFilters] = useState<Filters>({
    search: "",
    topSection: null,
    priority: null,
    status: null,
  });
  const [dbReady, setDbReady] = useState(false);
  const migrationDone = useRef(false);

  // Derive tasks from defaults + overrides
  const tasks = useMemo(() => applyOverrides(overrides), [overrides]);

  // ── DB: fetch overrides on mount ──────────────────────────────────────
  const { data: dbOverrides, isSuccess: dbLoaded } =
    trpc.tasks.getOverrides.useQuery(undefined, {
      staleTime: 30_000,
      retry: 2,
    });

  const upsertMutation = trpc.tasks.upsertOverride.useMutation();
  const bulkUpsertMutation = trpc.tasks.bulkUpsert.useMutation();
  const resetMutation = trpc.tasks.resetAll.useMutation();

  // When DB data arrives, merge it into state (DB wins over localStorage)
  useEffect(() => {
    if (!dbLoaded || !dbOverrides) return;

    const dbMap: Record<string, TaskOverride> = {};
    for (const row of dbOverrides) {
      const ov: TaskOverride = {};
      if (row.status) ov.status = row.status as Status;
      if (row.notes) ov.notes = row.notes;
      if (row.sectionOverride)
        ov.sectionOverride = row.sectionOverride as TopSection;
      if (Object.keys(ov).length > 0) {
        dbMap[row.taskId] = ov;
      }
    }

    if (Object.keys(dbMap).length > 0) {
      // DB has data — use it as source of truth
      setOverrides(dbMap);
      saveLocal(dbMap);
      setDbReady(true);
    } else if (!migrationDone.current) {
      // DB is empty — migrate localStorage data to DB
      const localOverrides = buildOverridesFromLocal();
      if (Object.keys(localOverrides).length > 0) {
        migrationDone.current = true;
        const items = Object.entries(localOverrides).map(([taskId, ov]) => ({
          taskId,
          status: ov.status ?? null,
          notes: ov.notes ?? null,
          sectionOverride: ov.sectionOverride ?? null,
        }));
        bulkUpsertMutation.mutate(items, {
          onSuccess: () => {
            console.log(
              "[Tasks] Migrated",
              items.length,
              "overrides from localStorage to DB"
            );
          },
        });
      }
      setDbReady(true);
    } else {
      setDbReady(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbLoaded, dbOverrides]);

  // ── Actions ───────────────────────────────────────────────────────────

  const updateStatus = useCallback(
    (id: string, status: Status) => {
      setOverrides((prev) => {
        const def = defaultTasks.find((t) => t.id === id);
        const next = { ...prev };
        const existing = next[id] || {};

        if (
          def &&
          status === def.status &&
          !existing.notes &&
          !existing.sectionOverride
        ) {
          delete next[id];
        } else {
          next[id] = {
            ...existing,
            status: status === def?.status ? undefined : status,
          };
          if (
            !next[id].status &&
            !next[id].notes &&
            !next[id].sectionOverride
          ) {
            delete next[id];
          }
        }

        saveLocal(next);
        return next;
      });

      const def = defaultTasks.find((t) => t.id === id);
      upsertMutation.mutate({
        taskId: id,
        status: status === def?.status ? null : status,
      });
    },
    [upsertMutation]
  );

  const moveTask = useCallback(
    (id: string, newSection: TopSection) => {
      setOverrides((prev) => {
        const def = defaultTasks.find((t) => t.id === id);
        const next = { ...prev };
        const existing = next[id] || {};

        if (
          def &&
          newSection === def.topSection &&
          !existing.notes &&
          !existing.status
        ) {
          delete next[id];
        } else {
          next[id] = {
            ...existing,
            sectionOverride:
              newSection === def?.topSection ? undefined : newSection,
          };
          if (
            !next[id].status &&
            !next[id].notes &&
            !next[id].sectionOverride
          ) {
            delete next[id];
          }
        }

        saveLocal(next);
        return next;
      });

      const def = defaultTasks.find((t) => t.id === id);
      upsertMutation.mutate({
        taskId: id,
        sectionOverride: newSection === def?.topSection ? null : newSection,
      });
    },
    [upsertMutation]
  );

  const updateNotes = useCallback(
    (id: string, notes: string) => {
      setOverrides((prev) => {
        const next = { ...prev };
        const existing = next[id] || {};

        if (!notes.trim() && !existing.status && !existing.sectionOverride) {
          delete next[id];
        } else {
          next[id] = { ...existing, notes: notes.trim() || undefined };
          if (
            !next[id].status &&
            !next[id].notes &&
            !next[id].sectionOverride
          ) {
            delete next[id];
          }
        }

        saveLocal(next);
        return next;
      });

      upsertMutation.mutate({
        taskId: id,
        notes: notes.trim() || null,
      });
    },
    [upsertMutation]
  );

  const getNotes = useCallback(
    (id: string): string => {
      return overrides[id]?.notes || "";
    },
    [overrides]
  );

  const resetAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setOverrides({});
    setFilters({ search: "", topSection: null, priority: null, status: null });
    resetMutation.mutate();
  }, [resetMutation]);

  // ── Derived data ──────────────────────────────────────────────────────

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filters.topSection && t.topSection !== filters.topSection)
        return false;
      if (filters.priority && t.priority !== filters.priority) return false;
      if (filters.status && t.status !== filters.status) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const match =
          t.name.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.subsection.toLowerCase().includes(q) ||
          t.topSection.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [tasks, filters]);

  const stats = useMemo(() => {
    const src = filters.topSection
      ? tasks.filter((t) => t.topSection === filters.topSection)
      : tasks;
    return {
      total: src.length,
      passed: src.filter((t) => t.status === "passed").length,
      failed: src.filter((t) => t.status === "failed").length,
      inProgress: src.filter((t) => t.status === "in_progress").length,
      blocked: src.filter((t) => t.status === "blocked").length,
      notStarted: src.filter((t) => t.status === "not_started").length,
      p1Total: src.filter((t) => t.priority === "P1").length,
      p1Passed: src.filter(
        (t) => t.priority === "P1" && t.status === "passed"
      ).length,
      p2Total: src.filter((t) => t.priority === "P2").length,
      p2Passed: src.filter(
        (t) => t.priority === "P2" && t.status === "passed"
      ).length,
      p3Total: src.filter((t) => t.priority === "P3").length,
      p3Passed: src.filter(
        (t) => t.priority === "P3" && t.status === "passed"
      ).length,
    };
  }, [tasks, filters.topSection]);

  return {
    tasks,
    filteredTasks,
    filters,
    setFilters,
    updateStatus,
    moveTask,
    updateNotes,
    getNotes,
    resetAll,
    stats,
    dbReady,
  };
}
