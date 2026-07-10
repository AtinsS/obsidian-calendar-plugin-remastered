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
    const walk = (folder: any) => {
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
