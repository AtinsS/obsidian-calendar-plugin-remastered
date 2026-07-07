import { ItemView, WorkspaceLeaf } from "obsidian";

import { VIEW_TYPE_SCHEDULE } from "../constants";
import type CalendarPlugin from "../main";
import ScheduleCalendar from "../components/ScheduleCalendar.svelte";

export default class ScheduleView extends ItemView {
  private plugin: CalendarPlugin;
  private svelteComponent: ScheduleCalendar;

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

    this.svelteComponent = new ScheduleCalendar({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      target: container as any,
      props: {
        plugin: this.plugin,
      },
    });
  }

  async onClose(): Promise<void> {
    if (this.svelteComponent) {
      this.svelteComponent.$destroy();
      this.svelteComponent = null;
    }
  }
}
