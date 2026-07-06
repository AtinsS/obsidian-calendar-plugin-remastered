<svelte:options immutable />

<script lang="ts">
  import type { Moment } from "moment";
  import {
    Calendar as CalendarBase,
    ICalendarSource,
    configureGlobalMomentLocale,
  } from "obsidian-calendar-ui";
  import { onDestroy, onMount } from "svelte";

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

  // Long-press for context menu on touch devices
  let containerEl: HTMLElement;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressStartX = 0;
  let longPressStartY = 0;
  const LONG_PRESS_MS = 500;
  const MOVE_THRESHOLD = 10;

  function findDayCell(target: EventTarget): HTMLElement | null {
    return (target as HTMLElement)?.closest?.(".day") || null;
  }

  function onContainerTouchStart(e: TouchEvent) {
    const dayCell = findDayCell(e.target);
    if (!dayCell) return;

    const dateStr = dayCell.getAttribute("data-date");
    if (!dateStr) return;

    const touch = e.touches[0];
    longPressStartX = touch.clientX;
    longPressStartY = touch.clientY;

    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      const moment = window.moment(dateStr, "YYYY-MM-DD");
      onContextMenuDay(moment, {
        pageX: longPressStartX,
        pageY: longPressStartY,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as MouseEvent);
    }, LONG_PRESS_MS);
  }

  function onContainerTouchMove(e: TouchEvent) {
    if (!longPressTimer) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - longPressStartX);
    const dy = Math.abs(touch.clientY - longPressStartY);
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function onContainerTouchEnd() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  onMount(() => {
    if (!containerEl) return;
    containerEl.addEventListener("touchstart", onContainerTouchStart, { passive: true });
    containerEl.addEventListener("touchmove", onContainerTouchMove, { passive: true });
    containerEl.addEventListener("touchend", onContainerTouchEnd, { passive: true });
    containerEl.addEventListener("touchcancel", onContainerTouchEnd, { passive: true });
  });

  onDestroy(() => {
    clearInterval(heartbeat);
    unsubTasks();
    unsubHabits();
    if (longPressTimer) clearTimeout(longPressTimer);
    if (containerEl) {
      containerEl.removeEventListener("touchstart", onContainerTouchStart);
      containerEl.removeEventListener("touchmove", onContainerTouchMove);
      containerEl.removeEventListener("touchend", onContainerTouchEnd);
      containerEl.removeEventListener("touchcancel", onContainerTouchEnd);
    }
  });
</script>

<div bind:this={containerEl}>
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
</div>
