import { App, Modal, Setting } from "obsidian";
import { get } from "svelte/store";
import { getDateUID } from "obsidian-daily-notes-interface";

import type { ITask, RecurrenceConfig } from "./types";
import { projects, selectedDate } from "./stores";
import { settings } from "../ui/stores";
import { FolderSuggestModal } from "../modals/FolderSuggestModal";
import { FileSuggestModal } from "../modals/FileSuggestModal";

export class TaskModal extends Modal {
  private task: ITask | null;
  private onSubmit: (task: Partial<ITask> & { isNoteTask?: boolean; notePath?: string }) => void;

  private titleInput = "";
  private projectId: string | null = null;
  private dateUID = "";
  private dateValue = "";
  private priority: "low" | "medium" | "high" = "medium";
  private notePathInput = ""; // привязанная существующая заметка
  private isNoteTask = false; // создать новую заметку
  private newNotePathInput = ""; // путь для новой заметки
  private recurrenceType: "none" | "daily" | "weekly" | "monthly" = "none";
  private recurrenceInterval = 1;
  private recurrenceDaysOfWeek: number[] = [];
  private recurrenceUntilDateUID = "";
  private recurrenceUntilDateValue = "";
  private estimatedTimeHours = "";
  private estimatedTimeMinutes = "";
  private scheduledTime = "";
  private isWorkTask = false;
  private paymentType: "hour" | "day" = "hour";
  private rate = "";
  private overtimeStart = "";
  private overtimeMultiplier = "";
  private deadlineDateUID = "";
  private deadlineDateValue = "";
  private deadlineTime = "";

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
      this.isNoteTask = !!this.task.isNoteTask;
      this.notePathInput = this.task.notePath || "";
      if (this.task.isNoteTask && this.task.notePath) {
        this.newNotePathInput = this.task.notePath;
      }
      if (this.task.recurrence) {
        this.recurrenceType = this.task.recurrence.type;
        this.recurrenceInterval = this.task.recurrence.interval || 1;
        this.recurrenceDaysOfWeek = this.task.recurrence.daysOfWeek || [];
        if (this.task.recurrence.until) {
          this.recurrenceUntilDateUID = this.task.recurrence.until;
          this.recurrenceUntilDateValue = this.extractDateValue(this.task.recurrence.until);
        }
      }
      if (this.task.estimatedTime) {
        const totalMin = this.task.estimatedTime;
        this.estimatedTimeHours = String(Math.floor(totalMin / 60));
        this.estimatedTimeMinutes = String(totalMin % 60);
      }
      if (this.task.scheduledTime) {
        this.scheduledTime = this.task.scheduledTime;
      }
      if (this.task.isWorkTask) {
        this.isWorkTask = this.task.isWorkTask;
        this.paymentType = this.task.paymentType || "hour";
        this.rate = this.task.rate ? String(this.task.rate) : "";
        if (this.task.overtimeStart) {
          this.overtimeStart = String(this.task.overtimeStart);
        }
        if (this.task.overtimeMultiplier) {
          this.overtimeMultiplier = String(this.task.overtimeMultiplier);
        }
      }
      if (this.task.deadline) {
        this.deadlineDateUID = this.task.deadline;
        this.deadlineDateValue = this.extractDateValue(this.task.deadline);
      }
      if (this.task.deadlineTime) {
        this.deadlineTime = this.task.deadlineTime;
      }
    } else {
      this.dateUID = get(selectedDate) || "";
      this.dateValue = this.extractDateValue(this.dateUID);
      const currentSettings = get(settings);
      this.paymentType = currentSettings.defaultPaymentType || "hour";
      this.rate = currentSettings.defaultRate ? String(currentSettings.defaultRate) : "";
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("task-tracker-modal");

    contentEl.createEl("h2", {
      text: this.task ? "Редактировать задачу" : "Новая задача",
    });

    // 1. Название
    new Setting(contentEl)
      .setName("Название")
      .addText((text) =>
        text
          .setPlaceholder("Название задачи")
          .setValue(this.titleInput)
          .onChange((value) => {
            this.titleInput = value;
            if (this.isNoteTask && !this.task) {
              this.updateNewNotePathPreview();
            }
          })
      );

    // 2. Дата
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

    // 3. Проект
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
            this.updateNewNotePathPreview();
          }
        });
      });

    // 4. Приоритет
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

    // 5. Привязать существующую заметку
    this.boundNoteSetting = new Setting(contentEl)
      .setName("Заметка")
      .setDesc("Привязать существующую заметку к задаче")
      .addText((text) =>
        text
          .setPlaceholder("Путь/к/заметке.md")
          .setValue(this.notePathInput)
          .onChange((value) => {
            this.notePathInput = value;
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText("...")
          .setTooltip("Выбрать файл")
          .onClick(() => {
            new FileSuggestModal(this.app, (filePath) => {
              this.notePathInput = filePath;
              const input = this.boundNoteSetting.settingEl.querySelector(
                "input"
              ) as HTMLInputElement | null;
              if (input) input.value = filePath;
            }).open();
          })
      );

    // 6. Создать как заметку
    new Setting(contentEl)
      .setName("Создать как заметку")
      .setDesc("Создать .md файл с названием задачи")
      .addToggle((toggle) => {
        toggle.setValue(this.isNoteTask);
        toggle.onChange((value) => {
          this.isNoteTask = value;
          this.newNotePathSetting.settingEl.style.display = value ? "" : "none";
        });
      });

    this.newNotePathSetting = new Setting(contentEl)
      .setName("Путь к заметке")
      .setDesc("Путь будет создан автоматически, можно отредактировать")
      .addText((text) =>
        text
          .setPlaceholder("Папка/Название.md")
          .setValue(this.newNotePathInput)
          .onChange((value) => {
            this.newNotePathInput = value;
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText("...")
          .setTooltip("Выбрать папку")
          .onClick(() => {
            new FolderSuggestModal(this.app, (folder) => {
              const title = this.titleInput.trim().replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_") || "Название";
              const path = folder ? `${folder}/${title}.md` : `${title}.md`;
              this.newNotePathInput = path;
              const input = this.newNotePathSetting.settingEl.querySelector(
                "input"
              ) as HTMLInputElement | null;
              if (input) input.value = path;
            }).open();
          })
      );

    if (!this.isNoteTask) {
      this.newNotePathSetting.settingEl.style.display = "none";
    }

    // 7. Запланировано на
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

    // 8. Дедлайн
    new Setting(contentEl)
      .setName("Дедлайн")
      .setDesc("Необязательно. Крайний срок выполнения задачи.")
      .addText((text) => {
        text
          .setPlaceholder("ГГГГ-ММ-ДД")
          .setValue(this.deadlineDateValue)
          .onChange((value) => {
            this.deadlineDateValue = value;
            if (value) {
              const m = window.moment(value, "YYYY-MM-DD", true);
              if (m.isValid()) {
                this.deadlineDateUID = getDateUID(m, "day");
              }
            } else {
              this.deadlineDateUID = "";
            }
          });
        text.inputEl.type = "date";
      })
      .addText((text) => {
        text
          .setPlaceholder("Время")
          .setValue(this.deadlineTime)
          .onChange((value) => {
            this.deadlineTime = value;
          });
        text.inputEl.type = "time";
        text.inputEl.style.maxWidth = "120px";
      });

    // 9. Ожидаемое время
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

    // 10. Повторение
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

    this.recurrenceUntilSetting = new Setting(contentEl)
      .setName("Повторять до")
      .setDesc("Необязательно. Дата, до которой повторять задачу (включительно).")
      .addText((text) => {
        text
          .setPlaceholder("ГГГГ-ММ-ДД")
          .setValue(this.recurrenceUntilDateValue)
          .onChange((value) => {
            this.recurrenceUntilDateValue = value;
            if (value) {
              const m = window.moment(value, "YYYY-MM-DD", true);
              if (m.isValid()) {
                this.recurrenceUntilDateUID = getDateUID(m, "day");
              }
            } else {
              this.recurrenceUntilDateUID = "";
            }
          });
        text.inputEl.type = "date";
      });

    // Visual order: Mon-Sun, but moment convention: 0=Sun,1=Mon,...,6=Sat
    const dayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    const dayIndices = [1, 2, 3, 4, 5, 6, 0]; // moment day-of-week indices
    const daysContainer = this.recurrenceDaysSetting.settingEl.createDiv({
      cls: "task-tracker-recurrence-days",
    });
    for (let i = 0; i < 7; i++) {
      const momentIdx = dayIndices[i];
      const dayBtn = daysContainer.createEl("button", {
        text: dayLabels[i],
        cls: "task-tracker-recurrence-day-btn",
      });
      if (this.recurrenceDaysOfWeek.includes(momentIdx)) {
        dayBtn.addClass("active");
      }
      dayBtn.addEventListener("click", () => {
        const idx = this.recurrenceDaysOfWeek.indexOf(momentIdx);
        if (idx >= 0) {
          this.recurrenceDaysOfWeek.splice(idx, 1);
          dayBtn.removeClass("active");
        } else {
          this.recurrenceDaysOfWeek.push(momentIdx);
          this.recurrenceDaysOfWeek.sort();
          dayBtn.addClass("active");
        }
      });
    }

    this.updateRecurrenceSettings();

    // 11. Рабочая задача
    new Setting(contentEl)
      .setName("Рабочая")
      .setDesc("Пометить задачу как рабочую для учёта заработка")
      .addToggle((toggle) => {
        toggle.setValue(this.isWorkTask);
        toggle.onChange((value) => {
          this.isWorkTask = value;
          this.updateWorkTaskSettings();
        });
      });

    this.workTaskTypeSetting = new Setting(contentEl)
      .setName("Тип оплаты")
      .addDropdown((dropdown) => {
        dropdown.addOption("hour", "Оплата в час");
        dropdown.addOption("day", "Оплата в день");
        dropdown.setValue(this.paymentType);
        dropdown.onChange((value) => {
          this.paymentType = value as "hour" | "day";
          this.updateWorkTaskSettings();
        });
      });

    this.workTaskRateSetting = new Setting(contentEl)
      .setName("Ставка")
      .setDesc("Стоимость работы (час или день)")
      .addText((text) => {
        text
          .setPlaceholder("0")
          .setValue(this.rate)
          .onChange((value) => {
            this.rate = value.replace(/[^0-9.,]/g, "");
          });
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.inputEl.style.maxWidth = "120px";
      });

    this.workTaskOvertimeStartSetting = new Setting(contentEl)
      .setName("Переработки с")
      .setDesc("С какого часа начислять переработки (например, 8)")
      .addText((text) => {
        text
          .setPlaceholder("ч")
          .setValue(this.overtimeStart)
          .onChange((value) => {
            this.overtimeStart = value.replace(/[^0-9]/g, "");
          });
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.max = "24";
        text.inputEl.style.maxWidth = "60px";
        text.inputEl.placeholder = "ч";
      });

    this.workTaskOvertimeMultiplierSetting = new Setting(contentEl)
      .setName("Множитель переработок")
      .setDesc("Во сколько раз увеличивать ставку (например, 1.5)")
      .addText((text) => {
        text
          .setPlaceholder("1.5")
          .setValue(this.overtimeMultiplier)
          .onChange((value) => {
            this.overtimeMultiplier = value.replace(/[^0-9.,]/g, "");
          });
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.max = "10";
        text.inputEl.step = "0.1";
        text.inputEl.style.maxWidth = "80px";
      });

    this.updateWorkTaskSettings();

    const buttonsEl = contentEl.createDiv("task-tracker-modal-buttons");

    const cancelBtn = buttonsEl.createEl("button", { text: "Отмена" });
    cancelBtn.addEventListener("click", () => this.close());

    const submitBtn = buttonsEl.createEl("button", {
      text: this.task ? "Сохранить" : "Создать",
      cls: "mod-cta",
    });
    submitBtn.addEventListener("click", () => this.handleSubmit());
  }

  private boundNoteSetting: Setting;
  private newNotePathSetting: Setting;
  private recurrenceIntervalSetting: Setting;
  private recurrenceDaysSetting: Setting;
  private recurrenceUntilSetting: Setting;
  private workTaskTypeSetting: Setting;
  private workTaskRateSetting: Setting;
  private workTaskOvertimeStartSetting: Setting;
  private workTaskOvertimeMultiplierSetting: Setting;

  private updateRecurrenceSettings(): void {
    const showInterval = this.recurrenceType === "monthly";
    const showDays = this.recurrenceType === "weekly";
    const showUntil = this.recurrenceType !== "none";

    this.recurrenceIntervalSetting.settingEl.style.display = showInterval ? "" : "none";
    this.recurrenceDaysSetting.settingEl.style.display = showDays ? "" : "none";
    this.recurrenceUntilSetting.settingEl.style.display = showUntil ? "" : "none";
  }

  private updateWorkTaskSettings(): void {
    const show = this.isWorkTask;
    const showOvertime = show && this.paymentType === "hour";
    this.workTaskTypeSetting.settingEl.style.display = show ? "" : "none";
    this.workTaskRateSetting.settingEl.style.display = show ? "" : "none";
    this.workTaskOvertimeStartSetting.settingEl.style.display = showOvertime ? "" : "none";
    this.workTaskOvertimeMultiplierSetting.settingEl.style.display = showOvertime ? "" : "none";
  }

  private updateNewNotePathPreview(): void {
    const title = this.titleInput.trim();
    if (!title) return;

    const project = get(projects).find((p) => p.id === this.projectId);
    const folder = project?.folder || "";
    const filename = title.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_") + ".md";
    this.newNotePathInput = folder ? `${folder}/${filename}` : filename;

    if (this.newNotePathSetting) {
      const input = this.newNotePathSetting.settingEl.querySelector("input");
      if (input) {
        input.value = this.newNotePathInput;
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
      if (this.recurrenceUntilDateUID) {
        recurrence.until = this.recurrenceUntilDateUID;
      }
    }

    this.onSubmit({
      title: this.titleInput.trim(),
      projectId: this.projectId,
      dateUID: finalDateUID,
      priority: this.priority,
      isNoteTask: this.isNoteTask,
      notePath: this.isNoteTask
        ? this.newNotePathInput || null
        : (this.notePathInput || null),
      recurrence,
      estimatedTime: (parseInt(this.estimatedTimeHours) || 0) * 60 + (parseInt(this.estimatedTimeMinutes) || 0) || undefined,
      scheduledTime: this.scheduledTime || undefined,
      isWorkTask: this.isWorkTask || undefined,
      paymentType: this.isWorkTask ? this.paymentType : undefined,
      rate: this.isWorkTask && this.rate ? parseFloat(this.rate.replace(",", ".")) : undefined,
      overtimeStart: this.isWorkTask && this.paymentType === "hour" && this.overtimeStart ? parseInt(this.overtimeStart) : undefined,
      overtimeMultiplier: this.isWorkTask && this.paymentType === "hour" && this.overtimeMultiplier ? parseFloat(this.overtimeMultiplier.replace(",", ".")) : undefined,
      deadline: this.deadlineDateUID || undefined,
      deadlineTime: this.deadlineTime || undefined,
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
