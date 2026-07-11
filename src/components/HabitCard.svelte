<script lang="ts">
  import type { IHabit } from "../habit-tracker/types";
  import { getHabitStats } from "../habit-tracker/stores";
  import type { HabitStats } from "../habit-tracker/stores";
  import { habitLogs } from "../habit-tracker/stores";

  export let habit: IHabit;

  let stats: HabitStats;

  $: {
    $habitLogs;
    stats = getHabitStats(habit.id);
  }

  function translateFrequency(freq: string): string {
    switch (freq) {
      case "daily": return "ежедневно";
      case "weekly": return "еженедельно";
      case "custom": return "по расписанию";
      default: return freq;
    }
  }
</script>

<div class="habit-card" style="--habit-color: {habit.color}">
  <div class="habit-card-header">
    <span class="habit-card-icon">{habit.icon}</span>
    <span class="habit-card-title">{habit.title}</span>
    <span class="habit-card-badge">
      <span class="habit-card-trend">↑ прогресс</span>
      <span class="habit-card-freq">{translateFrequency(habit.frequency)}</span>
    </span>
  </div>

  <div class="habit-card-stats">
    <div class="habit-stat">
      <span class="habit-stat-value">{stats.currentStreak}</span>
      <span class="habit-stat-label">серия</span>
      <span class="habit-stat-sub">дней</span>
    </div>
    <div class="habit-stat">
      <span class="habit-stat-value">{stats.longestStreak}</span>
      <span class="habit-stat-label">макс.</span>
      <span class="habit-stat-sub">дней</span>
    </div>
    <div class="habit-stat">
      <span class="habit-stat-value">{stats.totalCompletions}</span>
      <span class="habit-stat-label">всего</span>
      <span class="habit-stat-sub">выполнений</span>
    </div>
    <div class="habit-stat">
      <span class="habit-stat-value stat-accent">{stats.completionRate}%</span>
      <span class="habit-stat-label">процент</span>
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
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius);
    padding: 14px;
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    box-shadow: var(--mcp-shadow);
    transition: all 0.25s ease;
  }

  .habit-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--mcp-shadow-glow);
    border-color: var(--habit-color, var(--mcp-accent));
  }

  .habit-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .habit-card-icon {
    font-size: 20px;
  }

  .habit-card-title {
    font-weight: 600;
    font-size: 13px;
    flex: 1;
    color: var(--mcp-text);
  }

  .habit-card-badge {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }

  .habit-card-trend {
    font-size: 10px;
    font-weight: 600;
    color: var(--mcp-success);
    background: var(--mcp-success-dim);
    padding: 2px 8px;
    border-radius: 10px;
  }

  .habit-card-freq {
    font-size: 10px;
    color: var(--mcp-text-muted);
  }

  .habit-card-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    text-align: center;
    margin-bottom: 10px;
  }

  .habit-stat {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .habit-stat-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--habit-color, var(--mcp-accent));
    letter-spacing: -0.02em;
  }

  .habit-stat-value.stat-accent {
    color: var(--habit-color, var(--mcp-accent));
  }

  .habit-stat-label {
    font-size: 9px;
    color: var(--mcp-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 500;
  }

  .habit-stat-sub {
    font-size: 9px;
    color: var(--mcp-text-faint);
    font-weight: 400;
  }

  .habit-card-last {
    font-size: 11px;
    color: var(--mcp-text-muted);
    text-align: right;
    padding-top: 4px;
    border-top: 1px solid var(--mcp-glass-border);
  }

  @media (max-width: 480px) {
    .habit-card-stats {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
