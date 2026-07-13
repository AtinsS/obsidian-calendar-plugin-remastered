import { writable, get } from "svelte/store";
import type { TimeLog } from "./types";
import { MAX_TIME_LOGS } from "./types";

export const activeTimers = writable<Map<string, number>>(new Map());
export const timerTick = writable<number>(0);

let tickInterval: ReturnType<typeof setInterval> | null = null;

function startTickInterval(): void {
  if (tickInterval) return;
  tickInterval = setInterval(() => {
    timerTick.set(Date.now());
  }, 1000);
}

function stopTickInterval(): void {
  const timers = get(activeTimers);
  if (timers.size === 0 && tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

export function cleanupTimers(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  activeTimers.set(new Map());
}

export function startTimer(taskId: string): void {
  activeTimers.update((current) => {
    const next = new Map(current);
    next.set(taskId, Date.now());
    return next;
  });
  startTickInterval();
}

/** Resume a timer with a saved start time (e.g. after Obsidian restart). */
export function resumeTimer(taskId: string, savedStartTime: number): void {
  activeTimers.update((current) => {
    const next = new Map(current);
    next.set(taskId, savedStartTime);
    return next;
  });
  startTickInterval();
}

export function stopTimer(taskId: string): TimeLog | null {
  const timers = get(activeTimers);
  const startTime = timers.get(taskId);
  if (!startTime) return null;

  const endTime = Date.now();
  const duration = endTime - startTime;

  activeTimers.update((current) => {
    const next = new Map(current);
    next.delete(taskId);
    return next;
  });

  stopTickInterval();

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    taskId,
    taskTitle: "",
    startTime,
    endTime,
    duration,
    date: new Date(startTime).toISOString().split("T")[0],
  };
}

export function getActiveTimer(taskId: string): number | null {
  const timers = get(activeTimers);
  const startTime = timers.get(taskId);
  if (!startTime) return null;
  return Date.now() - startTime;
}

export function getAllActiveTimers(): Map<string, number> {
  const timers = get(activeTimers);
  const now = Date.now();
  const result = new Map<string, number>();
  for (const [taskId, startTime] of timers) {
    result.set(taskId, now - startTime);
  }
  return result;
}

export function addTimeLog(log: TimeLog, logs: TimeLog[]): TimeLog[] {
  const updated = [log, ...logs];
  return updated.length > MAX_TIME_LOGS ? updated.slice(0, MAX_TIME_LOGS) : updated;
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "< 1 мин";

  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours} ч ${minutes} мин`;
  }
  if (hours > 0) {
    return `${hours} ч`;
  }
  if (minutes === 0) return "< 1 мин";
  return `${minutes} мин`;
}

export function formatEstimate(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours} ч ${mins} мин` : `${hours} ч`;
}

export function groupLogsByDate(logs: TimeLog[]): Map<string, TimeLog[]> {
  const groups = new Map<string, TimeLog[]>();
  for (const log of logs) {
    const existing = groups.get(log.date) || [];
    existing.push(log);
    groups.set(log.date, existing);
  }
  return groups;
}
