<script lang="ts">
  import type { ITask, IProject } from "./types";
  import {
    tasks,
    projects,
    selectedDate,
    activeTab,
    taskFilter,
    addTask,
    updateTask,
    updateTaskStatus,
    removeTask,
    moveTask,
    completeRecurringTask,
  } from "./stores";
  import { createNoteTask, deleteNoteTask, archiveNoteTask } from "./noteTasks";
  import { settings } from "../ui/stores";
  import TaskItem from "./TaskItem.svelte";
  import KanbanTabs from "./KanbanTabs.svelte";
  import TimeLogsModal from "./TimeLogsModal.svelte";
  import { TaskModal } from "./TaskModal";
  import { ProjectModal } from "./ProjectModal";

  let collapsed = false;
  let showTimeLogs = false;

  $: currentDate = $selectedDate;
  $: allTasksForDate = currentDate
    ? $tasks.filter((t) => t.dateUID === currentDate)
    : [];
  $: filteredTasks = allTasksForDate
    .filter((t) => {
      if (t.status !== $activeTab) return false;
      if ($taskFilter.projectId && t.projectId !== $taskFilter.projectId)
        return false;
      if ($taskFilter.searchQuery) {
        const q = $taskFilter.searchQuery.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchDesc = t.description?.toLowerCase().includes(q) || false;
        if (!matchTitle && !matchDesc) return false;
      }
      return true;
    })
    .sort((a, b) => sortTasks(a, b, $taskFilter.sortMode));

  $: taskGroups = groupTasksByProject(filteredTasks, $projects);
  $: totalCount = allTasksForDate.length;
  $: doneCount = allTasksForDate.filter((t) => t.status === "done").length;

  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

  function sortTasks(
    a: ITask,
    b: ITask,
    mode: string
  ): number {
    // In todo column: scheduledTime tasks first, sorted by time
    if (a.status === "todo" && b.status === "todo") {
      if (a.scheduledTime && !b.scheduledTime) return -1;
      if (!a.scheduledTime && b.scheduledTime) return 1;
      if (a.scheduledTime && b.scheduledTime) {
        return a.scheduledTime.localeCompare(b.scheduledTime);
      }
    }

    switch (mode) {
      case "priority":
        return (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1);
      case "alpha":
        return a.title.localeCompare(b.title, "ru");
      case "created":
        return b.createdAt - a.createdAt;
      case "date":
      default:
        return a.sortOrder - b.sortOrder;
    }
  }

  function groupTasksByProject(
    taskList: ITask[],
    projectList: IProject[]
  ): { project: IProject | null; tasks: ITask[] }[] {
    const groups = new Map<string, ITask[]>();
    const noProject: ITask[] = [];

    for (const task of taskList) {
      if (task.projectId) {
        const existing = groups.get(task.projectId) || [];
        existing.push(task);
        groups.set(task.projectId, existing);
      } else {
        noProject.push(task);
      }
    }

    const result: { project: IProject | null; tasks: ITask[] }[] = [];

    for (const [projectId, projectTasks] of groups) {
      const project = projectList.find((p) => p.id === projectId);
      if (project && !project.archived) {
        result.push({ project, tasks: projectTasks });
      } else {
        noProject.push(...projectTasks);
      }
    }

    if (noProject.length > 0) {
      result.unshift({ project: null, tasks: noProject });
    }

    return result;
  }

  function formatDate(dateUID: string): string {
    if (!dateUID) return "Дата не выбрана";
    const match = dateUID.match(/^(?:day|week|month)-(\d{4}-\d{2}-\d{2})/);
    if (match) {
      try {
        return window.moment(match[1], "YYYY-MM-DD").format("D MMMM YYYY");
      } catch {
        return match[1];
      }
    }
    return dateUID;
  }

  function openCreateTask() {
    const modal = new TaskModal(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).app,
      async (taskData) => {
        const shouldCreateNote = taskData.isNoteTask;
        const customNotePath = taskData.notePath;
        const task = addTask({
          ...taskData,
          completed: false,
          status: "todo",
          notePath: null,
          tags: [],
          sortOrder: allTasksForDate.length,
        } as Omit<ITask, "id" | "createdAt" | "updatedAt">);

        if (shouldCreateNote) {
          const project = $projects.find((p) => p.id === task.projectId);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const app = (window as any).app;
          const file = await createNoteTask(task, project, app, customNotePath);
          if (file) {
            updateTask(task.id, { notePath: file.path });
          }
        }
      }
    );
    modal.open();
  }

  async function handleTaskDelete(task: ITask) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = (window as any).app;
    if (task.notePath && app) {
      await deleteNoteTask(task.notePath, app);
    }
    removeTask(task.id);
  }

  async function handleTaskComplete(task: ITask) {
    const newStatus = task.status === "done" ? "todo" : "done";
    updateTaskStatus(task.id, newStatus);

    // Generate next occurrence for recurring tasks
    if (newStatus === "done" && task.recurrence) {
      completeRecurringTask(task.id);
    }

    // Archive note task if enabled and completing
    if (newStatus === "done" && task.notePath && $settings.archiveCompletedNotes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const app = (window as any).app;
      if (app) {
        const newPath = await archiveNoteTask(
          task.notePath,
          $settings.archiveFolderPath,
          app
        );
        if (newPath) {
          updateTask(task.id, { notePath: newPath });
        }
      }
    }
  }

  function openProjectSettings() {
    const modal = new ProjectModal(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).app
    );
    modal.open();
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    const taskId = event.dataTransfer?.getData("text/plain");
    if (!taskId || !currentDate) return;
    moveTask(taskId, currentDate);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      taskFilter.update((f) => ({ ...f, searchQuery: "" }));
    }
  }

  function cleanupCompletedTasks() {
    const done = $tasks.filter((t) => t.status === "done");
    if (done.length === 0) return;
    if (!confirm(`Удалить ${done.length} завершённых задач?`)) return;
    for (const t of done) {
      removeTask(t.id);
    }
  }
</script>

<div
  class="task-tracker-panel"
  class:collapsed
  on:drop={handleDrop}
  on:dragover={handleDragOver}
  role="region"
  aria-label="Панель задач"
>
  <div
    class="task-tracker-header"
    on:click={() => (collapsed = !collapsed)}
    on:keydown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        collapsed = !collapsed;
      }
    }}
    tabindex="0"
    role="button"
    aria-expanded={!collapsed}
  >
    <div class="task-tracker-header-left">
      <span class="task-tracker-chevron" class:rotated={!collapsed}
        >&#9662;</span
      >
      <span class="task-tracker-title">Задачи</span>
      {#if currentDate}
        <span class="task-tracker-date">{formatDate(currentDate)}</span>
      {/if}
    </div>
    <div class="task-tracker-header-right">
      {#if totalCount > 0}
        <span class="task-tracker-count">
          {doneCount}/{totalCount}
        </span>
      {/if}
      <button
        class="task-tracker-btn"
        on:click|stopPropagation={() => (showTimeLogs = true)}
        aria-label="Логи времени"
        title="Посмотреть логи времени"
      >
        &#9201;
      </button>
      {#if doneCount > 0}
        <button
          class="task-tracker-btn"
          on:click|stopPropagation={cleanupCompletedTasks}
          aria-label="Очистить завершённые"
          title="Удалить все завершённые задачи"
        >
          &#10005;
        </button>
      {/if}
      <button
        class="task-tracker-btn"
        on:click|stopPropagation={openCreateTask}
        aria-label="Добавить задачу"
        title="Добавить задачу"
      >
        +
      </button>
      <button
        class="task-tracker-btn"
        on:click|stopPropagation={openProjectSettings}
        aria-label="Настройки проектов"
        title="Настройки проектов"
      >
        &#9881;
      </button>
    </div>
  </div>

  {#if !collapsed}
    <KanbanTabs />

    <div class="task-tracker-search-bar">
      <input
        class="task-tracker-search-input"
        type="text"
        placeholder="Поиск задач..."
        value={$taskFilter.searchQuery}
        on:input={(e) =>
          taskFilter.update((f) => ({ ...f, searchQuery: e.target.value }))}
        on:keydown={handleSearchKeydown}
      />
      <select
        class="task-tracker-sort-select"
        value={$taskFilter.sortMode}
        on:change={(e) =>
          taskFilter.update((f) => ({
            ...f,
            sortMode: e.target.value,
          }))}
      >
        <option value="date">По дате</option>
        <option value="priority">По приоритету</option>
        <option value="alpha">По алфавиту</option>
        <option value="created">По созданию</option>
      </select>
    </div>

    {#if $projects.length > 0}
      <div class="task-tracker-filter-bar">
        <button
          class="task-tracker-filter-btn"
          class:active={$taskFilter.projectId === null}
          on:click={() =>
            taskFilter.update((f) => ({ ...f, projectId: null }))}
        >
          Все проекты
        </button>
        {#each $projects.filter((p) => !p.archived) as project (project.id)}
          <button
            class="task-tracker-filter-btn project-filter"
            class:active={$taskFilter.projectId === project.id}
            on:click={() =>
              taskFilter.update((f) => ({
                ...f,
                projectId:
                  f.projectId === project.id ? null : project.id,
              }))}
          >
            <span
              class="filter-dot"
              style="background-color: {project.color}"
            ></span>
            {project.name}
          </button>
        {/each}
      </div>
    {/if}

    <div class="task-tracker-list">
      {#if filteredTasks.length === 0}
        <div class="task-tracker-empty">
          {#if !currentDate}
            Выберите дату на календаре
          {:else if allTasksForDate.length === 0}
            Нет задач на эту дату
          {:else if $taskFilter.searchQuery}
            Нет задач, соответствующих поиску
          {:else}
            Нет задач, соответствующих фильтру
          {/if}
        </div>
      {:else}
        {#each taskGroups as group (group.project?.id || "none")}
          {#if group.project}
            <div class="task-group-header">
              <span
                class="project-dot"
                style="background-color: {group.project.color}"
              ></span>
              <span class="group-name">{group.project.name}</span>
              <span class="group-count">{group.tasks.length}</span>
            </div>
          {:else}
            <div class="task-group-header">
              <span class="group-name">Без проекта</span>
              <span class="group-count">{group.tasks.length}</span>
            </div>
          {/if}

          {#each group.tasks as task (task.id)}
            <TaskItem
              {task}
              on:complete={(e) => handleTaskComplete(e.detail.task)}
              on:delete={(e) => handleTaskDelete(e.detail.task)}
            />
          {/each}
        {/each}
      {/if}
    </div>
  {/if}
</div>

{#if showTimeLogs}
  <TimeLogsModal onClose={() => (showTimeLogs = false)} />
{/if}
