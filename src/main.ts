import moment from "moment";
import type { Moment, WeekSpec } from "moment";
import { App, Plugin, WorkspaceLeaf } from "obsidian";

import {
  VIEW_TYPE_CALENDAR,
  VIEW_TYPE_SCHEDULE,
  VIEW_TYPE_HABIT_ANALYTICS,
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
import HabitAnalyticsView from "./views/HabitAnalyticsView";
import { initTaskStores, reloadTaskStores } from "./task-tracker/stores";
import { setSyncEnabled as setTaskSync } from "./task-tracker/storage";
import { setupNoteTaskSync } from "./task-tracker/noteTasks";
import { initHabitStores, reloadHabitStores } from "./habit-tracker/stores";
import { setSyncEnabled as setHabitSync } from "./habit-tracker/storage";
import { NotificationService } from "./services/NotificationService";

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
    if (this.syncReloadTimer) clearTimeout(this.syncReloadTimer);
    this.notificationService?.stop();
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_CALENDAR)
      .forEach((leaf) => leaf.detach());
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_SCHEDULE)
      .forEach((leaf) => leaf.detach());
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_HABIT_ANALYTICS)
      .forEach((leaf) => leaf.detach());
  }

  async onload(): Promise<void> {
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
      VIEW_TYPE_HABIT_ANALYTICS,
      (leaf: WorkspaceLeaf) => new HabitAnalyticsView(leaf, this)
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
        this.view.selectDateForWeek(moment());
      },
    });

    this.addCommand({
      id: "reveal-active-note",
      name: "Reveal active note",
      callback: () => this.view.revealActiveNote(),
    });

    this.addCommand({
      id: "open-schedule-view",
      name: "Открыть расписание",
      callback: () => this.activateScheduleView(),
    });

    this.addCommand({
      id: "open-habit-analytics",
      name: "Open Habit Analytics",
      callback: () => this.activateHabitAnalyticsView(),
    });

    this.addRibbonIcon("calendar-range", "Расписание", () => {
      this.activateScheduleView();
    });

    this.addRibbonIcon("bar-chart", "Habit Analytics", () => {
      this.activateHabitAnalyticsView();
    });

    await this.loadOptions();

    // Initialize task tracker
    initTaskStores(this);
    setupNoteTaskSync(this.app);

    // Initialize habit tracker
    initHabitStores(this);

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

  async activateScheduleView(): Promise<void> {
    const { workspace } = this.app;

    const existing = workspace.getLeavesOfType(VIEW_TYPE_SCHEDULE);
    if (existing.length) {
      workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = workspace.getLeaf("tab");
    if (leaf) {
      await leaf.setViewState({
        type: VIEW_TYPE_SCHEDULE,
        active: true,
      });
      workspace.revealLeaf(leaf);
    }
  }

  async activateHabitAnalyticsView(): Promise<void> {
    const { workspace } = this.app;

    const existing = workspace.getLeavesOfType(VIEW_TYPE_HABIT_ANALYTICS);
    if (existing.length) {
      workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = workspace.getLeaf("tab");
    if (leaf) {
      await leaf.setViewState({
        type: VIEW_TYPE_HABIT_ANALYTICS,
        active: true,
      });
      workspace.revealLeaf(leaf);
    }
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
