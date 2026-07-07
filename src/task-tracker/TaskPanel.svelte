<script lang="ts">
  import { get } from "svelte/store";
  import moment from "moment";
  import type { App } from "obsidian";
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
    createNextRecurringInstance,
  } from "./stores";
  import { createNoteTask, deleteNoteTask, archiveNoteTask } from "./noteTasks";
  import { settings } from "../ui/stores";
  import TaskItem from "./TaskItem.svelte";
  import KanbanTabs from "./KanbanTabs.svelte";
  import TimeLogsModal from "./TimeLogsModal.svelte";
  import { TaskModal } from "./TaskModal";
  import { ProjectModal } from "./ProjectModal";

  export let appInstance: App;

  let collapsed = false;
  let showTimeLogs = false;
  let showMenu = false;

  $: currentDate = $selectedDate;
  $: allTasksForDate = currentDate
    ? $tasks.filter((t) => t.dateUID === currentDate)
    : [];
  $: filteredTasks = allTasksForDate.filter((t) => {
    if (t.status !== $activeTab) return false;
    if ($taskFilter.projectId && t.projectId !== $taskFilter.projectId)
      return false;
    return true;
  });

  $: taskGroups = groupTasksByProject(filteredTasks, $projects);
  $: totalCount = allTasksForDate.length;
  $: doneCount = allTasksForDate.filter((t) => t.status === "done").length;

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
        return moment(match[1], "YYYY-MM-DD").format("D MMMM YYYY");
      } catch {
        return match[1];
      }
    }
    return dateUID;
  }

  function openCreateTask() {
    const modal = new TaskModal(
      appInstance,
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
          const file = await createNoteTask(task, project, appInstance, customNotePath);
          if (file) {
            updateTask(task.id, { notePath: file.path });
          }
        }
      }
    );
    modal.open();
  }

  async function handleTaskDelete(task: ITask) {
    if (task.notePath && appInstance) {
      await deleteNoteTask(task.notePath, appInstance);
    }
    removeTask(task.id);
  }

  function toggleTaskStatus(task: ITask): "done" | "todo" {
    const newStatus = task.status === "done" ? "todo" : "done";
    updateTaskStatus(task.id, newStatus);
    return newStatus;
  }

  function handleRecurringNext(task: ITask): void {
    if (task.recurrence) {
      createNextRecurringInstance(task.id);
    }
  }

  async function archiveNoteIfCompleted(task: ITask, newStatus: "done" | "todo"): Promise<void> {
    if (newStatus !== "done" || !task.notePath) return;
    if (!appInstance) return;
    const archivePath = $settings.archiveFolderPath || "Archive";
    const newPath = await archiveNoteTask(task.notePath, archivePath, appInstance);
    if (newPath) {
      updateTask(task.id, { notePath: newPath });
    }
  }

  async function handleTaskComplete(task: ITask) {
    const newStatus = toggleTaskStatus(task);

    if (newStatus === "done") {
      handleRecurringNext(task);
      await archiveNoteIfCompleted(task, newStatus);
    }
  }

  async function clearArchive() {
    if (!appInstance) return;

    const archivePath = $settings.archiveFolderPath || "Archive";
    const folder = appInstance.vault.getAbstractFileByPath(archivePath);
    if (!folder) {
      alert("Архив пуст");
      return;
    }

    const files = appInstance.vault.getFiles().filter((f: any) => f.path.startsWith(archivePath + "/"));
    if (files.length === 0) {
      alert("Архив пуст");
      return;
    }

    if (!confirm(`Удалить ${files.length} файлов из архива?`)) return;

    for (const file of files) {
      await appInstance.vault.delete(file);
    }

    // Remove tasks that pointed to archived files
    const archivedPaths = new Set(files.map((f: any) => f.path));
    const allTasks = get(tasks);
    for (const t of allTasks) {
      if (t.notePath && archivedPaths.has(t.notePath)) {
        removeTask(t.id);
      }
    }
  }

  function openProjectSettings() {
    const modal = new ProjectModal(appInstance);
    modal.open();
  }

  function toggleMenu() {
    showMenu = !showMenu;
  }

  function closeMenu() {
    showMenu = false;
  }
</script>

<div
  class="task-tracker-panel"
  class:collapsed
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
        class="task-tracker-btn desktop-only"
        on:click|stopPropagation={() => (showTimeLogs = true)}
        aria-label="Логи времени"
        title="Логи времени"
      >
        &#9201;
      </button>
      <button
        class="task-tracker-btn desktop-only"
        on:click|stopPropagation={clearArchive}
        aria-label="Очистить архив"
        title="Очистить архив"
      >
        &#128465;
      </button>
      <button
        class="task-tracker-btn"
        on:click|stopPropagation={openCreateTask}
        aria-label="Добавить задачу"
        title="Добавить задачу"
      >
        +
      </button>
      <div class="task-tracker-menu-wrapper mobile-only">
        <button
          class="task-tracker-btn"
          on:click|stopPropagation={toggleMenu}
          aria-label="Ещё"
          title="Ещё"
        >
          &#8942;
        </button>
        {#if showMenu}
          <div class="task-tracker-dropdown">
            <button
              class="task-tracker-dropdown-item"
              on:click|stopPropagation={() => { showTimeLogs = true; closeMenu(); }}
            >
              &#9201; <span class="dropdown-label-full">Логи времени</span><span class="dropdown-label-short">Логи</span>
            </button>
            <button
              class="task-tracker-dropdown-item"
              on:click|stopPropagation={() => { clearArchive(); closeMenu(); }}
            >
              &#128465; <span class="dropdown-label-full">Очистить архив</span><span class="dropdown-label-short">Очистить</span>
            </button>
            <button
              class="task-tracker-dropdown-item"
              on:click|stopPropagation={() => { openProjectSettings(); closeMenu(); }}
            >
              &#9881; <span class="dropdown-label-full">Настройки проектов</span><span class="dropdown-label-short">Проекты</span>
            </button>
          </div>
        {/if}
      </div>
      <button
        class="task-tracker-btn desktop-only"
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

    {#if $projects.filter((p) => !p.archived).length > 0}
      <div class="task-tracker-filter-bar">
        <button
          class="task-tracker-filter-btn"
          class:active={$taskFilter.projectId === null}
          on:click={() =>
            taskFilter.update((f) => ({ ...f, projectId: null }))}
        >
          Все
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
          {:else}
            Нет задач в этом статусе
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
              {appInstance}
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
