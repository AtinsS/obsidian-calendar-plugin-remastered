import moment from "moment";
import type { Moment, WeekSpec } from "moment";
import { App, Plugin, WorkspaceLeaf } from "obsidian";

import {
  VIEW_TYPE_CALENDAR,
  VIEW_TYPE_SCHEDULE,
  VIEW_TYPE_MOBILE_SCHEDULE,
  VIEW_TYPE_HABIT_ANALYTICS,
  VIEW_TYPE_FINANCE,
  VIEW_TYPE_FINANCIAL_ANALYTICS,
  VIEW_TYPE_NETWORK,
} from "./constants";
import { settings } from "./ui/stores";
import { app as appStore } from "./stores/appStore";
import {
  appHasPeriodicNotesPluginLoaded,
  CalendarSettingsTab,
  ISettings,
  applyAccentColor,
  applyGlassBgColor,
} from "./settings";
import { TFile } from "obsidian";
import CalendarView from "./view";
import ScheduleView from "./views/ScheduleView";
import MobileScheduleView from "./views/MobileScheduleView";
import HabitAnalyticsView from "./views/HabitAnalyticsView";
import FinanceView from "./views/FinanceView";
import FinancialAnalyticsView from "./views/FinancialAnalyticsView";
import NetworkView from "./views/NetworkView";
import { PersonModal } from "./networking/PersonModal";
import { parsePersonNote, buildPersonNote } from "./networking/personNote";
import { initTaskStores, reloadTaskStores, immediateSave as immediateTaskSave } from "./task-tracker/stores";
import { cleanupTimers } from "./task-tracker/TimerManager";
import { setSyncEnabled as setTaskSync } from "./task-tracker/storage";
import {
  setupNoteTaskSync,
  setupNoteRenameSync,
  setupNoteDeleteSync,
} from "./task-tracker/noteTasks";
import { initHabitStores, reloadHabitStores, immediateSave as immediateHabitSave } from "./habit-tracker/stores";
import { setSyncEnabled as setHabitSync } from "./habit-tracker/storage";
import { initFinanceStores, reloadFinanceStores, immediateFinanceSave } from "./finance/storage";
import { initFinancialAnalyticsStores, reloadFinancialAnalyticsStores, immediateAnalyticsSave } from "./finance/financialAnalyticsStorage";
import { NotificationService } from "./services/NotificationService";
import { initGistSync } from "./services/GistSyncService";
import { syncNotificationSettingsOnLoad } from "./io/vaultStorage";

declare global {
  interface Window {
    app: App;
    moment: () => Moment;
    _bundledLocaleWeekSpec: WeekSpec;
  }
}

export default class CalendarPlugin extends Plugin {
  public options: ISettings;
  private view: CalendarView;
  private syncReloadTimer: ReturnType<typeof setTimeout> | null = null;
  private notificationService: NotificationService;

  onunload(): void {
    // Flush pending debounced saves before teardown
    immediateTaskSave();
    immediateHabitSave();
    immediateFinanceSave();
    immediateAnalyticsSave();

    if (this.syncReloadTimer) clearTimeout(this.syncReloadTimer);
    this.notificationService?.stop();
    cleanupTimers();
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_CALENDAR)
      .forEach((leaf) => leaf.detach());
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_SCHEDULE)
      .forEach((leaf) => leaf.detach());
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_MOBILE_SCHEDULE)
      .forEach((leaf) => leaf.detach());
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_HABIT_ANALYTICS)
      .forEach((leaf) => leaf.detach());
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_FINANCE)
      .forEach((leaf) => leaf.detach());
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_FINANCIAL_ANALYTICS)
      .forEach((leaf) => leaf.detach());
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_NETWORK)
      .forEach((leaf) => leaf.detach());
  }

  async onload(): Promise<void> {
    // Set Russian locale for month names
    moment.locale("ru");

    // Set the app store so components can access the Obsidian App instance
    appStore.set(this.app);

    this.register(
      settings.subscribe((value) => {
        this.options = value;
        setTaskSync(!!value.syncToVault);
        setHabitSync(!!value.syncToVault);

        this.notificationService?.restart();
      })
    );

    this.registerView(
      VIEW_TYPE_CALENDAR,
      (leaf: WorkspaceLeaf) => (this.view = new CalendarView(leaf, this))
    );

    this.registerView(
      VIEW_TYPE_SCHEDULE,
      (leaf: WorkspaceLeaf) => new ScheduleView(leaf, this)
    );

    this.registerView(
      VIEW_TYPE_MOBILE_SCHEDULE,
      (leaf: WorkspaceLeaf) => new MobileScheduleView(leaf, this)
    );

    this.registerView(
      VIEW_TYPE_HABIT_ANALYTICS,
      (leaf: WorkspaceLeaf) => new HabitAnalyticsView(leaf, this)
    );

    this.registerView(
      VIEW_TYPE_FINANCE,
      (leaf: WorkspaceLeaf) => new FinanceView(leaf, this)
    );

    this.registerView(
      VIEW_TYPE_FINANCIAL_ANALYTICS,
      (leaf: WorkspaceLeaf) => new FinancialAnalyticsView(leaf, this)
    );

    this.registerView(
      VIEW_TYPE_NETWORK,
      (leaf: WorkspaceLeaf) => new NetworkView(leaf, this)
    );

    this.addCommand({
      id: "show-calendar-view",
      name: "Open view",
      checkCallback: (checking: boolean) => {
        if (checking) {
          return (
            this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).length === 0
          );
        }
        this.initLeaf();
      },
    });

    this.addCommand({
      id: "open-weekly-note",
      name: "Open Weekly Note",
      checkCallback: (checking) => {
        if (checking) {
          return !appHasPeriodicNotesPluginLoaded();
        }
        if (this.view) this.view.selectDateForWeek(moment());
      },
    });

    this.addCommand({
      id: "reveal-active-note",
      name: "Reveal active note",
      callback: () => {
        if (this.view) this.view.revealActiveNote();
      },
    });

    this.addCommand({
      id: "open-schedule-view",
      name: "Открыть расписание",
      callback: () => this.activateScheduleView(),
    });

    this.addCommand({
      id: "open-habit-analytics",
      name: "Открыть аналитику",
      callback: () => this.activateHabitAnalyticsView(),
    });

    this.addCommand({
      id: "open-finance-view",
      name: "Открыть распределение финансов",
      callback: () => this.activateFinanceView(),
    });

    this.addCommand({
      id: "open-financial-analytics",
      name: "Открыть финансовую аналитику",
      callback: () => this.activateFinancialAnalyticsView(),
    });

    this.addCommand({
      id: "open-network-graph",
      name: "Открыть граф связей",
      callback: () => this.activateNetworkView(),
    });

    this.addCommand({
      id: "add-person",
      name: "Добавить персону",
      callback: () => this.openPersonModal(),
    });

    this.addRibbonIcon("calendar-range", "Расписание", () => {
      this.activateScheduleView();
    });

    this.addRibbonIcon("calendar-with-checkmark", "Календарь", () => {
      this.initLeaf();
    });

    this.addRibbonIcon("bar-chart", "Аналитика", () => {
      this.activateHabitAnalyticsView();
    });

    this.addRibbonIcon("coins", "Финансы", () => {
      this.activateFinanceView();
    });

    this.addRibbonIcon("network", "Граф связей", () => {
      this.activateNetworkView();
    });

    this.addRibbonIcon("user-plus", "Добавить персону", () => {
      this.openPersonModal();
    });

    await this.loadOptions();

    // Apply accent color from settings
    if (this.options.accentColor) {
      applyAccentColor(this.options.accentColor);
    }
    if (this.options.glassBgColor) {
      applyGlassBgColor(this.options.glassBgColor, this.options.glassOpacity);
    }

    // Sync notification settings to vault on load so GitHub Actions always has current data.
    // MUST await before initTaskStores — otherwise this async write reads stale vault
    // data and overwrites the entire calendar-data.json before stores finish loading.
    await syncNotificationSettingsOnLoad(this.app, {
      syncToVault: !!this.options.syncToVault,
      overdueCheckEnabled: !!this.options.overdueCheckEnabled,
      ntfyTopic: this.options.ntfyTopic || "Calendar_Remastered",
    }).catch((e) => console.warn("[Calendar] Failed to sync notification settings to vault:", e));

    // Initialize task tracker
    initTaskStores(this);
    setupNoteTaskSync(this.app, this);
    setupNoteRenameSync(this.app, this);
    setupNoteDeleteSync(this.app, this);

    // Initialize habit tracker
    initHabitStores(this);

    // Initialize finance tracker (must await to prevent race condition where empty data overwrites vault)
    await initFinanceStores(this);

    // Initialize financial analytics (must await to prevent data loss)
    await initFinancialAnalyticsStores(this);

    // Initialize GitHub Gist sync
    initGistSync(this);

    // Initialize notification service
    this.notificationService = new NotificationService(this);
    if (this.options.notificationsEnabled) {
      this.notificationService.start();
    }

    // Watch for vault sync file changes (modify + create)
    const debouncedSyncReload = () => {
      if (this.syncReloadTimer) clearTimeout(this.syncReloadTimer);
      this.syncReloadTimer = setTimeout(async () => {
        reloadTaskStores(this);
        reloadHabitStores(this);
        await reloadFinanceStores();
        await reloadFinancialAnalyticsStores();
      }, 500);
    };

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.path === "calendar-data.json") {
          debouncedSyncReload();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && file.path === "calendar-data.json") {
          debouncedSyncReload();
        }
      })
    );

    // Синхронизация YAML ↔ тело заметки для карточек контактов
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile)) return;
        if (!file.path.startsWith(this.options.personsFolderPath || "People")) return;
        if (!file.path.endsWith(".md")) return;
        this.syncPersonFile(file);
      })
    );

    this.addSettingTab(new CalendarSettingsTab(this.app, this));

    if (this.app.workspace.layoutReady) {
      this.initLeaf();
    } else {
      this.app.workspace.onLayoutReady(() => this.initLeaf());
    }
  }

  initLeaf(): void {
    if (this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).length) {
      return;
    }
    // On mobile, open calendar in the main content area (right sidebar is hidden by default)
    const isMobile = this.app.workspace.containerEl.innerWidth <= 768;
    if (isMobile) {
      const leaf = this.app.workspace.getLeaf("tab");
      leaf.setViewState({ type: VIEW_TYPE_CALENDAR });
    } else {
      this.app.workspace.getRightLeaf(false).setViewState({
        type: VIEW_TYPE_CALENDAR,
      });
    }
  }

  private async activateView(viewType: string): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(viewType);
    if (existing.length) {
      workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getLeaf("tab");
    if (leaf) {
      await leaf.setViewState({ type: viewType, active: true });
      workspace.revealLeaf(leaf);
    }
  }

  async activateScheduleView(): Promise<void> {
    return this.activateView(VIEW_TYPE_SCHEDULE);
  }

  async activateMobileScheduleView(): Promise<void> {
    return this.activateView(VIEW_TYPE_MOBILE_SCHEDULE);
  }

  async activateHabitAnalyticsView(): Promise<void> {
    return this.activateView(VIEW_TYPE_HABIT_ANALYTICS);
  }

  async activateFinanceView(): Promise<void> {
    return this.activateView(VIEW_TYPE_FINANCE);
  }

  async activateFinancialAnalyticsView(): Promise<void> {
    return this.activateView(VIEW_TYPE_FINANCIAL_ANALYTICS);
  }

  async activateNetworkView(): Promise<void> {
    return this.activateView(VIEW_TYPE_NETWORK);
  }

  /**
   * Синхронизирует YAML-фронтматтер с телом заметки для файла карточки контакта.
   * Вызывается при изменении .md файла в папке People/.
   */
  private syncPersonFile(file: TFile): void {
    // Избегаем рекурсии: не обрабатываем файлы, которые мы сами только что записали
    if (this._syncingPersonFile === file.path) return;

    this.app.vault.read(file).then((content) => {
      const person = parsePersonNote(content, file.path);
      if (!person) return;

      const newContent = buildPersonNote(person);
      if (content !== newContent) {
        this._syncingPersonFile = file.path;
        this.app.vault.modify(file, newContent).then(() => {
          this._syncingPersonFile = "";
        });
      }
    });
  }

  private _syncingPersonFile = "";

  openPersonModal(existingPerson?: import("./networking/types").Person): void {
    const folderPath = this.options.personsFolderPath || "People";
    const avatarFolderPath = this.options.avatarFolderPath || "person-avatars";
    new PersonModal(this.app, folderPath, (_person, _filePath) => {
      // После создания/редактирования — обновляем граф, если открыт
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_NETWORK);
      for (const leaf of leaves) {
        const view = leaf.view as NetworkView;
        if (view && typeof view.refreshGraph === "function") {
          view.refreshGraph();
        }
      }
    }, existingPerson, avatarFolderPath).open();
  }

  async loadOptions(): Promise<void> {
    const options = await this.loadData();
    const old = { ...this.options };
    settings.update((current) => {
      return {
        ...current,
        ...(options || {}),
      };
    });

    if (JSON.stringify(old) !== JSON.stringify(this.options)) {
      await this.saveData(this.options);
    }
  }

  async writeOptions(changes: Partial<ISettings>): Promise<void> {
    settings.update((old) => ({ ...old, ...changes }));
    await this.saveData(this.options);
  }
}
