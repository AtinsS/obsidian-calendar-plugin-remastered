<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import moment from "moment";
  import type { ITask, IProject } from "../task-tracker/types";
  import { tasks, projects, updateTaskStatus, removeTask, updateTask, resetTaskTimer } from "../task-tracker/stores";
  import { selectedDate } from "../task-tracker/stores";
  import { TaskModal } from "../task-tracker/TaskModal";
  import type CalendarPlugin from "../main";

  export let plugin: CalendarPlugin;
  export let onClose: () => void = () => {};

  const DAY_START = 6;
  const DAY_END = 23;
  const HOUR_HEIGHT = 64;

  let currentDate = moment();
  let containerEl: HTMLDivElement;
  let scrollEl: HTMLDivElement;
  let contextMenuTask: ITask | null = null;
  let contextMenuEl: HTMLDivElement | null = null;

  $: dateStr = currentDate.format("YYYY-MM-DD");
  $: dayLabel = currentDate.locale("ru").format("dddd, D MMMM");
  $: dayTasks = $tasks.filter((t) => {
    const match = t.dateUID?.match(/^day-(\d{4}-\d{2}-\d{2})/);
    return match && match[1] === dateStr && t.scheduledTime;
  }).sort((a, b) => (a.scheduledTime || "").localeCompare(b.scheduledTime || ""));

  // Week strip
  $: weekStart = currentDate.clone().startOf("week");
  $: weekDays = Array.from({ length: 7 }, (_, i) => weekStart.clone().add(i, "days"));

  function prevDay() {
    currentDate = currentDate.clone().subtract(1, "days");
  }

  function nextDay() {
    currentDate = currentDate.clone().add(1, "days");
  }

  function goToday() {
    currentDate = moment();
  }

  function selectDay(day: moment.Moment) {
    currentDate = day.clone();
  }

  function getTaskStyle(task: ITask): string {
    if (!task.scheduledTime) return "";
    const [h, m] = task.scheduledTime.split(":").map(Number);
    const startMin = (h - DAY_START) * 60 + m;
    const duration = task.estimatedTime || 60;
    const top = (startMin / 60) * HOUR_HEIGHT;
    const height = Math.max((duration / 60) * HOUR_HEIGHT, 40);

    const project = $projects.find((p) => p.id === task.projectId);
    const color = project?.color || "rgba(95, 153, 225, 0.8)";

    return `top: ${top}px; height: ${height}px; background: ${color};`;
  }

  function getEndTime(task: ITask): string {
    if (!task.scheduledTime) return "";
    const [h, m] = task.scheduledTime.split(":").map(Number);
    const duration = task.estimatedTime || 60;
    const endMin = h * 60 + m + duration;
    const endH = Math.floor(endMin / 60);
    const endM = endMin % 60;
    return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
  }

  function openContextMenu(task: ITask, e: MouseEvent) {
    e.stopPropagation();
    closeContextMenu();
    contextMenuTask = task;

    const el = document.createElement("div");
    el.className = "ms-context-overlay";
    el.addEventListener("click", closeContextMenu);

    const menu = document.createElement("div");
    menu.className = "ms-context-menu";

    const items = [
      { label: "📝 Редактировать", action: () => contextEditTask() },
      ...(task.notePath ? [{ label: "📄 Открыть заметку", action: () => contextOpenNote() }] : []),
      { divider: true },
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
        div.className = "ms-context-divider";
        menu.appendChild(div);
      } else if ("disabled" in item && item.disabled) {
        const lbl = document.createElement("div");
        lbl.className = "ms-context-label";
        lbl.textContent = item.label;
        menu.appendChild(lbl);
      } else if ("action" in item) {
        const btn = document.createElement("button");
        btn.className = "ms-context-item" + ("danger" in item && item.danger ? " ms-context-danger" : "");
        btn.textContent = item.label;
        btn.addEventListener("click", (ev) => { ev.stopPropagation(); item.action(); });
        menu.appendChild(btn);
      }
    }

    el.appendChild(menu);
    document.body.appendChild(el);
    contextMenuEl = el;

    // Position: center on screen
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(16, (window.innerWidth - rect.width) / 2)}px`;
      menu.style.top = `${Math.max(16, (window.innerHeight - rect.height) / 2)}px`;
    });
  }

  function closeContextMenu() {
    if (contextMenuEl) { contextMenuEl.remove(); contextMenuEl = null; }
    contextMenuTask = null;
  }

  function contextEditTask() {
    if (contextMenuTask) {
      new TaskModal(plugin.app, (updates) => updateTask(contextMenuTask.id, updates), contextMenuTask).open();
    }
    closeContextMenu();
  }

  function contextOpenNote() {
    if (contextMenuTask?.notePath) {
      plugin.app.workspace.openLinkText(contextMenuTask.notePath, "", false);
    }
    closeContextMenu();
  }

  function contextChangeStatus(status: "todo" | "progress" | "done" | "paused") {
    if (contextMenuTask) {
      updateTaskStatus(contextMenuTask.id, status);
      if (status === "todo") {
        resetTaskTimer(contextMenuTask.id);
      }
    }
    closeContextMenu();
  }

  function contextDeleteTask() {
    if (contextMenuTask) removeTask(contextMenuTask.id);
    closeContextMenu();
  }

  onDestroy(() => { closeContextMenu(); });

  // Scroll to current time on mount
  onMount(() => {
    if (!scrollEl) return;
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const scrollTo = Math.max(0, ((h - DAY_START) * 60 + m) / 60 * HOUR_HEIGHT - 100);
    scrollEl.scrollTop = scrollTo;
  });
</script>

<div class="mobile-schedule" bind:this={containerEl}>
  <!-- Header -->
  <div class="ms-header">
    <button class="ms-nav-btn" on:click={prevDay} aria-label="Предыдущий день">‹</button>
    <button class="ms-title" on:click={goToday}>
      {dayLabel}
    </button>
    <button class="ms-nav-btn" on:click={nextDay} aria-label="Следующий день">›</button>
    <button class="ms-close-btn" on:click={onClose} aria-label="Закрыть">✕</button>
  </div>

  <!-- Week strip -->
  <div class="ms-week-strip">
    {#each weekDays as day (day.format("YYYY-MM-DD"))}
      <button
        class="ms-week-day"
        class:active={day.format("YYYY-MM-DD") === dateStr}
        class:today={day.format("YYYY-MM-DD") === moment().format("YYYY-MM-DD")}
        on:click={() => selectDay(day)}
      >
        <span class="ms-week-day-label">{day.locale("ru").format("dd")}</span>
        <span class="ms-week-day-num">{day.format("D")}</span>
      </button>
    {/each}
  </div>

  <!-- Timeline -->
  <div class="ms-timeline" bind:this={scrollEl}>
    <div class="ms-timeline-inner" style="height: {(DAY_END - DAY_START) * HOUR_HEIGHT}px;">
      <!-- Hour grid -->
      {#each Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i) as hour}
        <div class="ms-hour-line" style="top: {(hour - DAY_START) * HOUR_HEIGHT}px;">
          <span class="ms-hour-label">{String(hour).padStart(2, "0")}:00</span>
        </div>
      {/each}

      <!-- Now indicator -->
      {#if dateStr === moment().format("YYYY-MM-DD")}
        {@const now = new Date()}
        {@const nowMin = (now.getHours() - DAY_START) * 60 + now.getMinutes()}
        {#if nowMin >= 0 && nowMin <= (DAY_END - DAY_START) * 60}
          <div class="ms-now-line" style="top: {nowMin / 60 * HOUR_HEIGHT}px;"></div>
        {/if}
      {/if}

      <!-- Task blocks -->
      {#each dayTasks as task (task.id)}
        <div
          class="ms-task-block"
          class:done={task.status === "done"}
          class:paused={task.status === "paused"}
          style={getTaskStyle(task)}
          on:click={(e) => openContextMenu(task, e)}
          role="button"
          tabindex="0"
        >
          <div class="ms-task-header">
            <span class="ms-task-time">
              {task.scheduledTime} – {getEndTime(task)}
            </span>
            {#if task.isWorkTask}
              <span class="ms-task-work-icon">💼</span>
            {/if}
            <span class="ms-task-title">{task.title}</span>
            {#if task.status === "progress"}
              <span class="ms-task-status ms-status-progress">В работе</span>
            {:else if task.status === "paused"}
              <span class="ms-task-status ms-status-paused">На паузе</span>
            {:else if task.status === "done"}
              <span class="ms-task-status ms-status-done">Готово</span>
            {/if}
          </div>
          {#if task.description}
            <div class="ms-task-desc">{task.description}</div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .mobile-schedule {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background-primary, #1a1a2e);
    overflow: hidden;
  }

  /* Header */
  .ms-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 12px 8px;
    flex-shrink: 0;
  }

  .ms-nav-btn {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: 1px solid var(--mcp-glass-border, rgba(255,255,255,0.06));
    background: var(--mcp-glass-bg, rgba(35,40,55,0.4));
    color: var(--mcp-text, #e8ecf0);
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    flex-shrink: 0;
  }

  .ms-nav-btn:hover { background: var(--mcp-accent-dim, rgba(95,153,225,0.12)); }

  .ms-title {
    flex: 1;
    background: none;
    border: none;
    color: var(--mcp-text, #e8ecf0);
    font-size: 15px;
    font-weight: 600;
    text-align: center;
    cursor: pointer;
    padding: 6px 0;
    text-transform: capitalize;
  }

  .ms-close-btn {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: 1px solid var(--mcp-glass-border, rgba(255,255,255,0.06));
    background: var(--mcp-glass-bg, rgba(35,40,55,0.4));
    color: var(--mcp-text-muted, rgba(200,210,220,0.5));
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .ms-close-btn:hover { background: var(--mcp-accent-dim, rgba(95,153,225,0.12)); }

  /* Week strip */
  .ms-week-strip {
    display: flex;
    gap: 4px;
    padding: 0 12px 10px;
    flex-shrink: 0;
  }

  .ms-week-day {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 2px;
    border-radius: 10px;
    border: none;
    background: transparent;
    cursor: pointer;
    transition: background 0.15s;
  }

  .ms-week-day:hover { background: var(--mcp-accent-dim, rgba(95,153,225,0.08)); }

  .ms-week-day.active {
    background: var(--mcp-accent, rgba(95,153,225,0.48));
  }

  .ms-week-day.active .ms-week-day-label,
  .ms-week-day.active .ms-week-day-num {
    color: #000;
    font-weight: 700;
  }

  .ms-week-day.today .ms-week-day-num {
    color: var(--mcp-accent, rgba(95,153,225,0.9));
  }

  .ms-week-day-label {
    font-size: 10px;
    color: var(--mcp-text-muted, rgba(200,210,220,0.5));
    text-transform: uppercase;
    font-weight: 500;
  }

  .ms-week-day-num {
    font-size: 13px;
    font-weight: 600;
    color: var(--mcp-text, #e8ecf0);
  }

  /* Timeline */
  .ms-timeline {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    padding: 0 0 80px;
  }

  .ms-timeline-inner {
    position: relative;
    margin-left: 52px;
    margin-right: 8px;
  }

  .ms-hour-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--mcp-glass-border, rgba(255,255,255,0.04));
  }

  .ms-hour-label {
    position: absolute;
    left: -52px;
    top: -8px;
    width: 44px;
    text-align: right;
    font-size: 11px;
    font-weight: 500;
    color: var(--mcp-text-faint, rgba(200,210,220,0.25));
  }

  /* Now indicator */
  .ms-now-line {
    position: absolute;
    left: -6px;
    right: 0;
    height: 2px;
    background: var(--mcp-accent, rgba(95,153,225,0.8));
    border-radius: 1px;
    z-index: 5;
  }

  .ms-now-line::before {
    content: "";
    position: absolute;
    left: 0;
    top: -4px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--mcp-accent, rgba(95,153,225,0.8));
  }

  /* Task block */
  .ms-task-block {
    position: absolute;
    left: 4px;
    right: 0;
    border-radius: 10px;
    padding: 8px 12px;
    cursor: pointer;
    overflow: hidden;
    z-index: 2;
    transition: transform 0.15s, box-shadow 0.15s;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    border-left: 3px solid rgba(255,255,255,0.2);
  }

  .ms-task-block:hover {
    transform: scale(1.01);
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    z-index: 3;
  }

  .ms-task-block:active {
    transform: scale(0.98);
  }

  .ms-task-block.done {
    opacity: 0.5;
  }

  .ms-task-block.paused {
    opacity: 0.7;
  }

  .ms-task-header {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .ms-task-time {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255,255,255,0.85);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .ms-task-work-icon {
    font-size: 12px;
    flex-shrink: 0;
  }

  .ms-task-title {
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .ms-task-desc {
    font-size: 11px;
    color: rgba(255,255,255,0.7);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ms-task-status {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 4px;
    font-weight: 500;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .ms-status-progress {
    background: rgba(214, 178, 108, 0.25);
    color: rgba(225, 195, 130, 0.9);
  }

  .ms-status-paused {
    background: rgba(180, 150, 100, 0.25);
    color: rgba(200, 170, 110, 0.9);
  }

  .ms-status-done {
    background: rgba(110, 190, 160, 0.2);
    color: rgba(140, 205, 175, 0.85);
  }

  /* Context menu */
  :global(.ms-context-overlay) {
    position: fixed;
    inset: 0;
    z-index: 9998;
    background: rgba(0,0,0,0.4);
    backdrop-filter: blur(4px);
  }

  :global(.ms-context-menu) {
    position: fixed;
    z-index: 9999;
    min-width: 200px;
    background: var(--background-primary, #1e1e2e);
    border: 1px solid var(--background-modifier-border, rgba(255,255,255,0.08));
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    padding: 6px;
    font-family: var(--font-interface);
    font-size: 13px;
  }

  :global(.ms-context-item) {
    display: block;
    width: 100%;
    padding: 10px 14px;
    border: none;
    background: transparent;
    color: var(--text-normal, #e8ecf0);
    text-align: left;
    cursor: pointer;
    border-radius: 8px;
    transition: background 0.12s;
    font-family: var(--font-interface);
    font-size: 13px;
    min-height: 40px;
  }

  :global(.ms-context-item:hover) {
    background: var(--background-modifier-hover, rgba(255,255,255,0.06));
  }

  :global(.ms-context-divider) {
    height: 1px;
    background: var(--background-modifier-border, rgba(255,255,255,0.06));
    margin: 4px 10px;
  }

  :global(.ms-context-label) {
    padding: 6px 14px 2px;
    font-size: 11px;
    color: var(--text-faint, rgba(200,210,220,0.4));
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  :global(.ms-context-danger) {
    color: var(--text-error, #ef4444);
  }

  :global(.ms-context-danger:hover) {
    background: rgba(239,68,68,0.12);
  }
</style>
