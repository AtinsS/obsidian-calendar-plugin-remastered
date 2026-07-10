<script lang="ts">
  import type { TaskStatus } from "./types";
  import { tasks, activeTab, selectedDate } from "./stores";

  $: currentDate = $selectedDate;

  $: counts = {
    todo: $tasks.filter(
      (t) =>
        t.status === "todo" && t.dateUID === currentDate
    ).length,
    progress: $tasks.filter(
      (t) =>
        t.status === "progress" && t.dateUID === currentDate
    ).length,
    paused: $tasks.filter(
      (t) =>
        t.status === "paused" && t.dateUID === currentDate
    ).length,
    done: $tasks.filter(
      (t) =>
        t.status === "done" && t.dateUID === currentDate
    ).length,
  };

  const tabs: { key: TaskStatus; label: string; icon: string }[] = [
    { key: "todo", label: "Сделать", icon: "\u25CB" },
    { key: "progress", label: "В работе", icon: "\u23F3" },
    { key: "paused", label: "На паузе", icon: "\u23F8" },
    { key: "done", label: "Готово", icon: "\u2714" },
  ];

  function setTab(tab: TaskStatus) {
    activeTab.set(tab);
  }
</script>

<div class="kanban-tabs">
  {#each tabs as tab (tab.key)}
    <button
      class="kanban-tab"
      class:active={$activeTab === tab.key}
      on:click={() => setTab(tab.key)}
    >
      <span class="kanban-tab-icon">{tab.icon}</span>
      <span class="kanban-tab-label">{tab.label}</span>
      <span class="kanban-tab-count">{counts[tab.key]}</span>
    </button>
  {/each}
</div>
