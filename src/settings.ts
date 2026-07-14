import { App, PluginSettingTab, Setting } from "obsidian";
import { appHasDailyNotesPluginLoaded } from "obsidian-daily-notes-interface";
import type { ILocaleOverride, IWeekStartOption } from "obsidian-calendar-ui";

import { DEFAULT_WORDS_PER_DOT } from "src/constants";
import { defaultNotificationSettings } from "src/services/NotificationService";
import { FolderSuggestModal } from "./modals/FolderSuggestModal";

import type CalendarPlugin from "./main";

export interface ISettings {
  wordsPerDot: number;
  weekStart: IWeekStartOption;
  shouldConfirmBeforeCreate: boolean;

  // Weekly Note settings
  showWeeklyNote: boolean;
  weeklyNoteFormat: string;
  weeklyNoteTemplate: string;
  weeklyNoteFolder: string;

  localeOverride: ILocaleOverride;

  // Task Tracker settings
  showTaskTracker: boolean;
  taskTrackerCollapsed: boolean;
  archiveCompletedNotes: boolean;
  archiveFolderPath: string;

  // Task-Note sync settings
  syncAllTasksToNotes: boolean;
  tasksFolderPath: string;
  autoCleanupThreshold: number;

  // Habit Tracker settings
  showHabitTracker: boolean;

  // Sync settings
  syncToVault: boolean;

  // Notification settings
  notificationsEnabled: boolean;
  reminderMinutesBefore: number;
  checkIntervalMs: number;

  // Work task settings
  defaultPaymentType: "hour" | "day";
  defaultRate: number;
}

const weekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export const defaultSettings = Object.freeze({
  shouldConfirmBeforeCreate: true,
  weekStart: "locale" as IWeekStartOption,

  wordsPerDot: DEFAULT_WORDS_PER_DOT,

  showWeeklyNote: false,
  weeklyNoteFormat: "",
  weeklyNoteTemplate: "",
  weeklyNoteFolder: "",

  localeOverride: "system-default",

  showTaskTracker: true,
  taskTrackerCollapsed: false,
  archiveCompletedNotes: false,
  archiveFolderPath: "Archive",

  syncAllTasksToNotes: false,
  tasksFolderPath: "Tasks",
  autoCleanupThreshold: 180,

  showHabitTracker: true,

  syncToVault: false,

  notificationsEnabled: defaultNotificationSettings.notificationsEnabled,
  reminderMinutesBefore: defaultNotificationSettings.reminderMinutesBefore,
  checkIntervalMs: defaultNotificationSettings.checkIntervalMs,

  defaultPaymentType: "hour" as "hour" | "day",
  defaultRate: 0,
});

export function appHasPeriodicNotesPluginLoaded(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const periodicNotes = (<any>window.app).plugins.getPlugin("periodic-notes");
  return periodicNotes && periodicNotes.settings?.weekly?.enabled;
}

export class CalendarSettingsTab extends PluginSettingTab {
  private plugin: CalendarPlugin;

  constructor(app: App, plugin: CalendarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();

    if (!appHasDailyNotesPluginLoaded()) {
      this.containerEl.createDiv("settings-banner", (banner) => {
        banner.createEl("h3", {
          text: "⚠️ Плагин Daily Notes не включён",
        });
        banner.createEl("p", {
          cls: "setting-item-description",
          text:
            "Календарь лучше всего работает в связке с плагинами Daily Notes или Periodic Notes (доступны в каталоге плагинов).",
        });
      });
    }

    this.containerEl.createEl("h3", {
      text: "Основные настройки",
    });
    this.addWeekStartSetting();

    this.containerEl.createEl("h3", {
      text: "Панели",
    });
    this.addShowTaskTrackerSetting();
    this.addShowHabitTrackerSetting();

    this.containerEl.createEl("h3", {
      text: "Синхронизация",
    });
    this.addSyncToVaultSetting();
    this.addSyncAdvice();

    this.containerEl.createEl("h3", {
      text: "Синхронизация задач с заметками",
    });
    this.addTaskNoteSyncSettings();

    this.containerEl.createEl("h3", {
      text: "Уведомления",
    });
    this.addNotificationSettings();

    this.containerEl.createEl("h3", {
      text: "Рабочие задачи",
    });
    this.addWorkTaskSettings();
  }

  addWeekStartSetting(): void {
    const { moment } = window;

    const localizedWeekdays = moment.weekdays();
    const localeWeekStartNum = window._bundledLocaleWeekSpec.dow;
    const localeWeekStart = moment.weekdays()[localeWeekStartNum];

    new Setting(this.containerEl)
      .setName("Начало недели:")
      .setDesc(
        "Выберите день начала недели. «По умолчанию» использует настройки moment.js"
      )
      .addDropdown((dropdown) => {
        dropdown.addOption("locale", `По умолчанию (${localeWeekStart})`);
        localizedWeekdays.forEach((day, i) => {
          dropdown.addOption(weekdays[i], day);
        });
        dropdown.setValue(this.plugin.options.weekStart);
        dropdown.onChange(async (value) => {
          this.plugin.writeOptions({
            weekStart: value as IWeekStartOption,
          });
        });
      });
  }

  addShowTaskTrackerSetting(): void {
    new Setting(this.containerEl)
      .setName("Показывать трекер задач")
      .setDesc("Отображать панель трекера задач под календарём")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.showTaskTracker);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ showTaskTracker: value });
        });
      });

    new Setting(this.containerEl)
      .setName("Архивировать заметки-задачи")
      .setDesc("При завершении задачи-заметки перемещать её в папку архива")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.archiveCompletedNotes);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ archiveCompletedNotes: value });
        });
      });

    new Setting(this.containerEl)
      .setName("Папка архива")
      .setDesc("Папка для перемещения завершённых заметок-задач")
      .addDropdown((dropdown) => {
        const folders = this.getVaultFolders();
        folders.forEach((folder) => {
          dropdown.addOption(folder, folder);
        });
        dropdown.addOption("__custom", "Другая...");
        const current = this.plugin.options.archiveFolderPath || "Archive";
        if (!folders.includes(current)) {
          dropdown.addOption(current, current);
        }
        dropdown.setValue(current);
        dropdown.onChange(async (value) => {
          if (value === "__custom") {
            const modal = new FolderSuggestModal(this.app, async (folder) => {
              this.plugin.writeOptions({ archiveFolderPath: folder });
              this.display();
            });
            modal.open();
          } else {
            this.plugin.writeOptions({ archiveFolderPath: value });
          }
        });
      });
  }

  private getVaultFolders(): string[] {
    const folders: string[] = [];
    const root = this.app.vault.getRoot();
    const walk = (folder: { children?: Array<{ children?: unknown[]; path: string }>; path: string }) => {
      for (const child of folder.children) {
        if (child.children) {
          folders.push(child.path);
          walk(child);
        }
      }
    };
    walk(root);
    return folders.sort();
  }

  addShowHabitTrackerSetting(): void {
    new Setting(this.containerEl)
      .setName("Показывать трекер привычек")
      .setDesc("Отображать панель трекера привычек под календарём")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.showHabitTracker);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ showHabitTracker: value });
        });
      });
  }

  addSyncToVaultSetting(): void {
    new Setting(this.containerEl)
      .setName("Синхронизация в корень хранилища")
      .setDesc(
        "Сохранять данные в calendar-data.json в корне хранилища вместо папки плагина. Позволяет синхронизировать задачи и привычки через Obsidian Sync, iCloud или Git."
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.syncToVault);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ syncToVault: value });
        });
      });
  }

  addSyncAdvice(): void {
    const desc = document.createElement("div");
    desc.addClass("setting-item-description");
    desc.style.marginTop = "8px";
    desc.innerHTML = `
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>Remotely Save:</b> В настройках плагина добавьте <code>calendar-data.json</code> в список синхронизируемых файлов (Include Files).
      </p>
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>Obsidian Sync:</b> Включите синхронизацию файлов — <code>calendar-data.json</code> будет синхронизирован автоматически.
      </p>
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>iCloud / Google Drive:</b> Убедитесь, что хранилище синхронизируется полностью.
      </p>
    `;
    this.containerEl.appendChild(desc);
  }

  addTaskNoteSyncSettings(): void {
    new Setting(this.containerEl)
      .setName("Создавать Task заметку для каждой задачи")
      .setDesc(
        "При создании задачи автоматически создавать .md файл в папке Tasks/ в формате Tasks плагина."
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.syncAllTasksToNotes);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ syncAllTasksToNotes: value });
        });
      })
      .addButton((btn) =>
        btn
          .setButtonText("Создать заметки для всех задач")
          .setTooltip("Создать Task заметки для задач, у которых их ещё нет")
          .onClick(async () => {
            const { tasks } = await import("./task-tracker/stores");
            const { get } = await import("svelte/store");
            const { createNoteTask, shouldSyncTaskToNote } = await import("./task-tracker/noteTasks");

            const allTasks = get(tasks);
            const tasksFolderPath = this.plugin.options.tasksFolderPath || "Tasks";
            let created = 0;

            for (const task of allTasks) {
              // Пропускаем задачи у которых уже есть Task заметка
              if (task.notePath && task.notePath.startsWith(tasksFolderPath + "/")) {
                continue;
              }

              if (shouldSyncTaskToNote(task)) {
                try {
                  const { projects } = await import("./task-tracker/stores");
                  const { get: getS } = await import("svelte/store");
                  const project = getS(projects).find((p) => p.id === task.projectId);
                  const file = await createNoteTask(task, project, this.app);
                  if (file) {
                    const { updateTask } = await import("./task-tracker/stores");
                    updateTask(task.id, { notePath: file.path });
                    created++;
                  }
                } catch (error) {
                  console.error(`[Settings] Failed to create note for task ${task.id}:`, error);
                }
              }
            }

            alert(`Создано ${created} Task заметок`);
          })
      );

    new Setting(this.containerEl)
      .setName("Папка для задач")
      .setDesc("Папка, где будут храниться .md файлы задач")
      .addDropdown((dropdown) => {
        const folders = this.getVaultFolders();
        folders.forEach((folder) => {
          dropdown.addOption(folder, folder);
        });
        dropdown.addOption("__custom", "Другая...");
        const current = this.plugin.options.tasksFolderPath || "Tasks";
        if (!folders.includes(current)) {
          dropdown.addOption(current, current);
        }
        dropdown.setValue(current);
        dropdown.onChange(async (value) => {
          if (value === "__custom") {
            const modal = new FolderSuggestModal(this.app, async (folder) => {
              this.plugin.writeOptions({ tasksFolderPath: folder });
              this.display();
            });
            modal.open();
          } else {
            this.plugin.writeOptions({ tasksFolderPath: value });
          }
        });
      });

    new Setting(this.containerEl)
      .setName("Лимит выполненных задач")
      .setDesc("Максимальное количество выполненных задач. При превышении старые задачи и их заметки удаляются автоматически.")
      .addText((text) => {
        text
          .setPlaceholder("180")
          .setValue(String(this.plugin.options.autoCleanupThreshold || 180))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 10) {
              await this.plugin.writeOptions({ autoCleanupThreshold: num });
            }
          });
        text.inputEl.type = "number";
        text.inputEl.min = "10";
        text.inputEl.max = "10000";
        text.inputEl.style.maxWidth = "100px";
      });

    // Информация о формате
    const formatInfo = document.createElement("div");
    formatInfo.addClass("setting-item-description");
    formatInfo.style.marginTop = "8px";
    formatInfo.innerHTML = `
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>Формат заметки:</b>
      </p>
      <pre style="background: var(--background-secondary); padding: 8px; border-radius: 4px; font-size: 11px; overflow-x: auto; margin: 4px 0;"><code>---
task_id: abc123
title: Купить молоко
status: todo
date: day-2024-10-25
priority: medium
---

- [ ] Купить молоко 📅 2024-10-25 🛫 14:30 ⏫</code></pre>
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>Статусы:</b> - [ ] todo, - [/] progress, - [-] paused, - [x] done
      </p>
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>Эмодзи:</b> 📅 дата, 🛫 время, ⏰ дедлайн, 🔁 повторение, ⏫/⬇️ приоритет
      </p>
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>Автоочистка:</b> при достижении лимита старые выполненные задачи и их заметки удаляются автоматически.
      </p>
    `;
    this.containerEl.appendChild(formatInfo);
  }

  addNotificationSettings(): void {
    new Setting(this.containerEl)
      .setName("Включить уведомления")
      .setDesc("Показывать уведомления о запланированных задачах")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notificationsEnabled);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ notificationsEnabled: value });
        });
      });

    new Setting(this.containerEl)
      .setName("Напоминание за (минут)")
      .setDesc("За сколько минут до запланированного времени показывать напоминание")
      .addDropdown((dropdown) => {
        dropdown.addOption("1", "1 минута");
        dropdown.addOption("5", "5 минут");
        dropdown.addOption("10", "10 минут");
        dropdown.addOption("15", "15 минут");
        dropdown.addOption("30", "30 минут");
        dropdown.addOption("60", "1 час");
        dropdown.setValue(String(this.plugin.options.reminderMinutesBefore));
        dropdown.onChange(async (value) => {
          this.plugin.writeOptions({ reminderMinutesBefore: parseInt(value) });
        });
      });
  }

  addWorkTaskSettings(): void {
    new Setting(this.containerEl)
      .setName("Тип оплаты по умолчанию")
      .setDesc("Тип оплаты для новых рабочих задач")
      .addDropdown((dropdown) => {
        dropdown.addOption("hour", "Оплата в час");
        dropdown.addOption("day", "Оплата в день");
        dropdown.setValue(this.plugin.options.defaultPaymentType);
        dropdown.onChange(async (value) => {
          this.plugin.writeOptions({ defaultPaymentType: value as "hour" | "day" });
        });
      });

    new Setting(this.containerEl)
      .setName("Ставка по умолчанию")
      .setDesc("Ставка для новых рабочих задач (в рублях)")
      .addText((text) => {
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.options.defaultRate || ""))
          .onChange(async (value) => {
            this.plugin.writeOptions({ defaultRate: parseFloat(value) || 0 });
          });
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.inputEl.style.maxWidth = "120px";
      });
  }
}
