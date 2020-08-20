<script lang="ts">
  import type { TaskStatus } from "./types";
  import { tasks, activeTab, selectedDate } from "./stores";

  $: currentDate = $selectedDate;

  $: counts = (() => {
    const result = { all: 0, todo: 0, progress: 0, paused: 0, done: 0 };
    for (const t of $tasks) {
      if (currentDate && t.dateUID !== currentDate) continue;
      if (t.status === "done") {
        result.done++;
      } else if (t.status === "todo") {
        result.todo++;
        result.all++;
      } else if (t.status === "progress") {
        result.progress++;
        result.all++;
      } else if (t.status === "paused") {
        result.paused++;
        result.all++;
      }
    }
    return result;
  })();

  const tabs: { key: TaskStatus; icon: string; label: string }[] = [
    { key: "all", icon: "📋", label: "Все" },
    { key: "todo", icon: "🟢", label: "Сделать" },
    { key: "progress", icon: "🔥", label: "В работе" },
    { key: "paused", icon: "☕", label: "На паузе" },
    { key: "done", icon: "✅", label: "Готово" },
  ];

  $: currentTab = tabs.find((t) => t.key === $activeTab) || tabs[0];

  let showDropdown = false;

  function setTab(tab: TaskStatus) {
    activeTab.set(tab);
    showDropdown = false;
  }

  function toggleDropdown() {
    showDropdown = !showDropdown;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      showDropdown = false;
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="kanban-dropdown-wrapper">
  <button
    class="kanban-dropdown-trigger"
    on:click|stopPropagation={toggleDropdown}
  >
    <span class="kanban-trigger-icon">{currentTab.icon}</span>
    <span class="kanban-trigger-label">{currentTab.label}</span>
    {#if counts[currentTab.key] > 0}
      <span class="kanban-trigger-count">{counts[currentTab.key]}</span>
    {/if}
    <span class="kanban-trigger-arrow" class:rotated={showDropdown}>&#9662;</span>
  </button>
  {#if showDropdown}
    <div class="kanban-dropdown-menu" on:click|stopPropagation role="menu">
      {#each tabs as tab (tab.key)}
        <button
          class="kanban-dropdown-item"
          class:active={$activeTab === tab.key}
          role="menuitem"
          on:click={() => setTab(tab.key)}
        >
          <span class="kanban-item-icon">{tab.icon}</span>
          <span class="kanban-item-label">{tab.label}</span>
          {#if counts[tab.key] > 0}
            <span class="kanban-item-count">{counts[tab.key]}</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
