import { get } from "svelte/store";
import moment from "moment";
import type CalendarPlugin from "src/main";
import { tasks, projects } from "src/task-tracker/stores";
import type { ITask } from "src/task-tracker/types";
import type { ISettings } from "src/settings";

const DEFAULT_CHECK_INTERVAL_MS = 60_000; // 1 minute
const DEFAULT_REMINDER_MINUTES = 5;

export interface NotificationSettings {
  notificationsEnabled: boolean;
  reminderMinutesBefore: number;
  checkIntervalMs: number;
  notifyReminders: boolean;
  notifyOverdue: boolean;
  notifyEstimateExceeded: boolean;
  notifyDeadlines: boolean;
}

export const defaultNotificationSettings: NotificationSettings = {
  notificationsEnabled: false,
  reminderMinutesBefore: DEFAULT_REMINDER_MINUTES,
  checkIntervalMs: DEFAULT_CHECK_INTERVAL_MS,
  notifyReminders: true,
  notifyOverdue: true,
  notifyEstimateExceeded: true,
  notifyDeadlines: true,
};

export class NotificationService {
  private plugin: CalendarPlugin;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ntfyAbortController: AbortController | null = null;
  private firedReminders = new Set<string>();
  private firedOverdue = new Set<string>();
  private firedDeadline = new Set<string>();
  private firedEstimateExceeded = new Set<string>();
  private lastSummaryDate = "";

  constructor(plugin: CalendarPlugin) {
    this.plugin = plugin;
    this.loadFiredState();
  }

  start(): void {
    if (this.timer) return;

    this.requestPermission();
    this.timer = setInterval(() => this.check(), this.getSettings().checkIntervalMs);
    this.check(); // run immediately
    this.startNtfyListener();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.stopNtfyListener();
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
      notifyReminders: opts.notifyReminders ?? defaultNotificationSettings.notifyReminders,
      notifyOverdue: opts.notifyOverdue ?? defaultNotificationSettings.notifyOverdue,
      notifyEstimateExceeded: opts.notifyEstimateExceeded ?? defaultNotificationSettings.notifyEstimateExceeded,
      notifyDeadlines: opts.notifyDeadlines ?? defaultNotificationSettings.notifyDeadlines,
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
          if (this.getSettings().notifyReminders && now >= fireAt - reminderMs && now < fireAt && !this.firedReminders.has(reminderKey)) {
            this.firedReminders.add(reminderKey);
            this.notify(
              `📅 Calendar Remastered`,
              `⏱️ Напоминание: ${task.title}\nЗадача через ${this.getSettings().reminderMinutesBefore} мин (${task.scheduledTime})`
            );
          }

          // Просрочка — сразу при наступлении запланированного времени
          if (this.getSettings().notifyOverdue && task.status === "todo" && now >= fireAt && !this.firedOverdue.has(overdueKey)) {
            this.firedOverdue.add(overdueKey);
            this.notify(
              `📅 Calendar Remastered`,
              `‼️ Просрочено: ${task.title}\nЗапланировано на ${task.scheduledTime}`
            );
          }
        }
      }

      // Estimated time exceeded — notify when work time exceeds estimate
      if (this.getSettings().notifyEstimateExceeded && task.estimatedTime && task.totalWorkTime && task.status === "progress") {
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
      if (this.getSettings().notifyDeadlines && task.deadline) {
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
    this.checkScheduledSummary();
  }

  private checkScheduledSummary(): void {
    const opts = this.plugin.options as ISettings;
    if (!opts.morningSummaryEnabled || !opts.ntfyEnabled || !opts.ntfyTopic) return;

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // Reset on new day
    if (this.lastSummaryDate && this.lastSummaryDate !== todayStr) {
      this.lastSummaryDate = "";
    }

    // Already sent today
    if (this.lastSummaryDate === todayStr) return;

    const summaryTime = opts.morningSummaryTime || "08:00";
    const [targetH, targetM] = summaryTime.split(":").map(Number);

    // Check if current time matches target (within 1-minute window)
    if (now.getHours() === targetH && now.getMinutes() === targetM) {
      this.lastSummaryDate = todayStr;
      this.sendMorningSummary();
    }
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

    // Also send via ntfy.sh if enabled
    this.sendNtfy(body);
  }

  private sendNtfy(body: string): void {
    const opts = this.plugin.options as ISettings;
    if (!opts.ntfyEnabled || !opts.ntfyTopic) return;

    fetch(`https://ntfy.sh/${opts.ntfyTopic}`, {
      method: "POST",
      body,
    }).catch((e) => console.warn("[ntfy] send failed:", e));
  }

  private ntfyPollTimer: ReturnType<typeof setInterval> | null = null;
  private ntfyLastId = "";

  private startNtfyListener(): void {
    const opts = this.plugin.options as ISettings;
    if (!opts.ntfyEnabled || !opts.ntfyTopic) return;

    this.stopNtfyListener();

    const topic = opts.ntfyTopic;

    // Poll ntfy every 30 seconds for new messages
    this.ntfyPollTimer = setInterval(async () => {
      try {
        const sinceParam = this.ntfyLastId ? `&since=${this.ntfyLastId}` : "&since=5m";
        const url = `https://ntfy.sh/${topic}/json?poll=1${sinceParam}`;
        const response = await fetch(url);
        if (!response.ok) return;

        const text = await response.text();
        if (!text.trim()) return;

        const lines = text.split("\n").filter((l) => l.trim().startsWith("{"));

        for (const line of lines) {
          try {
            const event = JSON.parse(line.trim());
            if (event.id) this.ntfyLastId = event.id;
            if (event.message && event.event === "message") {
              this.handleNtfyCommand(event.message);
            }
          } catch {
            // ignore parse errors
          }
        }
      } catch (e) {
        console.warn("[ntfy] poll error:", e);
      }
    }, 30_000);
  }

  private stopNtfyListener(): void {
    if (this.ntfyPollTimer) {
      clearInterval(this.ntfyPollTimer);
      this.ntfyPollTimer = null;
    }
    if (this.ntfyAbortController) {
      this.ntfyAbortController.abort();
      this.ntfyAbortController = null;
    }
  }

  private handleNtfyCommand(message: string): void {
    const text = message.trim().toLowerCase();

    if (text === "утренняя сводка" || text === "сводка") {
      this.sendMorningSummary();
    }
  }

  private sendMorningSummary(): void {
    const opts = this.plugin.options as ISettings;
    if (!opts.ntfyEnabled || !opts.ntfyTopic) return;

    const allTasks = get(tasks);
    const allProjects = get(projects);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdayStr = `${yesterdayDate.getFullYear()}-${pad(yesterdayDate.getMonth() + 1)}-${pad(yesterdayDate.getDate())}`;

    const getProjectName = (pid: string) => {
      const p = allProjects.find((pr: any) => pr.id === pid);
      return p ? ` [${p.name}]` : "";
    };

    const overdue: string[] = [];
    const morning: string[] = [];
    const afternoon: string[] = [];
    const evening: string[] = [];
    let doneYesterday = 0;

    for (const t of allTasks) {
      if (t.status === "done" || t.completed) {
        const d = t.dateUID || "";
        if (d.includes(yesterdayStr)) doneYesterday++;
        continue;
      }

      const dateUID = t.dateUID || "";
      if (!dateUID.includes(todayStr)) {
        const schedDate = dateUID.replace("day-", "");
        if (schedDate && schedDate < todayStr) {
          overdue.push(`${getProjectName(t.projectId)} ${t.title} (${t.scheduledTime || "нет времени"})`);
        }
        continue;
      }

      const proj = getProjectName(t.projectId);
      const time = t.scheduledTime || "--:--";
      const hour = parseInt(time.split(":")[0]) || 12;

      let timerInfo = "";
      if (t.status === "progress" && t.timerStartedAt) {
        const elapsed = (Date.now() - t.timerStartedAt) / 1000;
        if (elapsed > 0) {
          const hours = Math.floor(elapsed / 3600);
          const minutes = Math.floor((elapsed % 3600) / 60);
          timerInfo = hours > 0
            ? ` [в работе ${hours}ч ${minutes > 0 ? minutes + 'м' : ''}]`
            : ` [в работе ${minutes}м]`;
        }
      }

      const line = `${proj} ${t.title} ⏰ ${time}${timerInfo}`;

      if (hour < 12) morning.push(line);
      else if (hour < 17) afternoon.push(line);
      else evening.push(line);
    }

    const total = overdue.length + morning.length + afternoon.length + evening.length;
    const lines = [`📋 Задачи на сегодня (${total})`, ""];

    if (overdue.length) {
      lines.push(`🔥 Просроченные (${overdue.length}):`);
      overdue.forEach((l, i) => lines.push(`${i + 1}. 🔴 ${l}`));
      lines.push("");
    }
    if (morning.length) {
      lines.push(`⏰ Утро (${morning.length}):`);
      morning.forEach((l, i) => lines.push(`${i + overdue.length + 1}. 🟡 ${l}`));
      lines.push("");
    }
    if (afternoon.length) {
      lines.push(`🌆 День (${afternoon.length}):`);
      afternoon.forEach((l, i) => lines.push(`${i + overdue.length + morning.length + 1}. 🔴 ${l}`));
      lines.push("");
    }
    if (evening.length) {
      lines.push(`🌙 Вечер (${evening.length}):`);
      evening.forEach((l, i) => lines.push(`${i + overdue.length + morning.length + afternoon.length + 1}. 🟣 ${l}`));
      lines.push("");
    }

    lines.push("📊 Статистика:");
    lines.push(`✅ Вчера выполнено: ${doneYesterday}`);
    lines.push(`📝 Сегодня осталось: ${total}`);

    if (total === 0) {
      lines.length = 0;
      lines.push("📋 Задач на сегодня нет", "", "Отдыхай!");
    }

    const msg = lines.join("\n");
    this.sendNtfy(msg);
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
    this.saveFiredState();
  }

  private async loadFiredState(): Promise<void> {
    try {
      const data = await this.plugin.loadData();
      const fired = data?.firedNotifications || {};
      this.firedReminders = new Set(fired.reminders || []);
      this.firedOverdue = new Set(fired.overdue || []);
      this.firedDeadline = new Set(fired.deadline || []);
      this.firedEstimateExceeded = new Set(fired.estimateExceeded || []);
    } catch {
      // ignore
    }
  }

  private saveFiredState(): void {
    const data = {
      reminders: [...this.firedReminders],
      overdue: [...this.firedOverdue],
      deadline: [...this.firedDeadline],
      estimateExceeded: [...this.firedEstimateExceeded],
    };
    this.plugin.loadData().then((existing) => {
      const updated = { ...(existing || {}), firedNotifications: data };
      this.plugin.saveData(updated);
    }).catch(() => { /* ignore */ });
  }
}
