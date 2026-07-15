<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { App } from "obsidian";
  import type { ITask, TaskStatus } from "./types";
  import { updateTask, updateTaskStatus, removeTask, projects, activeTab, calculateTaskEarnings, tasks } from "./stores";
  import { get } from "svelte/store";
  import { timerTick, getActiveTimer, formatDuration, formatEstimate } from "./TimerManager";
  import { TaskModal } from "./TaskModal";
  import { syncTaskToNote, shouldSyncTaskToNote } from "./noteTasks";
  import { settings } from "../ui/stores";

  export let task: ITask;
  export let appInstance: App;

  const dispatch = createEventDispatcher();

  $: project = $projects.find((p) => p.id === task.projectId);
  $: projectColor = project?.color || "var(--text-muted)";

  // Timer display — include accumulated totalWorkTime from prior sessions
  $: elapsed = $timerTick && task.status === "progress" && task.timerStartedAt
    ? getActiveTimer(task.id)
    : null;
  $: timerDisplay = elapsed !== null
    ? formatDuration(elapsed + (task.totalWorkTime || 0))
    : null;

  // Estimate vs actual
  $: hasEstimate = !!task.estimatedTime;
  $: hasActual = !!task.totalWorkTime;
  $: estimateOver = hasEstimate && hasActual && task.totalWorkTime > task.estimatedTime * 60000;
  $: estimateUnder = hasEstimate && hasActual && task.totalWorkTime <= task.estimatedTime * 60000;

  $: scheduledTimePassed = task.scheduledTime && task.dateUID ? isTimePassed(task.scheduledTime, task.dateUID) : false;

  // Deadline logic
  $: hasDeadline = !!task.deadline;
  $: deadlineOverdue = hasDeadline && task.status !== "done" ? isDeadlineOverdue(task.deadline, task.deadlineTime) : false;
  $: deadlineLabel = hasDeadline ? formatDeadlineLabel(task.deadline, task.deadlineTime) : "";

  function isTimePassed(time: string, dateUID: string): boolean {
    const [h, m] = time.split(":").map(Number);
    const now = new Date();
    const match = dateUID.match(/^day-(\d{4}-\d{2}-\d{2})/);
    if (!match) {
      return now.getHours() > h || (now.getHours() === h && now.getMinutes() > m);
    }
    const taskDate = new Date(match[1] + "T00:00:00");
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (taskDate.getTime() < today.getTime()) return true;
    if (taskDate.getTime() > today.getTime()) return false;
    return now.getHours() > h || (now.getHours() === h && now.getMinutes() > m);
  }

  function isDeadlineOverdue(deadlineUID: string, deadlineTime?: string): boolean {
    if (!deadlineUID) return false;
    const match = deadlineUID.match(/^day-(\d{4}-\d{2}-\d{2})/);
    if (!match) return false;
    const now = new Date();
    const deadlineDate = new Date(match[1] + "T00:00:00");
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (deadlineDate.getTime() < today.getTime()) return true;
    if (deadlineDate.getTime() > today.getTime()) return false;
    if (deadlineTime) {
      const [h, m] = deadlineTime.split(":").map(Number);
      return now.getHours() > h || (now.getHours() === h && now.getMinutes() > m);
    }
    return false;
  }

  function formatDeadlineLabel(deadlineUID: string, deadlineTime?: string): string {
    if (!deadlineUID) return "";
    const match = deadlineUID.match(/^day-(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return "";
    const [, year, month, day] = match;
    const now = new Date();
    const deadlineDate = new Date(`${year}-${month}-${day}T00:00:00`);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffMs = deadlineDate.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / 86400000);
    let label = "";
    if (diffDays < 0) {
      label = `${Math.abs(diffDays)}д просрочено`;
    } else if (diffDays === 0) {
      label = "Сегодня";
    } else if (diffDays === 1) {
      label = "Завтра";
    } else {
      label = `${diffDays}д`;
    }
    if (deadlineTime) {
      label += ` ${deadlineTime}`;
    }
    return label;
  }

  const statusIcons: Record<TaskStatus, string> = {
    todo: "🟢",
    progress: "🔥",
    done: "✅",
    paused: "☕",
    all: "",
  };

  async function quickStatus(status: TaskStatus) {
    if (task.status === status) return;
    updateTaskStatus(task.id, status);
    // Синхронизируем заметку при смене статуса
    if (appInstance) {
      const { tasks: tasksStore } = await import("./stores");
      const { get } = await import("svelte/store");
      const updatedTask = get(tasksStore).find((t) => t.id === task.id);
      if (updatedTask) {
        await syncTaskToNote(updatedTask, appInstance);
      }
    }
  }

  function handleEdit() {
    const modal = new TaskModal(
      appInstance,
      async (changes) => {
        console.log("[TaskItem] handleEdit changes:", changes);
        updateTask(task.id, changes);

        // Получаем обновлённую задачу из store
        const updatedTask = get(tasks).find((t) => t.id === task.id);
        console.log("[TaskItem] updatedTask:", updatedTask);
        if (!updatedTask || !appInstance) return;

        // Если нет Task заметки — создаём
        if (!updatedTask.notePath && shouldSyncTaskToNote(updatedTask)) {
          console.log("[TaskItem] Creating Task note...");
          const { createNoteTask } = await import("./noteTasks");
          const project = $projects.find((p) => p.id === updatedTask.projectId);
          const file = await createNoteTask(updatedTask, project, appInstance);
          if (file) {
            console.log("[TaskItem] Task note created:", file.path);
            updateTask(updatedTask.id, { notePath: file.path });
          }
        }

        // Синхронизируем Task заметку
        console.log("[TaskItem] Syncing to note...");
        await syncTaskToNote(updatedTask, appInstance);
        console.log("[TaskItem] Sync done");
      },
      task
    );
    modal.open();
  }

  function handleDelete() {
    dispatch("delete", { task });
  }

  function openNote() {
    // Приоритет: привязанная заметка > Task заметка
    const pathToOpen = task.boundNotePath || task.notePath;
    if (!pathToOpen) return;
    if (!appInstance) return;
    const file = appInstance.vault.getAbstractFileByPath(pathToOpen);
    if (file) {
      appInstance.workspace.openLinkText(pathToOpen, "", false);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (task.status !== "done") quickStatus("progress");
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      handleDelete();
    } else if (e.key === "e" || e.key === "E") {
      e.preventDefault();
      if (task.status !== "done") handleEdit();
    }
  }

  function handleDragStart(event: DragEvent) {
    if (event.dataTransfer) {
      event.dataTransfer.setData("text/plain", task.id);
      event.dataTransfer.effectAllowed = "move";
    }
  }

  let showActionsMenu = false;

  function toggleActionsMenu() {
    showActionsMenu = !showActionsMenu;
  }

  function closeActionsMenu() {
    showActionsMenu = false;
  }
</script>

<div
  class="task-item"
  class:completed={task.status === "done"}
  class:is-note-task={!!task.isNoteTask}
  data-status={task.status}
  draggable="true"
  on:dragstart={handleDragStart}
  on:keydown={handleKeydown}
  tabindex="0"
  role="listitem"
  aria-label={task.title}
>
  <span
    class="task-project-dot"
    style="background-color: {projectColor}"
  ></span>

  {#if task.isNoteTask && task.notePath}
    <button
      class="note-icon"
      on:click|stopPropagation={openNote}
      title="Открыть заметку-задачу"
      aria-label="Открыть заметку"
    >
      📝
    </button>
  {:else}
    <button
      class="task-status-btn status-{task.status}"
      disabled={task.status === "done"}
      on:click|stopPropagation={() => {
        if (task.status === "done") return;
        else if (task.status === "progress") quickStatus("done");
        else if (task.status === "paused") quickStatus("done");
        else quickStatus("done");
      }}
      title={task.status === 'done' ? 'Готово (только удаление)' : task.status === 'todo' ? 'Сделать' : task.status === 'progress' ? 'В работе' : 'На паузе'}
      aria-label="Изменить статус"
    >
      {statusIcons[task.status]}
    </button>
  {/if}

  {#if task.boundNotePath}
    <a
      class="task-title note-link"
      class:strikethrough={task.status === "done"}
      href={task.boundNotePath}
      on:click|preventDefault={openNote}
      title="Открыть привязанную заметку: {task.boundNotePath}"
    >
      {task.title}
    </a>
  {:else}
    <span class="task-title" class:strikethrough={task.status === "done"}>
      {task.title}
    </span>
  {/if}

  {#if task.description}
    <span class="task-descr" title={task.description}>
      {task.description}
    </span>
  {/if}

  {#if task.recurrence}
    <span class="task-recurring-icon" title="Повторяющаяся задача">&#8635;</span>
  {/if}

  {#if $activeTab === "all" && task.status !== "done"}
    <span class="task-status-badge status-badge-{task.status}">
      {task.status === "todo" ? "Сделать" : task.status === "progress" ? "В работе" : "На паузе"}
    </span>
  {/if}

  {#if task.scheduledTime && task.status !== "progress" && task.status !== "paused"}
    {#if task.status === "done"}
      <span class="task-scheduled done" title="Готово">
        &#10003; Готово
      </span>
    {:else}
      <span class="task-scheduled {scheduledTimePassed ? 'passed' : ''}" title={scheduledTimePassed ? "Время прошло" : "Запланировано"}>
        {scheduledTimePassed ? "\u26A0" : "\uD83D\uDD52"} {task.scheduledTime}
      </span>
    {/if}
  {/if}

  {#if hasDeadline && task.status !== "done"}
    <span class="task-deadline {deadlineOverdue ? 'overdue' : ''}" title={deadlineOverdue ? "Дедлайн просрочен" : "Дедлайн"}>
      &#9200; {deadlineLabel}
    </span>
  {/if}

  {#if task.status === "paused"}
    <span class="task-work-paused" title="Работа на паузе">
      &#9208; Работа на паузе
    </span>
    {#if hasActual}
      <span class="task-timer total" title="Общее время">
        &#9201; {formatDuration(task.totalWorkTime)}
      </span>
    {/if}
  {:else if timerDisplay}
    <span class="task-timer" title="Текущее время">
      &#9201; {timerDisplay}
    </span>
  {:else if hasEstimate && !hasActual}
    <span class="task-estimate" title="План">
      &#9201; {formatEstimate(task.estimatedTime)}
    </span>
  {:else if task.status === "done" && hasEstimate && hasActual}
    <span
      class="task-estimate-compare {estimateOver ? 'over' : 'under'}"
      title="План → Факт"
    >
      &#9201; {formatEstimate(task.estimatedTime)} → &#10003; {formatDuration(task.totalWorkTime)}
    </span>
  {:else if hasActual}
    <span class="task-timer total" title="Общее время">
      &#9201; {formatDuration(task.totalWorkTime)}
    </span>
  {/if}

  {#if task.priority === "high"}
    <span class="task-priority high" aria-label="Высокий приоритет">!</span>
  {:else if task.priority === "medium"}
    <span class="task-priority medium" aria-label="Средний приоритет">~</span>
  {/if}

  {#if task.isWorkTask}
    <span class="task-work-badge" title="Рабочая задача">
      &#128188; Рабочая
      {#if task.rate && task.status === "done"}
        <span class="task-work-earnings">
          {calculateTaskEarnings(task)} ₽
        </span>
      {/if}
    </span>
  {/if}

  <div class="task-actions-dropdown">
    <button
      class="task-actions-toggle"
      on:click|stopPropagation={toggleActionsMenu}
      aria-label="Действия"
    >
      &#8942;
    </button>
    {#if showActionsMenu}
      <div class="task-actions-menu" on:click|stopPropagation role="menu">
        {#if task.status === "done"}
          <button
            class="task-actions-item"
            on:click|stopPropagation={() => { quickStatus("todo"); closeActionsMenu(); }}
          >
            &#8634; Вернуть в Сделать
          </button>
          <button
            class="task-actions-item"
            on:click|stopPropagation={() => { quickStatus("progress"); closeActionsMenu(); }}
          >
            &#9203; Вернуть в работу
          </button>
          <div class="task-tracker-dropdown-divider"></div>
          <button
            class="task-actions-item danger"
            on:click|stopPropagation={() => { handleDelete(); closeActionsMenu(); }}
          >
            &#10005; Удалить
          </button>
        {:else}
          <button
            class="task-actions-item"
            disabled={task.status === "progress" || task.status === "paused"}
            on:click|stopPropagation={() => { quickStatus("progress"); closeActionsMenu(); }}
          >
            &#9203; В работу
          </button>
          {#if task.status === "progress"}
            <button
              class="task-actions-item"
              on:click|stopPropagation={() => { quickStatus("paused"); closeActionsMenu(); }}
            >
              &#9208; На паузу
            </button>
            <button
              class="task-actions-item"
              on:click|stopPropagation={() => { quickStatus("todo"); closeActionsMenu(); }}
            >
              &#8634; Вернуть
            </button>
          {/if}
          {#if task.status === "paused"}
            <button
              class="task-actions-item"
              on:click|stopPropagation={() => { quickStatus("progress"); closeActionsMenu(); }}
            >
              &#9654; Продолжить
            </button>
            <button
              class="task-actions-item"
              on:click|stopPropagation={() => { quickStatus("todo"); closeActionsMenu(); }}
            >
              &#8634; Вернуть
            </button>
          {/if}
          {#if task.notePath}
            <button
              class="task-actions-item"
              on:click|stopPropagation={() => { dispatch("complete", { task }); closeActionsMenu(); }}
            >
              &#10003; Готово
            </button>
          {/if}
          <button
            class="task-actions-item"
            on:click|stopPropagation={() => { handleEdit(); closeActionsMenu(); }}
          >
            &#9998; Редактировать
          </button>
          <button
            class="task-actions-item danger"
            on:click|stopPropagation={() => { handleDelete(); closeActionsMenu(); }}
          >
            &#10005; Удалить
          </button>
        {/if}
      </div>
    {/if}
  </div>

</div>
