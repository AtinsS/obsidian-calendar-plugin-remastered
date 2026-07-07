import { writable, get } from "svelte/store";
import moment from "moment";

import type CalendarPlugin from "src/main";

import type { IHabit, IHabitLog, IHabitTrackerData } from "./types";
import { HABIT_TRACKER_DATA_VERSION, MAX_HABIT_LOG_ENTRIES } from "./types";
import { loadHabitData, saveHabitData, generateId } from "./storage";

let pluginInstance: CalendarPlugin = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const habits = writable<IHabit[]>([]);
export const habitLogs = writable<IHabitLog[]>([]);

// --- Cached lookup maps (avoid N store reads per render) ---
let cachedLogs: IHabitLog[] = [];
let logsByHabitDate: Map<string, IHabitLog> = new Map();

export function rebuildLogsCache(): void {
  const current = get(habitLogs);
  if (current === cachedLogs) return;
  cachedLogs = current;
  logsByHabitDate = new Map();
  for (const log of current) {
    if (log.completed) {
      logsByHabitDate.set(`${log.habitId}::${log.date}`, log);
    }
  }
}

function cleanupOldHabitLogs(): void {
  habitLogs.update((current) => {
    if (current.length <= MAX_HABIT_LOG_ENTRIES) return current;
    const sorted = [...current].sort(
      (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)
    );
    return sorted.slice(0, MAX_HABIT_LOG_ENTRIES);
  });
}

function debouncedSave(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    const data: IHabitTrackerData = {
      habits: get(habits),
      habitLogs: get(habitLogs),
      version: HABIT_TRACKER_DATA_VERSION,
    };
    if (pluginInstance) {
      saveHabitData(pluginInstance, data);
    }
  }, 300);
}

export function initHabitStores(plugin: CalendarPlugin): void {
  pluginInstance = plugin;
  loadHabitData(plugin).then((data) => {
    habits.set(data.habits);
    habitLogs.set(data.habitLogs);
    rebuildLogsCache();
    cleanupOldHabitLogs();
  });
}

export function reloadHabitStores(plugin: CalendarPlugin): void {
  loadHabitData(plugin).then((data) => {
    habits.set(data.habits);
    habitLogs.set(data.habitLogs);
    rebuildLogsCache();
    cleanupOldHabitLogs();
  });
}

export function addHabit(
  habitData: Omit<IHabit, "id" | "createdAt">
): IHabit {
  const habit: IHabit = {
    ...habitData,
    id: generateId(),
    createdAt: Date.now(),
  };
  habits.update((current) => [...current, habit]);
  debouncedSave();
  return habit;
}

export function updateHabit(id: string, changes: Partial<IHabit>): void {
  habits.update((current) =>
    current.map((h) => (h.id === id ? { ...h, ...changes } : h))
  );
  debouncedSave();
}

export function removeHabit(id: string): void {
  habits.update((current) => current.filter((h) => h.id !== id));
  habitLogs.update((current) => {
    const next = current.filter((l) => l.habitId !== id);
    return next;
  });
  rebuildLogsCache();
  debouncedSave();
}

export function toggleHabitCompletion(
  habitId: string,
  date: string
): void {
  const key = `${habitId}::${date}`;
  const existing = logsByHabitDate.get(key);

  if (existing) {
    // Remove completion (toggle off)
    habitLogs.update((current) => current.filter((l) => l.id !== existing.id));
  } else {
    // Add completion (toggle on)
    const log: IHabitLog = {
      id: generateId(),
      habitId,
      date,
      completed: true,
      count: 1,
      completedAt: Date.now(),
    };
    habitLogs.update((current) => [...current, log]);
    cleanupOldHabitLogs();
  }
  rebuildLogsCache();
  debouncedSave();
}

export function isHabitCompletedOnDate(habitId: string, date: string): boolean {
  return logsByHabitDate.has(`${habitId}::${date}`);
}

export function calculateStreak(habitId: string): number {
  const logs = getHabitLogsSorted(habitId);
  if (logs.length === 0) return 0;

  let streak = 0;
  let currentDate = moment().startOf("day");

  for (const log of logs) {
    const logDate = moment(log.date, "YYYY-MM-DD").startOf("day");
    const diffDays = currentDate.diff(logDate, "days");

    if (diffDays <= 1) {
      streak++;
      currentDate = logDate.clone().subtract(1, "days");
    } else {
      break;
    }
  }

  return streak;
}

function getHabitLogsSorted(habitId: string): IHabitLog[] {
  return cachedLogs
    .filter((l) => l.habitId === habitId && l.completed)
    .sort(
      (a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );
}
