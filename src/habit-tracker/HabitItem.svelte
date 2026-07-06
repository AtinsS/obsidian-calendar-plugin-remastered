<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { IHabit } from "./types";
  import { habitLogs, isHabitCompletedOnDate, calculateStreak } from "./stores";

  export let habit: IHabit;
  export let date: string;

  const dispatch = createEventDispatcher();

  let isCompleted = false;
  let streak = 0;

  $: _logs = $habitLogs;
  $: {
    _logs;
    isCompleted = isHabitCompletedOnDate(habit.id, date);
  }
  $: {
    _logs;
    streak = calculateStreak(habit.id);
  }

  function toggle() {
    dispatch("toggle", { habit });
  }

  function handleEdit() {
    dispatch("edit", { habit });
  }

  function handleDelete() {
    dispatch("delete", { habit });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    } else if (e.key === "Delete") {
      e.preventDefault();
      handleDelete();
    } else if (e.key === "e" || e.key === "E") {
      e.preventDefault();
      handleEdit();
    }
  }
</script>

<div
  class="habit-item"
  class:completed={isCompleted}
  on:keydown={handleKeydown}
  tabindex="0"
  role="listitem"
  aria-label={habit.title}
>
  <button
    class="habit-check-btn"
    class:checked={isCompleted}
    style="--habit-color: {habit.color}"
    on:click={toggle}
    aria-label={isCompleted ? "Отменить выполнение" : "Отметить выполнение"}
  >
    {#if isCompleted}
      <span class="habit-check-icon">&#10003;</span>
    {/if}
  </button>

  <span class="habit-icon">{habit.icon}</span>
  <span class="habit-title" class:completed-text={isCompleted}>
    {habit.title}
  </span>

  {#if streak > 0}
    <span class="habit-streak">
      <span class="streak-fire">&#128293;</span>
      {streak}
    </span>
  {/if}

  <button
    class="habit-edit-btn"
    on:click={handleEdit}
    aria-label="Редактировать привычку"
  >
    &#9998;
  </button>

  <button
    class="habit-delete-btn"
    on:click={handleDelete}
    aria-label="Удалить привычку"
  >
    &#10005;
  </button>
</div>
