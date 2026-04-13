import { useState, useCallback, useMemo } from "react";
import { type Task, type Status, type Priority, type TopSection, defaultTasks, TOP_SECTIONS } from "@/lib/taskData";

const STORAGE_KEY = "vop-task-tracker-v4";

interface SavedState {
  statuses: Record<string, Status>;
  sectionMoves: Record<string, TopSection>;
}

function loadSaved(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { statuses: {}, sectionMoves: {} };
    const parsed = JSON.parse(raw);
    // Handle v3 format (just statuses record) gracefully
    if (parsed && typeof parsed === "object" && !parsed.statuses) {
      return { statuses: parsed as Record<string, Status>, sectionMoves: {} };
    }
    return {
      statuses: parsed.statuses || {},
      sectionMoves: parsed.sectionMoves || {},
    };
  } catch {
    return { statuses: {}, sectionMoves: {} };
  }
}

function loadTasks(): Task[] {
  const saved = loadSaved();
  return defaultTasks.map((t) => ({
    ...t,
    status: saved.statuses[t.id] ?? t.status,
    topSection: saved.sectionMoves[t.id] ?? t.topSection,
  }));
}

function saveTasks(tasks: Task[]) {
  const statuses: Record<string, Status> = {};
  const sectionMoves: Record<string, TopSection> = {};

  for (const task of tasks) {
    const def = defaultTasks.find((d) => d.id === task.id);
    if (def && task.status !== def.status) {
      statuses[task.id] = task.status;
    }
    if (def && task.topSection !== def.topSection) {
      sectionMoves[task.id] = task.topSection;
    }
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify({ statuses, sectionMoves }));
}

export interface Filters {
  search: string;
  topSection: TopSection | null;
  priority: Priority | null;
  status: Status | null;
}

export function useTaskStore() {
  const [tasks, setTasks] = useState<Task[]>(loadTasks);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    topSection: null,
    priority: null,
    status: null,
  });

  const updateStatus = useCallback((id: string, status: Status) => {
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, status } : t));
      saveTasks(next);
      return next;
    });
  }, []);

  const moveTask = useCallback((id: string, newSection: TopSection) => {
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, topSection: newSection } : t));
      saveTasks(next);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setTasks(defaultTasks.map((t) => ({ ...t })));
    setFilters({ search: "", topSection: null, priority: null, status: null });
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filters.topSection && t.topSection !== filters.topSection) return false;
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
    const src = filters.topSection ? tasks.filter((t) => t.topSection === filters.topSection) : tasks;
    return {
      total: src.length,
      passed: src.filter((t) => t.status === "passed").length,
      failed: src.filter((t) => t.status === "failed").length,
      inProgress: src.filter((t) => t.status === "in_progress").length,
      blocked: src.filter((t) => t.status === "blocked").length,
      notStarted: src.filter((t) => t.status === "not_started").length,
      p1Total: src.filter((t) => t.priority === "P1").length,
      p1Passed: src.filter((t) => t.priority === "P1" && t.status === "passed").length,
      p2Total: src.filter((t) => t.priority === "P2").length,
      p2Passed: src.filter((t) => t.priority === "P2" && t.status === "passed").length,
      p3Total: src.filter((t) => t.priority === "P3").length,
      p3Passed: src.filter((t) => t.priority === "P3" && t.status === "passed").length,
    };
  }, [tasks, filters.topSection]);

  return {
    tasks,
    filteredTasks,
    filters,
    setFilters,
    updateStatus,
    moveTask,
    resetAll,
    stats,
  };
}
