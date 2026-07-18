import { App, PluginSettingTab, Setting, TFolder, requestUrl } from "obsidian";
import { appHasDailyNotesPluginLoaded } from "obsidian-daily-notes-interface";
import type { ILocaleOverride } from "obsidian-calendar-ui";
import { get } from "svelte/store";

import { DEFAULT_WORDS_PER_DOT } from "src/constants";
import { FolderSuggestModal } from "./modals/FolderSuggestModal";

import type CalendarPlugin from "./main";

export interface ISettings {
  wordsPerDot: number;
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

  // Task-Note sync settings
  syncAllTasksToNotes: boolean;
  tasksFolderPath: string;
  autoCleanupThreshold: number;
  timeLogCleanupThreshold: number;

  // Habit Tracker settings
  showHabitTracker: boolean;
  habitLogCleanupThreshold: number;

  // Sync settings
  syncToVault: boolean;

  // Notification settings
  notificationsEnabled: boolean;
  reminderMinutesBefore: number;
  checkIntervalMs: number;
  notifyReminders: boolean;
  notifyOverdue: boolean;
  notifyEstimateExceeded: boolean;
  notifyDeadlines: boolean;

  // ntfy.sh settings
  ntfyEnabled: boolean;
  ntfyTopic: string;

  // GitHub Actions notification settings
  morningSummaryEnabled: boolean;
  morningSummaryTime: string;
  overdueCheckEnabled: boolean;

  // Work task settings
  defaultPaymentType: "hour" | "day";
  defaultRate: number;

  // GitHub Actions test settings
  vaultRepo?: string;
  workflowToken?: string;

  // GitHub Gist sync settings
  githubToken?: string;
  gistId?: string;
  gistUrl?: string;
  gistRawUrl?: string;
  gistAutoSync?: boolean;
}

export const defaultSettings = Object.freeze({
  shouldConfirmBeforeCreate: true,

  wordsPerDot: DEFAULT_WORDS_PER_DOT,

  showWeeklyNote: false,
  weeklyNoteFormat: "",
  weeklyNoteTemplate: "",
  weeklyNoteFolder: "",

  localeOverride: "system-default",

  showTaskTracker: true,
  taskTrackerCollapsed: false,

  syncAllTasksToNotes: false,
  tasksFolderPath: "Tasks",
  autoCleanupThreshold: 180,
  timeLogCleanupThreshold: 180,

  showHabitTracker: true,
  habitLogCleanupThreshold: 1000,

  syncToVault: false,

  notificationsEnabled: false,
  reminderMinutesBefore: 5,
  checkIntervalMs: 60000,
  notifyReminders: true,
  notifyOverdue: true,
  notifyEstimateExceeded: true,
  notifyDeadlines: true,

  ntfyEnabled: false,
  ntfyTopic: "Calendar_Remastered",

  morningSummaryEnabled: false,
  morningSummaryTime: "06:00",
  overdueCheckEnabled: false,

  defaultPaymentType: "hour" as "hour" | "day",
  defaultRate: 0,
});

export function appHasPeriodicNotesPluginLoaded(): boolean {
  // Undocumented periodic-notes plugin API
  const appWithPlugins = window.app as unknown as { plugins: { getPlugin: (id: string) => { settings?: { weekly?: { enabled?: boolean } } } } };
  const periodicNotes = appWithPlugins.plugins.getPlugin("periodic-notes");
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

    this.addGitHubGistSettings();
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
  }

  private getVaultFolders(): string[] {
    const folders: string[] = [];
    const root = this.app.vault.getRoot();
    const walk = (folder: TFolder) => {
      for (const child of folder.children || []) {
        if (child instanceof TFolder) {
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

    new Setting(this.containerEl)
      .setName("Лимит логов привычек")
      .setDesc("Максимальное количество записей логов привычек. При превышении старые записи удаляются автоматически.")
      .addText((text) => {
        text
          .setPlaceholder("1000")
          .setValue(String(this.plugin.options.habitLogCleanupThreshold || 1000))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 50) {
              await this.plugin.writeOptions({ habitLogCleanupThreshold: num });
            }
          });
        text.inputEl.type = "number";
        text.inputEl.min = "50";
        text.inputEl.max = "10000";
        text.inputEl.style.maxWidth = "100px";
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
          .setPlaceholder("1000")
          .setValue(String(this.plugin.options.autoCleanupThreshold || 1000))
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

    new Setting(this.containerEl)
      .setName("Лимит логов времени")
      .setDesc("Максимальное количество записей логов времени. При превышении старые логи удаляются автоматически.")
      .addText((text) => {
        text
          .setPlaceholder("1000")
          .setValue(String(this.plugin.options.timeLogCleanupThreshold || 1000))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 10) {
              await this.plugin.writeOptions({ timeLogCleanupThreshold: num });
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

    new Setting(this.containerEl)
      .setName("Типы уведомлений")
      .setDesc("Выберите, какие типы уведомлений включить");

    new Setting(this.containerEl)
      .setName("Напоминания")
      .setDesc("Напоминание за N минут до запланированного времени")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notifyReminders);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ notifyReminders: value });
        });
      });

    new Setting(this.containerEl)
      .setName("Просроченные задачи")
      .setDesc("Уведомление, когда задача становится просроченной")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notifyOverdue);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ notifyOverdue: value });
        });
      });

    new Setting(this.containerEl)
      .setName("Превышение лимита времени")
      .setDesc("Уведомление, когда время работы превышает оценку")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notifyEstimateExceeded);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ notifyEstimateExceeded: value });
        });
      });

    new Setting(this.containerEl)
      .setName("Дедлайны")
      .setDesc("Уведомления о дедлайнах (завтра, сегодня, истёк)")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notifyDeadlines);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ notifyDeadlines: value });
        });
      });

    new Setting(this.containerEl)
      .setName("Отправлять в ntfy.sh")
      .setDesc("Дублировать уведомления на смартфон через ntfy.sh")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.ntfyEnabled);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ ntfyEnabled: value });
        });
      });

    new Setting(this.containerEl)
      .setName("Topic для ntfy.sh")
      .setDesc("Имя топика для получения уведомлений в приложении ntfy")
      .addText((text) => {
        text
          .setPlaceholder("Calendar_Remastered")
          .setValue(this.plugin.options.ntfyTopic || "Calendar_Remastered")
          .onChange(async (value) => {
            this.plugin.writeOptions({ ntfyTopic: value || "Calendar_Remastered" });
          });
        text.inputEl.style.maxWidth = "250px";
      });

    new Setting(this.containerEl)
      .setName("Тест ntfy.sh")
      .setDesc("Отправить тестовое уведомление на указанный топик")
      .addButton((btn) =>
        btn
          .setButtonText("Отправить тест")
          .setWarning()
          .onClick(async () => {
            const topic = this.plugin.options.ntfyTopic || "Calendar_Remastered";
            try {
              await requestUrl({
                url: `https://ntfy.sh/${topic}`,
                method: "POST",
                body: "Тестовое уведомление из Calendar Remastered",
              });
              alert(`Тестовое уведомление отправлено в ${topic}`);
            } catch (e) {
              alert(`Ошибка отправки: ${e}`);
            }
          })
      );

    this.containerEl.createEl("h4", {
      text: "GitHub Actions",
    });

    const ghDesc = document.createElement("div");
    ghDesc.addClass("setting-item-description");
    ghDesc.style.marginBottom = "8px";
    ghDesc.innerHTML = `
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        Уведомления отправляются через GitHub Actions, когда компьютер выключен.
      </p>
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>Требования:</b><br>
        1. Включите <b>Синхронизацию в корень хранилища</b> выше<br>
        2. Настройте git push в репозиторий (Obsidian Git или вручную)<br>
        3. Скопируйте файл <code>examples/workflows/daily-summary.yml</code> в <code>.github/workflows/</code> вашего vault-репозитория<br>
        4. Создайте токен: GitHub → Settings → Credentials → Personal access tokens (классический) с правами <code>repo</code> + <code>actions:write</code><br>
        5. Вставьте токен в поле ниже
      </p>
    `;
    this.containerEl.appendChild(ghDesc);

    new Setting(this.containerEl)
      .setName("Утренняя сводка")
      .setDesc("Отправлять список задач на телефон каждое утро через GitHub Actions")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.morningSummaryEnabled);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ morningSummaryEnabled: value });
          this.syncNotificationSettingsToVault();
        });
      });

    new Setting(this.containerEl)
      .setName("Время утренней сводки")
      .setDesc("Когда отправлять сводку (локальное время, формат ЧЧ:ММ)")
      .addText((text) => {
        text
          .setPlaceholder("06:00")
          .setValue(this.plugin.options.morningSummaryTime || "06:00")
          .onChange(async (value) => {
            if (/^\d{2}:\d{2}$/.test(value)) {
              this.plugin.writeOptions({ morningSummaryTime: value });
              this.syncNotificationSettingsToVault();
            }
          });
        text.inputEl.type = "time";
        text.inputEl.style.maxWidth = "120px";
      });

    new Setting(this.containerEl)
      .setName("Проверка просроченных (GitHub Actions)")
      .setDesc("Проверять просроченные задачи и дедлайны каждые 30 мин, когда компьютер выключен")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.overdueCheckEnabled);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ overdueCheckEnabled: value });
          this.syncNotificationSettingsToVault();
        });
      });

    new Setting(this.containerEl)
      .setName("Vault репозиторий")
      .setDesc("GitHub репозиторий с vault (формат: owner/repo)")
      .addText((text) => {
        text
          .setPlaceholder("AtinsS/ObsidianVaultRaven")
          .setValue(this.plugin.options.vaultRepo || "")
          .onChange(async (value) => {
            await this.plugin.writeOptions({ vaultRepo: value });
          });
        text.inputEl.style.maxWidth = "300px";
      });

    new Setting(this.containerEl)
      .setName("GitHub токен для Actions")
      .setDesc("Personal access token с правами repo/public_repo + actions:write")
      .addText((text) => {
        text
          .setPlaceholder("ghp_...")
          .setValue(this.plugin.options.workflowToken || "")
          .onChange(async (value) => {
            await this.plugin.writeOptions({ workflowToken: value });
          });
        text.inputEl.type = "password";
        text.inputEl.style.maxWidth = "300px";
      });

    new Setting(this.containerEl)
      .setName("Тест GitHub Actions")
      .setDesc("Запустить workflow утренней сводки в vault-репозитории")
      .addButton((btn) =>
        btn
          .setButtonText("Запустить workflow")
          .setWarning()
          .onClick(async () => {
            const token = this.plugin.options.workflowToken;
            const rawRepo = this.plugin.options.vaultRepo;
            const repo = rawRepo?.replace(/^https?:\/\/github\.com\//, "").replace(/\/+$/, "").replace(/\.git$/, "");

            if (!token) {
              alert("Сначала введите GitHub токен для Actions выше.");
              return;
            }
            if (!repo) {
              alert("Укажите vault репозиторий (owner/repo) выше.");
              return;
            }

            btn.setButtonText("Запуск...");
            btn.setDisabled(true);

            try {
              // Шаг 1: Проверяем доступ к репозиторию
              try {
                await requestUrl({
                  url: `https://api.github.com/repos/${repo}`,
                  headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github.v3+json",
                  },
                });
              } catch (err: unknown) {
                const status = (err as { status?: number | string })?.status || "неизвестно";
                alert(
                  `Нет доступа к репозиторию (${status})\n\n` +
                  `Репозиторий: ${repo}\n\n` +
                  `Возможные причины:\n` +
                  `1. Токен не имеет доступа к приватному репозиторию (нужен scope "repo")\n` +
                  `2. Репозиторий не существует\n` +
                  `3. Формат должен быть: owner/repo\n\n` +
                  `Проверьте токен: GitHub → Settings → Credentials → Personal access tokens`
                );
                return;
              }

              // Шаг 2: Проверяем наличие workflow
              let workflowFound = false;
              let availableList = "";
              try {
                const workflowsResp = await requestUrl({
                  url: `https://api.github.com/repos/${repo}/actions/workflows`,
                  headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github.v3+json",
                  },
                });
                const workflows = workflowsResp.json?.workflows || [];
                workflowFound = workflows.some((w: { path: string }) => w.path?.includes("daily-summary.yml"));
                availableList = workflows.map((w: { name: string; path: string }) => `  - ${w.name} (${w.path})`).join("\n");
              } catch {
                // Если не удалось получить список workflow — попробуем всё равно
                availableList = "(не удалось загрузить)";
              }

              if (!workflowFound) {
                alert(
                  `Workflow daily-summary.yml не найден!\n\n` +
                  `Доступные workflow:\n${availableList || "  (пусто)"}\n\n` +
                  `Убедитесь, что файл .github/workflows/daily-summary.yml существует в репозитории.`
                );
                return;
              }

              // Шаг 3: Запускаем workflow
              try {
                await requestUrl({
                  url: `https://api.github.com/repos/${repo}/actions/workflows/daily-summary.yml/dispatches`,
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github.v3+json",
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ ref: "main" }),
                });
                alert(`Workflow запущен! Проверьте ntfy.sh через 1-2 минуты.`);
              } catch (err: unknown) {
                const status = (err as { status?: number | string })?.status || "неизвестно";
                if (status === 422) {
                  alert("Workflow уже выполняется или конфигурация неверна.");
                } else {
                  alert(`Ошибка запуска workflow (${status}):\n${(err as Error)?.message || "неизвестная ошибка"}`);
                }
              }
            } catch (e) {
              alert(`Неожиданная ошибка: ${e}`);
            } finally {
              btn.setButtonText("Запустить workflow");
              btn.setDisabled(false);
            }
          })
      );

    new Setting(this.containerEl)
      .setName("Тест утренней сводки")
      .setDesc("Отправить тестовое уведомление со списком задач на сегодня")
      .addButton((btn) =>
        btn
          .setButtonText("Отправить тест")
          .setWarning()
          .onClick(async () => {
            const topic = this.plugin.options.ntfyTopic || "Calendar_Remastered";
            try {
              const { tasks } = await import("./task-tracker/stores");
              const { projects } = await import("./task-tracker/stores");
              const { get } = await import("svelte/store");

              const allTasks = get(tasks);
              const allProjects = get(projects);
              const now = new Date();

              // Локальная дата, не UTC
              const pad = (n: number) => String(n).padStart(2, "0");
              const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
              const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
              const yesterdayStr = `${yesterdayDate.getFullYear()}-${pad(yesterdayDate.getMonth() + 1)}-${pad(yesterdayDate.getDate())}`;

              const getProjectName = (pid: string) => {
                const p = allProjects.find((pr) => pr.id === pid);
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

                // Include elapsed time for tasks in progress
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

              await requestUrl({
                url: `https://ntfy.sh/${topic}`,
                method: "POST",
                body: msg,
                headers: {
                  Priority: "high",
                  Tags: "calendar,clipboard",
                },
              });

              alert(`Тестовая утренняя сводка отправлена в ${topic}`);
            } catch (e) {
              alert(`Ошибка отправки: ${e}`);
            }
          })
      );
  }

  private async syncNotificationSettingsToVault(): Promise<void> {
    if (!this.plugin.options.syncToVault) return;
    const { saveNotificationSyncSettings } = await import("./io/vaultStorage");
    await saveNotificationSyncSettings(this.app, {
      morningSummaryEnabled: this.plugin.options.morningSummaryEnabled,
      morningSummaryTime: this.plugin.options.morningSummaryTime,
      overdueCheckEnabled: this.plugin.options.overdueCheckEnabled,
      ntfyTopic: this.plugin.options.ntfyTopic || "Calendar_Remastered",
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

  addGitHubGistSettings(): void {
    this.containerEl.createEl("h3", {
      text: "GitHub Gist — синхронизация календаря",
    });

    const desc = document.createElement("div");
    desc.addClass("setting-item-description");
    desc.style.marginBottom = "8px";
    desc.innerHTML = `
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        Публикуйте календарь задач в GitHub Gist как .ics файл.
        Подпишитесь на него в Google Calendar или любом другом календаре.
      </p>
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>Как получить токен:</b><br>
        1. GitHub → Settings → Credentials<br>
        2. Personal access tokens → Tokens (classic)<br>
        3. Generate new token → галочки: <code>gist</code><br>
        4. Скопируйте токен и вставьте ниже
      </p>
    `;
    this.containerEl.appendChild(desc);

    new Setting(this.containerEl)
      .setName("GitHub токен для Gist")
      .setDesc("Personal access token с правами gist")
      .addText((text) => {
        text
          .setPlaceholder("ghp_...")
          .setValue(this.plugin.options.githubToken || "")
          .onChange(async (value) => {
            await this.plugin.writeOptions({ githubToken: value });
          });
        text.inputEl.type = "password";
        text.inputEl.style.maxWidth = "300px";
      });

    new Setting(this.containerEl)
      .setName("Синхронизировать с Gist")
      .setDesc("Экспортировать задачи (даты, время, дедлайны) в .ics файл на GitHub Gist")
      .addButton((btn) =>
        btn
          .setButtonText("Синхронизировать")
          .setCta()
          .onClick(async () => {
            const { syncToGist, gistSyncStatus, connectGist } = await import("./services/GistSyncService");
            const token = this.plugin.options.githubToken;

            if (!token) {
              alert("Сначала введите GitHub токен выше.");
              return;
            }

            // Check token permissions first
            const connectResult = await connectGist(token);
            if (connectResult.warning) {
              alert(connectResult.warning);
              return;
            }
            if (!connectResult.success) {
              alert(`Ошибка: ${connectResult.error}`);
              return;
            }

            const result = await syncToGist();
            if (result.success) {
              const status = get(gistSyncStatus);
              // Re-render settings to show the URL field
              this.display();
              alert(`Синхронизация завершена!\n\nURL для подписки:\n${status.rawUrl}\n\nДобавьте этот URL в Google Calendar (Settings → Subscribe to calendar).`);
            } else {
              alert(`Ошибка: ${result.error}`);
            }
          })
      );

    new Setting(this.containerEl)
      .setName("Автоматическая синхронизация")
      .setDesc("Автоматически обновлять Gist при изменении задач (debounce 5 сек)")
      .addToggle((toggle) => {
        toggle.setValue(!!this.plugin.options.gistAutoSync);
        toggle.onChange(async (value) => {
          const { setAutoSync } = await import("./services/GistSyncService");
          await this.plugin.writeOptions({ gistAutoSync: value });
          setAutoSync(value);
          if (value) {
            // Show status
            const statusEl = document.getElementById("gist-auto-sync-status");
            if (statusEl) statusEl.textContent = "✓ Автосинхронизация включена. Измените задачу для проверки.";
          }
        });
      });

    // Auto-sync status indicator
    const statusDesc = document.createElement("div");
    statusDesc.id = "gist-auto-sync-status";
    statusDesc.style.cssText = "font-size: 11px; color: var(--text-faint); margin-top: 4px; padding: 4px 0;";
    statusDesc.textContent = this.plugin.options.gistAutoSync
      ? "✓ Автосинхронизация включена. Измените задачу для проверки."
      : "Выключена. Включите для автоматического обновления календаря.";
    this.containerEl.querySelector(".setting-item:last-child")?.appendChild(statusDesc);

    if (this.plugin.options.gistRawUrl) {
      new Setting(this.containerEl)
        .setName("URL календаря")
        .setDesc("Добавьте этот URL в Google Calendar или другой календарь")
        .addText((text) => {
          text.setValue(this.plugin.options.gistRawUrl || "").setDisabled(true);
          text.inputEl.style.maxWidth = "500px";
        });
    }
  }
}
