<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { Calendar } from "@fullcalendar/core";
  import dayGridPlugin from "@fullcalendar/daygrid";
  import timeGridPlugin from "@fullcalendar/timegrid";
  import interactionPlugin from "@fullcalendar/interaction";
  import luxonPlugin from "@fullcalendar/luxon3";

  import type CalendarPlugin from "../main";
  import type { ITask, IProject } from "../task-tracker/types";
  import {
    tasks,
    projects,
    updateTask,
    addTask,
  } from "../task-tracker/stores";
  import { TaskModal } from "../task-tracker/TaskModal";
  import { getDateUID } from "obsidian-daily-notes-interface";
  import {
    tasksToEvents,
  } from "./scheduleUtils";

  export let plugin: CalendarPlugin;

  let calendarEl: HTMLDivElement;
  let calendar: Calendar;
  let refetchTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  // Мобильное определение — начальный вид зависит от ширины экрана
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;
  const isSmallPhone = typeof window !== "undefined" && window.innerWidth <= 480;

  // Touch/swipe state
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;
  let isSwiping = false;
  const SWIPE_THRESHOLD = 50;
  const SWIPE_MAX_Y_DEVIATION = 100;

  /** Debounced refetch — предотвращает каскадное обновление */
  function scheduleRefetch(): void {
    if (destroyed) return;
    if (refetchTimer) clearTimeout(refetchTimer);
    refetchTimer = setTimeout(() => {
      refetchTimer = null;
      if (!destroyed && calendar) {
        calendar.refetchEvents();
      }
    }, 150);
  }

  // Подписываемся и на tasks, и на projects
  const unsubTasks = tasks.subscribe(() => scheduleRefetch());
  const unsubProjects = projects.subscribe(() => scheduleRefetch());

  // Обработчик ресайза — переключаем вид при переходе через брейкпоинт
  let lastWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  function handleResize(): void {
    if (destroyed || !calendar) return;
    const w = window.innerWidth;
    const crossed =
      (lastWidth > 480 && w <= 480) ||
      (lastWidth <= 480 && w > 480) ||
      (lastWidth > 768 && w <= 768) ||
      (lastWidth <= 768 && w > 768);
    lastWidth = w;
    if (crossed) {
      const newView = w <= 480 ? "timeGridDay" : w <= 768 ? "timeGridWeek" : "timeGridWeek";
      if (calendar.view.type !== newView) {
        calendar.changeView(newView);
      }
    }
  }

  onMount(() => {
    initCalendar();
    setupTouchNavigation();
    window.addEventListener("resize", handleResize);
  });

  onDestroy(() => {
    destroyed = true;
    if (refetchTimer) clearTimeout(refetchTimer);
    unsubTasks();
    unsubProjects();
    window.removeEventListener("resize", handleResize);
    if (calendarEl) {
      calendarEl.removeEventListener("touchstart", handleTouchStart);
      calendarEl.removeEventListener("touchmove", handleTouchMove);
      calendarEl.removeEventListener("touchend", handleTouchEnd);
    }
    if (calendar) {
      calendar.destroy();
      calendar = null;
    }
  });

  function setupTouchNavigation(): void {
    if (!calendarEl) return;

    calendarEl.addEventListener("touchstart", handleTouchStart, { passive: true });
    calendarEl.addEventListener("touchmove", handleTouchMove, { passive: true });
    calendarEl.addEventListener("touchend", handleTouchEnd, { passive: true });
  }

  function handleTouchStart(e: TouchEvent): void {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isSwiping = false;
  }

  function handleTouchMove(e: TouchEvent): void {
    touchEndX = e.touches[0].clientX;
    touchEndY = e.touches[0].clientY;

    const dx = Math.abs(touchEndX - touchStartX);
    const dy = Math.abs(touchEndY - touchStartY);

    if (dx > 20 && dx > dy && dy < SWIPE_MAX_Y_DEVIATION) {
      isSwiping = true;
    }
  }

  function handleTouchEnd(): void {
    if (!isSwiping || !calendar) return;

    const dx = touchEndX - touchStartX;

    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      if (dx > 0) {
        calendar.prev();
      } else {
        calendar.next();
      }
    }

    isSwiping = false;
  }

  function initCalendar(): void {
    // На мобилке начальный вид — день, на десктопе — неделя
    const initialView = isSmallPhone ? "timeGridDay" : isMobile ? "timeGridWeek" : "timeGridWeek";

    // На телефоне упрощаем тулбар: стрелки + сегодня слева, переключение вида справа
    const headerToolbar = isSmallPhone
      ? { left: "prev,next", center: "title", right: "today" }
      : isMobile
        ? { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }
        : { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" };

    calendar = new Calendar(calendarEl, {
      plugins: [
        dayGridPlugin,
        timeGridPlugin,
        interactionPlugin,
        luxonPlugin,
      ],
      initialView,
      locale: "ru",
      headerToolbar,
      buttonText: {
        today: "Сегодня",
        month: "Месяц",
        week: "Неделя",
        day: "День",
      },
      slotMinTime: "06:00:00",
      slotMaxTime: "24:00:00",
      allDaySlot: false,
      // На телефоне слот 15 минут — удобнее для выбора времени тапом
      slotDuration: isSmallPhone ? "00:15:00" : "00:30:00",
      slotLabelInterval: "01:00",
      // На мобилке отключаем drag-and-drop — свайп используется для навигации
      editable: !isMobile,
      selectable: true,
      selectMirror: true,
      dayMaxEvents: true,
      weekends: true,
      firstDay: 1,
      height: "100%",
      nowIndicator: true,
      // На телефоне — list view по умолчанию не используем
      views: isSmallPhone ? {
        timeGridDay: { titleFormat: { day: "numeric", month: "short" } },
        timeGridWeek: { titleFormat: { day: "numeric", month: "short" } },
      } : {},
      eventSources: [
        {
          events: fetchEvents,
          id: "task-source",
        },
      ],
      eventContent: renderEventContent,
      eventClick: handleEventClick,
      eventDrop: handleEventDrop,
      eventResize: handleEventResize,
      select: handleSelect,
    });

    calendar.render();
  }

  function fetchEvents(
    _fetchInfo: { start: Date; end: Date },
    successCallback: (events: any[]) => void
  ): void {
    try {
      const allTasks = get(tasks);
      const allProjects = get(projects);
      const events = tasksToEvents(allTasks, allProjects);
      successCallback(events);
    } catch (e) {
      console.error("[ScheduleCalendar] fetchEvents error:", e);
      successCallback([]);
    }
  }

  function renderEventContent(eventInfo: any) {
    const { time, event } = eventInfo;
    const task = event.extendedProps.task as ITask;
    const mobile = isMobile;

    const statusLabel =
      task.status === "progress" ? "В работе" :
      task.status === "done" ? "Готово" : "";
    const priorityBadge =
      task.priority === "high" ? '<span class="sch-priority sch-priority-high">!</span>' :
      task.priority === "medium" ? '<span class="sch-priority sch-priority-mid">~</span>' : "";
    const noteIcon = task.notePath && !mobile
      ? '<span class="sch-note-icon" title="Заметка-задача">&#128221;</span>' : "";
    const durationLabel = task.estimatedTime && !mobile
      ? `<span class="sch-duration">${task.estimatedTime >= 60 ? Math.floor(task.estimatedTime / 60) + 'ч ' + (task.estimatedTime % 60 > 0 ? (task.estimatedTime % 60) + 'м' : '') : task.estimatedTime + 'м'}</span>` : "";

    return {
      html: `
        <div class="sch-event">
          <div class="sch-event-header">
            ${priorityBadge}
            <span class="sch-event-title">${event.title}</span>
            ${noteIcon}
          </div>
          ${!mobile ? `
          <div class="sch-event-meta">
            ${time ? `<span class="sch-event-time">${time}</span>` : ""}
            ${statusLabel ? `<span class="sch-event-status sch-status-${task.status}">${statusLabel}</span>` : ""}
            ${durationLabel}
          </div>
          ` : ''}
        </div>
      `,
    };
  }

  function handleEventClick(info: any): void {
    const task = info.event.extendedProps.task as ITask;
    openTaskEditor(task);
  }

  function handleEventDrop(info: any): void {
    const task = info.event.extendedProps.task as ITask;
    const newStart = info.event.start as Date;

    if (newStart) {
      const year = newStart.getFullYear();
      const month = String(newStart.getMonth() + 1).padStart(2, "0");
      const day = String(newStart.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      const hours = String(newStart.getHours()).padStart(2, "0");
      const minutes = String(newStart.getMinutes()).padStart(2, "0");
      const newTime = `${hours}:${minutes}`;

      const moment = window.moment(dateStr, "YYYY-MM-DD", true);
      if (moment.isValid()) {
        const newDateUID = getDateUID(moment, "day");
        updateTask(task.id, {
          dateUID: newDateUID,
          scheduledTime: newTime,
        });
      }
    }
  }

  function handleEventResize(info: any): void {
    const task = info.event.extendedProps.task as ITask;
    const start = info.event.start as Date;
    const end = info.event.end as Date;

    if (start && end) {
      const durationMin = Math.round(
        (end.getTime() - start.getTime()) / 1000 / 60
      );
      updateTask(task.id, {
        estimatedTime: Math.max(15, durationMin),
      });
    }
  }

  function handleSelect(info: any): void {
    const start = info.start as Date;

    if (start) {
      const year = start.getFullYear();
      const month = String(start.getMonth() + 1).padStart(2, "0");
      const day = String(start.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      const hours = String(start.getHours()).padStart(2, "0");
      const minutes = String(start.getMinutes()).padStart(2, "0");
      const timeStr = `${hours}:${minutes}`;

      openTaskCreator(dateStr, timeStr);
    }

    calendar.unselect();
  }

  function openTaskEditor(task: ITask): void {
    new TaskModal(plugin.app, (updates) => {
      updateTask(task.id, updates);
    }, task).open();
  }

  function openTaskCreator(dateStr: string, timeStr: string): void {
    const moment = window.moment(dateStr, "YYYY-MM-DD", true);
    if (!moment.isValid()) return;

    const dateUID = getDateUID(moment, "day");

    new TaskModal(plugin.app, (data) => {
      addTask({
        title: data.title || "Новая задача",
        completed: false,
        status: "todo",
        dateUID: data.dateUID || dateUID,
        projectId: data.projectId || null,
        notePath: (data as any).notePath || null,
        priority: data.priority || "medium",
        tags: [],
        sortOrder: 0,
        description: data.description,
        recurrence: data.recurrence,
        estimatedTime: data.estimatedTime,
        scheduledTime: data.scheduledTime || timeStr,
      });
    }).open();
  }

  export function refresh(): void {
    scheduleRefetch();
  }
</script>

<div class="schedule-calendar-wrapper">
  {#if isSwiping}
    <div class="swipe-indicator" class:swipe-left={touchEndX < touchStartX} class:swipe-right={touchEndX > touchStartX}>
      <span class="swipe-arrow">{touchEndX < touchStartX ? '&#8250;' : '&#8249;'}</span>
    </div>
  {/if}
  <div bind:this={calendarEl} class="schedule-calendar"></div>
</div>

<style>
  .schedule-calendar-wrapper {
    height: 100%;
    width: 100%;
    position: relative;
    overflow: hidden;
  }

  .schedule-calendar {
    height: 100%;
    width: 100%;
    touch-action: pan-y pinch-zoom;
  }

  .swipe-indicator {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 100;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
    animation: swipeHint 0.3s ease;
  }

  .swipe-indicator.swipe-left {
    right: 8px;
  }

  .swipe-indicator.swipe-right {
    left: 8px;
  }

  .swipe-arrow {
    font-size: 24px;
    color: var(--mcp-accent, rgba(95, 153, 225, 0.8));
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  @keyframes swipeHint {
    0% { opacity: 0; transform: translateY(-50%) scale(0.8); }
    50% { opacity: 0.8; }
    100% { opacity: 0; transform: translateY(-50%) scale(1); }
  }
  .schedule-calendar {
    height: 100%;
    width: 100%;
  }

  /* ===== FullCalendar — Glassmorphism тема ===== */

  :global(.fc) {
    height: 100%;
    font-family: var(--font-interface);
    --fc-border-color: rgba(255, 255, 255, 0.06);
    --fc-today-bg-color: transparent;
    --fc-page-bg-color: transparent;
    --fc-neutral-bg-color: rgba(255, 255, 255, 0.03);
    --fc-list-event-hover-bg-color: rgba(255, 255, 255, 0.04);
    --fc-event-border-color: transparent;
  }

  /* Контейнер расписания — стеклянная панель */
  :global(.schedule-view-container) {
    height: 100%;
    overflow: hidden;
    background: var(--mcp-glass-bg, rgba(35, 40, 55, 0.4));
    backdrop-filter: var(--mcp-blur, blur(20px));
    -webkit-backdrop-filter: var(--mcp-blur, blur(20px));
    border: 1px solid var(--mcp-glass-border, rgba(255, 255, 255, 0.06));
    border-radius: var(--mcp-radius, 14px);
    box-shadow: var(--mcp-shadow, 0 8px 32px rgba(0, 0, 0, 0.15)),
                var(--mcp-shadow-glow, 0 0 40px rgba(80, 170, 210, 0.06));
  }

  /* Тулбар — стекло */
  :global(.fc .fc-toolbar) {
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: var(--mcp-radius-sm, 10px);
    margin: 8px 8px 0;
  }

  :global(.fc .fc-toolbar-title) {
    color: var(--mcp-text, var(--text-normal));
    font-size: 1.15em;
    font-weight: 600;
  }

  :global(.fc .fc-button) {
    background: rgba(255, 255, 255, 0.05);
    color: var(--mcp-text, var(--text-normal));
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--mcp-radius-sm, 10px);
    font-size: 0.82em;
    padding: 5px 14px;
    transition: all var(--mcp-transition, 0.3s cubic-bezier(0.4, 0, 0.2, 1));
    font-weight: 500;
  }

  :global(.fc .fc-button:hover) {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.12);
  }

  :global(.fc .fc-button-active) {
    background: var(--mcp-accent, rgba(95, 153, 225, 0.48)) !important;
    color: var(--mcp-text, var(--text-normal)) !important;
    border-color: rgba(95, 153, 225, 0.3) !important;
    box-shadow: 0 0 12px rgba(95, 153, 225, 0.15);
  }

  :global(.fc .fc-button:disabled) {
    background: rgba(255, 255, 255, 0.02);
    color: var(--mcp-text-faint, rgba(200, 210, 220, 0.25));
    border-color: transparent;
  }

  /* Сетка — полупрозрачные линии */
  :global(.fc .fc-scrollgrid) {
    border-color: rgba(255, 255, 255, 0.04);
  }

  :global(.fc td),
  :global(.fc th) {
    border-color: rgba(255, 255, 255, 0.04);
  }

  :global(.fc .fc-col-header-cell) {
    background: rgba(255, 255, 255, 0.02);
  }

  :global(.fc .fc-col-header-cell-cushion) {
    color: var(--mcp-text-muted, var(--text-muted));
    padding: 8px 0;
    font-weight: 500;
    font-size: 0.85em;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  :global(.fc .fc-timegrid-axis-cushion),
  :global(.fc .fc-timegrid-slot-label-cushion) {
    color: var(--mcp-text-faint, var(--text-faint));
    font-size: 10px;
    font-weight: 400;
  }

  :global(.fc .fc-daygrid-day-number) {
    color: var(--mcp-text, var(--text-normal));
    padding: 4px 8px;
    font-size: 0.85em;
  }

  /* Сегодня — без заливки, только бордер */
  :global(.fc .fc-day-today) {
    background: transparent !important;
    box-shadow: inset 0 0 0 1.5px var(--mcp-accent, rgba(95, 153, 225, 0.48));
    border-radius: 6px;
  }

  :global(.fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number) {
    color: var(--mcp-accent, rgba(95, 153, 225, 0.48));
    font-weight: 700;
  }

  /* Сегодня в timegrid — бордер колонки */
  :global(.fc .fc-timegrid .fc-day-today) {
    box-shadow: inset 0 0 0 1.5px var(--mcp-accent, rgba(95, 153, 225, 0.48));
  }

  /* Now indicator */
  :global(.fc .fc-timegrid-now-indicator-line) {
    border-color: var(--mcp-accent, rgba(95, 153, 225, 0.48));
  }

  :global(.fc .fc-timegrid-now-indicator-arrow) {
    border-color: var(--mcp-accent, rgba(95, 153, 225, 0.48));
  }

  :global(.fc .fc-timegrid-now-indicator-container) {
    overflow: visible;
  }

  :global(.fc .fc-timegrid-now-indicator-now) {
    color: var(--mcp-accent, rgba(95, 153, 225, 0.48));
    font-weight: 600;
    font-size: 10px;
  }

  /* Выделение */
  :global(.fc .fc-highlight) {
    background: rgba(95, 153, 225, 0.08);
    border-radius: 4px;
  }

  :global(.fc .fc-daygrid-more-link) {
    color: var(--mcp-text-muted, var(--text-muted));
    font-size: 11px;
  }

  /* ===== Glassmorphism события ===== */

  :global(.fc .fc-event) {
    cursor: pointer;
    border: none !important;
    border-radius: 8px !important;
    border-left: 3px solid !important;
    border-left-style: solid !important;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  }

  :global(.fc .fc-timegrid-event) {
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  :global(.fc .fc-event:hover) {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    filter: brightness(1.15);
  }

  :global(.fc .fc-event-main) {
    border-radius: 8px;
    overflow: hidden;
  }

  /* ===== Кастомный контент события ===== */

  :global(.sch-event) {
    padding: 4px 8px;
    line-height: 1.35;
    min-width: 0;
  }

  :global(.sch-event-header) {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  :global(.sch-event-title) {
    font-size: 11.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--mcp-text, var(--text-normal));
  }

  :global(.sch-priority) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 700;
    flex-shrink: 0;
  }

  :global(.sch-priority-high) {
    background: rgba(220, 150, 150, 0.35);
    color: rgba(240, 170, 170, 0.95);
  }

  :global(.sch-priority-mid) {
    background: rgba(220, 190, 130, 0.25);
    color: rgba(230, 210, 150, 0.85);
  }

  :global(.sch-note-icon) {
    font-size: 10px;
    opacity: 0.6;
    flex-shrink: 0;
  }

  :global(.sch-event-meta) {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 1px;
    flex-wrap: wrap;
  }

  :global(.sch-event-time) {
    font-size: 10px;
    color: var(--mcp-text-muted, rgba(200, 210, 220, 0.5));
    font-weight: 500;
  }

  :global(.sch-event-status) {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 4px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  :global(.sch-status-todo) {
    background: rgba(140, 160, 190, 0.15);
    color: rgba(180, 195, 215, 0.8);
  }

  :global(.sch-status-progress) {
    background: rgba(214, 178, 108, 0.15);
    color: rgba(225, 195, 130, 0.85);
  }

  :global(.sch-status-done) {
    background: rgba(110, 190, 160, 0.12);
    color: rgba(140, 205, 175, 0.75);
  }

  :global(.sch-duration) {
    font-size: 9px;
    color: var(--mcp-text-faint, rgba(200, 210, 220, 0.25));
  }

  /* ===== List view ===== */

  :global(.fc .fc-list-event:hover td) {
    background-color: rgba(255, 255, 255, 0.03);
  }

  :global(.fc .fc-list-event-title a) {
    color: var(--mcp-text, var(--text-normal));
  }

  :global(.fc .fc-list-event-time a) {
    color: var(--mcp-text-muted, var(--text-muted));
  }

  /* ===== Header / day cells ===== */

  :global(.fc .fc-day-header) {
    background: rgba(255, 255, 255, 0.02);
  }

  :global(.fc .fc-timegrid-header) {
    border-bottom-color: rgba(255, 255, 255, 0.04);
  }

  /* ===== Мобильная адаптация — планшет (≤768px) ===== */
  @media (max-width: 768px) {
    /* Контейнер — убираем скругления и тени на мобилке */
    :global(.schedule-view-container) {
      border-radius: 0;
      border: none;
      box-shadow: none;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      background: transparent;
    }

    /* Тулбар — двухстрочный, компактный */
    :global(.fc .fc-toolbar) {
      flex-wrap: wrap;
      gap: 4px;
      padding: 6px 8px;
      margin: 4px 4px 0;
    }

    :global(.fc .fc-toolbar-title) {
      font-size: 13px;
      order: -1;
      width: 100%;
      text-align: center;
      margin-bottom: 2px;
      font-weight: 700;
    }

    :global(.fc .fc-toolbar-chunk) {
      display: flex;
      gap: 4px;
      min-height: 36px;
    }

    :global(.fc .fc-toolbar-chunk:last-child) {
      margin-left: auto;
    }

    :global(.fc .fc-button) {
      font-size: 11px;
      padding: 6px 10px;
      min-height: 36px;
      min-width: 40px;
      border-radius: 8px;
    }

    :global(.fc .fc-today-button) {
      min-width: 56px;
    }

    :global(.fc .fc-col-header-cell-cushion) {
      font-size: 10.5px;
      padding: 6px 0;
      text-transform: none;
      letter-spacing: 0;
    }

    :global(.fc .fc-timegrid-slot-label-cushion) {
      font-size: 9.5px;
    }

    /* События — компактнее */
    :global(.sch-event) {
      padding: 3px 6px;
    }

    :global(.sch-event-title) {
      font-size: 11px;
    }

    :global(.sch-event-meta) {
      gap: 4px;
    }

    :global(.sch-event-status) {
      font-size: 8.5px;
      padding: 1px 4px;
    }

    :global(.sch-priority) {
      width: 13px;
      height: 13px;
      font-size: 8.5px;
    }

    /* Touch scroll */
    :global(.fc .fc-scrollgrid) {
      -webkit-overflow-scrolling: touch;
    }

    :global(.fc .fc-timegrid-body) {
      min-height: 400px;
    }
  }

  /* ===== Телефон (≤480px) ===== */
  @media (max-width: 480px) {
    :global(.fc .fc-toolbar) {
      padding: 4px 6px;
      margin: 2px 2px 0;
      gap: 3px;
    }

    :global(.fc .fc-toolbar-title) {
      font-size: 12px;
    }

    :global(.fc .fc-button) {
      font-size: 10px;
      padding: 6px 8px;
      min-height: 36px;
      min-width: 36px;
      border-radius: 7px;
    }

    :global(.fc .fc-button-active) {
      box-shadow: 0 0 8px rgba(95, 153, 225, 0.2);
    }

    /* Заголовки дней — компактные */
    :global(.fc .fc-col-header-cell-cushion) {
      font-size: 9.5px;
      padding: 5px 0;
    }

    :global(.fc .fc-daygrid-day-number) {
      font-size: 11px;
      padding: 3px 5px;
    }

    /* Сетка времени — увеличенные слоты для тапа */
    :global(.fc .fc-timegrid-slot) {
      height: 40px;
    }

    :global(.fc .fc-timegrid-axis-cushion),
    :global(.fc .fc-timegrid-slot-label-cushion) {
      font-size: 9px;
      padding-right: 2px;
    }

    /* Боковая ось — уже */
    :global(.fc .fc-timegrid-axis) {
      width: 30px;
    }

    /* События — крупные тап-таргеты */
    :global(.fc .fc-event) {
      border-radius: 6px !important;
      min-height: 28px;
    }

    :global(.fc .fc-timegrid-event) {
      border-left-width: 2.5px !important;
    }

    :global(.sch-event) {
      padding: 2px 5px;
      line-height: 1.3;
    }

    :global(.sch-event-header) {
      gap: 3px;
    }

    :global(.sch-event-title) {
      font-size: 10.5px;
      font-weight: 600;
    }

    :global(.sch-event-meta) {
      gap: 3px;
      margin-top: 0;
    }

    :global(.sch-event-time) {
      font-size: 9px;
    }

    :global(.sch-event-status) {
      font-size: 8px;
      padding: 0.5px 3px;
      border-radius: 3px;
    }

    :global(.sch-priority) {
      width: 12px;
      height: 12px;
      font-size: 8px;
      border-radius: 3px;
    }

    :global(.sch-note-icon) {
      font-size: 9px;
    }

    :global(.sch-duration) {
      font-size: 8px;
    }

    /* Скрываем мету в timegrid — экономим место */
    :global(.fc .fc-timegrid-event .sch-event-meta) {
      display: none;
    }

    :global(.fc .fc-timegrid-event .sch-event) {
      padding: 2px 5px;
    }

    /* Now indicator — заметнее */
    :global(.fc .fc-timegrid-now-indicator-line) {
      border-width: 2px;
    }

    :global(.fc .fc-timegrid-now-indicator-arrow) {
      border-width: 2px;
    }

    :global(.fc .fc-timegrid-now-indicator-now) {
      display: none;
    }

    /* Выделение при тапе */
    :global(.fc .fc-highlight) {
      background: rgba(95, 153, 225, 0.12);
      border-radius: 4px;
    }

    /* Day grid — крупные ячейки */
    :global(.fc .fc-daygrid-day) {
      min-height: 44px;
    }

    :global(.fc .fc-daygrid-more-link) {
      font-size: 10px;
      padding: 2px 4px;
    }

    /* List view */
    :global(.fc .fc-list-event-title a) {
      font-size: 12px;
    }

    :global(.fc .fc-list-event-time a) {
      font-size: 10.5px;
    }

    :global(.fc .fc-list-day-cushion) {
      padding: 4px 8px;
    }

    /* Горизонтальный скролл timegrid — если колонки не помещаются */
    :global(.fc .fc-timegrid-scroll) {
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
    }

    /* Месяц на маленьком экране — ещё компактнее */
    :global(.fc .fc-daygrid-day) {
      min-height: 40px;
    }

    :global(.fc .fc-daygrid-event) {
      font-size: 9px;
      margin: 1px 1px;
      padding: 1px 3px;
    }

    :global(.fc .fc-daygrid-event .sch-event-title) {
      font-size: 9px;
    }

    :global(.fc .fc-daygrid-more-link) {
      font-size: 8px;
    }
  }

  /* ===== Мобильная сетка месяца (dayGridMonth) ===== */
  @media (max-width: 768px) {
    /* Сетка месяца — полная 7x5/7x6 сетка */
    :global(.fc .fc-daygrid) {
      min-height: 280px;
    }

    :global(.fc .fc-daygrid-day) {
      min-height: 42px;
      padding: 2px;
    }

    :global(.fc .fc-daygrid-day-number) {
      font-size: 12px;
      padding: 3px 6px;
      min-width: 24px;
      text-align: center;
    }

    /* События в ячейках месяца — компактные полоски */
    :global(.fc .fc-daygrid-event) {
      margin: 1px 2px;
      padding: 1px 4px;
      font-size: 10px;
      border-radius: 3px;
      border-left-width: 2px !important;
      line-height: 1.3;
    }

    :global(.fc .fc-daygrid-event .sch-event) {
      padding: 1px 3px;
      line-height: 1.25;
    }

    :global(.fc .fc-daygrid-event .sch-event-title) {
      font-size: 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    :global(.fc .fc-daygrid-event .sch-priority) {
      width: 10px;
      height: 10px;
      font-size: 7px;
    }

    :global(.fc .fc-daygrid-more-link) {
      font-size: 9px;
      padding: 1px 4px;
      color: var(--mcp-accent, rgba(95, 153, 225, 0.7));
    }

    /* Заголовки дней месяца */
    :global(.fc .fc-col-header-cell-cushion) {
      font-size: 10px;
      padding: 5px 0;
    }

    /* Скрываем "весь день" слот в timegrid на мобилке */
    :global(.fc .fc-timegrid .fc-day-today) {
      background: rgba(95, 153, 225, 0.04) !important;
    }
  }

  /* ===== Маленький телефон (≤360px) ===== */
  @media (max-width: 360px) {
    :global(.fc .fc-toolbar-title) {
      font-size: 11px;
    }

    :global(.fc .fc-button) {
      font-size: 9.5px;
      padding: 5px 6px;
      min-height: 34px;
    }

    :global(.fc .fc-col-header-cell-cushion) {
      font-size: 9px;
    }

    :global(.fc .fc-timegrid-slot) {
      height: 36px;
    }

    :global(.fc .fc-timegrid-axis) {
      width: 26px;
    }

    :global(.fc .fc-timegrid-axis-cushion) {
      font-size: 8px;
    }

    :global(.sch-event-title) {
      font-size: 10px;
    }

    :global(.fc .fc-daygrid-day-number) {
      font-size: 10px;
      padding: 2px 4px;
    }

    /* Месяц — минимальные ячейки */
    :global(.fc .fc-daygrid-day) {
      min-height: 36px;
    }

    :global(.fc .fc-daygrid-event) {
      font-size: 8px;
      padding: 1px 2px;
      margin: 0 1px;
    }

    :global(.fc .fc-daygrid-event .sch-event-title) {
      font-size: 8px;
    }

    :global(.fc .fc-daygrid-event .sch-priority) {
      display: none;
    }

    :global(.fc .fc-daygrid-more-link) {
      font-size: 7px;
      padding: 0 2px;
    }

    /* TimeGrid — ещё компактнее */
    :global(.fc .fc-timegrid-slot) {
      height: 34px;
    }

    :global(.fc .fc-timegrid-axis) {
      width: 24px;
    }

    :global(.fc .fc-timegrid-axis-cushion),
    :global(.fc .fc-timegrid-slot-label-cushion) {
      font-size: 8px;
    }

    :global(.fc .fc-timegrid-event) {
      min-height: 26px;
    }

    :global(.sch-event) {
      padding: 1px 4px;
    }

    :global(.sch-event-title) {
      font-size: 9.5px;
    }
  }

  /* ===== Альбомная ориентация ===== */
  @media (max-width: 768px) and (orientation: landscape) {
    :global(.fc .fc-toolbar) {
      flex-direction: row;
      flex-wrap: nowrap;
      gap: 6px;
      align-items: center;
    }

    :global(.fc .fc-toolbar-title) {
      width: auto;
      order: 0;
      font-size: 12px;
    }

    :global(.fc .fc-timegrid-slot) {
      height: 32px;
    }

    :global(.sch-event) {
      padding: 2px 5px;
    }
  }

  /* ===== Touch-устройства — улучшенные тап-таргеты ===== */
  @media (hover: none) and (pointer: coarse) {
    :global(.fc .fc-button) {
      min-height: 40px;
      min-width: 40px;
    }

    :global(.fc .fc-event) {
      min-height: 32px;
    }

    :global(.fc .fc-daygrid-day) {
      min-height: 44px;
    }

    :global(.fc .fc-daygrid-more-link) {
      padding: 4px 8px;
    }

    /* Убираем hover-эффекты на тач */
    :global(.fc .fc-event:hover) {
      transform: none;
      filter: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }

    /* Увеличиваем область тапа на заголовки дней */
    :global(.fc .fc-col-header-cell) {
      padding: 4px 0;
    }

    :global(.fc .fc-col-header-cell-cushion) {
      padding: 6px 0;
    }

    /* Увеличиваем тап-таргеты для месячного вида */
    :global(.fc .fc-daygrid-day) {
      min-height: 48px;
    }

    :global(.fc .fc-daygrid-event) {
      min-height: 20px;
      padding: 2px 4px;
    }

    /* Увеличиваем слоты времени для удобного тапа */
    :global(.fc .fc-timegrid-slot) {
      min-height: 44px;
    }

    /* Увеличиваем кнопки навигации */
    :global(.fc .fc-prev-button),
    :global(.fc .fc-next-button),
    :global(.fc .fc-today-button) {
      min-height: 44px;
      min-width: 44px;
    }
  }

  /* ===== Safe area (iOS notch / home indicator) ===== */
  @supports (padding: env(safe-area-inset-bottom)) {
    :global(.schedule-view-container) {
      padding-bottom: env(safe-area-inset-bottom);
    }

    :global(.fc .fc-toolbar) {
      padding-top: calc(6px + env(safe-area-inset-top));
    }
  }
</style>
