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
  private firedDeadline = new Set<string>();
  private firedEstimateExceeded = new Set<string>();

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
    this.firedDeadline.clear();
    this.firedEstimateExceeded.clear();
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
      if (task.completed || task.status === "done") continue;

      // Scheduled time reminders
      if (task.scheduledTime && task.dateUID) {
        const scheduledMoment = this.getScheduledMoment(task);
        if (scheduledMoment && scheduledMoment.isValid()) {
          const fireAt = scheduledMoment.valueOf();
          const reminderKey = `${task.id}:reminder`;
          const overdueKey = `${task.id}:overdue`;

          const reminderMs = this.getSettings().reminderMinutesBefore * 60_000;
          if (now >= fireAt - reminderMs && now < fireAt && !this.firedReminders.has(reminderKey)) {
            this.firedReminders.add(reminderKey);
            this.notify(
              `📅 Calendar Remastered`,
              `⏱️ Напоминание: ${task.title}\nЗадача через ${this.getSettings().reminderMinutesBefore} мин (${task.scheduledTime})`
            );
          }

          if (now >= fireAt + 30 * 60_000 && !this.firedOverdue.has(overdueKey)) {
            this.firedOverdue.add(overdueKey);
            this.notify(
              `📅 Calendar Remastered`,
              `‼️ Просрочено: ${task.title}\nЗапланировано на ${task.scheduledTime}`
            );
          }
        }
      }

      // Estimated time exceeded — notify when work time exceeds estimate
      if (task.estimatedTime && task.totalWorkTime && task.status === "progress") {
        const estimateKey = `${task.id}:estimate-exceeded`;
        if (!this.firedEstimateExceeded.has(estimateKey)) {
          const estimatedMs = task.estimatedTime * 60_000;
          if (task.totalWorkTime > estimatedMs) {
            this.firedEstimateExceeded.add(estimateKey);
            const estH = Math.floor(task.estimatedTime / 60);
            const estM = task.estimatedTime % 60;
            const estStr = estH > 0 ? `${estH}ч ${estM > 0 ? estM + 'м' : ''}` : `${estM}м`;
            this.notify(
              `📅 Calendar Remastered`,
              `⏰ Превышен лимит: ${task.title}\nЗаявлено: ${estStr}`
            );
          }
        }
      }

      // Deadline notifications
      if (task.deadline) {
        const deadlineMatch = task.deadline.match(/^day-(\d{4})-(\d{2})-(\d{2})/);
        if (deadlineMatch) {
          const [, y, m, d] = deadlineMatch;
          const deadlineDate = new Date(`${y}-${m}-${d}T00:00:00`);
          const nowDate = new Date();
          const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
          const diffMs = deadlineDate.getTime() - today.getTime();
          const diffDays = Math.round(diffMs / 86400000);

          // Deadline start — when the deadline day begins (9:00 AM)
          const deadlineStartKey = `${task.id}:deadline-start`;
          if (diffDays === 0 && nowDate.getHours() >= 9 && !this.firedDeadline.has(deadlineStartKey)) {
            this.firedDeadline.add(deadlineStartKey);
            const timeStr = task.deadlineTime ? ` в ${task.deadlineTime}` : "";
            this.notify(
              `📅 Calendar Remastered`,
              `🎯 Дедлайн сегодня: ${task.title}${timeStr}`
            );
          }

          // Deadline end — when the deadline time passes
          if (task.deadlineTime && diffDays <= 0) {
            const deadlineEndKey = `${task.id}:deadline-end`;
            if (!this.firedDeadline.has(deadlineEndKey)) {
              const deadlineDateTime = new Date(`${y}-${m}-${d}T${task.deadlineTime}:00`);
              if (now >= deadlineDateTime.getTime()) {
                this.firedDeadline.add(deadlineEndKey);
                this.notify(
                  `📅 Calendar Remastered`,
                  `🔴 Дедлайн истёк: ${task.title}\nВремя: ${task.deadlineTime}`
                );
              }
            }
          }

          // 1 day before deadline
          const deadlineKey = `${task.id}:deadline`;
          if (diffDays === 1 && !this.firedDeadline.has(deadlineKey)) {
            this.firedDeadline.add(deadlineKey);
            const timeStr = task.deadlineTime ? ` в ${task.deadlineTime}` : "";
            this.notify(
              `📅 Calendar Remastered`,
              `⏰ Дедлайн завтра: ${task.title}${timeStr}`
            );
          }
        }
      }
    }

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
    for (const key of this.firedDeadline) {
      const taskId = key.split(":")[0];
      if (!activeIds.has(taskId)) {
        this.firedDeadline.delete(key);
      }
    }
    for (const key of this.firedEstimateExceeded) {
      const taskId = key.split(":")[0];
      if (!activeIds.has(taskId)) {
        this.firedEstimateExceeded.delete(key);
      }
    }
  }
}
