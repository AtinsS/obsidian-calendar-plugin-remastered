import { ItemView, WorkspaceLeaf } from "obsidian";

import { VIEW_TYPE_HABIT_ANALYTICS } from "../constants";
import type CalendarPlugin from "../main";
import HabitAnalytics from "../components/HabitAnalytics.svelte";

export default class HabitAnalyticsView extends ItemView {
  private plugin: CalendarPlugin;
  private svelteComponent: HabitAnalytics;

  constructor(leaf: WorkspaceLeaf, plugin: CalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_HABIT_ANALYTICS;
  }

  getDisplayText(): string {
    return "Habit Analytics";
  }

  getIcon(): string {
    return "bar-chart";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("habit-analytics-view-container");

    this.svelteComponent = new HabitAnalytics({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      target: container as any,
    });
  }

  async onClose(): Promise<void> {
    if (this.svelteComponent) {
      this.svelteComponent.$destroy();
      this.svelteComponent = null;
    }
  }
}
