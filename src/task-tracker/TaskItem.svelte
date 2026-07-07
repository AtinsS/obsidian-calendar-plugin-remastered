<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { App } from "obsidian";
  import type { ITask, TaskStatus } from "./types";
  import { updateTask, updateTaskStatus, removeTask, projects } from "./stores";
  import { timerTick, getActiveTimer, formatDuration, formatEstimate } from "./TimerManager";
  import { TaskModal } from "./TaskModal";

  export let task: ITask;
  export let appInstance: App;

  const dispatch = createEventDispatcher();

  $: project = $projects.find((p) => p.id === task.projectId);
  $: projectColor = project?.color || "var(--text-muted)";

  // Timer display
  $: elapsed = $timerTick && task.status === "progress" && task.timerStartedAt
    ? getActiveTimer(task.id)
    : null;
  $: timerDisplay = elapsed !== null ? formatDuration(elapsed) : null;

  // Estimate vs actual
  $: hasEstimate = !!task.estimatedTime;
  $: hasActual = !!task.totalWorkTime;
  $: estimateOver = hasEstimate && hasActual && task.totalWorkTime > task.estimatedTime * 60000;
  $: estimateUnder = hasEstimate && hasActual && task.totalWorkTime <= task.estimatedTime * 60000;

  $: scheduledTimePassed = task.scheduledTime && task.dateUID ? isTimePassed(task.scheduledTime, task.dateUID) : false;

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

  const statusIcons: Record<TaskStatus, string> = {
    todo: "\u25CB",
    progress: "\u23F3",
    done: "\u2714",
  };

  function quickStatus(status: TaskStatus) {
    if (task.status === status) return;
    updateTaskStatus(task.id, status);
  }

  function handleEdit() {
    const modal = new TaskModal(
      appInstance,
      (changes) => {
        updateTask(task.id, changes);
      },
      task
    );
    modal.open();
  }

  function handleDelete() {
    dispatch("delete", { task });
  }

  function openNote() {
    if (!task.notePath) return;
    if (!appInstance) return;
    const file = appInstance.vault.getAbstractFileByPath(task.notePath);
    if (file) {
      appInstance.workspace.openLinkText(task.notePath, "", false);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      quickStatus("progress");
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      handleDelete();
    } else if (e.key === "e" || e.key === "E") {
      e.preventDefault();
      handleEdit();
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
  class:is-note-task={!!task.notePath}
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

  {#if task.notePath}
    <button
      class="note-icon"
      on:click|stopPropagation={openNote}
      title="Открыть заметку"
      aria-label="Открыть заметку"
    >
      &#128221;
    </button>
  {:else}
    <button
      class="task-status-btn status-{task.status}"
      on:click|stopPropagation={() => quickStatus(task.status === "done" ? "todo" : "done")}
      title="Статус: {task.status === 'todo' ? 'Сделать' : task.status === 'progress' ? 'В работе' : 'Готово'}"
      aria-label="Изменить статус"
    >
      {statusIcons[task.status]}
    </button>
  {/if}

  {#if task.notePath}
    <a
      class="task-title note-link"
      class:strikethrough={task.status === "done"}
      href={task.notePath}
      on:click|preventDefault={openNote}
      title="Открыть заметку: {task.notePath}"
    >
      {task.title}
    </a>
  {:else}
    <span class="task-title" class:strikethrough={task.status === "done"}>
      {task.title}
    </span>
  {/if}

  {#if task.recurrence}
    <span class="task-recurring-icon" title="Повторяющаяся задача">&#8635;</span>
  {/if}

  {#if task.scheduledTime}
    <span class="task-scheduled {scheduledTimePassed ? 'passed' : ''}" title={scheduledTimePassed ? "Время прошло" : "Запланировано"}>
      {scheduledTimePassed ? "\u26A0" : "\uD83D\uDD52"} {task.scheduledTime}
    </span>
  {/if}

  {#if timerDisplay}
    <span class="task-timer" title="Текущее время">
      &#9201; {timerDisplay}
    </span>
  {:else if hasEstimate && !hasActual}
    <span class="task-estimate" title="План">
      &#9201; {formatEstimate(task.estimatedTime)}
    </span>
  {:else if hasEstimate && hasActual}
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
        <button
          class="task-actions-item"
          disabled={task.status === "progress"}
          on:click|stopPropagation={() => { quickStatus("progress"); closeActionsMenu(); }}
        >
          &#9203; В работу
        </button>
        {#if task.notePath}
          <button
            class="task-actions-item"
            disabled={task.status === "done"}
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
      </div>
    {/if}
  </div>

</div>
