import { useState, useCallback, useEffect } from "react";
import { type Task, type Status, type Priority, defaultTasks } from "@/lib/taskData";

const STORAGE_KEY = "vop-task-tracker-v3";

function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultTasks;
    const saved: Record<string, Status> = JSON.parse(raw);
    return defaultTasks.map((task) => ({
      ...task,
      status: saved[task.id] ?? task.status,
    }));
  } catch {
    return defaultTasks;
  }
}

function saveTasks(tasks: Task[]) {
  const map: Record<string, Status> = {};
  for (const t of tasks) {
    if (t.status !== "not_started") {
      map[t.id] = t.status;
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export interface Filters {
  search: string;
  module: number | null;
  priority: Priority | null;
  week: number | null; // kept for interface compat but unused
  status: Status | null;
}

export function useTaskStore() {
  const [tasks, setTasks] = useState<Task[]>(loadTasks);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    module: null,
    priority: null,
    week: null,
    status: null,
  });

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  const updateStatus = useCallback((taskId: string, status: Status) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status } : t))
    );
  }, []);

  const resetAll = useCallback(() => {
    setTasks(defaultTasks);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const filteredTasks = tasks.filter((t) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (
        !t.name.toLowerCase().includes(q) &&
        !t.id.toLowerCase().includes(q) &&
        !t.moduleName.toLowerCase().includes(q) &&
        !t.section.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (filters.module !== null && t.module !== filters.module) return false;
    if (filters.priority !== null && t.priority !== filters.priority) return false;
    if (filters.status !== null && t.status !== filters.status) return false;
    return true;
  });

  const stats = {
    total: tasks.length,
    passed: tasks.filter((t) => t.status === "passed").length,
    failed: tasks.filter((t) => t.status === "failed").length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
    notStarted: tasks.filter((t) => t.status === "not_started").length,
    p1Total: tasks.filter((t) => t.priority === "P1").length,
    p1Passed: tasks.filter((t) => t.priority === "P1" && t.status === "passed").length,
    p2Total: tasks.filter((t) => t.priority === "P2").length,
    p2Passed: tasks.filter((t) => t.priority === "P2" && t.status === "passed").length,
    p3Total: tasks.filter((t) => t.priority === "P3").length,
    p3Passed: tasks.filter((t) => t.priority === "P3" && t.status === "passed").length,
  };

  return {
    tasks,
    filteredTasks,
    filters,
    setFilters,
    updateStatus,
    resetAll,
    stats,
  };
}
