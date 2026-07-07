export interface IHabit {
  id: string;
  title: string;
  icon: string;
  color: string;
  frequency: "daily" | "weekly" | "custom";
  customDays?: number[];
  projectId?: string | null;
  targetCount: number;
  archived: boolean;
  createdAt: number;
  sortOrder: number;
}

export interface IHabitLog {
  id: string;
  habitId: string;
  date: string;
  completed: boolean;
  count: number;
  completedAt?: number;
}

export interface IHabitTrackerData {
  habits: IHabit[];
  habitLogs: IHabitLog[];
  version: number;
}

export const HABIT_TRACKER_DATA_VERSION = 1;
export const MAX_HABIT_LOG_ENTRIES = 180;
