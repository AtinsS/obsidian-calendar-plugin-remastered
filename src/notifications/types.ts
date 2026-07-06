export type ReminderType = "task" | "habit" | "custom";

export interface IReminder {
  id: string;
  type: ReminderType;
  entityId?: string;
  title: string;
  message: string;
  scheduledFor: number;
  repeat: "none" | "daily" | "weekly";
  triggered: boolean;
  createdAt: number;
}

export interface INotificationData {
  reminders: IReminder[];
  version: number;
}

export const NOTIFICATION_DATA_VERSION = 1;
