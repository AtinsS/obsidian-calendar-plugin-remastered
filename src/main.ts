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
} from "./constants";
import { settings } from "./ui/stores";
import { app as appStore } from "./stores/appStore";
import {
  appHasPeriodicNotesPluginLoaded,
  CalendarSettingsTab,
  ISettings,
} from "./settings";
import { TFile } from "obsidian";
import CalendarView from "./view";
import ScheduleView from "./views/ScheduleView";
import MobileScheduleView from "./views/MobileScheduleView";
import HabitAnalyticsView from "./views/HabitAnalyticsView";
import FinanceView from "./views/FinanceView";
import FinancialAnalyticsView from "./views/FinancialAnalyticsView";
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

    this.addRibbonIcon("calendar-range", "Расписание", () => {
      this.activateScheduleView();
    });

    this.addRibbonIcon("bar-chart", "Аналитика", () => {
      this.activateHabitAnalyticsView();
    });

    this.addRibbonIcon("coins", "Финансы", () => {
      this.activateFinanceView();
    });

    await this.loadOptions();

    // Initialize task tracker
    initTaskStores(this);
    setupNoteTaskSync(this.app, this);
    setupNoteRenameSync(this.app, this);
    setupNoteDeleteSync(this.app, this);

    // Initialize habit tracker
    initHabitStores(this);

    // Initialize finance tracker
    initFinanceStores(this);

    // Initialize financial analytics
    initFinancialAnalyticsStores(this);

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
      this.syncReloadTimer = setTimeout(() => {
        reloadTaskStores(this);
        reloadHabitStores(this);
        reloadFinanceStores();
        reloadFinancialAnalyticsStores();
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

    this.addSettingTab(new CalendarSettingsTab(this.app, this));

    if (this.app.workspace.layoutReady) {
      this.initLeaf();
    } else {
      this.registerEvent(
        this.app.workspace.on("layout-ready", this.initLeaf.bind(this))
      );
    }
  }

  initLeaf(): void {
    if (this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).length) {
      return;
    }
    this.app.workspace.getRightLeaf(false).setViewState({
      type: VIEW_TYPE_CALENDAR,
    });
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
