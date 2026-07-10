import { get } from "svelte/store";
import moment from "moment";
import type CalendarPlugin from "src/main";
import { tasks } from "src/task-tracker/stores";
import type { ITask } from "src/task-tracker/types";
import type { ISettings } from "src/settings";

const DEFAULT_CHECK_INTERVAL_MS = 60_000; // 1 minute
const DEFAULT_REMINDER_MINUTES = 5;

export interface NotificationSettings {
  notificationsEnabled: boolean;
  reminderMinutesBefore: number;
  checkIntervalMs: number;
}

export const defaultNotificationSettings: NotificationSettings = {
  notificationsEnabled: false,
  reminderMinutesBefore: DEFAULT_REMINDER_MINUTES,
  checkIntervalMs: DEFAULT_CHECK_INTERVAL_MS,
};

export class NotificationService {
  private plugin: CalendarPlugin;
  private timer: ReturnType<typeof setInterval> | null = null;
  private firedReminders = new Set<string>(); // track which reminders already fired
  private firedOverdue = new Set<string>();

  constructor(plugin: CalendarPlugin) {
    this.plugin = plugin;
  }

  start(): void {
    if (this.timer) return;

    this.requestPermission();
    this.timer = setInterval(() => this.check(), this.getSettings().checkIntervalMs);
    this.check(); // run immediately
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.firedReminders.clear();
    this.firedOverdue.clear();
  }

  restart(): void {
    this.stop();
    if (this.getSettings().notificationsEnabled) {
      this.start();
    }
  }

  private getSettings(): NotificationSettings {
    const opts = this.plugin.options as ISettings;
    return {
      notificationsEnabled: opts.notificationsEnabled ?? defaultNotificationSettings.notificationsEnabled,
      reminderMinutesBefore: opts.reminderMinutesBefore ?? defaultNotificationSettings.reminderMinutesBefore,
      checkIntervalMs: opts.checkIntervalMs ?? defaultNotificationSettings.checkIntervalMs,
    };
  }

  private requestPermission(): void {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  private check(): void {
    if (!this.getSettings().notificationsEnabled) return;
    if ("Notification" in window && Notification.permission !== "granted") return;

    const allTasks = get(tasks);
    const now = Date.now();

    for (const task of allTasks) {
      if (task.completed || task.status === "progress" || task.status === "paused" || !task.scheduledTime || !task.dateUID) continue;

      const scheduledMoment = this.getScheduledMoment(task);
      if (!scheduledMoment || !scheduledMoment.isValid()) continue;

      const fireAt = scheduledMoment.valueOf();
      const reminderKey = `${task.id}:reminder`;
      const overdueKey = `${task.id}:overdue`;

      // Pre-task reminder
      const reminderMs = this.getSettings().reminderMinutesBefore * 60_000;
      if (now >= fireAt - reminderMs && now < fireAt && !this.firedReminders.has(reminderKey)) {
        this.firedReminders.add(reminderKey);
        this.notify(
          `📅 Calendar Remastered`,
          `⏱️ Напоминание: ${task.title}\nЗадача через ${this.getSettings().reminderMinutesBefore} мин (${task.scheduledTime})`
        );
      }

      // Overdue alert (30 minutes after scheduled time)
      if (now >= fireAt + 30 * 60_000 && !this.firedOverdue.has(overdueKey)) {
        this.firedOverdue.add(overdueKey);
        this.notify(
          `📅 Calendar Remastered`,
          `‼️ Просрочено: ${task.title}\nЗапланировано на ${task.scheduledTime}`
        );
      }
    }

    // Reset keys for completed or removed tasks
    this.cleanupFiredKeys(allTasks);
  }

  private getScheduledMoment(task: ITask): moment.Moment | null {
    const match = task.dateUID.match(/^day-(\d{4}-\d{2}-\d{2})/);
    if (!match) return null;

    const dateStr = match[1];
    return moment(`${dateStr} ${task.scheduledTime}`, "YYYY-MM-DD HH:mm", true);
  }

  private notify(title: string, body: string): void {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const notification = new Notification(title, {
      body,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // Auto-close after 10 seconds
    setTimeout(() => notification.close(), 10_000);
  }

  private cleanupFiredKeys(activeTasks: ITask[]): void {
    const activeIds = new Set(activeTasks.map((t) => t.id));
    for (const key of this.firedReminders) {
      const taskId = key.split(":")[0];
      if (!activeIds.has(taskId)) {
        this.firedReminders.delete(key);
      }
    }
    for (const key of this.firedOverdue) {
      const taskId = key.split(":")[0];
      if (!activeIds.has(taskId)) {
        this.firedOverdue.delete(key);
      }
    }
  }
}
