import { writable, get } from "svelte/store";

import type CalendarPlugin from "src/main";
import { getDateUID } from "obsidian-daily-notes-interface";

import type { ITask, IProject, ITaskTrackerData, TimeLog, TaskStatus, DateUID } from "./types";
import { TASK_TRACKER_DATA_VERSION } from "./types";
import { loadTaskData, saveTaskData, generateId } from "./storage";
import { startTimer, stopTimer, addTimeLog } from "./TimerManager";

let pluginInstance: CalendarPlugin = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

const AUTO_CLEANUP_THRESHOLD = 30;

function autoCleanupCompleted(): void {
  const allTasks = get(tasks);
  const completed = allTasks
    .filter((t) => t.completed)
    .sort((a, b) => a.updatedAt - b.updatedAt);

  if (completed.length <= AUTO_CLEANUP_THRESHOLD) return;

  const toRemove = completed.slice(0, completed.length - AUTO_CLEANUP_THRESHOLD);
  const removeIds = new Set(toRemove.map((t) => t.id));

  tasks.update((current) => current.filter((t) => !removeIds.has(t.id)));
  debouncedSave();
}

export const tasks = writable<ITask[]>([]);
export const projects = writable<IProject[]>([]);
export const selectedDate = writable<DateUID>(null);
export const activeTab = writable<TaskStatus>("todo");
export const taskFilter = writable<{
  projectId: string | null;
}>({
  projectId: null,
});

export const timeLogs = writable<TimeLog[]>([]);

function debouncedSave(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    const data: ITaskTrackerData = {
      tasks: get(tasks),
      projects: get(projects),
      timeLogs: get(timeLogs),
      version: TASK_TRACKER_DATA_VERSION,
    };
    if (pluginInstance) {
      saveTaskData(pluginInstance, data);
    }
  }, 300);
}

export function initTaskStores(plugin: CalendarPlugin): void {
  pluginInstance = plugin;
  loadTaskData(plugin).then((data) => {
    tasks.set(data.tasks);
    projects.set(data.projects);
    timeLogs.set(data.timeLogs || []);
    autoCleanupCompleted();
  });
}

export function reloadTaskStores(plugin: CalendarPlugin): void {
  loadTaskData(plugin).then((data) => {
    tasks.set(data.tasks);
    projects.set(data.projects);
    timeLogs.set(data.timeLogs || []);
  });
}

export function addTask(
  taskData: Omit<ITask, "id" | "createdAt" | "updatedAt">
): ITask {
  const now = Date.now();
  const task: ITask = {
    ...taskData,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  tasks.update((current) => [...current, task]);
  debouncedSave();
  return task;
}

export function updateTask(id: string, changes: Partial<ITask>): void {
  tasks.update((current) =>
    current.map((t) =>
      t.id === id ? { ...t, ...changes, updatedAt: Date.now() } : t
    )
  );
  debouncedSave();
  if (changes.completed !== undefined) {
    autoCleanupCompleted();
  }
}

export function updateTaskStatus(id: string, status: TaskStatus): void {
  const allTasks = get(tasks);
  const task = allTasks.find((t) => t.id === id);
  const oldStatus = task?.status;

  // Start timer when entering progress
  if (oldStatus !== "progress" && status === "progress") {
    startTimer(id);
    tasks.update((current) =>
      current.map((t) =>
        t.id === id
          ? { ...t, status, completed: false, timerStartedAt: Date.now(), updatedAt: Date.now() }
          : t
      )
    );
  }
  // Stop timer when leaving progress
  else if (oldStatus === "progress" && status !== "progress") {
    const log = stopTimer(id);
    if (log && task) {
      log.taskTitle = task.title;
      const updatedLogs = addTimeLog(log, get(timeLogs));
      timeLogs.set(updatedLogs);
      tasks.update((current) =>
        current.map((t) =>
          t.id === id
            ? {
                ...t,
                status,
                completed: status === "done",
                totalWorkTime: (t.totalWorkTime || 0) + log.duration,
                timerStartedAt: undefined,
                updatedAt: Date.now(),
              }
            : t
        )
      );
    } else {
      tasks.update((current) =>
        current.map((t) =>
          t.id === id
            ? { ...t, status, completed: status === "done", timerStartedAt: undefined, updatedAt: Date.now() }
            : t
        )
      );
    }
  }
  // Simple status change (not involving progress)
  else {
    tasks.update((current) =>
      current.map((t) =>
        t.id === id
          ? { ...t, status, completed: status === "done", updatedAt: Date.now() }
          : t
      )
    );
  }

  debouncedSave();
}

export function removeTask(id: string): void {
  tasks.update((current) => current.filter((t) => t.id !== id));
  debouncedSave();
}

export function moveTask(taskId: string, newDateUID: string): void {
  tasks.update((current) =>
    current.map((t) =>
      t.id === taskId
        ? { ...t, dateUID: newDateUID, updatedAt: Date.now() }
        : t
    )
  );
  debouncedSave();
}

export function completeRecurringTask(taskId: string): void {
  const allTasks = get(tasks);
  const task = allTasks.find((t) => t.id === taskId);
  if (!task || !task.recurrence) return;

  const moment = window.moment;
  const dateMatch = task.dateUID.match(
    /^day-(\d{4}-\d{2}-\d{2})/
  );
  if (!dateMatch) return;

  const currentDate = moment(dateMatch[1], "YYYY-MM-DD");
  if (!currentDate.isValid()) return;

  let nextDate = currentDate.clone();

  switch (task.recurrence.type) {
    case "daily":
      nextDate.add(task.recurrence.interval || 1, "days");
      break;
    case "weekly":
      if (
        task.recurrence.daysOfWeek &&
        task.recurrence.daysOfWeek.length > 0
      ) {
        const currentDow = currentDate.day();
        const sortedDays = [...task.recurrence.daysOfWeek].sort(
          (a, b) => a - b
        );
        let foundNext = false;
        for (let offset = 1; offset <= 7; offset++) {
          const candidateDow = (currentDow + offset) % 7;
          if (sortedDays.includes(candidateDow)) {
            nextDate = currentDate.clone().add(offset, "days");
            foundNext = true;
            break;
          }
        }
        if (!foundNext) {
          nextDate.add(task.recurrence.interval || 1, "weeks");
        }
      } else {
        nextDate.add(task.recurrence.interval || 1, "weeks");
      }
      break;
    case "monthly":
      nextDate.add(task.recurrence.interval || 1, "months");
      break;
  }

  const newDateUID = getDateUID(nextDate, "day");

  addTask({
    title: task.title,
    completed: false,
    status: "todo",
    dateUID: newDateUID,
    projectId: task.projectId,
    notePath: null,
    priority: task.priority,
    tags: [...task.tags],
    sortOrder: 0,
    description: task.description,
    recurrence: task.recurrence,
  });
}

export function addProject(
  projectData: Omit<IProject, "id" | "createdAt">
): IProject {
  const project: IProject = {
    ...projectData,
    id: generateId(),
    createdAt: Date.now(),
  };
  projects.update((current) => [...current, project]);
  debouncedSave();
  return project;
}

export function updateProject(id: string, changes: Partial<IProject>): void {
  projects.update((current) =>
    current.map((p) => (p.id === id ? { ...p, ...changes } : p))
  );
  debouncedSave();
}

export function removeProject(id: string): void {
  projects.update((current) => current.filter((p) => p.id !== id));
  tasks.update((current) =>
    current.map((t) => (t.projectId === id ? { ...t, projectId: null } : t))
  );
  debouncedSave();
}

export function getTasksForDate(dateUID: string): ITask[] {
  return get(tasks).filter((t) => t.dateUID === dateUID);
}
