import { App, Modal, TFile, Notice } from "obsidian";
import type { Person, PersonContacts } from "./types";
import { buildPersonNote } from "./personNote";

/**
 * Модалка для добавления / редактирования карточки контакта.
 * После сохранения создаёт .md файл с YAML-фронтматтером и визуальным телом.
 */
export class PersonModal extends Modal {
  private person: Person | null;
  private onSubmit: (person: Person, filePath: string) => void;
  private folderPath: string;
  private avatarFolderPath: string;

  // Поля формы
  private nameInput = "";
  private birthdayInput = "";
  private contextInput = "";
  private noteInput = "";
  private lastContactInput = "";
  private skillsInput = "";
  private telegramInput = "";
  private phoneInput = "";
  private connectionsInput = "";
  private colorInput = "";
  private avatarInput = "";

  // Кастомные контакты: массив пар [ключ, значение]
  private customContacts: Array<{ key: string; value: string }> = [];
  private customContactsContainer: HTMLDivElement | null = null;

  constructor(
    app: App,
    folderPath: string,
    onSubmit: (person: Person, filePath: string) => void,
    existingPerson?: Person,
    avatarFolderPath?: string
  ) {
    super(app);
    this.folderPath = folderPath;
    this.onSubmit = onSubmit;
    this.person = existingPerson || null;
    this.avatarFolderPath = avatarFolderPath || "person-avatars";

    if (this.person) {
      this.nameInput = this.person.name;
      this.birthdayInput = this.person.birthday || "";
      this.contextInput = this.person.context || "";
      this.noteInput = this.person.note || "";
      this.lastContactInput = this.person.last_contact || "";
      this.skillsInput = (this.person.skills || []).join(", ");
      this.telegramInput = this.person.contacts?.telegram || "";
      this.phoneInput = this.person.contacts?.phone || "";
      this.connectionsInput = (this.person.connections || []).join(", ");
      this.colorInput = this.person.color || "";
      this.avatarInput = this.person.avatar || "";

      // Загружаем кастомные контакты (всё кроме telegram, phone)
      if (this.person.contacts) {
        const skipKeys = new Set(["telegram", "phone"]);
        for (const [key, value] of Object.entries(this.person.contacts)) {
          if (!skipKeys.has(key) && value) {
            this.customContacts.push({ key, value });
          }
        }
      }
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("person-modal");

    // Заголовок
    contentEl.createEl("h2", {
      text: this.person ? `Редактировать: ${this.person.name}` : "Новая персона",
      cls: "person-modal-title",
    });

    // ═══ Имя ═══
    this.addTextField(contentEl, "Имя *", "Иван Петров", "name");

    // ═══ Визуал узла ═══
    const visualHeader = contentEl.createDiv({ cls: "person-section-header" });
    visualHeader.createEl("span", { text: "Визуал узла в графе" });

    // Цвет узла
    const colorWrap = contentEl.createDiv({ cls: "person-field" });
    colorWrap.createEl("label", { text: "Цвет узла", cls: "person-label" });
    const colorRow = colorWrap.createDiv({ cls: "person-color-row" });
    const colorSwatch = colorRow.createEl("input", {
      type: "color",
      cls: "person-color-swatch",
      value: this.colorInput || "#5b8def",
    });
    colorSwatch.addEventListener("input", () => {
      this.colorInput = colorSwatch.value;
      colorHexInput.value = colorSwatch.value;
    });
    const colorHexInput = colorRow.createEl("input", {
      type: "text",
      cls: "person-input person-color-hex",
      placeholder: "#5b8def",
      value: this.colorInput,
    });
    colorHexInput.addEventListener("input", () => {
      this.colorInput = colorHexInput.value;
      if (/^#[0-9a-fA-F]{6}$/.test(colorHexInput.value)) {
        colorSwatch.value = colorHexInput.value;
      }
    });
    const clearColorBtn = colorRow.createEl("button", { text: "✕", cls: "person-btn person-color-clear" });
    clearColorBtn.addEventListener("click", () => {
      this.colorInput = "";
      colorHexInput.value = "";
      colorSwatch.value = "#5b8def";
    });

    // Аватар
    const avatarWrap = contentEl.createDiv({ cls: "person-field" });
    avatarWrap.createEl("label", { text: "Аватар", cls: "person-label" });

    // Строка с вводом и кнопкой выбора файла
    const avatarRow = avatarWrap.createDiv({ cls: "person-color-row" });
    const avatarInput = avatarRow.createEl("input", {
      type: "text",
      cls: "person-input",
      placeholder: "Путь в vault или URL",
      value: this.avatarInput,
    });
    avatarInput.addEventListener("input", () => {
      this.avatarInput = avatarInput.value;
      this.updateAvatarPreview(avatarWrap);
    });

    // Скрытый file input
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";
    avatarWrap.appendChild(fileInput);

    // Кнопка «Выбрать файл»
    const pickFileBtn = avatarRow.createEl("button", {
      text: "📂",
      cls: "person-btn person-color-clear",
    });
    pickFileBtn.title = "Выбрать файл с компьютера";
    pickFileBtn.addEventListener("click", () => fileInput.click());

    // Кнопка очистки
    const clearAvatarBtn = avatarRow.createEl("button", {
      text: "✕",
      cls: "person-btn person-color-clear",
    });
    clearAvatarBtn.addEventListener("click", () => {
      this.avatarInput = "";
      avatarInput.value = "";
      this.updateAvatarPreview(avatarWrap);
    });

    // Обработка выбора файла
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      try {
        // Читаем файл как ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();

        // Формируем имя файла: person_id + оригинальное расширение
        const ext = file.name.split(".").pop() || "jpg";
        const safeName = (this.person?.id || this.nameInput || "avatar")
          .toLowerCase()
          .replace(/[^a-z0-9а-яё]+/gi, "-")
          .replace(/^-|-$/g, "");
        const fileName = `${safeName}.${ext}`;
        const filePath = `${this.avatarFolderPath}/${fileName}`;

        // Создаём папку если нет
        const folder = this.app.vault.getAbstractFileByPath(this.avatarFolderPath);
        if (!folder) {
          await this.app.vault.createFolder(this.avatarFolderPath);
        }

        // Записываем файл (перезаписываем если уже есть)
        const existing = this.app.vault.getAbstractFileByPath(filePath);
        if (existing instanceof TFile) {
          await this.app.vault.modifyBinary(existing, arrayBuffer);
        } else {
          await this.app.vault.createBinary(filePath, arrayBuffer);
        }

        this.avatarInput = filePath;
        avatarInput.value = filePath;
        this.updateAvatarPreview(avatarWrap);
      } catch (e) {
        new Notice(`Ошибка загрузки аватара: ${e}`);
      }
    });

    // Превью аватара
    this.updateAvatarPreview(avatarWrap);

    // ═══ День рождения ═══
    const bdWrap = contentEl.createDiv({ cls: "person-field" });
    bdWrap.createEl("label", { text: "День рождения", cls: "person-label" });
    const bdInput = bdWrap.createEl("input", {
      type: "date",
      cls: "person-input",
      value: this.birthdayInput,
    });
    bdInput.addEventListener("change", () => { this.birthdayInput = bdInput.value; });

    // ═══ Последний контакт ═══
    const lcWrap = contentEl.createDiv({ cls: "person-field" });
    lcWrap.createEl("label", { text: "Последний контакт", cls: "person-label" });
    const lcInput = lcWrap.createEl("input", {
      type: "date",
      cls: "person-input",
      value: this.lastContactInput,
    });
    lcInput.addEventListener("change", () => { this.lastContactInput = lcInput.value; });

    // ═══ Контекст ═══
    this.addTextField(contentEl, "Контекст", "Где познакомились, общие темы...", "context");

    // ═══ Заметка ═══
    this.addTextField(contentEl, "Заметка / напоминание", "Обещал прислать ссылку...", "note");

    // ═══ Навыки ═══
    this.addTextField(contentEl, "Навыки (через запятую)", "React, TypeScript, Node.js", "skills");

    // ═══ Контакты ═══
    const contactsHeader = contentEl.createDiv({ cls: "person-section-header" });
    contactsHeader.createEl("span", { text: "Контакты" });

    this.addTextField(contentEl, "Telegram", "@ivan_dev", "telegram");
    this.addTextField(contentEl, "Телефон", "+7 (999) 123-45-67", "phone");

    // Кастомные контакты
    this.customContactsContainer = contentEl.createDiv({ cls: "person-custom-contacts" });
    this.renderCustomContacts();

    // Кнопка добавить поле
    const addFieldBtn = contentEl.createEl("button", {
      text: "+ Добавить поле",
      cls: "person-btn person-add-field",
    });
    addFieldBtn.addEventListener("click", () => {
      this.customContacts.push({ key: "", value: "" });
      this.renderCustomContacts();
    });

    // ═══ Связи ═══
    this.addTextField(contentEl, "Связи (имена через запятую)", "Анна Смирнова, Борис Козлов", "connections");

    // ═══ Footer ═══
    const footer = contentEl.createDiv({ cls: "person-footer" });
    const cancelBtn = footer.createEl("button", { text: "Отмена", cls: "person-btn person-cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const submitBtn = footer.createEl("button", {
      text: this.person ? "Сохранить" : "Создать карточку контакта",
      cls: "person-btn person-submit",
    });
    submitBtn.addEventListener("click", () => this.handleSubmit());
  }

  private renderCustomContacts(): void {
    if (!this.customContactsContainer) return;
    this.customContactsContainer.empty();

    this.customContacts.forEach((contact, index) => {
      const row = this.customContactsContainer!.createDiv({ cls: "person-custom-row" });

      const keyInput = row.createEl("input", {
        type: "text",
        cls: "person-input person-custom-key",
        placeholder: "Поле",
        value: contact.key,
      });
      keyInput.addEventListener("input", () => {
        this.customContacts[index].key = keyInput.value;
      });

      const valInput = row.createEl("input", {
        type: "text",
        cls: "person-input person-custom-value",
        placeholder: "Значение",
        value: contact.value,
      });
      valInput.addEventListener("input", () => {
        this.customContacts[index].value = valInput.value;
      });

      const removeBtn = row.createEl("button", { text: "✕", cls: "person-custom-remove" });
      removeBtn.addEventListener("click", () => {
        this.customContacts.splice(index, 1);
        this.renderCustomContacts();
      });
    });
  }

  private updateAvatarPreview(container: HTMLElement): void {
    // Удаляем старое превью
    const oldPreview = container.querySelector(".person-avatar-preview");
    if (oldPreview) oldPreview.remove();

    if (!this.avatarInput) return;

    const preview = container.createDiv({ cls: "person-avatar-preview" });
    const img = preview.createEl("img");

    // Если путь в vault — конвертируем в base64 через Obsidian API
    if (!this.avatarInput.startsWith("http")) {
      const file = this.app.vault.getAbstractFileByPath(this.avatarInput);
      if (file instanceof TFile) {
        this.app.vault.readBinary(file).then((buffer) => {
          const blob = new Blob([buffer]);
          const reader = new FileReader();
          reader.onload = () => {
            img.src = reader.result as string;
          };
          reader.readAsDataURL(blob);
        }).catch(() => { preview.remove(); });
      } else {
        preview.remove();
        return;
      }
    } else {
      img.src = this.avatarInput;
    }

    img.alt = "Превью";
    img.onerror = () => { preview.remove(); };
  }

  private addTextField(
    container: HTMLElement,
    label: string,
    placeholder: string,
    field: string
  ): void {
    const wrap = container.createDiv({ cls: "person-field" });
    wrap.createEl("label", { text: label, cls: "person-label" });
    const input = wrap.createEl("input", {
      type: "text",
      cls: "person-input",
      placeholder,
      value: (this as Record<string, unknown>)[field + "Input"] as string || "",
    });
    input.addEventListener("input", () => {
      (this as Record<string, unknown>)[field + "Input"] = input.value;
    });
  }

  private async handleSubmit(): Promise<void> {
    const name = this.nameInput.trim();
    if (!name) {
      new Notice("Введите имя персоны");
      return;
    }

    // Собираем данные
    const person: Person = {
      id: this.person?.id || name.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, ""),
      path: this.person?.path || `${this.folderPath}/${name}.md`,
      name,
    };

    if (this.birthdayInput) person.birthday = this.birthdayInput;
    if (this.contextInput.trim()) person.context = this.contextInput.trim();
    if (this.noteInput.trim()) person.note = this.noteInput.trim();
    if (this.lastContactInput) person.last_contact = this.lastContactInput;
    if (this.colorInput.trim()) person.color = this.colorInput.trim();
    if (this.avatarInput.trim()) person.avatar = this.avatarInput.trim();

    const skills = this.skillsInput.split(",").map(s => s.trim()).filter(Boolean);
    if (skills.length > 0) person.skills = skills;

    // Собираем контакты
    const contacts: PersonContacts = {};
    if (this.telegramInput.trim()) contacts.telegram = this.telegramInput.trim();
    if (this.phoneInput.trim()) contacts.phone = this.phoneInput.trim();

    // Добавляем кастомные контакты
    for (const c of this.customContacts) {
      if (c.key.trim() && c.value.trim()) {
        contacts[c.key.trim().toLowerCase()] = c.value.trim();
      }
    }
    if (Object.keys(contacts).length > 0) person.contacts = contacts;

    const connections = this.connectionsInput.split(",").map(s => s.trim()).filter(Boolean);
    if (connections.length > 0) person.connections = connections;

    // Создаём/обновляем папку и файл
    try {
      const folderParts = this.folderPath.split("/");
      let currentPath = "";
      for (const part of folderParts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const existing = this.app.vault.getAbstractFileByPath(currentPath);
        if (!existing) {
          await this.app.vault.createFolder(currentPath);
        }
      }

      const filePath = person.path;
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);

      if (existingFile instanceof TFile) {
        const content = buildPersonNote(person);
        await this.app.vault.modify(existingFile, content);
      } else {
        const content = buildPersonNote(person);
        const file = await this.app.vault.create(filePath, content);
        person.path = file.path;
      }

      this.onSubmit(person, filePath);
      this.close();
    } catch (e) {
      new Notice(`Ошибка: ${e}`);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
