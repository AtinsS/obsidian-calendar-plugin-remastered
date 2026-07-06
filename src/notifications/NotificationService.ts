import type CalendarPlugin from "src/main";
import { Notice } from "obsidian";
import type { IReminder, INotificationData } from "./types";
import { NOTIFICATION_DATA_VERSION } from "./types";

const NOTIFICATION_KEY = "notifications";
const CHECK_INTERVAL = 30000;

let pluginInstance: CalendarPlugin | null = null;
let checkTimer: ReturnType<typeof setInterval> | null = null;
let reminders: IReminder[] = [];

function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function loadData(): Promise<void> {
  if (!pluginInstance) return;
  const raw = await pluginInstance.loadData();
  if (raw && raw[NOTIFICATION_KEY]) {
    const data = raw[NOTIFICATION_KEY] as INotificationData;
    reminders = data.reminders || [];
  }
}

async function saveData(): Promise<void> {
  if (!pluginInstance) return;
  const raw = await pluginInstance.loadData();
  const data: INotificationData = {
    reminders,
    version: NOTIFICATION_DATA_VERSION,
  };
  const updated = { ...(raw || {}), [NOTIFICATION_KEY]: data };
  await pluginInstance.saveData(updated);
}

function checkReminders(): void {
  const now = Date.now();
  let changed = false;

  for (const reminder of reminders) {
    if (reminder.triggered) continue;
    if (reminder.scheduledFor > now) continue;

    // Fire the reminder
    new Notice(`${reminder.title}\n${reminder.message}`, 8000);

    // Mark as triggered
    reminder.triggered = true;
    changed = true;

    // Handle repeat
    if (reminder.repeat !== "none") {
      const nextDate = new Date(reminder.scheduledFor);
      if (reminder.repeat === "daily") {
        nextDate.setDate(nextDate.getDate() + 1);
      } else if (reminder.repeat === "weekly") {
        nextDate.setDate(nextDate.getDate() + 7);
      }
      reminders.push({
        ...reminder,
        id: generateId(),
        scheduledFor: nextDate.getTime(),
        triggered: false,
        createdAt: Date.now(),
      });
    }
  }

  // Clean old triggered reminders (> 7 days)
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const beforeClean = reminders.length;
  reminders = reminders.filter(
    (r) => !r.triggered || r.createdAt > sevenDaysAgo
  );
  if (reminders.length !== beforeClean) changed = true;

  if (changed) {
    saveData();
  }
}

export function initNotifications(plugin: CalendarPlugin): void {
  pluginInstance = plugin;
  loadData().then(() => {
    checkTimer = setInterval(checkReminders, CHECK_INTERVAL);
    checkReminders();
  });
}

export function destroyNotifications(): void {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
  pluginInstance = null;
}

export function addReminder(
  reminder: Omit<IReminder, "id" | "triggered" | "createdAt">
): IReminder {
  const newReminder: IReminder = {
    ...reminder,
    id: generateId(),
    triggered: false,
    createdAt: Date.now(),
  };
  reminders.push(newReminder);
  saveData();
  return newReminder;
}

export function removeReminder(id: string): void {
  reminders = reminders.filter((r) => r.id !== id);
  saveData();
}

export function getRemindersForEntity(entityId: string): IReminder[] {
  return reminders.filter((r) => r.entityId === entityId);
}

export function getActiveReminders(): IReminder[] {
  return reminders.filter((r) => !r.triggered);
}
