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

  onMount(() => {
    initCalendar();
  });

  onDestroy(() => {
    destroyed = true;
    if (refetchTimer) clearTimeout(refetchTimer);
    unsubTasks();
    unsubProjects();
    if (calendar) {
      calendar.destroy();
      calendar = null;
    }
  });

  function initCalendar(): void {
    calendar = new Calendar(calendarEl, {
      plugins: [
        dayGridPlugin,
        timeGridPlugin,
        interactionPlugin,
        luxonPlugin,
      ],
      initialView: "timeGridWeek",
      locale: "ru",
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay",
      },
      buttonText: {
        today: "Сегодня",
        month: "Месяц",
        week: "Неделя",
        day: "День",
      },
      slotMinTime: "06:00:00",
      slotMaxTime: "23:00:00",
      allDaySlot: false,
      slotDuration: "00:30:00",
      slotLabelInterval: "01:00",
      editable: true,
      selectable: true,
      selectMirror: true,
      dayMaxEvents: true,
      weekends: true,
      firstDay: 1,
      height: "100%",
      nowIndicator: true,
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

    const statusLabel =
      task.status === "progress" ? "В работе" :
      task.status === "done" ? "Готово" : "";
    const priorityBadge =
      task.priority === "high" ? '<span class="sch-priority sch-priority-high">!</span>' :
      task.priority === "medium" ? '<span class="sch-priority sch-priority-mid">~</span>' : "";
    const noteIcon = task.notePath
      ? '<span class="sch-note-icon" title="Заметка-задача">&#128221;</span>' : "";
    const durationLabel = task.estimatedTime
      ? `<span class="sch-duration">${task.estimatedTime}м</span>` : "";

    return {
      html: `
        <div class="sch-event">
          <div class="sch-event-header">
            ${priorityBadge}
            <span class="sch-event-title">${event.title}</span>
            ${noteIcon}
          </div>
          <div class="sch-event-meta">
            ${time ? `<span class="sch-event-time">${time}</span>` : ""}
            ${statusLabel ? `<span class="sch-event-status sch-status-${task.status}">${statusLabel}</span>` : ""}
            ${durationLabel}
          </div>
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

<div bind:this={calendarEl} class="schedule-calendar"></div>

<style>
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

  /* ===== Мобильная адаптация ===== */
  @media (max-width: 768px) {
    :global(.fc .fc-toolbar) {
      flex-direction: column;
      gap: 6px;
    }

    :global(.fc .fc-toolbar-title) {
      font-size: 14px;
    }

    :global(.fc .fc-button) {
      font-size: 11px;
      padding: 4px 8px;
    }

    :global(.fc .fc-timegrid-slot-label-cushion) {
      font-size: 9px;
    }

    :global(.fc .fc-col-header-cell-cushion) {
      font-size: 10px;
    }

    :global(.sch-event-title) {
      font-size: 10.5px;
    }

    :global(.sch-event-meta) {
      gap: 4px;
    }

    :global(.sch-event-status) {
      font-size: 8px;
    }
  }

  @media (max-width: 480px) {
    :global(.fc .fc-timegrid-axis-cushion) {
      font-size: 8px;
    }

    :global(.fc .fc-timegrid-slot-label-cushion) {
      font-size: 8px;
    }
  }
</style>
