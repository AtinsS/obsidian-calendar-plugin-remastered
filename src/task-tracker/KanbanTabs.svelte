<script lang="ts">
  import type { TaskStatus } from "./types";
  import { tasks, activeTab, selectedDate } from "./stores";

  $: currentDate = $selectedDate;

  $: counts = {
    all: $tasks.filter(
      (t) => t.status !== "done" && (!currentDate || t.dateUID === currentDate)
    ).length,
    todo: $tasks.filter(
      (t) => t.status === "todo" && (!currentDate || t.dateUID === currentDate)
    ).length,
    progress: $tasks.filter(
      (t) => t.status === "progress" && (!currentDate || t.dateUID === currentDate)
    ).length,
    paused: $tasks.filter(
      (t) => t.status === "paused" && (!currentDate || t.dateUID === currentDate)
    ).length,
    done: $tasks.filter(
      (t) => t.status === "done" && (!currentDate || t.dateUID === currentDate)
    ).length,
  };

  const tabs: { key: TaskStatus; icon: string; label: string }[] = [
    { key: "all", icon: "📋", label: "Все" },
    { key: "todo", icon: "🟢", label: "Сделать" },
    { key: "progress", icon: "🔥", label: "В работе" },
    { key: "paused", icon: "☕", label: "На паузе" },
    { key: "done", icon: "✅", label: "Готово" },
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
      {#if counts[tab.key] > 0}
        <span class="kanban-tab-count">{counts[tab.key]}</span>
      {/if}
    </button>
  {/each}
</div>
