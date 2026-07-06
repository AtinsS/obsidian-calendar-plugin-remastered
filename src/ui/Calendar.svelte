<svelte:options immutable />

<script lang="ts">
  import type { Moment } from "moment";
  import {
    Calendar as CalendarBase,
    ICalendarSource,
    configureGlobalMomentLocale,
  } from "obsidian-calendar-ui";
  import { onDestroy } from "svelte";

  import type { ISettings } from "src/settings";
  import { activeFile, dailyNotes, settings, weeklyNotes } from "./stores";
  import { tasks } from "../task-tracker/stores";
  import { habitLogs } from "../habit-tracker/stores";

  let today: Moment = window.moment();
  let lastWeekStart: string = null;

  // When tasks or habits change, re-render calendar so badges update
  const unsubTasks = tasks.subscribe(() => { today = window.moment(); });
  const unsubHabits = habitLogs.subscribe(() => { today = window.moment(); });

  $: {
    const ws = $settings.weekStart;
    if (ws !== lastWeekStart) {
      lastWeekStart = ws;
      configureGlobalMomentLocale("ru", ws);
      dailyNotes.reindex();
      weeklyNotes.reindex();
      today = window.moment();
    }
  }

  export let displayedMonth: Moment = today;
  export let sources: ICalendarSource[];
  export let onHoverDay: (date: Moment, targetEl: EventTarget) => boolean;
  export let onHoverWeek: (date: Moment, targetEl: EventTarget) => boolean;
  export let onClickDay: (date: Moment, isMetaPressed: boolean) => boolean;
  export let onClickWeek: (date: Moment, isMetaPressed: boolean) => boolean;
  export let onContextMenuDay: (date: Moment, event: MouseEvent) => boolean;
  export let onContextMenuWeek: (date: Moment, event: MouseEvent) => boolean;

  export function tick() {
    today = window.moment();
  }

  let lastHeartbeatDay: string = today.format("YYYY-MM-DD");

  const heartbeat = setInterval(() => {
    const currentDay = window.moment().format("YYYY-MM-DD");
    if (currentDay !== lastHeartbeatDay) {
      lastHeartbeatDay = currentDay;
      today = window.moment();

      if (displayedMonth.isSame(today, "month")) {
        displayedMonth = today;
      }
    }
  }, 1000 * 30);

  onDestroy(() => {
    clearInterval(heartbeat);
    unsubTasks();
    unsubHabits();
  });
</script>

<CalendarBase
  {sources}
  {today}
  {onHoverDay}
  {onHoverWeek}
  {onContextMenuDay}
  {onContextMenuWeek}
  {onClickDay}
  {onClickWeek}
  bind:displayedMonth
  localeData={today.localeData()}
  selectedId={$activeFile}
  showWeekNums={$settings.showWeeklyNote}
/>
