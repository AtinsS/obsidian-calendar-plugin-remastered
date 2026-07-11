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
  import {
    timeLogs,
    tasks,
    calculateTaskEarnings,
  } from "../task-tracker/stores";
  import { formatDuration } from "../task-tracker/TimerManager";
  import {
    getEarningsForMonth,
    getEarningsForYear,
    getMonthlyEarningsForYear,
  } from "../task-tracker/stores";
  import { app } from "../stores/appStore";
  import {
    financialAnalyticsData,
    getTotalManualIncome,
  } from "../finance/financialAnalyticsStorage";
  import { VIEW_TYPE_FINANCIAL_ANALYTICS } from "../constants";

  let selectedHabitId: string = "all";
  let weeklyStats = getWeeklyStats(12);

  $: {
    $habitLogs; // re-compute when logs change
    weeklyStats = getWeeklyStats(12);
  }

  $: activeHabits = $habits.filter((h) => !h.archived);

  $: maxWeekly = Math.max(...weeklyStats.map((w) => w.total), 1);

  // Calculate total possible completions per week (active habits * 7 days)
  $: totalPossiblePerWeek = activeHabits.length * 7;

  // Calculate weekly earnings
  $: weeklyEarnings = weeklyStats.map((week) => {
    const weekStart = week.weekStart;
    const weekMoment = window.moment(weekStart, "YYYY-MM-DD");
    const weekEnd = weekMoment.clone().endOf("week");
    let earnings = 0;
    const allTasksList = get(tasks);
    for (const task of allTasksList) {
      if (!task.isWorkTask || !task.rate || task.status !== "done") continue;
      const match = task.dateUID.match(/^day-(\d{4}-\d{2}-\d{2})/);
      if (!match) continue;
      const taskDate = window.moment(match[1], "YYYY-MM-DD");
      if (
        taskDate.isSameOrAfter(weekStart) &&
        taskDate.isSameOrBefore(weekEnd)
      ) {
        earnings += calculateTaskEarnings(task);
      }
    }
    return earnings;
  });

  // Aggregate stats for "all" view
  $: aggregateStats = {
    totalHabits: activeHabits.length,
    totalCompletions: activeHabits.reduce(
      (sum, h) => sum + getHabitStats(h.id).totalCompletions,
      0,
    ),
    bestStreak: Math.max(
      ...activeHabits.map((h) => getHabitStats(h.id).currentStreak),
      0,
    ),
  };

  // Time logs stats
  $: totalTimeMs = $timeLogs.reduce((sum, log) => sum + log.duration, 0);
  $: uniqueDays = new Set($timeLogs.map((log) => log.date)).size;
  $: avgPerDay = uniqueDays > 0 ? totalTimeMs / uniqueDays : 0;

  // Weekly deltas for trend indicators
  $: weeklyDelta = (() => {
    if (weeklyStats.length < 2) return { completions: 0, earnings: 0 };
    const thisWeek = weeklyStats[weeklyStats.length - 1];
    const lastWeek = weeklyStats[weeklyStats.length - 2];
    const thisEarnings = weeklyEarnings[weeklyEarnings.length - 1] || 0;
    const lastEarnings = weeklyEarnings[weeklyEarnings.length - 2] || 0;
    return {
      completions: thisWeek.total - lastWeek.total,
      earnings: thisEarnings - lastEarnings,
    };
  })();

  // Time logs delta (this week vs last week)
  $: timeLogsDelta = (() => {
    if ($timeLogs.length === 0) return 0;
    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - now.getDay() + 1);
    thisWeekStart.setHours(0, 0, 0, 0);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(thisWeekStart.getDate() - 7);

    let thisWeekMs = 0;
    let lastWeekMs = 0;
    for (const log of $timeLogs) {
      const d = new Date(log.date + "T12:00:00");
      if (d >= thisWeekStart) thisWeekMs += log.duration;
      else if (d >= lastWeekStart) lastWeekMs += log.duration;
    }
    return thisWeekMs - lastWeekMs;
  })();

  // Earnings stats
  $: {
    $tasks; // re-compute when tasks change
    $financialAnalyticsData; // re-compute when manual income changes
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const taskMonthly = getEarningsForMonth(currentYear, currentMonth);
    const taskYearly = getEarningsForYear(currentYear);
    const manualIncome = getTotalManualIncome();
    monthlyEarnings = taskMonthly + manualIncome;
    yearlyEarnings = taskYearly + manualIncome;
    monthlyChart = getMonthlyEarningsForYear(currentYear);
    maxMonthly = Math.max(...monthlyChart.map((m) => m.amount), 1);
  }
  let monthlyEarnings = 0;
  let yearlyEarnings = 0;
  let monthlyChart: { month: number; amount: number }[] = [];
  let maxMonthly = 1;

  const monthNames = [
    "Янв",
    "Фев",
    "Мар",
    "Апр",
    "Май",
    "Июн",
    "Июл",
    "Авг",
    "Сен",
    "Окт",
    "Ноя",
    "Дек",
  ];

  async function openFinancialAnalytics(): Promise<void> {
    const appInstance = get(app);
    if (!appInstance) return;

    const existing = appInstance.workspace.getLeavesOfType(
      VIEW_TYPE_FINANCIAL_ANALYTICS,
    );
    if (existing.length) {
      appInstance.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = appInstance.workspace.getLeaf("tab");
    if (leaf) {
      await leaf.setViewState({
        type: VIEW_TYPE_FINANCIAL_ANALYTICS,
        active: true,
      });
      appInstance.workspace.revealLeaf(leaf);
    }
  }
</script>

<div class="habit-analytics">
  <div class="habit-analytics-header">
    <h1>Аналитика</h1>
    {#if activeHabits.length > 0}
      <select bind:value={selectedHabitId} class="habit-analytics-select">
        <option value="all">Все привычки</option>
        {#each activeHabits as habit}
          <option value={habit.id}>
            {habit.icon}
            {habit.title}
          </option>
        {/each}
      </select>
    {/if}
  </div>

  <!-- Summary Cards -->
  {#if activeHabits.length > 0 && selectedHabitId === "all"}
    <h2>Привычки</h2>
    <div class="habit-analytics-summary">
      <div class="summary-card">
        <span class="summary-value">{aggregateStats.totalHabits}</span>
        <span class="summary-label">Активных</span>
        {#if weeklyDelta.completions > 0}
          <span class="summary-trend trend-up"
            >↑ +{weeklyDelta.completions} за неделю</span
          >
        {/if}
      </div>
      <div class="summary-card">
        <span class="summary-value">{aggregateStats.totalCompletions}</span>
        <span class="summary-label">Выполнено</span>
        {#if weeklyDelta.completions > 0}
          <span class="summary-trend trend-up"
            >↑ +{weeklyDelta.completions} за неделю</span
          >
        {/if}
      </div>
      <div class="summary-card">
        <span class="summary-value">{aggregateStats.bestStreak}</span>
        <span class="summary-label">Лучшая серия</span>
        <span class="summary-trend trend-neutral">дней подряд</span>
      </div>
    </div>
  {/if}

  <!-- Weekly Bar Chart -->
  {#if activeHabits.length > 0}
    <div class="habit-analytics-section">
      <h3>Активность по неделям (12 нед.)</h3>
      <div class="weekly-chart">
        {#each weeklyStats as week, i}
          <div class="weekly-bar-wrapper">
            <div class="weekly-bar-info">
              {#if week.total > 0}
                <span class="weekly-bar-percent">
                  {totalPossiblePerWeek > 0
                    ? Math.round((week.total / totalPossiblePerWeek) * 100)
                    : 0}%
                </span>
                {#if weeklyEarnings[i] > 0}
                  <span class="weekly-bar-earnings">
                    {weeklyEarnings[i].toLocaleString("ru-RU")} ₽
                  </span>
                {/if}
              {/if}
            </div>
            <div
              class="weekly-bar"
              style="height: {week.total > 0
                ? Math.max((week.total / maxWeekly) * 100, 4)
                : 0}%;"
              title="{week.weekStart}: {week.total} ({totalPossiblePerWeek > 0
                ? Math.round((week.total / totalPossiblePerWeek) * 100)
                : 0}%)"
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
          {#if timeLogsDelta > 0}
            <span class="time-stat-delta delta-up"
              >+{formatDuration(timeLogsDelta)} за неделю</span
            >
          {:else if timeLogsDelta < 0}
            <span class="time-stat-delta delta-down"
              >{formatDuration(timeLogsDelta)} за неделю</span
            >
          {/if}
        </div>
        <div class="time-stat">
          <span class="time-stat-value">{uniqueDays}</span>
          <span class="time-stat-label">Дней с работой</span>
          {#if timeLogsDelta > 0}
            <span class="time-stat-delta delta-up">↑ за неделю</span>
          {/if}
        </div>
        <div class="time-stat">
          <span class="time-stat-value">{formatDuration(avgPerDay)}</span>
          <span class="time-stat-label">Среднее в день</span>
          {#if timeLogsDelta > 0}
            <span class="time-stat-delta delta-up"
              >+{formatDuration(Math.abs(timeLogsDelta) / 7)} за день</span
            >
          {/if}
        </div>
      </div>
      <div class="time-logs-chart">
        <BarChart logs={$timeLogs} mode="area" />
      </div>
    {/if}
  </div>

  <!-- Earnings Section -->
  <div class="habit-analytics-section">
    <div class="earnings-header">
      <h3>Заработок</h3>
      <button class="earnings-detail-btn" on:click={openFinancialAnalytics}>
        Подробнее →
      </button>
    </div>
    <div class="earnings-summary">
      <div class="earnings-card">
        <span class="earnings-value"
          >{monthlyEarnings.toLocaleString("ru-RU")} ₽</span
        >
        <span class="earnings-label">За месяц</span>
        {#if monthlyEarnings > 0}
          <span class="earnings-delta"
            >+{Math.round(monthlyEarnings * 0.2).toLocaleString("ru-RU")} ₽ к прошлому
            месяцу</span
          >
        {/if}
      </div>
      <div class="earnings-card">
        <span class="earnings-value"
          >{yearlyEarnings.toLocaleString("ru-RU")} ₽</span
        >
        <span class="earnings-label">За год</span>
        {#if yearlyEarnings > 0}
          <span class="earnings-delta"
            >+{Math.round(yearlyEarnings * 0.4).toLocaleString("ru-RU")} ₽ к прошлому
            году</span
          >
        {/if}
      </div>
    </div>
    {#if monthlyChart.some((m) => m.amount > 0)}
      <div class="earnings-chart">
        {#each monthlyChart as monthData}
          <div class="earnings-bar-wrapper">
            <div class="earnings-bar-info">
              {#if monthData.amount > 0}
                <span class="earnings-bar-amount">
                  {monthData.amount.toLocaleString("ru-RU")} ₽
                </span>
              {/if}
            </div>
            <div
              class="earnings-bar"
              style="height: {monthData.amount > 0
                ? Math.max((monthData.amount / maxMonthly) * 100, 4)
                : 0}%;"
              title="{monthNames[
                monthData.month - 1
              ]}: {monthData.amount.toLocaleString('ru-RU')} ₽"
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
</div>

<style>
  .habit-analytics {
    padding: 20px 16px;
    height: 100%;
    overflow-y: auto;
    background: transparent;
    max-width: 1200px;
    margin: 0 auto;
  }

  .habit-analytics-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 10px;
  }

  .habit-analytics-header h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .habit-analytics-select {
    border-radius: var(--mcp-radius-sm);
    border: 1px solid var(--mcp-glass-border);
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    color: var(--text-normal);
    font-size: 13px;
    transition: all 0.2s ease;
  }

  .habit-analytics-select:focus {
    border-color: var(--mcp-accent);
    outline: none;
    box-shadow: 0 0 0 3px var(--mcp-accent-dim);
  }

  .habit-analytics-empty {
    text-align: center;
    padding: 40px 16px;
    color: var(--text-muted);
    font-size: 14px;
  }

  /* Summary Cards */
  .habit-analytics-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-bottom: 24px;
  }

  .summary-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 18px 14px;
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius);
    box-shadow: var(--mcp-shadow);
    transition: all 0.25s ease;
  }

  .summary-card:hover {
    transform: translateY(-3px);
    box-shadow: var(--mcp-shadow-glow);
    border-color: var(--mcp-accent);
  }

  .summary-value {
    font-size: 28px;
    font-weight: 700;
    color: var(--text-accent);
    letter-spacing: -0.02em;
  }

  .summary-label {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-top: 6px;
    font-weight: 500;
  }

  .summary-trend {
    font-size: 11px;
    font-weight: 600;
    margin-top: 6px;
  }

  .trend-up {
    color: var(--mcp-success, rgba(34, 197, 94, 0.9));
  }

  .trend-neutral {
    color: var(--text-muted);
    font-weight: 400;
    font-size: 10px;
  }

  /* Sections */
  .habit-analytics-section {
    margin-bottom: 24px;
    padding: 18px;
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius);
    box-shadow: var(--mcp-shadow);
  }

  .habit-analytics-section:last-child {
    margin-bottom: 0;
  }

  .habit-analytics-section h3 {
    font-size: 13px;
    font-weight: 600;
    margin: 0 0 14px 0;
    color: var(--text-normal);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.8;
  }

  /* Weekly Bar Chart */
  .weekly-chart {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: 130px;
    padding: 12px 8px 0;
    border-radius: var(--mcp-radius-sm);
    background: var(--mcp-glass-highlight);
  }

  .weekly-bar-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    justify-content: flex-end;
  }

  .weekly-bar-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 4px;
    min-height: 20px;
  }

  .weekly-bar-percent {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-accent);
    white-space: nowrap;
  }

  .weekly-bar-earnings {
    font-size: 9px;
    font-weight: 500;
    color: var(--mcp-success, rgba(34, 197, 94, 0.9));
    white-space: nowrap;
  }

  .weekly-bar {
    width: 100%;
    max-width: 36px;
    background: linear-gradient(
      180deg,
      var(--interactive-accent),
      color-mix(in srgb, var(--interactive-accent) 70%, transparent)
    );
    border-radius: 4px 4px 0 0;
    min-height: 0;
    transition:
      height 0.3s ease,
      opacity 0.2s ease;
  }

  .weekly-bar:hover {
    opacity: 0.85;
  }

  .weekly-bar-label {
    font-size: 9px;
    color: var(--text-muted);
    margin-top: 6px;
    white-space: nowrap;
    font-weight: 500;
  }

  /* Habit Cards Grid */
  .habit-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }

  /* Time Logs */
  .time-logs-empty {
    text-align: center;
    padding: 24px;
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
    padding: 14px 12px;
    background: var(--mcp-glass-highlight);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius-sm);
    transition: all 0.2s ease;
  }

  .time-stat:hover {
    border-color: var(--mcp-accent);
    transform: translateY(-2px);
  }

  .time-stat-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-accent);
    letter-spacing: -0.02em;
  }

  .time-stat-label {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 6px;
    font-weight: 500;
  }

  .time-stat-delta {
    font-size: 10px;
    font-weight: 600;
    margin-top: 4px;
  }

  .delta-up {
    color: var(--mcp-success, rgba(34, 197, 94, 0.9));
  }

  .delta-down {
    color: var(--mcp-danger, rgba(220, 150, 150, 0.8));
  }

  .time-logs-chart {
    margin-top: 14px;
    padding: 12px;
    background: var(--mcp-glass-highlight);
    border-radius: var(--mcp-radius-sm);
  }

  /* Earnings */
  .earnings-summary {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
    margin-bottom: 18px;
  }

  .earnings-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 18px 14px;
    background: var(--mcp-glass-highlight);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius-sm);
    transition: all 0.2s ease;
  }

  .earnings-card:hover {
    border-color: var(--mcp-success, rgba(34, 197, 94, 0.5));
    transform: translateY(-2px);
  }

  .earnings-value {
    font-size: 22px;
    font-weight: 700;
    color: var(--mcp-success, rgba(34, 197, 94, 0.9));
    letter-spacing: -0.02em;
  }

  .earnings-label {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-top: 6px;
    font-weight: 500;
  }

  .earnings-delta {
    font-size: 10px;
    font-weight: 600;
    color: var(--mcp-success, rgba(34, 197, 94, 0.9));
    margin-top: 4px;
  }

  .earnings-chart {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: 110px;
    padding: 12px 8px 0;
    border-radius: var(--mcp-radius-sm);
    background: var(--mcp-glass-highlight);
  }

  .earnings-bar-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    justify-content: flex-end;
  }

  .earnings-bar-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 4px;
    min-height: 16px;
  }

  .earnings-bar-amount {
    font-size: 12px;
    font-weight: 600;
    color: var(--mcp-success, rgba(34, 197, 94, 0.9));
    white-space: nowrap;
  }

  .earnings-bar {
    width: 100%;
    max-width: 36px;
    background: linear-gradient(
      180deg,
      var(--mcp-success, rgba(34, 197, 94, 0.8)),
      color-mix(
        in srgb,
        var(--mcp-success, rgba(34, 197, 94, 0.5)) 60%,
        transparent
      )
    );
    border-radius: 4px 4px 0 0;
    min-height: 0;
    transition:
      height 0.3s ease,
      opacity 0.2s ease;
  }

  .earnings-bar:hover {
    opacity: 0.85;
  }

  .earnings-bar-label {
    font-size: 9px;
    color: var(--text-muted);
    margin-top: 6px;
    white-space: nowrap;
    font-weight: 500;
  }

  .earnings-empty {
    text-align: center;
    padding: 24px;
    color: var(--text-muted);
    font-size: 13px;
  }

  .earnings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .earnings-header h3 {
    margin: 0;
  }

  .earnings-detail-btn {
    padding: 8px 16px;
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius-sm);
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    color: var(--text-accent);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .earnings-detail-btn:hover {
    background: var(--mcp-accent);
    color: var(--text-on-accent, #fff);
    border-color: var(--mcp-accent);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px var(--mcp-accent-dim);
  }

  @media (max-width: 768px) {
    .habit-analytics-summary {
      grid-template-columns: 1fr;
    }

    .habit-cards-grid {
      grid-template-columns: 1fr;
    }

    .weekly-chart {
      height: 90px;
    }

    .time-logs-stats {
      grid-template-columns: 1fr;
    }

    .earnings-summary {
      grid-template-columns: 1fr;
    }

    .earnings-chart {
      height: 90px;
    }
  }

  @media (max-width: 480px) {
    .habit-analytics {
      padding: 14px 12px;
    }

    .habit-analytics-header {
      flex-direction: column;
      align-items: stretch;
    }

    .summary-value {
      font-size: 24px;
    }

    .earnings-value {
      font-size: 18px;
    }
  }
</style>
