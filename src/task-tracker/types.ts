export interface RecurrenceConfig {
  type: "daily" | "weekly" | "monthly";
  interval?: number;
  daysOfWeek?: number[];
}

export interface ITask {
  id: string;
  title: string;
  completed: boolean;
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

export interface ITaskTrackerData {
  tasks: ITask[];
  projects: IProject[];
  version: number;
}

export type DateUID = string;

export const TASK_TRACKER_DATA_VERSION = 2;

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
