import moment from "moment";
import type { Moment } from "moment";
import {
  getDailyNote,
  getDailyNoteSettings,
  getDateFromFile,
  getDateUID,
  getWeeklyNote,
  getWeeklyNoteSettings,
} from "obsidian-daily-notes-interface";
import { FileView, TFile, ItemView, WorkspaceLeaf } from "obsidian";
import { get } from "svelte/store";

import { TRIGGER_ON_OPEN, VIEW_TYPE_CALENDAR } from "src/constants";
import type { ISettings } from "src/settings";
import type CalendarPlugin from "src/main";

import Calendar from "./ui/Calendar.svelte";
import { showNoteContextMenu } from "./ui/fileMenu";
import { activeFile, dailyNotes, weeklyNotes, settings } from "./ui/stores";
import {
  customTagsSource,
  streakSource,
  wordCountSource,
} from "./ui/sources";

import TaskPanel from "./task-tracker/TaskPanel.svelte";
import { taskDotSource } from "./task-tracker/taskDotSource";
import { selectedDate } from "./task-tracker/stores";

import HabitPanel from "./habit-tracker/HabitPanel.svelte";
import { habitSource } from "./habit-tracker/habitSource";

import { getMonthGoals } from "./finance/storage";
import { financeData } from "./finance/storage";
import type { MonthGoal } from "./finance/types";

export default class CalendarView extends ItemView {
  private calendar: Calendar;
  private taskPanel: TaskPanel;
  private habitPanel: HabitPanel;
  private settings: ISettings;
  private plugin: CalendarPlugin;
  private goalsContainer: HTMLElement;
  private panelsContainer: HTMLElement;
  private goalsUnsub: (() => void) | null = null;
  private currentMonthKey = "";
  private isMobile = typeof window !== "undefined" && window.innerWidth <= 768;

  constructor(leaf: WorkspaceLeaf, plugin?: CalendarPlugin) {
    super(leaf);
    this.plugin = plugin;

    this.selectDateForDay = this.selectDateForDay.bind(this);
    this.selectDateForWeek = this.selectDateForWeek.bind(this);

    this.onNoteSettingsUpdate = this.onNoteSettingsUpdate.bind(this);
    this.onFileCreated = this.onFileCreated.bind(this);
    this.onFileDeleted = this.onFileDeleted.bind(this);
    this.onFileModified = this.onFileModified.bind(this);
    this.onFileOpen = this.onFileOpen.bind(this);

    this.onHoverDay = this.onHoverDay.bind(this);
    this.onHoverWeek = this.onHoverWeek.bind(this);

    this.onContextMenuDay = this.onContextMenuDay.bind(this);
    this.onContextMenuWeek = this.onContextMenuWeek.bind(this);

    this.registerEvent(
      // Undocumented periodic-notes plugin event
      (this.app.workspace as unknown as { on: (name: string, cb: () => void) => import("obsidian").EventRef }).on(
        "periodic-notes:settings-updated",
        this.onNoteSettingsUpdate
      )
    );
    this.registerEvent(this.app.vault.on("create", this.onFileCreated));
    this.registerEvent(this.app.vault.on("delete", this.onFileDeleted));
    this.registerEvent(this.app.vault.on("modify", this.onFileModified));
    this.registerEvent(this.app.workspace.on("file-open", this.onFileOpen));

    this.settings = null;
    settings.subscribe((val) => {
      this.settings = val;

      // Calendar.svelte reacts to $settings changes directly — no tick needed here

      // Toggle task panel visibility
      if (val.showTaskTracker === false && this.taskPanel) {
        this.taskPanel.$destroy();
        this.taskPanel = null;
      } else if (val.showTaskTracker !== false && !this.taskPanel && this.panelsContainer) {
        this.taskPanel = new TaskPanel({
          target: this.panelsContainer,
          props: {
            appInstance: this.app,
          },
        });
      }

      // Toggle habit panel visibility
      if (val.showHabitTracker === false && this.habitPanel) {
        this.habitPanel.$destroy();
        this.habitPanel = null;
      } else if (val.showHabitTracker !== false && !this.habitPanel && this.panelsContainer) {
        this.habitPanel = new HabitPanel({
          target: this.panelsContainer,
          props: {
            appInstance: this.app,
          },
        });
      }
    });
  }

  getViewType(): string {
    return VIEW_TYPE_CALENDAR;
  }

  getDisplayText(): string {
    return "Calendar";
  }

  getIcon(): string {
    return "calendar-with-checkmark";
  }

  onClose(): Promise<void> {
    this.removeTooltip();
    if (this.goalsUnsub) {
      this.goalsUnsub();
      this.goalsUnsub = null;
    }
    if (this.calendar) {
      this.calendar.$destroy();
    }
    if (this.taskPanel) {
      this.taskPanel.$destroy();
    }
    if (this.habitPanel) {
      this.habitPanel.$destroy();
    }
    return Promise.resolve();
  }

  async onOpen(): Promise<void> {
    // Initialize selected date with today
    selectedDate.set(getDateUID(moment(), "day"));

    // Schedule view button
    const scheduleBtn = this.contentEl.createEl("button", {
      text: "📅 Открыть расписание",
      cls: "schedule-open-btn",
    });
    scheduleBtn.addEventListener("click", () => {
      if (this.isMobile && this.plugin) {
        this.plugin.activateMobileScheduleView();
      } else if (this.plugin) {
        this.plugin.activateScheduleView();
      }
    });

    // Monthly goals indicator
    this.goalsContainer = this.contentEl.createDiv({
      cls: "month-goals-indicator",
    });
    this.updateGoalsIndicator();

    // Integration point: external plugins can listen for `calendar:open`
    // to feed in additional sources.
    const sources = [
      customTagsSource,
      streakSource,
      wordCountSource,
      taskDotSource,
      habitSource,
    ];
    this.app.workspace.trigger(TRIGGER_ON_OPEN, sources);

    this.calendar = new Calendar({
      target: this.contentEl,
      props: {
        onClickDay: this.selectDateForDay,
        onClickWeek: this.selectDateForWeek,
        onHoverDay: this.onHoverDay,
        onHoverWeek: this.onHoverWeek,
        onContextMenuDay: this.onContextMenuDay,
        onContextMenuWeek: this.onContextMenuWeek,
        onMonthChange: (mk: string) => {
          this.currentMonthKey = mk;
          this.updateGoalsIndicator(mk);
        },
        sources,
      },
    });

    // Container for task & habit panels — always below the calendar
    this.panelsContainer = this.contentEl.createDiv({ cls: "panels-container" });

    // Create panels now that panelsContainer exists
    // (settings.subscribe() in the constructor ran before panelsContainer was created)
    const currentSettings = get(settings);
    if (currentSettings.showTaskTracker !== false) {
      this.taskPanel = new TaskPanel({
        target: this.panelsContainer,
        props: { appInstance: this.app },
      });
    }
    if (currentSettings.showHabitTracker !== false) {
      this.habitPanel = new HabitPanel({
        target: this.panelsContainer,
        props: { appInstance: this.app },
      });
    }

    // Subscribe to finance data changes (deferred to avoid init issues)
    setTimeout(() => {
      // Guard: view may have closed before the deferred callback fires
      if (!this.goalsContainer) return;
      this.goalsUnsub = financeData.subscribe(() => {
        this.updateGoalsIndicator(this.currentMonthKey);
      });
    }, 200);
  }

  private updateGoalsIndicator(monthKey?: string): void {
    if (!this.goalsContainer) return;

    if (!monthKey) {
      const now = new Date();
      monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }

    const goals = getMonthGoals(monthKey);
    this.renderGoalsIndicator(goals, monthKey);
  }

  private renderGoalsIndicator(goals: MonthGoal[], monthKey: string): void {
    if (!this.goalsContainer) return;
    this.goalsContainer.empty();

    if (goals.length === 0) return;

    if (goals.length === 1) {
      const goal = goals[0];
      const remaining = (goal.targetAmount || 0) - (goal.currentAmount || 0);
      const remainingText = remaining > 0
        ? `Осталось накопить: ${remaining.toLocaleString("ru-RU")} ₽`
        : (remaining === 0 ? "Цель достигнута!" : `Превышено на ${Math.abs(remaining).toLocaleString("ru-RU")} ₽`);

      const wrapper = this.goalsContainer.createDiv({ cls: "month-goals-single" });
      wrapper.createEl("span", { text: goal.icon || "🎯", cls: "month-goals-icon" });
      const textEl = wrapper.createEl("span", { cls: "month-goals-text" });
      textEl.createEl("strong", { text: goal.name || "Цель" });
      textEl.createEl("span", { text: ` — ${remainingText}`, cls: "month-goals-remaining" });

      const navBtn = wrapper.createEl("button", { text: "💰", cls: "month-goals-nav-btn" });
      navBtn.title = "Перейти к распределению средств";
      navBtn.addEventListener("click", () => {
        if (this.plugin) {
          this.plugin.activateFinanceView();
        }
      });
    } else {
      const wrapper = this.goalsContainer.createDiv({ cls: "month-goals-multi" });
      wrapper.createEl("span", { text: "🎯", cls: "month-goals-icon" });
      const summary = goals.map(g => {
        const rem = (g.targetAmount || 0) - (g.currentAmount || 0);
        return `${g.icon || "🎯"} ${g.name || "Цель"}: ${rem > 0 ? `ост. ${rem.toLocaleString("ru-RU")} ₽` : "✓"}`;
      }).join(" | ");
      wrapper.createEl("span", { text: summary, cls: "month-goals-text" });

      const showBtn = wrapper.createEl("button", { text: `Все (${goals.length})`, cls: "month-goals-show-btn" });
      showBtn.addEventListener("click", () => {
        this.showGoalsModal(monthKey);
      });

      const navBtn = wrapper.createEl("button", { text: "💰", cls: "month-goals-nav-btn" });
      navBtn.title = "Перейти к распределению средств";
      navBtn.addEventListener("click", () => {
        if (this.plugin) {
          this.plugin.activateFinanceView();
        }
      });
    }
  }

  private showGoalsModal(monthKey: string): void {
    const goals = getMonthGoals(monthKey);
    if (goals.length === 0) return;

    const months = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    const [y, m] = monthKey.split("-");
    const monthName = `${months[parseInt(m) - 1]} ${y}`;

    const overlay = document.body.createDiv({ cls: "goals-modal-overlay" });
    const modal = overlay.createDiv({ cls: "goals-modal" });

    const header = modal.createDiv({ cls: "goals-modal-header" });
    header.createEl("span", { text: "🎯", cls: "goals-modal-icon" });
    header.createEl("h2", { text: `Цели на ${monthName}` });
    const closeBtn = header.createEl("button", { text: "✕", cls: "goals-modal-close" });

    const body = modal.createDiv({ cls: "goals-modal-body" });
    goals.forEach((goal: MonthGoal, i: number) => {
      const remaining = (goal.targetAmount || 0) - (goal.currentAmount || 0);
      const item = body.createDiv({ cls: "goal-item" });
      item.createEl("span", { text: `${i + 1}.`, cls: "goal-number" });
      const name = goal.name || "Цель";
      const icon = goal.icon || "🎯";
      item.createEl("span", { text: `${icon} ${name}`, cls: "goal-text" });
      const amountsEl = item.createDiv({ cls: "goal-amounts" });
      amountsEl.createEl("span", {
        text: `${(goal.currentAmount || 0).toLocaleString("ru-RU")} ₽ / ${(goal.targetAmount || 0).toLocaleString("ru-RU")} ₽`,
        cls: "goal-amounts-detail",
      });
      amountsEl.createEl("span", {
        text: remaining > 0 ? `Осталось: ${remaining.toLocaleString("ru-RU")} ₽` : (remaining === 0 ? "✓ Достигнуто" : `Превышено: ${Math.abs(remaining).toLocaleString("ru-RU")} ₽`),
        cls: remaining > 0 ? "goal-remaining" : "goal-remaining done",
      });
    });

    const footer = modal.createDiv({ cls: "goals-modal-footer" });
    const navBtn = footer.createEl("button", { text: "💰 Перейти к распределению", cls: "goals-modal-nav-btn" });
    navBtn.addEventListener("click", () => {
      close();
      if (this.plugin) {
        this.plugin.activateFinanceView();
      }
    });

    const close = () => overlay.remove();
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
  }

  private activeTooltip: HTMLElement | null = null;

  onHoverDay(
    date: Moment,
    targetEl: EventTarget,
    isMetaPressed: boolean
  ): void {
    if (isMetaPressed) {
      const { format } = getDailyNoteSettings();
      const note = getDailyNote(date, get(dailyNotes));
      this.app.workspace.trigger(
        "link-hover",
        this,
        targetEl,
        date.format(format),
        note?.path
      );
    }
    // Tooltips disabled — tasks are visible in the task panel
  }

  private removeTooltip(): void {
    if (this.activeTooltip) {
      this.activeTooltip.remove();
      this.activeTooltip = null;
    }
  }

  onHoverWeek(
    date: Moment,
    targetEl: EventTarget,
    isMetaPressed: boolean
  ): void {
    if (!isMetaPressed) {
      return;
    }
    const note = getWeeklyNote(date, get(weeklyNotes));
    const { format } = getWeeklyNoteSettings();
    this.app.workspace.trigger(
      "link-hover",
      this,
      targetEl,
      date.format(format),
      note?.path
    );
  }

  private onContextMenuDay(date: Moment, event: MouseEvent): void {
    const note = getDailyNote(date, get(dailyNotes));
    if (!note) {
      // If no file exists for a given day, show nothing.
      return;
    }
    showNoteContextMenu(this.app, note, {
      x: event.pageX,
      y: event.pageY,
    });
  }

  private onContextMenuWeek(date: Moment, event: MouseEvent): void {
    const note = getWeeklyNote(date, get(weeklyNotes));
    if (!note) {
      // If no file exists for a given day, show nothing.
      return;
    }
    showNoteContextMenu(this.app, note, {
      x: event.pageX,
      y: event.pageY,
    });
  }

  private onNoteSettingsUpdate(): void {
    dailyNotes.reindex();
    weeklyNotes.reindex();
    // Calendar reactivity handles display update — no tick needed
  }

  private onFileDeleted(file: TFile): void {
    if (getDateFromFile(file, "day")) {
      dailyNotes.reindex();
    }
    if (getDateFromFile(file, "week")) {
      weeklyNotes.reindex();
    }
    this.updateActiveFile();
  }

  private onFileModified(_file: TFile): void {
    // Calendar reactivity handles display update via store subscriptions
  }

  private onFileCreated(file: TFile): void {
    if (this.app.workspace.layoutReady) {
      if (getDateFromFile(file, "day")) {
        dailyNotes.reindex();
      }
      if (getDateFromFile(file, "week")) {
        weeklyNotes.reindex();
      }
    }
  }

  public onFileOpen(_file: TFile): void {
    if (this.app.workspace.layoutReady) {
      this.updateActiveFile();
    }
  }

  private updateActiveFile(): void {
    const leaf = this.app.workspace.activeLeaf;
    if (!leaf) return;

    const { view } = leaf;

    let file = null;
    if (view instanceof FileView) {
      file = view.file;
    }
    activeFile.setFile(file);
  }

  public revealActiveNote(): void {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (!activeLeaf) return;

    if (activeLeaf.view instanceof FileView) {
      // Check to see if the active note is a daily-note
      let date = getDateFromFile(activeLeaf.view.file, "day");
      if (date) {
        this.calendar.$set({ displayedMonth: date });
        return;
      }

      // Check to see if the active note is a weekly-note
      const { format } = getWeeklyNoteSettings();
      date = moment(activeLeaf.view.file.basename, format, true);
      if (date.isValid()) {
        this.calendar.$set({ displayedMonth: date });
        return;
      }
    }
  }

  selectDateForWeek(date: Moment): void {
    const dateUID = getDateUID(date, "week");
    selectedDate.set(dateUID);
    activeFile.setUID(dateUID);
  }

  selectDateForDay(date: Moment): void {
    const dateUID = getDateUID(date, "day");
    const current = get(selectedDate);
    if (current === dateUID) {
      selectedDate.set(null);
      activeFile.setUID(null);
    } else {
      selectedDate.set(dateUID);
      activeFile.setUID(dateUID);
    }
  }
}
