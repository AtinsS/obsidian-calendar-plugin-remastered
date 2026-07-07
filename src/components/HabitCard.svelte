<script lang="ts">
  import type { IHabit } from "../habit-tracker/types";
  import { getHabitStats } from "../habit-tracker/stores";
  import type { HabitStats } from "../habit-tracker/stores";
  import { habitLogs } from "../habit-tracker/stores";

  export let habit: IHabit;

  let stats: HabitStats;

  $: {
    // Re-compute when logs change
    $habitLogs;
    stats = getHabitStats(habit.id);
  }

  function translateFrequency(freq: string): string {
    switch (freq) {
      case "daily": return "ежедн.";
      case "weekly": return "еженед.";
      case "custom": return "по расп.";
      default: return freq;
    }
  }
</script>

<div class="habit-card" style="--habit-color: {habit.color}">
  <div class="habit-card-header">
    <span class="habit-card-icon">{habit.icon}</span>
    <span class="habit-card-title">{habit.title}</span>
    <span class="habit-card-freq">{translateFrequency(habit.frequency)}</span>
  </div>

  <div class="habit-card-stats">
    <div class="habit-stat">
      <span class="habit-stat-value">{stats.currentStreak}</span>
      <span class="habit-stat-label">Серия</span>
    </div>
    <div class="habit-stat">
      <span class="habit-stat-value">{stats.longestStreak}</span>
      <span class="habit-stat-label">Макс.</span>
    </div>
    <div class="habit-stat">
      <span class="habit-stat-value">{stats.totalCompletions}</span>
      <span class="habit-stat-label">Всего</span>
    </div>
    <div class="habit-stat">
      <span class="habit-stat-value">{stats.completionRate}%</span>
      <span class="habit-stat-label">Процент</span>
    </div>
  </div>

  {#if stats.lastCompleted}
    <div class="habit-card-last">
      Последнее: {stats.lastCompleted}
    </div>
  {/if}
</div>

<style>
  .habit-card {
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    padding: 12px;
    background: var(--background-secondary);
  }

  .habit-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .habit-card-icon {
    font-size: 18px;
  }

  .habit-card-title {
    font-weight: 600;
    flex: 1;
  }

  .habit-card-freq {
    font-size: 11px;
    color: var(--text-muted);
  }

  .habit-card-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    text-align: center;
  }

  .habit-stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .habit-stat-value {
    font-size: 18px;
    font-weight: 700;
    color: var(--habit-color, var(--text-accent));
  }

  .habit-stat-label {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .habit-card-last {
    margin-top: 8px;
    font-size: 11px;
    color: var(--text-muted);
    text-align: right;
  }

  @media (max-width: 480px) {
    .habit-card-stats {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
