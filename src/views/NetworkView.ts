import { ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_NETWORK } from "../constants";
import type CalendarPlugin from "../main";
import { collectPersons } from "../networking/personCollector";
import type { Person } from "../networking/types";
import { PersonModal } from "../networking/PersonModal";
import NetworkGraph from "../networking/NetworkGraph.svelte";

/**
 * Obsidian-вьюшка для отображения графа связей между людьми.
 * Использует Svelte-компонент NetworkGraph с D3.js.
 */
export default class NetworkView extends ItemView {
  private plugin: CalendarPlugin;
  private graphComponent: NetworkGraph | null = null;
  private persons: Person[] = [];
  private searchInput: HTMLInputElement | null = null;
  private searchQuery = "";

  constructor(leaf: WorkspaceLeaf, plugin: CalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_NETWORK;
  }

  getDisplayText(): string {
    return "Граф связей";
  }

  getIcon(): string {
    return "network";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("network-view-container");
    (container as HTMLElement).style.height = "100%";
    (container as HTMLElement).style.display = "flex";
    (container as HTMLElement).style.flexDirection = "column";

    // Собираем данные о людях из хранилища
    this.persons = collectPersons(this.app);

    // Заголовок
    const header = container.createDiv({ cls: "network-view-header" });
    header.createEl("h3", { text: `Граф связей (${this.persons.length} чел.)` });

    // Кнопка обновления
    const refreshBtn = header.createEl("button", {
      text: "↻ Обновить",
      cls: "network-refresh-btn",
    });
    refreshBtn.addEventListener("click", () => this.refreshGraph());

    // Кнопка добавления персоны
    const addBtn = header.createEl("button", {
      text: "+ Добавить персону",
      cls: "network-add-btn",
    });
    addBtn.addEventListener("click", () => {
      const folderPath = this.plugin.options.personsFolderPath || "People";
      const avatarFolderPath = this.plugin.options.avatarFolderPath || "person-avatars";
      new PersonModal(this.app, folderPath, () => this.refreshGraph(), undefined, avatarFolderPath).open();
    });

    // Поиск по навыкам
    const searchContainer = container.createDiv({ cls: "network-search-container" });
    this.searchInput = searchContainer.createEl("input", {
      type: "text",
      cls: "network-search-input",
      placeholder: "Поиск по навыкам (React, TypeScript...)",
    });
    this.searchInput.addEventListener("input", () => {
      this.searchQuery = this.searchInput?.value || "";
      this.applySearch();
    });

    // Контейнер для графа
    const graphContainer = container.createDiv({ cls: "network-graph-wrapper" });
    (graphContainer as HTMLElement).style.flex = "1";
    (graphContainer as HTMLElement).style.minHeight = "400px";

    // Монтируем Svelte-компонент
    this.graphComponent = new NetworkGraph({
      target: graphContainer,
      props: {
        persons: this.persons,
        app: this.app,
        onEditPerson: (person: Person) => this.editPerson(person),
        onOpenDossier: (person: Person) => this.openDossier(person),
      },
    });
  }

  async onClose(): Promise<void> {
    if (this.graphComponent) {
      this.graphComponent.$destroy();
      this.graphComponent = null;
    }
  }

  /**
   * Пересобирает данные и обновляет граф.
   */
  refreshGraph(): void {
    this.persons = collectPersons(this.app);
    if (this.graphComponent) {
      this.graphComponent.$set({ persons: this.persons });
    }
  }

  /**
   * Открывает модалку редактирования персоны.
   */
  editPerson(person: Person): void {
    const folderPath = this.plugin.options.personsFolderPath || "People";
    const avatarFolderPath = this.plugin.options.avatarFolderPath || "person-avatars";
    new PersonModal(this.app, folderPath, () => this.refreshGraph(), person, avatarFolderPath).open();
  }

  /**
   * Открывает .md файл карточки контакта в Obsidian.
   */
  private openDossier(person: Person): void {
    const file = this.app.vault.getAbstractFileByPath(person.path);
    if (file) {
      this.app.workspace.openLinkText(person.path, "", true);
    }
  }

  /**
   * Фильтрует людей по навыкам и обновляет граф.
   */
  private applySearch(): void {
    const query = this.searchQuery.toLowerCase().trim();
    if (!query) {
      // Показываем всех
      if (this.graphComponent) {
        this.graphComponent.$set({ persons: this.persons });
      }
      return;
    }

    const searchTerms = query.split(/[,;\s]+/).filter(Boolean);
    const filtered = this.persons.filter((p) => {
      if (!p.skills || p.skills.length === 0) return false;
      const personSkills = p.skills.map((s) => s.toLowerCase());
      return searchTerms.every((term) =>
        personSkills.some((skill) => skill.includes(term))
      );
    });

    if (this.graphComponent) {
      this.graphComponent.$set({ persons: filtered });
    }

    // Обновляем заголовок с количеством
    const header = this.containerEl.querySelector(".network-view-header h3");
    if (header) {
      header.textContent = query
        ? `Граф связей (${filtered.length}/${this.persons.length} чел.)`
        : `Граф связей (${this.persons.length} чел.)`;
    }
  }
}
