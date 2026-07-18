import { ItemView, WorkspaceLeaf } from "obsidian";
import { get } from "svelte/store";

import { VIEW_TYPE_SCHEDULE } from "../constants";
import type CalendarPlugin from "../main";
import { settings } from "../ui/stores";
import ScheduleCalendar from "../components/ScheduleCalendar.svelte";

export default class ScheduleView extends ItemView {
  private plugin: CalendarPlugin;
  private svelteComponent: ScheduleCalendar;
  private settingsUnsub: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: CalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_SCHEDULE;
  }

  getDisplayText(): string {
    return "Расписание";
  }

  getIcon(): string {
    return "calendar";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("schedule-view-container");
    // Ensure the content area fills the available height
    (container as HTMLElement).style.height = "100%";
    (container as HTMLElement).style.display = "flex";
    (container as HTMLElement).style.flexDirection = "column";

    this.svelteComponent = new ScheduleCalendar({
      target: container as HTMLElement,
      props: {
        plugin: this.plugin,
        scheduleDisplay: get(settings),
      },
    });

    // Reactively update scheduleDisplay when settings change
    this.settingsUnsub = settings.subscribe((val) => {
      if (this.svelteComponent) {
        this.svelteComponent.$set({ scheduleDisplay: val });
      }
    });
  }

  async onClose(): Promise<void> {
    if (this.settingsUnsub) {
      this.settingsUnsub();
      this.settingsUnsub = null;
    }
    if (this.svelteComponent) {
      this.svelteComponent.$destroy();
      this.svelteComponent = null;
    }
  }
}
