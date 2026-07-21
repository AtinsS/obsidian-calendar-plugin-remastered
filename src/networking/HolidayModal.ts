import { App, Modal, Notice } from "obsidian";
import type { Holiday } from "./holidays";
import { generateHolidayId } from "./holidays";

/**
 * Модалка для добавления / редактирования праздника.
 */
export class HolidayModal extends Modal {
  private holiday: Holiday | null;
  private onSubmit: (holiday: Holiday) => void;

  private nameInput = "";
  private dateInput = "";
  private colorInput = "#e74c3c";

  private static PRESET_COLORS = [
    { label: "Красный", value: "#e74c3c" },
    { label: "Зелёный", value: "#27ae60" },
    { label: "Синий", value: "#2980b9" },
    { label: "Оранжевый", value: "#f39c12" },
    { label: "Фиолетовый", value: "#8e44ad" },
    { label: "Розовый", value: "#e91e63" },
  ];

  constructor(
    app: App,
    onSubmit: (holiday: Holiday) => void,
    existingHoliday?: Holiday
  ) {
    super(app);
    this.onSubmit = onSubmit;
    this.holiday = existingHoliday || null;

    if (this.holiday) {
      this.nameInput = this.holiday.name;
      this.dateInput = this.holiday.date;
      this.colorInput = this.holiday.color || "#e74c3c";
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("person-modal");
    contentEl.addClass("holiday-modal");

    contentEl.createEl("h2", {
      text: this.holiday ? `Редактировать: ${this.holiday.name}` : "Новый праздник",
      cls: "person-modal-title",
    });

    // Название
    const nameWrap = contentEl.createDiv({ cls: "person-field" });
    nameWrap.createEl("label", { text: "Название *", cls: "person-label" });
    const nameEl = nameWrap.createEl("input", {
      type: "text",
      cls: "person-input",
      placeholder: "Новый год, День рождения...",
      value: this.nameInput,
    });
    nameEl.addEventListener("input", () => { this.nameInput = nameEl.value; });

    // Дата (MM-DD)
    const dateWrap = contentEl.createDiv({ cls: "person-field" });
    dateWrap.createEl("label", { text: "Дата (ДД.ММ) *", cls: "person-label" });
    const dateEl = dateWrap.createEl("input", {
      type: "text",
      cls: "person-input",
      placeholder: "01-01, 12-25...",
      value: this.dateInput,
    });
    dateEl.addEventListener("input", () => { this.dateInput = dateEl.value; });

    // Цвет
    const colorWrap = contentEl.createDiv({ cls: "person-field" });
    colorWrap.createEl("label", { text: "Цвет", cls: "person-label" });
    const colorRow = colorWrap.createDiv({ cls: "holiday-colors" });
    for (const preset of HolidayModal.PRESET_COLORS) {
      const swatch = colorRow.createEl("button", {
        cls: "holiday-color-swatch" + (this.colorInput === preset.value ? " active" : ""),
      });
      swatch.style.backgroundColor = preset.value;
      swatch.title = preset.label;
      swatch.addEventListener("click", () => {
        this.colorInput = preset.value;
        colorRow.querySelectorAll(".holiday-color-swatch").forEach(s => s.removeClass("active"));
        swatch.addClass("active");
      });
    }

    // Footer
    const footer = contentEl.createDiv({ cls: "person-footer" });
    const cancelBtn = footer.createEl("button", { text: "Отмена", cls: "person-btn person-cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const submitBtn = footer.createEl("button", {
      text: this.holiday ? "Сохранить" : "Добавить праздник",
      cls: "person-btn person-submit",
    });
    submitBtn.addEventListener("click", () => this.handleSubmit());
  }

  private handleSubmit(): void {
    const name = this.nameInput.trim();
    if (!name) {
      new Notice("Введите название праздника");
      return;
    }

    const date = this.dateInput.trim();
    if (!/^\d{2}-\d{2}$/.test(date)) {
      new Notice("Формат даты: ММ-ДД (напр. 01-01)");
      return;
    }

    const holiday: Holiday = {
      id: this.holiday?.id || generateHolidayId(),
      name,
      date,
      color: this.colorInput,
    };

    this.onSubmit(holiday);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
