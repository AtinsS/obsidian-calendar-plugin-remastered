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
  import { getDateUID } from "obsidian-daily-notes-interface";
  import TaskItem from "./TaskItem.svelte";
  import KanbanTabs from "./KanbanTabs.svelte";
  import TimeLogsModal from "./TimeLogsModal.svelte";
  import { TaskModal } from "./TaskModal";
  import { ProjectModal } from "./ProjectModal";

  export let appInstance: App;

  let collapsed = false;
  let showTimeLogs = false;
  let showMenu = false;
  let searchQuery = "";

  $: currentDate = $selectedDate;
  $: allTasksForDate = currentDate
    ? $tasks.filter((t) => t.dateUID === currentDate)
    : $tasks;
  $: filteredTasks = allTasksForDate.filter((t) => {
    if ($taskFilter.projectId && t.projectId !== $taskFilter.projectId)
      return false;
    // Search filter
    if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase()))
      return false;
    // Tasks with deadlines are always visible
    if (t.deadline && t.status !== "done") return true;
    // "all" tab — show everything except done
    if ($activeTab === "all") return t.status !== "done";
    return t.status === $activeTab;
  });

  $: showAllDates = !currentDate;
  $: taskGroups = showAllDates
    ? groupTasksByDateAndProject(filteredTasks, $projects)
    : groupTasksByProject(filteredTasks, $projects);
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

  function groupTasksByDateAndProject(
    taskList: ITask[],
    projectList: IProject[]
  ): { dateUID: string; dateLabel: string; groups: { project: IProject | null; tasks: ITask[] }[] }[] {
    const byDate = new Map<string, ITask[]>();
    for (const task of taskList) {
      const key = task.dateUID || "unassigned";
      const arr = byDate.get(key) || [];
      arr.push(task);
      byDate.set(key, arr);
    }

    const sortedDates = Array.from(byDate.keys()).sort((a, b) => {
      if (a === "unassigned") return 1;
      if (b === "unassigned") return -1;
      return a.localeCompare(b);
    });

    const result: { dateUID: string; dateLabel: string; groups: { project: IProject | null; tasks: ITask[] }[] }[] = [];

    for (const dateKey of sortedDates) {
      const dateTasks = byDate.get(dateKey)!;
      const label = dateKey === "unassigned" ? "Без даты" : formatDate(dateKey);
      const groups = groupTasksByProject(dateTasks, projectList);
      result.push({ dateUID: dateKey, dateLabel: label, groups });
    }

    return result;
  }

  function formatDate(dateUID: string): string {
    if (!dateUID) return "Дата не выбрана";
    const match = dateUID.match(/^(?:day|week|month)-(\d{4}-\d{2}-\d{2})/);
    if (match) {
      try {
        const m = window.moment(match[1], "YYYY-MM-DD", true);
        if (m.isValid()) {
          return m.format("D MMMM YYYY");
        }
        return match[1];
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

  async function clearCompletedTasks() {
    if (!appInstance) return;

    const allTasksList = get(tasks);
    const completedTasks = allTasksList.filter((t) => t.completed);

    if (completedTasks.length === 0) {
      alert("Нет выполненных задач");
      return;
    }

    if (!confirm(`Удалить ${completedTasks.length} выполненных задач?`)) return;

    // Delete associated note files if they exist
    for (const task of completedTasks) {
      if (task.notePath) {
        const file = appInstance.vault.getAbstractFileByPath(task.notePath);
        if (file) {
          await appInstance.vault.delete(file);
        }
      }
      removeTask(task.id);
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

  function goToToday() {
    const todayUID = getDateUID(window.moment(), "day");
    selectedDate.set(todayUID);
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
        class="task-tracker-btn"
        on:click|stopPropagation={goToToday}
        title="Перейти к сегодня"
      >
        ☀️
      </button>
      <button
        class="task-tracker-btn"
        on:click|stopPropagation={openCreateTask}
        title="Добавить задачу"
      >
        +
      </button>
      <button
        class="task-tracker-btn"
        on:click|stopPropagation={openProjectSettings}
        title="Управление проектами"
      >
        ❇️
      </button>
      <div class="task-tracker-menu-wrapper">
        <button
          class="task-tracker-btn"
          on:click|stopPropagation={toggleMenu}
          title="Ещё"
        >
          &#8942;
        </button>
        {#if showMenu}
          <div class="task-tracker-dropdown" on:click|stopPropagation role="menu">
            <button
              class="task-tracker-dropdown-item"
              role="menuitem"
              on:click|stopPropagation={() => { showTimeLogs = true; closeMenu(); }}
            >
              &#9201; Логи времени
            </button>
            <button
              class="task-tracker-dropdown-item"
              role="menuitem"
              on:click|stopPropagation={() => { clearCompletedTasks(); closeMenu(); }}
            >
              &#128465; Очистить выполненные
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>

  {#if !collapsed}
    <KanbanTabs />

    {#if $activeTab === "all" && !currentDate}
      <div class="task-tracker-search-bar">
        <input
          type="text"
          class="task-tracker-search-input"
          placeholder="Поиск задач..."
          bind:value={searchQuery}
        />
      </div>
    {/if}

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
            style={$taskFilter.projectId === project.id
              ? `background: ${project.color}; border-color: ${project.color}; color: #fff;`
              : ''}
            on:click={() =>
              taskFilter.update((f) => ({
                ...f,
                projectId:
                  f.projectId === project.id ? null : project.id,
              }))}
          >
            {#if project.icon}
              <span class="project-icon">{project.icon}</span>
            {:else}
              <span
                class="filter-dot"
                style="background-color: {project.color}"
              ></span>
            {/if}
            {project.name}
          </button>
        {/each}
      </div>
    {/if}

    <div class="task-tracker-list">
      {#if filteredTasks.length === 0}
        <div class="task-tracker-empty">
          {#if !currentDate && $tasks.length === 0}
            Нет задач
          {:else if !currentDate}
            Нет задач в этом статусе
          {:else if allTasksForDate.length === 0}
            Нет задач на эту дату
          {:else}
            Нет задач в этом статусе
          {/if}
        </div>
      {:else if showAllDates}
        {#each taskGroups as dateGroup (dateGroup.dateUID)}
          <div class="task-date-group-header">
            <span class="date-group-label">{dateGroup.dateLabel}</span>
          </div>
          {#each dateGroup.groups as group (dateGroup.dateUID + "-" + (group.project?.id || "none"))}
            {#if group.project}
              <div class="task-group-header">
                {#if group.project.icon}
                  <span class="project-icon">{group.project.icon}</span>
                {:else}
                  <span
                    class="project-dot"
                    style="background-color: {group.project.color}"
                  ></span>
                {/if}
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
        {/each}
      {:else}
        {#each taskGroups as group (group.project?.id || "none")}
          {#if group.project}
            <div class="task-group-header">
              {#if group.project.icon}
                <span class="project-icon">{group.project.icon}</span>
              {:else}
                <span
                  class="project-dot"
                  style="background-color: {group.project.color}"
                ></span>
              {/if}
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
