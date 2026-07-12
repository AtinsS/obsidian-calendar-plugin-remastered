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
    updateTaskStatus,
    removeTask,
    addTask,
  } from "../task-tracker/stores";
  import { createNoteTask, deleteNoteTask, archiveNoteTask } from "../task-tracker/noteTasks";
  import { TaskModal } from "../task-tracker/TaskModal";
  import { getDateUID } from "obsidian-daily-notes-interface";
  import { settings } from "../ui/stores";
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
      // Only auto-switch from time-based views; respect user's month view choice
      const currentType = calendar.view.type;
      if (currentType === "dayGridMonth") return;
      const newView = w <= 480 ? "timeGridDay" : "timeGridWeek";
      if (currentType !== newView) {
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
    closeContextMenu(); // убираем контекстное меню из document.body
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

    // На телефоне упрощаем тулбар: стрелки + сегодня + переключение вида
    const headerToolbar = isSmallPhone
      ? { left: "prev,next", center: "title", right: "today,dayGridMonth,timeGridWeek,timeGridDay" }
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
      slotMaxTime: "30:00:00",
      allDaySlot: true,
      allDayText: "Без времени",
      // На телефоне слот 15 минут — удобнее для выбора времени тапом
      slotDuration: isSmallPhone ? "00:15:00" : "00:30:00",
      slotLabelInterval: "01:00",
      // На мобилке отключаем drag-and-drop — свайп используется для навигации
      editable: !isMobile,
      selectable: true,
      selectMirror: true,
      select: handleCalendarSelect,
      dayMaxEvents: true,
      weekends: true,
      firstDay: 1,
      height: "100%",
      nowIndicator: true,
      // На телефоне — list view по умолчанию не используем
      views: isSmallPhone ? {
        timeGridDay: { titleFormat: { day: "numeric", month: "short" }, buttonText: "День" },
        timeGridWeek: { titleFormat: { day: "numeric", month: "short" }, buttonText: "Неделя" },
        dayGridMonth: { titleFormat: { month: "long", year: "numeric" }, buttonText: "Месяц" },
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
      eventDidMount: handleEventDidMount,
      eventDragStart: handleEventDragStart,
      eventDragStop: handleEventDragStop,
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

  /** FullCalendar v6 + luxon3 не сохраняет complex objects в extendedProps.
   *  Ищем task по ID из store — это гарантированно работает. */
  function resolveTask(event: any): ITask | null {
    const fromProps = event.extendedProps?.task as ITask | undefined;
    if (fromProps) return fromProps;
    const taskId = event.extendedProps?.taskId || event.id;
    if (!taskId) return null;
    return get(tasks).find((t) => t.id === taskId) || null;
  }

  function renderEventContent(eventInfo: any) {
    const { time, event } = eventInfo;
    const task = resolveTask(event);
    if (!task) {
      return { html: `<div class="sch-event sch-event-compact"><span class="sch-event-title">${event.title || "?"}</span></div>` };
    }
    const isDeadlineEvent = event.extendedProps?.isDeadlineEvent as boolean;

    if (isDeadlineEvent) {
      return {
        html: `
          <div class="sch-event sch-event-compact sch-event-deadline">
            <span class="sch-deadline-icon">&#9200;</span>
            <span class="sch-event-title">${event.title}</span>
          </div>
        `,
      };
    }

    const displayTime = time || (task.scheduledTime || "");
    const statusLabel =
      task.status === "progress" ? "В работе" :
      task.status === "paused" ? "На паузе" :
      task.status === "done" ? "Готово" : "";
    const statusHtml = statusLabel
      ? `<span class="sch-event-status sch-status-${task.status}">${statusLabel}</span>`
      : "";
    const priorityBadge =
      task.priority === "high" ? '<span class="sch-priority sch-priority-high">!</span>' :
      task.priority === "medium" ? '<span class="sch-priority sch-priority-mid">~</span>' : "";
    const workBadge = task.isWorkTask
      ? '<span class="sch-work-badge" title="Рабочая задача">&#128188;</span>' : "";
    const noteBadge = task.notePath
      ? task.isNoteTask
        ? '<span class="sch-note-badge" title="Задача-заметка">&#128221;</span>'
        : '<span class="sch-note-badge" title="С привязанной заметкой">&#128279;</span>'
      : "";

    let deadlineHtml = "";
    if (task.deadline && task.status !== "done") {
      const match = task.deadline.match(/^day-(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        const [, y, m, d] = match;
        const now = new Date();
        const dl = new Date(`${y}-${m}-${d}T00:00:00`);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diffDays = Math.round((dl.getTime() - today.getTime()) / 86400000);
        let dlLabel = "";
        if (diffDays < 0) dlLabel = `${Math.abs(diffDays)}д просрочено`;
        else if (diffDays === 0) dlLabel = "Сегодня";
        else if (diffDays === 1) dlLabel = "Завтра";
        else dlLabel = `${diffDays}д`;
        if (task.deadlineTime) dlLabel += ` ${task.deadlineTime}`;
        const isOverdue = diffDays < 0;
        deadlineHtml = `<span class="sch-deadline ${isOverdue ? 'sch-deadline-overdue' : ''}" title="Дедлайн">${dlLabel}</span>`;
      }
    }

    // Бейдж «Просрочено на N» — только todo (не в работе / на паузе / готово)
    let overdueHtml = "";
    if (task.status === "todo" && task.scheduledTime && task.dateUID) {
      const dateMatch = task.dateUID.match(/^day-(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        const [, dy, dm, dd] = dateMatch;
        const [sh, sm] = task.scheduledTime.split(":").map(Number);
        const scheduledStart = new Date(`${dy}-${dm}-${dd}T${String(sh).padStart(2,"0")}:${String(sm).padStart(2,"0")}:00`);
        const now = new Date();
        if (now.getTime() > scheduledStart.getTime()) {
          const diffMs = now.getTime() - scheduledStart.getTime();
          const diffMin = Math.floor(diffMs / 60000);
          const diffH = Math.floor(diffMin / 60);
          const diffD = Math.floor(diffH / 24);
          let overdueLabel = "";
          if (diffD > 0) overdueLabel = `${diffD}д ${diffH % 24}ч`;
          else if (diffH > 0) overdueLabel = `${diffH}ч ${diffMin % 60}м`;
          else overdueLabel = `${diffMin}м`;
          overdueHtml = `<span class="sch-overdue" title="Просрочено">⚠ ${overdueLabel}</span>`;
        }
      }
    }

    return {
      html: `
        <div class="sch-event sch-event-compact">
          ${displayTime ? `<span class="sch-event-time${overdueHtml ? ' sch-time-overdue' : ''}">${displayTime}</span>` : ""}
          <span class="sch-event-title">${event.title}</span>
          ${statusHtml}
          ${workBadge}
          ${noteBadge}
          ${priorityBadge}
          ${overdueHtml}
          ${deadlineHtml}
        </div>
      `,
    };
  }

  function handleEventDidMount(info: any): void {
    const el = info.el;
    const task = resolveTask(info.event);
    if (!task) return;
    const projectColor = info.event.extendedProps?.projectColor as string | null;
    const isDeadlineEvent = info.event.extendedProps?.isDeadlineEvent as boolean;

    if (isDeadlineEvent) {
      el.style.backgroundColor = "rgba(180, 60, 60, 0.85)";
      el.style.boxShadow = "inset 3px 0 0 #b43c3c";
      el.style.cursor = "default";
      el.style.pointerEvents = "none";
      const deadlineDateStr = info.event.start
        ? `${info.event.start.getFullYear()}-${String(info.event.start.getMonth()+1).padStart(2,"0")}-${String(info.event.start.getDate()).padStart(2,"0")}`
        : "";
      el.setAttribute("title", `Дедлайн задачи: ${task.title}\nДата: ${deadlineDateStr}${task.deadlineTime ? ' ' + task.deadlineTime : ''}`);
      return;
    }

    if (projectColor) {
      el.style.setProperty("--event-project-color", projectColor);
      el.style.backgroundColor = projectColor;
    }

    // Tooltip: full title + recurrence + estimated time
    const lines: string[] = [];
    lines.push(task.title);
    if (task.recurrence) {
      const recMap: Record<string, string> = { daily: "Ежедневно", weekly: "Еженедельно", monthly: "Ежемесячно" };
      let recText = `Повторение: ${recMap[task.recurrence.type] || task.recurrence.type}`;
      if (task.recurrence.until) {
        const untilDate = task.recurrence.until.replace(/^day-/, "");
        recText += ` (до ${untilDate})`;
      }
      lines.push(recText);
    }
    if (task.estimatedTime) {
      const h = Math.floor(task.estimatedTime / 60);
      const m = task.estimatedTime % 60;
      lines.push(`Ожидаемое: ${h > 0 ? h + 'ч ' : ''}${m > 0 ? m + 'м' : ''}`);
    }
    if (lines.length > 0) {
      el.setAttribute("title", lines.join("\n"));
    }
  }

  function handleEventClick(info: any): void {
    if (info.event.extendedProps?.isDeadlineEvent) return;
    const task = resolveTask(info.event);
    if (!task) return;

    const menuWidth = 220;
    const menuHeight = 260;
    let x = info.jsEvent?.clientX ?? 0;
    let y = info.jsEvent?.clientY ?? 0;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 8;
    }
    if (x < 8) x = 8;
    if (y + menuHeight > window.innerHeight) {
      y = Math.max(8, y - menuHeight - 4);
    }

    openContextMenu(task, x, y);
  }

  function handleCalendarSelect(info: any): void {
    if (!info.start || !calendar) return;

    const date = info.start as Date;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const timeStr = `${hours}:${minutes}`;
    const viewType = calendar.view?.type || "";
    const initialTime = viewType.startsWith("timeGrid") ? timeStr : undefined;

    calendar.unselect();
    openTaskCreator(dateStr, initialTime);
  }

  function handleEventDragStart(_info: any): void {
    // Reserved for future use
  }

  function handleEventDragStop(): void {
    // Reserved for future use
  }

  function handleEventDrop(info: any): void {
    if (info.event.extendedProps?.isDeadlineEvent) return;
    const task = resolveTask(info.event);
    if (!task) return;
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
          scheduledTime: info.event.allDay ? undefined : newTime,
        });
      }
    }
  }

  function handleEventResize(info: any): void {
    const task = resolveTask(info.event);
    if (!task) return;
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

  function openTaskEditor(task: ITask): void {
    new TaskModal(plugin.app, (updates) => {
      updateTask(task.id, updates);
    }, task).open();
  }

  async function deleteNoteFileIfNeeded(task: ITask): Promise<void> {
    if (!task.isNoteTask || !task.notePath) return;
    await deleteNoteTask(task.notePath, plugin.app);
  }

  async function archiveNoteIfCompleted(task: ITask, newStatus: "done" | "todo"): Promise<void> {
    if (newStatus !== "done" || !task.notePath || !task.isNoteTask) return;
    const archivePath = get(settings).archiveFolderPath || "Archive";
    const newPath = await archiveNoteTask(task.notePath, archivePath, plugin.app);
    if (newPath) {
      updateTask(task.id, { notePath: newPath });
    }
  }

  async function openTaskCreator(dateStr: string, timeStr?: string): Promise<void> {
    const moment = window.moment(dateStr, "YYYY-MM-DD", true);
    if (!moment.isValid()) return;

    const dateUID = getDateUID(moment, "day");

    // Определяем текущий вид: time-based (неделя/день) или месяц
    const viewType = calendar?.view?.type || "";
    const isTimeView = viewType.startsWith("timeGrid");
    const initialDate = dateStr;
    const initialTime = isTimeView ? timeStr : undefined;

    new TaskModal(plugin.app, async (data) => {
      const isNoteTask = !!data.isNoteTask;
      const task = addTask({
        title: data.title || "Новая задача",
        completed: false,
        status: "todo",
        dateUID: data.dateUID || dateUID,
        projectId: data.projectId || null,
        isNoteTask,
        notePath: isNoteTask ? null : (data as any).notePath || null,
        priority: data.priority || "medium",
        tags: [],
        sortOrder: 0,
        recurrence: data.recurrence,
        estimatedTime: data.estimatedTime,
        scheduledTime: data.scheduledTime || initialTime,
      });

      if (isNoteTask) {
        const project = get(projects).find((p) => p.id === data.projectId);
        try {
          const file = await createNoteTask(task, project, plugin.app, (data as any).notePath || undefined);
          if (file) {
            updateTask(task.id, { notePath: file.path });
          }
        } catch (error) {
          console.error("[ScheduleCalendar] failed to create note task:", error);
        }
      }

      if (!destroyed && calendar) {
        calendar.refetchEvents();
      }
    }, undefined, initialDate, initialTime).open();
  }

  // Контекстное меню задачи — рендерим в document.body,
  // чтобы position:fixed работал относительно viewport,
  // а не относительно schedule-view-container с backdrop-filter
  let contextMenuTask: ITask | null = null;
  let contextMenuEl: HTMLDivElement | null = null;

  function openContextMenu(task: ITask, x: number, y: number): void {
    closeContextMenu(); // убираем предыдущее, если есть
    contextMenuTask = task;

    // Создаём DOM-элемент в document.body, минуя backdrop-filter containing block
    const el = document.createElement("div");
    el.className = "sch-context-overlay";
    el.addEventListener("click", closeContextMenu);
    el.addEventListener("keydown", closeContextMenu);

    const menu = document.createElement("div");
    menu.className = "sch-context-menu";
    menu.style.position = "fixed";
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.zIndex = "9999";

    // Кнопки меню
    const items = [
      { label: "📝 Редактировать", action: () => contextEditTask() },
      ...(task.notePath
        ? [{ label: "📄 Открыть заметку", action: () => contextOpenNote() }, { divider: true }]
        : []),
      { label: "Перевести статус:", disabled: true },
      { label: "🟢 Сделать", action: () => contextChangeStatus("todo") },
      { label: "▶️ В работу", action: () => contextChangeStatus("progress") },
      { label: "⏸️ На паузу", action: () => contextChangeStatus("paused") },
      { label: "✅ Готово", action: () => contextChangeStatus("done") },
      { divider: true },
      { label: "🗑️ Удалить", action: () => contextDeleteTask(), danger: true },
    ];

    for (const item of items) {
      if ("divider" in item && item.divider) {
        const div = document.createElement("div");
        div.className = "sch-context-divider";
        menu.appendChild(div);
      } else if ("disabled" in item && item.disabled) {
        const lbl = document.createElement("div");
        lbl.className = "sch-context-label";
        lbl.textContent = item.label;
        menu.appendChild(lbl);
      } else if ("action" in item) {
        const btn = document.createElement("button");
        btn.className = "sch-context-item" + ("danger" in item && item.danger ? " sch-context-danger" : "");
        btn.innerHTML = item.label;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          item.action();
        });
        menu.appendChild(btn);
      }
    }

    el.appendChild(menu);
    document.body.appendChild(el);
    contextMenuEl = el;

    // Границы viewport — сдвигаем меню, если не помещается
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
      }
    });
  }

  function closeContextMenu(): void {
    if (contextMenuEl) {
      contextMenuEl.remove();
      contextMenuEl = null;
    }
    contextMenuTask = null;
  }

  function contextEditTask(): void {
    if (contextMenuTask) {
      openTaskEditor(contextMenuTask);
    }
    closeContextMenu();
  }

  async function contextOpenNote(): Promise<void> {
    if (!contextMenuTask?.notePath) return;
    try {
      plugin.app.workspace.openLinkText(contextMenuTask.notePath, "", false);
    } catch (error) {
      console.error("[ScheduleCalendar] failed to open note:", error);
    }
    closeContextMenu();
  }

  function contextChangeStatus(newStatus: "todo" | "progress" | "done" | "paused"): void {
    if (contextMenuTask) {
      updateTaskStatus(contextMenuTask.id, newStatus);
      if (newStatus === "done") {
        archiveNoteIfCompleted(contextMenuTask, newStatus);
      }
    }
    closeContextMenu();
  }

  async function contextDeleteTask(): Promise<void> {
    if (contextMenuTask) {
      await deleteNoteFileIfNeeded(contextMenuTask);
      removeTask(contextMenuTask.id);
    }
    closeContextMenu();
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

  <!-- Контекстное меню теперь рендерится в document.body через DOM API,
       чтобы position:fixed работал корректно (backdrop-filter на
       schedule-view-container создаёт containing block) -->
</div>

<style>
  .schedule-calendar-wrapper {
    flex: 1;
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

  /* Контекстное меню задачи — global, т.к. рендерится в document.body */
  :global(.sch-context-overlay) {
    position: fixed;
    inset: 0;
    z-index: 9998;
    background: transparent;
  }

  :global(.sch-context-menu) {
    position: fixed;
    z-index: 9999;
    min-width: 200px;
    background: var(--background-primary, #1e1e2e);
    border: 1px solid var(--background-modifier-border, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
    padding: 4px;
    font-family: var(--font-interface);
    font-size: 13px;
  }

  :global(.sch-context-item) {
    display: block;
    width: 100%;
    padding: 7px 12px;
    border: none;
    background: transparent;
    color: var(--text-normal, #e8ecf0);
    text-align: left;
    cursor: pointer;
    border-radius: 5px;
    transition: background 0.15s;
    font-family: var(--font-interface);
    font-size: 13px;
  }

  :global(.sch-context-item:hover) {
    background: var(--background-modifier-hover, rgba(255, 255, 255, 0.06));
  }

  :global(.sch-context-divider) {
    height: 1px;
    background: var(--background-modifier-border, rgba(255, 255, 255, 0.06));
    margin: 3px 8px;
  }

  :global(.sch-context-label) {
    padding: 4px 12px 2px;
    font-size: 11px;
    color: var(--text-faint, rgba(200, 210, 220, 0.4));
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  :global(.sch-context-danger) {
    color: var(--text-error, #ef4444);
  }

  :global(.sch-context-danger:hover) {
    background: rgba(239, 68, 68, 0.12);
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
    /* Не переопределяем --fc-event-border-color — цвет берётся изInlineData event data */
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
    font-size: 11px;
    font-weight: 500;
  }

  /* Не переопределяем height слотов — FullCalendar рассчитывает
     позиции highlight/drag/snap на основе slotDuration,
     а CSS height создаёт рассинхрон */

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

  /* Hover на слотах времени */
  :global(.fc .fc-timegrid-slot) {
    transition: background-color 0.15s ease;
  }

  :global(.fc .fc-timegrid-slot:hover) {
    background: rgba(95, 153, 225, 0.06);
  }

  :global(.fc .fc-timegrid-slot-lane:hover) {
    background: rgba(95, 153, 225, 0.06);
  }

  :global(.fc .fc-daygrid-day:hover) {
    background: rgba(95, 153, 225, 0.04);
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
    transition: background-color 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
    box-shadow: inset 3px 0 0 var(--event-project-color, rgba(120, 145, 175, 1)), 0 2px 8px rgba(0, 0, 0, 0.12);
  }

  :global(.fc .fc-event:has(.sch-event)) {
    background-color: var(--event-project-color, rgba(110, 130, 160, 0.8)) !important;
    box-shadow: inset 3px 0 0 var(--event-project-color, rgba(120, 145, 175, 1)), 0 2px 8px rgba(0, 0, 0, 0.12) !important;
  }

  :global(.fc .fc-event:has(.sch-event-compact)) {
    background-color: var(--event-project-color, rgba(110, 130, 160, 0.8)) !important;
    box-shadow: inset 3px 0 0 var(--event-project-color, rgba(120, 145, 175, 1)), 0 2px 8px rgba(0, 0, 0, 0.12) !important;
  }

  :global(.sch-event) {
    padding: 4px 8px;
    line-height: 1.35;
    min-width: 0;
  }

  :global(.fc .fc-timegrid-event) {
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  :global(.fc .fc-event:hover) {
    transform: none;
    box-shadow: inset 3px 0 0 var(--event-project-color, rgba(120, 145, 175, 1)), 0 4px 16px rgba(0, 0, 0, 0.25);
    filter: brightness(1.15);
  }

  :global(.fc .fc-event.fc-dragging),
  :global(.fc .fc-event-event-dragging),
  :global(.fc .fc-event-mirror) {
    transition: none !important;
    will-change: auto;
    opacity: 0.9;
    z-index: 9999;
    box-shadow: none !important;
    filter: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  :global(.fc .fc-event-main) {
    border-radius: 8px;
    overflow: hidden;
  }

  :global(.sch-event-compact) {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    line-height: 1.35;
    min-width: 0;
    overflow: hidden;
  }

  :global(.sch-event-compact .sch-event-time) {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
    flex-shrink: 0;
  }

  :global(.sch-event-compact .sch-event-title) {
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #fff;
    min-width: 0;
  }

  :global(.sch-recurrence) {
    font-size: 11px;
    flex-shrink: 0;
    opacity: 0.85;
  }

  :global(.sch-deadline) {
    font-size: 9px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(251, 191, 36, 0.3);
    color: rgba(255, 230, 150, 0.95);
    flex-shrink: 0;
    white-space: nowrap;
  }

  :global(.sch-deadline-overdue) {
    background: rgba(220, 100, 100, 0.4);
    color: rgba(255, 180, 180, 0.95);
  }

  :global(.sch-overdue) {
    font-size: 9px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(220, 80, 80, 0.35);
    color: rgba(255, 160, 160, 0.95);
    flex-shrink: 0;
    white-space: nowrap;
  }

  :global(.sch-time-overdue) {
    color: rgba(255, 130, 130, 0.95) !important;
  }

  :global(.sch-event-deadline) {
    opacity: 0.9;
  }

  :global(.sch-event-deadline .sch-event-title) {
    color: #fff;
    font-style: italic;
  }

  :global(.sch-deadline-icon) {
    font-size: 11px;
    flex-shrink: 0;
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

  :global(.sch-status-paused) {
    background: rgba(180, 150, 100, 0.15);
    color: rgba(200, 170, 110, 0.85);
  }

  :global(.sch-duration) {
    font-size: 9px;
    color: var(--mcp-text-faint, rgba(200, 210, 220, 0.25));
  }

  :global(.sch-work-badge) {
    font-size: 10px;
    opacity: 0.8;
    flex-shrink: 0;
  }

  :global(.sch-note-badge) {
    font-size: 10px;
    opacity: 0.85;
    flex-shrink: 0;
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
      flex-wrap: wrap;
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

    :global(.fc .fc-toolbar-chunk:last-child) {
      flex-wrap: wrap;
      gap: 2px;
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

    /* Сетка времени — FullCalendar сам управляет высотой слотов */

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

    :global(.sch-note-badge) {
      font-size: 9px;
    }

    :global(.sch-overdue) {
      font-size: 8px;
      padding: 1px 4px;
    }

    :global(.sch-duration) {
      font-size: 8px;
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
      font-size: 9px;
      padding: 4px 5px;
      min-height: 32px;
      min-width: 30px;
    }

    :global(.fc .fc-col-header-cell-cushion) {
      font-size: 9px;
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
