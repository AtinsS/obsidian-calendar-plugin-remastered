<script lang="ts">
  import { get } from "svelte/store";
  import { tasks } from "../task-tracker/stores";
  import { calculateTaskEarnings } from "../task-tracker/stores";
  import { formatDuration } from "../task-tracker/TimerManager";
  import {
    financialAnalyticsData,
    addManualIncomeSource,
    updateManualIncomeSource,
    removeManualIncomeSource,
    getTotalManualIncome,
  } from "./financialAnalyticsStorage";
  import type { ManualIncomeSource } from "./financialAnalyticsStorage";

  let filterTab: "all" | "done" | "todo" = "all";
  let showAddIncome = false;
  let newIncomeName = "";
  let newIncomeAmount = 0;
  let newIncomeDate = new Date().toISOString().split("T")[0];

  $: allWorkTasks = $tasks.filter((t) => t.isWorkTask);
  $: doneTasks = allWorkTasks.filter((t) => t.status === "done");
  $: todoTasks = allWorkTasks.filter((t) => t.status !== "done");

  $: filteredTasks =
    filterTab === "done"
      ? doneTasks
      : filterTab === "todo"
        ? todoTasks
        : allWorkTasks;

  $: totalTaskEarnings = allWorkTasks
    .filter((t) => t.status === "done")
    .reduce((sum, t) => sum + calculateTaskEarnings(t), 0);

  $: totalManualIncome = $financialAnalyticsData
    ? getTotalManualIncome()
    : 0;

  $: grandTotal = totalTaskEarnings + totalManualIncome;

  function getTaskDate(task: any): string {
    const match = task.dateUID.match(/^day-(\d{4}-\d{2}-\d{2})/);
    if (match) {
      const date = new Date(match[1]);
      return date.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
    return "—";
  }

  function getTaskWorkTime(task: any): string {
    if (task.totalWorkTime) {
      return formatDuration(task.totalWorkTime);
    }
    return "—";
  }

  function getTaskPaymentInfo(task: any): string {
    if (task.paymentType === "hour" && task.rate) {
      return `${task.rate} ₽/час`;
    }
    if (task.paymentType === "day" && task.rate) {
      return `${task.rate} ₽/день`;
    }
    return "—";
  }

  function addIncomeSource(): void {
    if (!newIncomeName.trim() || newIncomeAmount <= 0) return;

    addManualIncomeSource({
      name: newIncomeName.trim(),
      amount: newIncomeAmount,
      date: newIncomeDate,
    });

    newIncomeName = "";
    newIncomeAmount = 0;
    newIncomeDate = new Date().toISOString().split("T")[0];
    showAddIncome = false;
  }

  function deleteIncomeSource(id: string): void {
    if (confirm("Удалить источник дохода?")) {
      removeManualIncomeSource(id);
    }
  }

  function formatDate(dateStr: string): string {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function formatMoney(amount: number): string {
    return amount.toLocaleString("ru-RU");
  }

  const STATUS_LABELS: Record<string, string> = {
    done: "Выполнено",
    progress: "Надо сделать",
    todo: "Надо сделать",
    paused: "Приостановлено",
  };

  const STATUS_COLORS: Record<string, string> = {
    done: "var(--mcp-success)",
    progress: "var(--mcp-accent)",
    todo: "var(--mcp-text-muted)",
    paused: "var(--mcp-warning)",
  };
</script>

<div class="financial-analytics">
  <div class="fa-header">
    <h2>Финансовая аналитика</h2>
  </div>

  <!-- Summary Cards -->
  <div class="fa-summary">
    <div class="fa-summary-card">
      <span class="fa-summary-icon">Задачи</span>
      <span class="fa-summary-value">{formatMoney(totalTaskEarnings)} ₽</span>
      <span class="fa-summary-label">Из задач</span>
    </div>
    <div class="fa-summary-card">
      <span class="fa-summary-icon">Доп. доход</span>
      <span class="fa-summary-value">{formatMoney(totalManualIncome)} ₽</span>
      <span class="fa-summary-label">Доп. доход</span>
    </div>
    <div class="fa-summary-card total">
      <span class="fa-summary-icon">Итого</span>
      <span class="fa-summary-value">{formatMoney(grandTotal)} ₽</span>
      <span class="fa-summary-label">Итого</span>
    </div>
  </div>

  <!-- Tasks Section -->
  <div class="fa-section">
    <div class="fa-section-header">
      <h3>Задачи</h3>
      <div class="fa-tabs">
        <button
          class="fa-tab"
          class:active={filterTab === "all"}
          on:click={() => (filterTab = "all")}
        >
          Все ({allWorkTasks.length})
        </button>
        <button
          class="fa-tab"
          class:active={filterTab === "done"}
          on:click={() => (filterTab = "done")}
        >
          Выполнено ({doneTasks.length})
        </button>
        <button
          class="fa-tab"
          class:active={filterTab === "todo"}
          on:click={() => (filterTab = "todo")}
        >
          Надо сделать ({todoTasks.length})
        </button>
      </div>
    </div>

    {#if filteredTasks.length === 0}
      <div class="fa-empty">Нет задач для отображения</div>
    {:else}
      <div class="fa-task-list">
        {#each filteredTasks as task (task.id)}
          <div class="fa-task-item" class:completed={task.status === "done"}>
            <div class="fa-task-status">
              <span
                class="fa-status-dot"
                style="background: {STATUS_COLORS[task.status] || STATUS_COLORS.todo}"
              ></span>
            </div>
            <div class="fa-task-info">
              <div class="fa-task-title">{task.title}</div>
              <div class="fa-task-meta">
                <span>{getTaskDate(task)}</span>
                <span class="fa-meta-separator">·</span>
                <span>{STATUS_LABELS[task.status] || task.status}</span>
                {#if task.totalWorkTime}
                  <span class="fa-meta-separator">·</span>
                  <span>{getTaskWorkTime(task)}</span>
                {/if}
              </div>
            </div>
            <div class="fa-task-payment">
              <div class="fa-task-rate">{getTaskPaymentInfo(task)}</div>
              <div class="fa-task-earning">
                {formatMoney(calculateTaskEarnings(task))} ₽
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Manual Income Section -->
  <div class="fa-section">
    <div class="fa-section-header">
      <h3>Дополнительные источники дохода</h3>
      <button class="fa-add-btn" on:click={() => (showAddIncome = !showAddIncome)}>
        {showAddIncome ? "Отмена" : "+ Добавить"}
      </button>
    </div>

    {#if showAddIncome}
      <div class="fa-add-form">
        <input
          type="text"
          bind:value={newIncomeName}
          placeholder="Название источника"
          class="fa-input"
        />
        <input
          type="number"
          bind:value={newIncomeAmount}
          placeholder="Сумма"
          min="0"
          class="fa-input fa-input-amount"
        />
        <input
          type="date"
          bind:value={newIncomeDate}
          class="fa-input"
        />
        <button class="fa-submit-btn" on:click={addIncomeSource}>
          Добавить
        </button>
      </div>
    {/if}

    {#if $financialAnalyticsData.manualIncomeSources.length === 0}
      <div class="fa-empty">Нет дополнительных источников дохода</div>
    {:else}
      <div class="fa-income-list">
        {#each $financialAnalyticsData.manualIncomeSources as source (source.id)}
          <div class="fa-income-item">
            <div class="fa-income-info">
              <div class="fa-income-name">{source.name}</div>
              <div class="fa-income-date">{formatDate(source.date)}</div>
            </div>
            <div class="fa-income-right">
              <span class="fa-income-amount">{formatMoney(source.amount)} ₽</span>
              <button
                class="fa-delete-btn"
                on:click={() => deleteIncomeSource(source.id)}
              >
                ✕
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .financial-analytics {
    padding: 20px 16px 32px;
    height: 100%;
    overflow-y: auto;
    background: var(--background-primary);
  }

  .fa-header h2 {
    margin: 0 0 20px;
    font-size: 18px;
    font-weight: 600;
    text-align: center;
    letter-spacing: -0.01em;
  }

  /* ── Summary Cards ──────────────────────────────────── */
  .fa-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }

  .fa-summary-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 12px;
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius);
    box-shadow: var(--mcp-shadow);
    transition: all var(--mcp-transition);
  }

  .fa-summary-card:hover {
    border-color: var(--mcp-accent);
    transform: translateY(-2px);
    box-shadow: var(--mcp-shadow-glow);
  }

  .fa-summary-card.total {
    background: linear-gradient(
      135deg,
      rgba(80, 200, 160, 0.12),
      rgba(95, 153, 225, 0.12)
    );
    border-color: rgba(80, 200, 160, 0.2);
  }

  .fa-summary-icon {
    font-size: 20px;
    margin-bottom: 8px;
    opacity: 0.8;
  }

  .fa-summary-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--mcp-text);
    letter-spacing: -0.02em;
  }

  .fa-summary-card.total .fa-summary-value {
    color: var(--mcp-success);
  }

  .fa-summary-label {
    font-size: 11px;
    color: var(--mcp-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 4px;
  }

  /* ── Section ────────────────────────────────────────── */
  .fa-section {
    margin-bottom: 24px;
  }

  .fa-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    flex-wrap: wrap;
    gap: 8px;
  }

  .fa-section-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--mcp-text);
  }

  /* ── Tabs ───────────────────────────────────────────── */
  .fa-tabs {
    display: flex;
    gap: 4px;
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius-sm);
    padding: 3px;
  }

  .fa-tab {
    padding: 6px 12px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--mcp-text-muted);
    cursor: pointer;
    font-size: 11.5px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.15s;
  }

  .fa-tab.active {
    background: var(--mcp-accent);
    color: var(--text-on-accent, #fff);
  }

  .fa-tab:hover:not(.active) {
    background: var(--mcp-surface);
    color: var(--mcp-text);
  }

  /* ── Task List ──────────────────────────────────────── */
  .fa-task-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .fa-task-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius);
    box-shadow: var(--mcp-shadow);
    transition: all var(--mcp-transition);
  }

  .fa-task-item:hover {
    border-color: var(--mcp-accent);
    transform: translateY(-1px);
    box-shadow: var(--mcp-shadow-glow);
  }

  .fa-task-item.completed {
    opacity: 0.75;
  }

  .fa-task-item.completed .fa-task-title {
    text-decoration: line-through;
    color: var(--mcp-text-muted);
  }

  .fa-task-status {
    flex-shrink: 0;
  }

  .fa-status-dot {
    display: block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .fa-task-info {
    flex: 1;
    min-width: 0;
  }

  .fa-task-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--mcp-text);
    margin-bottom: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .fa-task-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--mcp-text-muted);
  }

  .fa-meta-separator {
    opacity: 0.4;
  }

  .fa-task-payment {
    flex-shrink: 0;
    text-align: right;
  }

  .fa-task-rate {
    font-size: 11px;
    color: var(--mcp-text-muted);
    margin-bottom: 2px;
  }

  .fa-task-earning {
    font-size: 15px;
    font-weight: 700;
    color: var(--mcp-success);
  }

  /* ── Income Section ─────────────────────────────────── */
  .fa-add-btn {
    padding: 6px 12px;
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius-sm);
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    color: var(--mcp-accent);
    cursor: pointer;
    font-size: 11.5px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.15s;
  }

  .fa-add-btn:hover {
    background: var(--mcp-surface);
    border-color: var(--mcp-accent);
  }

  .fa-add-form {
    display: grid;
    grid-template-columns: 1fr 120px 140px auto;
    gap: 8px;
    margin-bottom: 12px;
    padding: 14px;
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius);
  }

  .fa-input {
    padding: 8px 12px;
    border: 1px solid var(--mcp-glass-border);
    border-radius: 8px;
    background: var(--background-primary);
    color: var(--mcp-text);
    font-size: 12.5px;
    font-family: inherit;
    transition: border-color 0.15s;
  }

  .fa-input:focus {
    border-color: var(--mcp-accent);
    outline: none;
  }

  .fa-input-amount {
    text-align: right;
  }

  .fa-submit-btn {
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    background: var(--mcp-accent);
    color: var(--text-on-accent, #fff);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.15s;
  }

  .fa-submit-btn:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .fa-income-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .fa-income-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius);
    box-shadow: var(--mcp-shadow);
    transition: all var(--mcp-transition);
  }

  .fa-income-item:hover {
    border-color: var(--mcp-accent);
    transform: translateY(-1px);
    box-shadow: var(--mcp-shadow-glow);
  }

  .fa-income-info {
    flex: 1;
  }

  .fa-income-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--mcp-text);
    margin-bottom: 4px;
  }

  .fa-income-date {
    font-size: 11px;
    color: var(--mcp-text-muted);
  }

  .fa-income-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .fa-income-amount {
    font-size: 16px;
    font-weight: 700;
    color: var(--mcp-success);
  }

  .fa-delete-btn {
    background: none;
    border: none;
    color: var(--mcp-text-muted);
    cursor: pointer;
    padding: 4px 8px;
    font-size: 12px;
    border-radius: 6px;
    opacity: 0.4;
    transition: all 0.15s;
  }

  .fa-income-item:hover .fa-delete-btn {
    opacity: 1;
  }

  .fa-delete-btn:hover {
    color: var(--mcp-danger);
    background: var(--mcp-danger-dim);
  }

  /* ── Empty State ────────────────────────────────────── */
  .fa-empty {
    text-align: center;
    padding: 32px 16px;
    color: var(--mcp-text-muted);
    font-size: 13px;
  }

  /* ── Mobile ─────────────────────────────────────────── */
  @media (max-width: 768px) {
    .fa-summary {
      grid-template-columns: 1fr;
    }

    .fa-add-form {
      grid-template-columns: 1fr;
    }

    .fa-task-item {
      flex-wrap: wrap;
    }

    .fa-task-payment {
      width: 100%;
      text-align: left;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--mcp-glass-border);
    }
  }
</style>
