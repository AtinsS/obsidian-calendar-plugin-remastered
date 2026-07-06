import { App, Modal, Setting } from "obsidian";

import type { IHabit } from "./types";

const DEFAULT_HABIT_COLORS = [
  "#ff6b6b", "#ffa502", "#ffd93d", "#6bcb77",
  "#4d96ff", "#9b59b6", "#e91e63", "#00b894",
  "#fd79a8", "#636e72",
];

export class HabitModal extends Modal {
  private habit: IHabit | null;
  private onSubmit: (habit: Partial<IHabit>) => void;

  private titleInput = "";
  private iconInput = "";
  private colorInput = DEFAULT_HABIT_COLORS[0];
  private frequencyInput: "daily" | "weekly" | "custom" = "daily";
  private customDaysInput: number[] = [];

  constructor(
    app: App,
    onSubmit: (habit: Partial<IHabit>) => void,
    habit?: IHabit
  ) {
    super(app);
    this.onSubmit = onSubmit;
    this.habit = habit || null;

    if (this.habit) {
      this.titleInput = this.habit.title;
      this.iconInput = this.habit.icon;
      this.colorInput = this.habit.color;
      this.frequencyInput = this.habit.frequency;
      this.customDaysInput = this.habit.customDays || [];
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("task-tracker-modal");

    contentEl.createEl("h2", {
      text: this.habit ? "Редактировать привычку" : "Новая привычка",
    });

    new Setting(contentEl)
      .setName("Название")
      .addText((text) =>
        text
          .setPlaceholder("Название привычки")
          .setValue(this.titleInput)
          .onChange((value) => {
            this.titleInput = value;
          })
      );

    new Setting(contentEl)
      .setName("Иконка")
      .setDesc("Эмодзи или символ")
      .addText((text) =>
        text
          .setPlaceholder("💧")
          .setValue(this.iconInput)
          .onChange((value) => {
            this.iconInput = value;
          })
      );

    // Color picker
    const colorSetting = new Setting(contentEl).setName("Цвет");
    const colorGrid = colorSetting.settingEl.createDiv({
      cls: "task-tracker-color-grid",
    });

    for (const color of DEFAULT_HABIT_COLORS) {
      const swatch = colorGrid.createDiv({
        cls: `task-tracker-color-swatch ${color === this.colorInput ? "active" : ""}`,
      });
      swatch.style.backgroundColor = color;
      swatch.style.setProperty("--swatch-color", color);
      swatch.addEventListener("click", () => {
        this.colorInput = color;
        colorGrid
          .querySelectorAll(".task-tracker-color-swatch")
          .forEach((s) => s.removeClass("active"));
        swatch.addClass("active");
      });
    }

    new Setting(contentEl)
      .setName("Частота")
      .addDropdown((dropdown) => {
        dropdown.addOption("daily", "Ежедневно");
        dropdown.addOption("weekly", "Еженедельно");
        dropdown.addOption("custom", "Произвольно");
        dropdown.setValue(this.frequencyInput);
        dropdown.onChange((value) => {
          this.frequencyInput = value as "daily" | "weekly" | "custom";
          this.updateCustomDaysVisibility();
        });
      });

    // Custom days
    this.customDaysSetting = new Setting(contentEl).setName("Дни недели");
    const dayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    const daysContainer = this.customDaysSetting.settingEl.createDiv({
      cls: "task-tracker-recurrence-days",
    });
    for (let i = 0; i < 7; i++) {
      const dayBtn = daysContainer.createEl("button", {
        text: dayNames[i],
        cls: "task-tracker-recurrence-day-btn",
      });
      if (this.customDaysInput.includes(i)) {
        dayBtn.addClass("active");
      }
      dayBtn.addEventListener("click", () => {
        const idx = this.customDaysInput.indexOf(i);
        if (idx >= 0) {
          this.customDaysInput.splice(idx, 1);
          dayBtn.removeClass("active");
        } else {
          this.customDaysInput.push(i);
          this.customDaysInput.sort();
          dayBtn.addClass("active");
        }
      });
    }

    this.updateCustomDaysVisibility();

    const buttonsEl = contentEl.createDiv("task-tracker-modal-buttons");

    const cancelBtn = buttonsEl.createEl("button", { text: "Отмена" });
    cancelBtn.addEventListener("click", () => this.close());

    const submitBtn = buttonsEl.createEl("button", {
      text: this.habit ? "Сохранить" : "Создать",
      cls: "mod-cta",
    });
    submitBtn.addEventListener("click", () => this.handleSubmit());
  }

  private customDaysSetting: Setting;

  private updateCustomDaysVisibility(): void {
    this.customDaysSetting.settingEl.style.display =
      this.frequencyInput === "custom" ? "" : "none";
  }

  private handleSubmit(): void {
    if (!this.titleInput.trim()) return;

    this.onSubmit({
      title: this.titleInput.trim(),
      icon: this.iconInput || "\u2728",
      color: this.colorInput,
      frequency: this.frequencyInput,
      customDays:
        this.frequencyInput === "custom"
          ? [...this.customDaysInput]
          : undefined,
      targetCount: 1,
      archived: false,
    });

    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
