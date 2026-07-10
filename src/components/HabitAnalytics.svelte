<script lang="ts">
  import { get } from "svelte/store";
  import {
    habits,
    habitLogs,
    getWeeklyStats,
    getHabitStats,
  } from "../habit-tracker/stores";
  import type { IHabit } from "../habit-tracker/types";
  import HabitCard from "./HabitCard.svelte";
  import BarChart from "./BarChart.svelte";
  import { timeLogs, tasks } from "../task-tracker/stores";
  import { formatDuration } from "../task-tracker/TimerManager";
  import { getEarningsForMonth, getEarningsForYear, getMonthlyEarningsForYear } from "../task-tracker/stores";

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

  // Time logs stats
  $: totalTimeMs = $timeLogs.reduce((sum, log) => sum + log.duration, 0);
  $: uniqueDays = new Set($timeLogs.map(log => log.date)).size;
  $: avgPerDay = uniqueDays > 0 ? totalTimeMs / uniqueDays : 0;

  // Earnings stats
  $: {
    $tasks; // re-compute when tasks change
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    monthlyEarnings = getEarningsForMonth(currentYear, currentMonth);
    yearlyEarnings = getEarningsForYear(currentYear);
    monthlyChart = getMonthlyEarningsForYear(currentYear);
    maxMonthly = Math.max(...monthlyChart.map(m => m.amount), 1);
  }
  let monthlyEarnings = 0;
  let yearlyEarnings = 0;
  let monthlyChart: { month: number; amount: number }[] = [];
  let maxMonthly = 1;

  const monthNames = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
</script>

<div class="habit-analytics">
  <div class="habit-analytics-header">
    <h2>Аналитика</h2>
    <select bind:value={selectedHabitId} class="habit-analytics-select">
      <option value="all">Все привычки</option>
      {#each activeHabits as habit}
        <option value={habit.id}>
          {habit.icon} {habit.title}
        </option>
      {/each}
    </select>
  </div>

  {#if activeHabits.length === 0}
    <div class="habit-analytics-empty">
      Нет привычек для анализа. Сначала создайте привычки!
    </div>
  {:else}
    <!-- Summary Cards -->
    {#if selectedHabitId === "all"}
      <div class="habit-analytics-summary">
        <div class="summary-card">
          <span class="summary-value">{aggregateStats.totalHabits}</span>
          <span class="summary-label">Активных</span>
        </div>
        <div class="summary-card">
          <span class="summary-value">{aggregateStats.totalCompletions}</span>
          <span class="summary-label">Выполнено</span>
        </div>
        <div class="summary-card">
          <span class="summary-value">{aggregateStats.bestStreak}</span>
          <span class="summary-label">Лучшая серия</span>
        </div>
      </div>
    {/if}

    <!-- Weekly Bar Chart -->
    <div class="habit-analytics-section">
      <h3>Активность по неделям (12 нед.)</h3>
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
        <h3>Детали по привычкам</h3>
        <div class="habit-cards-grid">
          {#each activeHabits as habit (habit.id)}
            <HabitCard {habit} />
          {/each}
        </div>
      </div>
    {:else}
      {#each activeHabits.filter((h) => h.id === selectedHabitId) as habit (habit.id)}
        <div class="habit-analytics-section">
          <h3>{habit.icon} {habit.title}</h3>
          <HabitCard {habit} />
        </div>
      {/each}
    {/if}

    <!-- Time Logs Section -->
    <div class="habit-analytics-section">
      <h3>Логи задач по времени</h3>
      {#if $timeLogs.length === 0}
        <div class="time-logs-empty">Нет логов времени</div>
      {:else}
        <div class="time-logs-stats">
          <div class="time-stat">
            <span class="time-stat-value">{formatDuration(totalTimeMs)}</span>
            <span class="time-stat-label">Общее время</span>
          </div>
          <div class="time-stat">
            <span class="time-stat-value">{uniqueDays}</span>
            <span class="time-stat-label">Дней с работой</span>
          </div>
          <div class="time-stat">
            <span class="time-stat-value">{formatDuration(avgPerDay)}</span>
            <span class="time-stat-label">Среднее в день</span>
          </div>
        </div>
        <div class="time-logs-chart">
          <BarChart logs={$timeLogs} />
        </div>
      {/if}
    </div>

    <!-- Earnings Section -->
    <div class="habit-analytics-section">
      <h3>Заработок</h3>
      <div class="earnings-summary">
        <div class="earnings-card">
          <span class="earnings-value">{monthlyEarnings.toLocaleString("ru-RU")} ₽</span>
          <span class="earnings-label">За месяц</span>
        </div>
        <div class="earnings-card">
          <span class="earnings-value">{yearlyEarnings.toLocaleString("ru-RU")} ₽</span>
          <span class="earnings-label">За год</span>
        </div>
      </div>
      {#if monthlyChart.some(m => m.amount > 0)}
        <div class="earnings-chart">
          {#each monthlyChart as monthData}
            <div class="earnings-bar-wrapper">
              <div
                class="earnings-bar"
                style="height: {monthData.amount > 0
                  ? Math.max((monthData.amount / maxMonthly) * 100, 4)
                  : 0}%;"
                title="{monthNames[monthData.month - 1]}: {monthData.amount.toLocaleString('ru-RU')} ₽"
              ></div>
              <span class="earnings-bar-label">
                {monthNames[monthData.month - 1]}
              </span>
            </div>
          {/each}
        </div>
      {:else}
        <div class="earnings-empty">Нет данных о заработке</div>
      {/if}
    </div>
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

  .time-logs-empty {
    text-align: center;
    padding: 20px;
    color: var(--text-muted);
    font-size: 13px;
  }

  .time-logs-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }

  .time-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }

  .time-stat-value {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-accent);
  }

  .time-stat-label {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 4px;
  }

  .time-logs-chart {
    margin-top: 12px;
  }

  .earnings-summary {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }

  .earnings-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }

  .earnings-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--mcp-success, rgba(34, 197, 94, 0.9));
  }

  .earnings-label {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 4px;
  }

  .earnings-chart {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    height: 100px;
    padding-top: 8px;
  }

  .earnings-bar-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    justify-content: flex-end;
  }

  .earnings-bar {
    width: 100%;
    max-width: 40px;
    background: var(--mcp-success, rgba(34, 197, 94, 0.7));
    border-radius: 3px 3px 0 0;
    min-height: 0;
    transition: height 0.2s ease;
  }

  .earnings-bar-label {
    font-size: 9px;
    color: var(--text-muted);
    margin-top: 4px;
    white-space: nowrap;
  }

  .earnings-empty {
    text-align: center;
    padding: 20px;
    color: var(--text-muted);
    font-size: 13px;
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

    .time-logs-stats {
      grid-template-columns: 1fr;
    }

    .earnings-summary {
      grid-template-columns: 1fr;
    }

    .earnings-chart {
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
