import { App, Modal, Setting } from "obsidian";
import { get } from "svelte/store";

import type { IProject } from "./types";
import { DEFAULT_PROJECT_COLORS } from "./types";
import {
  projects,
  addProject,
  updateProject,
  removeProject,
} from "./stores";

export class ProjectModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("task-tracker-project-modal");

    contentEl.createEl("h2", { text: "Управление проектами" });

    const newProjectSection = contentEl.createDiv(
      "task-tracker-new-project"
    );
    newProjectSection.createEl("h3", { text: "Новый проект" });

    let newName = "";
    let newColor = DEFAULT_PROJECT_COLORS[0];
    let newIcon = "";

    new Setting(newProjectSection)
      .setName("Название")
      .addText((text) =>
        text.setPlaceholder("Название проекта").onChange((value) => {
          newName = value;
        })
      );

    const colorPickerEl = newProjectSection.createDiv(
      "task-tracker-color-picker"
    );
    colorPickerEl.createEl("label", { text: "Цвет:" });

    const colorGrid = colorPickerEl.createDiv("task-tracker-color-grid");
    DEFAULT_PROJECT_COLORS.forEach((color) => {
      const swatch = colorGrid.createDiv("task-tracker-color-swatch");
      swatch.style.backgroundColor = color;
      if (color === newColor) {
        swatch.addClass("active");
      }
      swatch.addEventListener("click", () => {
        colorGrid
          .querySelectorAll(".task-tracker-color-swatch")
          .forEach((s) => s.removeClass("active"));
        swatch.addClass("active");
        newColor = color;
      });
    });

    new Setting(newProjectSection)
      .setName("Иконка")
      .addText((text) =>
        text.setPlaceholder("Emoji иконка").onChange((value) => {
          newIcon = value;
        })
      );

    const createBtn = newProjectSection.createEl("button", {
      text: "Создать проект",
      cls: "mod-cta",
    });
    createBtn.addEventListener("click", () => {
      if (!newName.trim()) return;
      addProject({
        name: newName.trim(),
        color: newColor,
        icon: newIcon || "📁",
        folder: null,
        archived: false,
        sortOrder: get(projects).length,
      });
      this.rerender();
    });

    const existingSection = contentEl.createDiv(
      "task-tracker-existing-projects"
    );
    existingSection.createEl("h3", { text: "Существующие проекты" });

    this.renderProjectList(existingSection);
  }

  private renderProjectList(container: HTMLElement): void {
    container.empty();
    const allProjects = get(projects);

    if (allProjects.length === 0) {
      container.createEl("p", {
        text: "Проектов пока нет. Создайте один выше.",
        cls: "setting-item-description",
      });
      return;
    }

    allProjects.forEach((project) => {
      const projectEl = container.createDiv("task-tracker-project-item");

      const infoEl = projectEl.createDiv("task-tracker-project-info");
      const dot = infoEl.createSpan("task-tracker-project-dot");
      dot.style.backgroundColor = project.color;
      infoEl.createSpan("task-tracker-project-icon").textContent =
        project.icon;
      infoEl.createSpan("task-tracker-project-name").textContent =
        project.name;

      const actionsEl = projectEl.createDiv("task-tracker-project-actions");

      const editBtn = actionsEl.createEl("button", {
        text: "Ред.",
        cls: "task-tracker-btn-small",
      });
      editBtn.addEventListener("click", () => {
        this.openEditProject(project);
      });

      const deleteBtn = actionsEl.createEl("button", {
        text: "Удалить",
        cls: "task-tracker-btn-small mod-warning",
      });
      deleteBtn.addEventListener("click", () => {
        if (
          confirm(
            `Удалить проект «${project.name}»? Задачи сохранят данные, но потеряют привязку к проекту.`
          )
        ) {
          removeProject(project.id);
          this.rerender();
        }
      });
    });
  }

  private openEditProject(project: IProject): void {
    const modal = new EditProjectModal(this.app, project, () =>
      this.rerender()
    );
    modal.open();
  }

  private rerender(): void {
    this.onClose();
    this.onOpen();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class EditProjectModal extends Modal {
  private project: IProject;
  private onSaved: () => void;

  constructor(app: App, project: IProject, onSaved: () => void) {
    super(app);
    this.project = project;
    this.onSaved = onSaved;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Редактировать проект" });

    let name = this.project.name;
    let color = this.project.color;
    let icon = this.project.icon;

    new Setting(contentEl)
      .setName("Название")
      .addText((text) =>
        text.setValue(name).onChange((value) => {
          name = value;
        })
      );

    const colorPickerEl = contentEl.createDiv(
      "task-tracker-color-picker"
    );
    colorPickerEl.createEl("label", { text: "Цвет:" });

    const colorGrid = colorPickerEl.createDiv("task-tracker-color-grid");
    DEFAULT_PROJECT_COLORS.forEach((c) => {
      const swatch = colorGrid.createDiv("task-tracker-color-swatch");
      swatch.style.backgroundColor = c;
      if (c === color) {
        swatch.addClass("active");
      }
      swatch.addEventListener("click", () => {
        colorGrid
          .querySelectorAll(".task-tracker-color-swatch")
          .forEach((s) => s.removeClass("active"));
        swatch.addClass("active");
        color = c;
      });
    });

    new Setting(contentEl)
      .setName("Иконка")
      .addText((text) =>
        text.setValue(icon).onChange((value) => {
          icon = value;
        })
      );

    const buttonsEl = contentEl.createDiv("task-tracker-modal-buttons");

    const cancelBtn = buttonsEl.createEl("button", { text: "Отмена" });
    cancelBtn.addEventListener("click", () => this.close());

    const saveBtn = buttonsEl.createEl("button", {
      text: "Сохранить",
      cls: "mod-cta",
    });
    saveBtn.addEventListener("click", () => {
      if (!name.trim()) return;
      updateProject(this.project.id, {
        name: name.trim(),
        color,
        icon: icon || "📁",
        folder: null,
      });
      this.onSaved();
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
