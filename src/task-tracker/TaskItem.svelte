<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { ITask } from "./types";
  import { updateTask, removeTask, projects } from "./stores";
  import { TaskModal } from "./TaskModal";

  export let task: ITask;

  const dispatch = createEventDispatcher();

  let isEditing = false;

  $: project = $projects.find((p) => p.id === task.projectId);
  $: projectColor = project?.color || "var(--text-muted)";
  $: descriptionPreview = task.description
    ? task.description.substring(0, 60) + (task.description.length > 60 ? "..." : "")
    : "";

  function toggleComplete() {
    dispatch("complete", { task });
  }

  function handleEdit() {
    isEditing = true;
    const modal = new TaskModal(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).app,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = (window as any).app;
    if (!app) return;
    const file = app.vault.getAbstractFileByPath(task.notePath);
    if (file) {
      app.workspace.openLinkText(task.notePath, "", false);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleComplete();
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
</script>

<div
  class="task-item"
  class:completed={task.completed}
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

  <label class="task-checkbox">
    <input
      type="checkbox"
      checked={task.completed}
      on:change={toggleComplete}
      aria-label="Отметить выполнение"
    />
    <span class="checkmark"></span>
  </label>

  {#if task.notePath}
    <a
      class="task-title note-link"
      class:strikethrough={task.completed}
      href={task.notePath}
      on:click|preventDefault={openNote}
      title="Открыть заметку: {task.notePath}"
    >
      [[{task.title}]]
    </a>
  {:else}
    <span class="task-title" class:strikethrough={task.completed}>
      {task.title}
    </span>
  {/if}

  {#if task.recurrence}
    <span class="task-recurring-icon" title="Повторяющаяся задача">&#8635;</span>
  {/if}

  {#if descriptionPreview}
    <span class="task-description-preview" title={task.description}>
      {descriptionPreview}
    </span>
  {/if}

  {#if task.priority === "high"}
    <span class="task-priority high" aria-label="Высокий приоритет">!</span>
  {:else if task.priority === "medium"}
    <span class="task-priority medium" aria-label="Средний приоритет">~</span>
  {/if}

  <button
    class="task-edit-btn"
    on:click={handleEdit}
    aria-label="Редактировать задачу"
  >
    &#9998;
  </button>

  <button
    class="task-delete-btn"
    on:click={handleDelete}
    aria-label="Удалить задачу"
  >
    &#10005;
  </button>
</div>
