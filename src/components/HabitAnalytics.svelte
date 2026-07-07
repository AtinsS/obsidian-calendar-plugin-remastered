<script lang="ts">
  import { get } from "svelte/store";
  import {
    habits,
    habitLogs,
    getWeeklyStats,
    getHabitStats,
  } from "../habit-tracker/stores";
  import type { IHabit } from "../habit-tracker/types";
  import Heatmap from "./Heatmap.svelte";
  import HabitCard from "./HabitCard.svelte";

  let selectedHabitId: string = "all";
  let weeklyStats = getWeeklyStats(12);

  $: {
    $habitLogs; // re-compute when logs change
    weeklyStats = getWeeklyStats(12);
  }

  $: activeHabits = $habits.filter((h) => !h.archived);

  $: maxWeekly = Math.max(...weeklyStats.map((w) => w.total), 1);

  // Aggregate stats for "all" view
  $: aggregateStats = {
    totalHabits: activeHabits.length,
    totalCompletions: activeHabits.reduce(
      (sum, h) => sum + getHabitStats(h.id).totalCompletions,
      0
    ),
    bestStreak: Math.max(
      ...activeHabits.map((h) => getHabitStats(h.id).currentStreak),
      0
    ),
  };
</script>

<div class="habit-analytics">
  <div class="habit-analytics-header">
    <h2>Habit Analytics</h2>
    <select bind:value={selectedHabitId} class="habit-analytics-select">
      <option value="all">All Habits</option>
      {#each activeHabits as habit}
        <option value={habit.id}>
          {habit.icon} {habit.title}
        </option>
      {/each}
    </select>
  </div>

  {#if activeHabits.length === 0}
    <div class="habit-analytics-empty">
      No habits to analyze. Create some habits first!
    </div>
  {:else}
    <!-- Summary Cards -->
    {#if selectedHabitId === "all"}
      <div class="habit-analytics-summary">
        <div class="summary-card">
          <span class="summary-value">{aggregateStats.totalHabits}</span>
          <span class="summary-label">Active Habits</span>
        </div>
        <div class="summary-card">
          <span class="summary-value">{aggregateStats.totalCompletions}</span>
          <span class="summary-label">Total Completions</span>
        </div>
        <div class="summary-card">
          <span class="summary-value">{aggregateStats.bestStreak}</span>
          <span class="summary-label">Best Streak</span>
        </div>
      </div>
    {/if}

    <!-- Heatmap -->
    <div class="habit-analytics-section">
      <h3>Activity Heatmap</h3>
      <Heatmap
        habitId={selectedHabitId === "all" ? undefined : selectedHabitId}
      />
    </div>

    <!-- Weekly Bar Chart -->
    <div class="habit-analytics-section">
      <h3>Weekly Activity (Last 12 Weeks)</h3>
      <div class="weekly-chart">
        {#each weeklyStats as week}
          <div class="weekly-bar-wrapper">
            <div
              class="weekly-bar"
              style="height: {week.total > 0
                ? Math.max((week.total / maxWeekly) * 100, 4)
                : 0}%;"
              title="{week.weekStart}: {week.total}"
            ></div>
            <span class="weekly-bar-label">
              {week.weekStart.slice(5)}
            </span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Per-habit cards -->
    {#if selectedHabitId === "all"}
      <div class="habit-analytics-section">
        <h3>Habit Details</h3>
        <div class="habit-cards-grid">
          {#each activeHabits as habit (habit.id)}
            <HabitCard {habit} />
          {/each}
        </div>
      </div>
    {:else}
      {#each activeHabits.filter((h) => h.id === selectedHabitId) as habit (habit.id)}
        <div class="habit-analytics-section">
          <h3>{habit.icon} {habit.title} Details</h3>
          <HabitCard {habit} />
        </div>
      {/each}
    {/if}
  {/if}
</div>

<style>
  .habit-analytics {
    padding: 16px;
    height: 100%;
    overflow-y: auto;
  }

  .habit-analytics-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    flex-wrap: wrap;
    gap: 8px;
  }

  .habit-analytics-header h2 {
    margin: 0;
    font-size: 18px;
  }

  .habit-analytics-select {
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 13px;
  }

  .habit-analytics-empty {
    text-align: center;
    padding: 40px 16px;
    color: var(--text-muted);
    font-size: 14px;
  }

  .habit-analytics-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }

  .summary-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }

  .summary-value {
    font-size: 24px;
    font-weight: 700;
    color: var(--text-accent);
  }

  .summary-label {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 4px;
  }

  .habit-analytics-section {
    margin-bottom: 24px;
  }

  .habit-analytics-section h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 10px 0;
    color: var(--text-normal);
  }

  .weekly-chart {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    height: 120px;
    padding-top: 8px;
  }

  .weekly-bar-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    justify-content: flex-end;
  }

  .weekly-bar {
    width: 100%;
    max-width: 40px;
    background: var(--interactive-accent);
    border-radius: 3px 3px 0 0;
    min-height: 0;
    transition: height 0.2s ease;
  }

  .weekly-bar-label {
    font-size: 9px;
    color: var(--text-muted);
    margin-top: 4px;
    white-space: nowrap;
  }

  .habit-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }

  @media (max-width: 768px) {
    .habit-analytics-summary {
      grid-template-columns: 1fr;
    }

    .habit-cards-grid {
      grid-template-columns: 1fr;
    }

    .weekly-chart {
      height: 80px;
    }
  }

  @media (max-width: 480px) {
    .habit-analytics {
      padding: 12px;
    }

    .habit-analytics-header {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
