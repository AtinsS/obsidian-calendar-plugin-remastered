import { App, Modal, Setting } from "obsidian";
import { get } from "svelte/store";
import { getDateUID } from "obsidian-daily-notes-interface";

import type { ITask, RecurrenceConfig } from "./types";
import { projects, selectedDate } from "./stores";

export class TaskModal extends Modal {
  private task: ITask | null;
  private onSubmit: (task: Partial<ITask> & { isNoteTask?: boolean; notePath?: string }) => void;

  private titleInput = "";
  private projectId: string | null = null;
  private dateUID = "";
  private dateValue = "";
  private priority: "low" | "medium" | "high" = "medium";
  private isNoteTask = false;
  private notePathInput = "";
  private recurrenceType: "none" | "daily" | "weekly" | "monthly" = "none";
  private recurrenceInterval = 1;
  private recurrenceDaysOfWeek: number[] = [];
  private estimatedTimeHours = "";
  private estimatedTimeMinutes = "";
  private scheduledTime = "";

  constructor(
    app: App,
    onSubmit: (task: Partial<ITask> & { isNoteTask?: boolean; notePath?: string }) => void,
    task?: ITask
  ) {
    super(app);
    this.onSubmit = onSubmit;
    this.task = task || null;

    if (this.task) {
      this.titleInput = this.task.title;
      this.projectId = this.task.projectId;
      this.dateUID = this.task.dateUID;
      this.dateValue = this.extractDateValue(this.task.dateUID);
      this.priority = this.task.priority;
      this.isNoteTask = !!this.task.notePath;
      this.notePathInput = this.task.notePath || "";
      if (this.task.recurrence) {
        this.recurrenceType = this.task.recurrence.type;
        this.recurrenceInterval = this.task.recurrence.interval || 1;
        this.recurrenceDaysOfWeek = this.task.recurrence.daysOfWeek || [];
      }
      if (this.task.estimatedTime) {
        const totalMin = this.task.estimatedTime;
        this.estimatedTimeHours = String(Math.floor(totalMin / 60));
        this.estimatedTimeMinutes = String(totalMin % 60);
      }
      if (this.task.scheduledTime) {
        this.scheduledTime = this.task.scheduledTime;
      }
    } else {
      this.dateUID = get(selectedDate) || "";
      this.dateValue = this.extractDateValue(this.dateUID);
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("task-tracker-modal");

    contentEl.createEl("h2", {
      text: this.task ? "Редактировать задачу" : "Новая задача",
    });

    new Setting(contentEl)
      .setName("Название")
      .addText((text) =>
        text
          .setPlaceholder("Название задачи")
          .setValue(this.titleInput)
          .onChange((value) => {
            this.titleInput = value;
            if (this.isNoteTask && !this.task) {
              this.updateNotePathPreview();
            }
          })
      );

    const projectOptions: Record<string, string> = { "": "Без проекта" };
    get(projects).forEach((p) => {
      projectOptions[p.id] = `${p.icon} ${p.name}`;
    });

    new Setting(contentEl)
      .setName("Проект")
      .addDropdown((dropdown) => {
        Object.entries(projectOptions).forEach(([id, label]) => {
          dropdown.addOption(id, label);
        });
        dropdown.setValue(this.projectId || "");
        dropdown.onChange((value) => {
          this.projectId = value || null;
          if (this.isNoteTask && !this.task) {
            this.updateNotePathPreview();
          }
        });
      });

    new Setting(contentEl)
      .setName("Дата")
      .addText((text) => {
        text
          .setPlaceholder("ГГГГ-ММ-ДД")
          .setValue(this.dateValue)
          .onChange((value) => {
            this.dateValue = value;
            if (value) {
              const moment = window.moment(value, "YYYY-MM-DD", true);
              if (moment.isValid()) {
                this.dateUID = getDateUID(moment, "day");
              }
            } else {
              this.dateUID = "";
            }
          });
        text.inputEl.type = "date";
      });

    new Setting(contentEl)
      .setName("Приоритет")
      .addDropdown((dropdown) => {
        dropdown.addOption("low", "Низкий");
        dropdown.addOption("medium", "Средний");
        dropdown.addOption("high", "Высокий");
        dropdown.setValue(this.priority);
        dropdown.onChange((value) => {
          this.priority = value as "low" | "medium" | "high";
        });
      });

    new Setting(contentEl)
      .setName("Ожидаемое время")
      .setDesc("Необязательно. Часы и минуты.")
      .addText((text) => {
        text
          .setPlaceholder("ч")
          .setValue(this.estimatedTimeHours)
          .onChange((value) => {
            this.estimatedTimeHours = value;
          });
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.inputEl.max = "24";
        text.inputEl.style.maxWidth = "50px";
        text.inputEl.placeholder = "ч";
      })
      .addText((text) => {
        text
          .setPlaceholder("мин")
          .setValue(this.estimatedTimeMinutes)
          .onChange((value) => {
            this.estimatedTimeMinutes = value;
          });
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.inputEl.max = "59";
        text.inputEl.style.maxWidth = "50px";
        text.inputEl.placeholder = "мин";
      });

    new Setting(contentEl)
      .setName("Запланировано на")
      .setDesc("Необязательно. Время выполнения задачи.")
      .addText((text) => {
        text
          .setPlaceholder("14:30")
          .setValue(this.scheduledTime)
          .onChange((value) => {
            this.scheduledTime = value;
          });
        text.inputEl.type = "time";
        text.inputEl.style.maxWidth = "120px";
      });

    // Recurrence section
    new Setting(contentEl)
      .setName("Повторение")
      .setDesc("Настройка повторяющейся задачи")
      .addDropdown((dropdown) => {
        dropdown.addOption("none", "Нет");
        dropdown.addOption("daily", "Ежедневно");
        dropdown.addOption("weekly", "Еженедельно");
        dropdown.addOption("monthly", "Ежемесячно");
        dropdown.setValue(this.recurrenceType);
        dropdown.onChange((value) => {
          this.recurrenceType = value as "none" | "daily" | "weekly" | "monthly";
          this.updateRecurrenceSettings();
        });
      });

    this.recurrenceIntervalSetting = new Setting(contentEl)
      .setName("Интервал")
      .addText((text) => {
        text
          .setPlaceholder("1")
          .setValue(String(this.recurrenceInterval))
          .onChange((value) => {
            this.recurrenceInterval = Math.max(1, parseInt(value) || 1);
          });
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.style.maxWidth = "80px";
      });

    this.recurrenceDaysSetting = new Setting(contentEl)
      .setName("Дни недели");

    const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    const daysContainer = this.recurrenceDaysSetting.settingEl.createDiv({
      cls: "task-tracker-recurrence-days",
    });
    for (let i = 0; i < 7; i++) {
      const dayBtn = daysContainer.createEl("button", {
        text: dayNames[i],
        cls: "task-tracker-recurrence-day-btn",
      });
      if (this.recurrenceDaysOfWeek.includes(i)) {
        dayBtn.addClass("active");
      }
      dayBtn.addEventListener("click", () => {
        const idx = this.recurrenceDaysOfWeek.indexOf(i);
        if (idx >= 0) {
          this.recurrenceDaysOfWeek.splice(idx, 1);
          dayBtn.removeClass("active");
        } else {
          this.recurrenceDaysOfWeek.push(i);
          this.recurrenceDaysOfWeek.sort();
          dayBtn.addClass("active");
        }
      });
    }

    this.updateRecurrenceSettings();

    // Note task
    new Setting(contentEl)
      .setName("Создать как заметку")
      .setDesc("Создать .md файл с названием задачи")
      .addToggle((toggle) => {
        toggle.setValue(this.isNoteTask);
        toggle.onChange((value) => {
          this.isNoteTask = value;
          this.notePathSetting.settingEl.style.display = value ? "" : "none";
          if (value && !this.notePathInput) {
            this.updateNotePathPreview();
          }
        });
      });

    const notePathSetting = new Setting(contentEl)
      .setName("Путь к заметке")
      .setDesc("Путь будет создан автоматически, можно отредактировать")
      .addText((text) =>
        text
          .setPlaceholder("Папка/Название.md")
          .setValue(this.notePathInput)
          .onChange((value) => {
            this.notePathInput = value;
          })
      );
    this.notePathSetting = notePathSetting;

    if (!this.isNoteTask) {
      notePathSetting.settingEl.style.display = "none";
    }

    const buttonsEl = contentEl.createDiv("task-tracker-modal-buttons");

    const cancelBtn = buttonsEl.createEl("button", { text: "Отмена" });
    cancelBtn.addEventListener("click", () => this.close());

    const submitBtn = buttonsEl.createEl("button", {
      text: this.task ? "Сохранить" : "Создать",
      cls: "mod-cta",
    });
    submitBtn.addEventListener("click", () => this.handleSubmit());
  }

  private notePathSetting: Setting;
  private recurrenceIntervalSetting: Setting;
  private recurrenceDaysSetting: Setting;

  private updateRecurrenceSettings(): void {
    const showInterval = this.recurrenceType === "monthly";
    const showDays = this.recurrenceType === "weekly";

    this.recurrenceIntervalSetting.settingEl.style.display = showInterval ? "" : "none";
    this.recurrenceDaysSetting.settingEl.style.display = showDays ? "" : "none";
  }

  private updateNotePathPreview(): void {
    const title = this.titleInput.trim();
    if (!title) return;

    const project = get(projects).find((p) => p.id === this.projectId);
    const folder = project?.folder || "";
    const filename = title.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_") + ".md";
    this.notePathInput = folder ? `${folder}/${filename}` : filename;

    if (this.notePathSetting) {
      const input = this.notePathSetting.settingEl.querySelector("input");
      if (input) {
        input.value = this.notePathInput;
      }
    }
  }

  private handleSubmit(): void {
    if (!this.titleInput.trim()) {
      return;
    }

    let finalDateUID = this.dateUID;
    if (!finalDateUID && this.dateValue) {
      const moment = window.moment(this.dateValue, "YYYY-MM-DD", true);
      if (moment.isValid()) {
        finalDateUID = getDateUID(moment, "day");
      }
    }
    if (!finalDateUID) {
      finalDateUID = getDateUID(window.moment(), "day");
    }

    let recurrence: RecurrenceConfig | undefined;
    if (this.recurrenceType !== "none") {
      recurrence = {
        type: this.recurrenceType as "daily" | "weekly" | "monthly",
        interval: this.recurrenceInterval,
      };
      if (this.recurrenceType === "weekly" && this.recurrenceDaysOfWeek.length > 0) {
        recurrence.daysOfWeek = [...this.recurrenceDaysOfWeek];
      }
    }

    this.onSubmit({
      title: this.titleInput.trim(),
      projectId: this.projectId,
      dateUID: finalDateUID,
      priority: this.priority,
      isNoteTask: this.isNoteTask,
      notePath: this.isNoteTask ? this.notePathInput || null : null,
      recurrence,
      estimatedTime: (parseInt(this.estimatedTimeHours) || 0) * 60 + (parseInt(this.estimatedTimeMinutes) || 0) || undefined,
      scheduledTime: this.scheduledTime || undefined,
    });

    this.close();
  }

  private extractDateValue(dateUID: string): string {
    if (!dateUID) return "";
    const match = dateUID.match(/^day-(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
