export interface RecurrenceConfig {
  type: "daily" | "weekly" | "monthly";
  interval?: number;
  daysOfWeek?: number[];
}

export type TaskStatus = "todo" | "progress" | "done";

export interface ITask {
  id: string;
  title: string;
  completed: boolean;
  status: TaskStatus;
  dateUID: string;
  projectId: string | null;
  notePath: string | null;
  priority: "low" | "medium" | "high";
  tags: string[];
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  description?: string;
  recurrence?: RecurrenceConfig;
  timerStartedAt?: number;
  totalWorkTime?: number;
  estimatedTime?: number;
  scheduledTime?: string;
  isRecurringInstance?: boolean;
  parentTaskId?: string;
}

export interface IProject {
  id: string;
  name: string;
  color: string;
  icon: string;
  folder: string | null;
  archived: boolean;
  sortOrder: number;
  createdAt: number;
}

export interface TimeLog {
  id: string;
  taskId: string;
  taskTitle: string;
  startTime: number;
  endTime: number;
  duration: number;
  date: string;
}

export interface ITaskTrackerData {
  tasks: ITask[];
  projects: IProject[];
  timeLogs: TimeLog[];
  version: number;
}

export type DateUID = string;

export const TASK_TRACKER_DATA_VERSION = 4;
export const MAX_TIME_LOGS = 30;

export const DEFAULT_PROJECT_COLORS = [
  "#ff6b6b",
  "#ffa502",
  "#ffd93d",
  "#6bcb77",
  "#4d96ff",
  "#9b59b6",
  "#e91e63",
  "#00b894",
  "#fd79a8",
  "#636e72",
  "#2d3436",
  "#dfe6e9",
];
