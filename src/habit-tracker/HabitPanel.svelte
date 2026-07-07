<script lang="ts">
  import moment from "moment";
  import type { App } from "obsidian";
  import type { IHabit } from "./types";
  import {
    habits,
    addHabit,
    updateHabit,
    removeHabit,
    toggleHabitCompletion,
    calculateStreak,
  } from "./stores";
  import { selectedDate } from "../task-tracker/stores";
  import HabitItem from "./HabitItem.svelte";
  import { HabitModal } from "./HabitModal";

  export let appInstance: App;

  let collapsed = false;

  $: currentDate = $selectedDate;
  $: dateStr = extractDateStr(currentDate);
  $: activeHabits = $habits.filter((h) => !h.archived);
  $: totalStreak = activeHabits.reduce(
    (sum, h) => sum + calculateStreak(h.id),
    0
  );

  function extractDateStr(dateUID: string): string {
    if (!dateUID) {
      return moment().format("YYYY-MM-DD");
    }
    const match = dateUID.match(/^(?:day|week)-(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : moment().format("YYYY-MM-DD");
  }

  function openCreateHabit() {
    const modal = new HabitModal(
      appInstance,
      (habitData) => {
        addHabit({
          ...habitData,
          sortOrder: activeHabits.length,
        } as Omit<IHabit, "id" | "createdAt">);
      }
    );
    modal.open();
  }

  function handleToggle(event: CustomEvent<{ habit: IHabit }>) {
    toggleHabitCompletion(event.detail.habit.id, dateStr);
  }

  function handleEdit(event: CustomEvent<{ habit: IHabit }>) {
    const modal = new HabitModal(
      appInstance,
      (changes) => {
        updateHabit(event.detail.habit.id, changes);
      },
      event.detail.habit
    );
    modal.open();
  }

  function handleDelete(event: CustomEvent<{ habit: IHabit }>) {
    removeHabit(event.detail.habit.id);
  }
</script>

<div class="habit-tracker-panel" class:collapsed>
  <div
    class="habit-tracker-header"
    on:click={() => (collapsed = !collapsed)}
    on:keydown={(e) => {
      if (e.key === "Enter" || e.key === " ") collapsed = !collapsed;
    }}
    tabindex="0"
    role="button"
    aria-expanded={!collapsed}
  >
    <div class="habit-tracker-header-left">
      <span class="habit-tracker-chevron" class:rotated={!collapsed}>&#9662;</span>
      <span class="habit-tracker-title">Привычки</span>
      {#if totalStreak > 0}
        <span class="habit-tracker-streak">
          &#128293; {totalStreak}
        </span>
      {/if}
    </div>
    <div class="habit-tracker-header-right">
      <button
        class="habit-tracker-btn"
        on:click|stopPropagation={openCreateHabit}
        title="Добавить привычку"
      >
        +
      </button>
    </div>
  </div>

  {#if !collapsed}
    <div class="habit-tracker-list">
      {#if activeHabits.length === 0}
        <div class="habit-tracker-empty">
          Нет привычек. Нажмите + чтобы создать.
        </div>
      {:else}
        {#each activeHabits as habit (habit.id)}
          <HabitItem
            {habit}
            date={dateStr}
            on:toggle={handleToggle}
            on:edit={handleEdit}
            on:delete={handleDelete}
          />
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .habit-tracker-header {
    min-height: 44px;
  }

  .habit-tracker-btn {
    min-width: 44px;
    min-height: 44px;
  }
</style>
