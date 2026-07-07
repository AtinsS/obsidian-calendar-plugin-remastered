import { writable, get } from "svelte/store";
import moment from "moment";

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
    // Генерируем повторяющиеся задачи до конца месяца
    setTimeout(() => generateAllMonthlyRecurringTasks(), 100);
  });
}

export function reloadTaskStores(plugin: CalendarPlugin): void {
  loadTaskData(plugin).then((data) => {
    tasks.set(data.tasks);
    projects.set(data.projects);
    timeLogs.set(data.timeLogs || []);
    autoCleanupCompleted();
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

  // Если задача с повторением и не является экземпляром — генерируем до конца месяца
  if (task.recurrence && !task.isRecurringInstance) {
    // Даём время на обновление store, затем генерируем
    setTimeout(() => generateMonthlyRecurringTasks(task.id), 50);
  }

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

function startTaskTimer(id: string): void {
  startTimer(id);
  tasks.update((current) =>
    current.map((t) =>
      t.id === id
        ? { ...t, status: "progress" as TaskStatus, completed: false, timerStartedAt: Date.now(), updatedAt: Date.now() }
        : t
    )
  );
}

function stopTaskTimerAndLog(id: string, status: TaskStatus): void {
  const allTasks = get(tasks);
  const task = allTasks.find((t) => t.id === id);
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

function setTaskStatus(id: string, status: TaskStatus): void {
  tasks.update((current) =>
    current.map((t) =>
      t.id === id
        ? { ...t, status, completed: status === "done", updatedAt: Date.now() }
        : t
    )
  );
}

export function updateTaskStatus(id: string, status: TaskStatus): void {
  const allTasks = get(tasks);
  const task = allTasks.find((t) => t.id === id);
  const oldStatus = task?.status;

  if (oldStatus !== "progress" && status === "progress") {
    startTaskTimer(id);
  } else if (oldStatus === "progress" && status !== "progress") {
    stopTaskTimerAndLog(id, status);
  } else {
    setTaskStatus(id, status);
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

export function createNextRecurringInstance(taskId: string): void {
  const allTasks = get(tasks);
  const task = allTasks.find((t) => t.id === taskId);
  if (!task || !task.recurrence) return;

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
          const daysUntilNextWeek = 7 - currentDow + sortedDays[0];
          nextDate.add(daysUntilNextWeek, "days");
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

  const existingTask = allTasks.find(
    (t) => t.title === task.title && t.dateUID === newDateUID && t.parentTaskId === task.id
  );
  if (existingTask) return;

  addTask({
    title: task.title,
    completed: false,
    status: "todo",
    dateUID: newDateUID,
    projectId: task.projectId,
    notePath: task.notePath,
    priority: task.priority,
    tags: [...task.tags],
    sortOrder: 0,
    recurrence: task.recurrence,
    scheduledTime: task.scheduledTime,
    estimatedTime: task.estimatedTime,
    totalWorkTime: 0,
    isRecurringInstance: true,
    parentTaskId: task.id,
  });
}

/**
 * Генерирует все экземпляры повторяющейся задачи до конца месяца.
 * Вызывается при создании задачи с recurrence или при загрузке плагина.
 */
export function generateMonthlyRecurringTasks(taskId: string): void {
  const allTasks = get(tasks);
  const task = allTasks.find((t) => t.id === taskId);
  if (!task || !task.recurrence) return;

  const dateMatch = task.dateUID.match(/^day-(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return;

  const startDate = moment(dateMatch[1], "YYYY-MM-DD");
  if (!startDate.isValid()) return;

  // Конец текущего месяца
  const endOfMonth = startDate.clone().endOf("month");

  let currentDate = startDate.clone();
  let created = 0;
  const maxInstances = 31; // максимум дней в месяце

  while (currentDate.isBefore(endOfMonth) && created < maxInstances) {
    // Вычисляем следующую дату
    let nextDate = currentDate.clone();

    switch (task.recurrence.type) {
      case "daily":
        nextDate.add(task.recurrence.interval || 1, "days");
        break;
      case "weekly":
        if (task.recurrence.daysOfWeek && task.recurrence.daysOfWeek.length > 0) {
          const currentDow = currentDate.day();
          const sortedDays = [...task.recurrence.daysOfWeek].sort((a, b) => a - b);
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
            // Переходим на следующую неделю
            nextDate = currentDate.clone().add(7 - currentDow + sortedDays[0], "days");
          }
        } else {
          nextDate.add(task.recurrence.interval || 1, "weeks");
        }
        break;
      case "monthly":
        nextDate.add(task.recurrence.interval || 1, "months");
        break;
    }

    // Если следующая дата выходит за пределы месяца — останавливаемся
    if (nextDate.isAfter(endOfMonth)) break;

    const newDateUID = getDateUID(nextDate, "day");

    // Проверяем, нет ли уже такой задачи
    const existing = allTasks.find(
      (t) => t.title === task.title && t.dateUID === newDateUID && t.parentTaskId === task.id
    );

    if (!existing) {
      addTask({
        title: task.title,
        completed: false,
        status: "todo",
        dateUID: newDateUID,
        projectId: task.projectId,
        notePath: task.notePath,
        priority: task.priority,
        tags: [...task.tags],
        sortOrder: 0,
        recurrence: task.recurrence,
        scheduledTime: task.scheduledTime,
        estimatedTime: task.estimatedTime,
        totalWorkTime: 0,
        isRecurringInstance: true,
        parentTaskId: task.id,
      });
      created++;
    }

    currentDate = nextDate;
  }
}

/**
 * Генерирует повторяющиеся задачи для всех активных recurring задач до конца месяца.
 * Вызывается при загрузке плагина.
 */
export function generateAllMonthlyRecurringTasks(): void {
  const allTasks = get(tasks);
  const recurringTasks = allTasks.filter(
    (t) => t.recurrence && !t.isRecurringInstance
  );

  for (const task of recurringTasks) {
    generateMonthlyRecurringTasks(task.id);
  }
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
