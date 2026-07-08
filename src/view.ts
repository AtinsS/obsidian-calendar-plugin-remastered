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
import { selectedDate, tasks as taskStore } from "./task-tracker/stores";

import HabitPanel from "./habit-tracker/HabitPanel.svelte";
import { habitSource } from "./habit-tracker/habitSource";

export default class CalendarView extends ItemView {
  private calendar: Calendar;
  private taskPanel: TaskPanel;
  private habitPanel: HabitPanel;
  private settings: ISettings;
  private plugin: CalendarPlugin;

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (<any>this.app.workspace).on(
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
      }

      // Toggle habit panel visibility
      if (val.showHabitTracker === false && this.habitPanel) {
        this.habitPanel.$destroy();
        this.habitPanel = null;
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
    const scheduleBtn = (this as any).contentEl.createEl("button", {
      text: "📅 Открыть расписание",
      cls: "schedule-open-btn",
    });
    scheduleBtn.addEventListener("click", () => {
      if (this.plugin) {
        this.plugin.activateScheduleView();
      }
    });

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      target: (this as any).contentEl,
      props: {
        onClickDay: this.selectDateForDay,
        onClickWeek: this.selectDateForWeek,
        onHoverDay: this.onHoverDay,
        onHoverWeek: this.onHoverWeek,
        onContextMenuDay: this.onContextMenuDay,
        onContextMenuWeek: this.onContextMenuWeek,
        sources,
      },
    });

    // Create task panel below calendar
    if (this.settings?.showTaskTracker !== false) {
      this.taskPanel = new TaskPanel({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        target: (this as any).contentEl,
        props: {
          appInstance: this.app,
        },
      });
    }

    // Create habit panel below task panel
    if (this.settings?.showHabitTracker !== false) {
      this.habitPanel = new HabitPanel({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        target: (this as any).contentEl,
        props: {
          appInstance: this.app,
        },
      });
    }
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
      return;
    }

    // Show uncompleted tasks tooltip
    const dateUID = getDateUID(date, "day");
    const allTasks = get(taskStore);
    const uncompleted = allTasks.filter(
      (t) => t.dateUID === dateUID && !t.completed
    );

    this.removeTooltip();

    if (uncompleted.length === 0) return;

    const el = targetEl as HTMLElement;
    const rect = el.getBoundingClientRect();

    const tooltip = document.createElement("div");
    tooltip.className = "calendar-task-tooltip";
    tooltip.style.cssText = `
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.bottom + 4}px;
      z-index: 1000;
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 12px;
      color: var(--text-normal);
      max-width: 220px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      pointer-events: none;
    `;

    const items = uncompleted.slice(0, 7);
    for (const t of items) {
      const row = document.createElement("div");
      row.style.cssText = "padding: 3px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px;";

      const statusIcon = t.status === "progress" ? "\u23F3" : t.status === "done" ? "\u2714" : "\u25CB";
      const priorityIcon = t.priority === "high" ? "!" : t.priority === "medium" ? "~" : "";
      const noteIcon = t.notePath ? " \uD83D\uDCDD" : "";
      const timeIcon = t.scheduledTime ? ` \uD83D\uDD52${t.scheduledTime}` : "";
      const recurringIcon = t.recurrence ? " \u21BB" : "";

      const iconSpan = document.createElement("span");
      iconSpan.style.cssText = "color: var(--text-faint); font-size: 10px; min-width: 14px; text-align: center;";
      iconSpan.textContent = statusIcon;

      const textSpan = document.createElement("span");
      textSpan.style.cssText = "overflow: hidden; text-overflow: ellipsis;";
      textSpan.textContent = (priorityIcon ? priorityIcon + " " : "") + t.title;

      const metaSpan = document.createElement("span");
      metaSpan.style.cssText = "color: var(--text-faint); font-size: 10px; flex-shrink: 0;";
      metaSpan.textContent = `${noteIcon}${timeIcon}${recurringIcon}`;

      row.appendChild(iconSpan);
      row.appendChild(textSpan);
      row.appendChild(metaSpan);
      tooltip.appendChild(row);
    }
    if (uncompleted.length > 7) {
      const more = document.createElement("div");
      more.style.cssText = "padding: 3px 0; color: var(--text-faint); font-size: 11px; text-align: center;";
      more.textContent = `+${uncompleted.length - 7} ещё`;
      tooltip.appendChild(more);
    }

    document.body.appendChild(tooltip);
    this.activeTooltip = tooltip;
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
    const { view } = this.app.workspace.activeLeaf;

    let file = null;
    if (view instanceof FileView) {
      file = view.file;
    }
    activeFile.setFile(file);
    // Calendar uses $activeFile as selectedId prop — Svelte handles reactivity
  }

  public revealActiveNote(): void {
    const { activeLeaf } = this.app.workspace;

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
