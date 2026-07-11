<script lang="ts">
  import {
    financeData,
    getCurrentMonthKey,
    getMonthData,
    updateMonthData,
    getStoredMonthKeys,
    deleteMonthData,
    deleteMonthsBefore,
  } from "./storage";
  import type { FinanceCategory, FinanceMonthData } from "./types";
  import { generateCategoryId } from "./types";
  import { get } from "svelte/store";
  import { tasks } from "../task-tracker/stores";
  import { calculateTaskEarnings } from "../task-tracker/stores";
  import { financialAnalyticsData, getTotalManualIncome } from "./financialAnalyticsStorage";

  let monthKey = getCurrentMonthKey();
  let monthData: FinanceMonthData = {
    monthlyIncome: 0,
    lastMonthExpense: 0,
    mainAccountCategories: [],
    monthGoals: [],
    savingsCategories: [],
    distributionRules: [],
    updatedAt: "",
  };
  let incomeSource: "analytics" | "manual" = "analytics";
  let manualIncome = 0;
  let recalcTimeout: ReturnType<typeof setTimeout> | null = null;

  const MONTH_NAMES = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
  ];

  $: [displayYear, displayMonth] = monthKey.split("-").map(Number);
  $: displayMonthName = `${MONTH_NAMES[displayMonth - 1]} ${displayYear}`;
  $: isCurrentMonth = monthKey === getCurrentMonthKey();

  function prevMonth(): void {
    const d = new Date(displayYear, displayMonth - 2, 1);
    monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function nextMonth(): void {
    const d = new Date(displayYear, displayMonth, 1);
    monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function goToday(): void {
    monthKey = getCurrentMonthKey();
  }

  $: {
    $financeData;
    monthData = getMonthData(monthKey);
    if (monthData) {
      incomeSource = (monthData as any).incomeSource || "analytics";
      manualIncome = monthData.monthlyIncome;
    }
  }

  // Auto-update income when source is "analytics" and tasks or manual income change
  $: {
    $tasks;
    $financialAnalyticsData;
    if (incomeSource === "analytics") {
      const income = getWorkIncome();
      updateMonthData(monthKey, {
        monthlyIncome: income,
        incomeSource: "analytics",
      } as any);
      monthData = getMonthData(monthKey);
    }
  }

  $: mainTotal = monthData
    ? monthData.mainAccountCategories.reduce((sum, c) => sum + c.amount, 0)
    : 0;
  $: savingsTotal = monthData
    ? monthData.savingsCategories.reduce((sum, c) => sum + c.amount, 0)
    : 0;
  $: balance = monthData
    ? monthData.monthlyIncome - mainTotal
    : 0;
  $: balanceStatus =
    balance >= savingsTotal
      ? "ok"
      : balance >= savingsTotal * 0.8
        ? "warn"
        : "danger";

  function getWorkIncome(): number {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const allTasks = get(tasks);
    const taskEarnings = allTasks
      .filter((t) => {
        if (!t.isWorkTask || t.status !== "done") return false;
        const match = t.dateUID.match(/^day-(\d{4})-(\d{2})/);
        if (!match) return false;
        return parseInt(match[1]) === year && parseInt(match[2]) === month;
      })
      .reduce((sum, t) => sum + calculateTaskEarnings(t), 0);
    return taskEarnings + getTotalManualIncome();
  }

  function setIncomeSource(source: "analytics" | "manual") {
    incomeSource = source;
    if (source === "analytics") {
      const income = getWorkIncome();
      updateMonthData(monthKey, {
        monthlyIncome: income,
        incomeSource: "analytics",
      } as any);
    } else {
      updateMonthData(monthKey, {
        monthlyIncome: manualIncome,
        incomeSource: "manual",
      } as any);
    }
    monthData = getMonthData(monthKey);
  }

  function updateManualIncome(value: string) {
    manualIncome = parseFloat(value.replace(/[^0-9.,]/g, "")) || 0;
    if (recalcTimeout) clearTimeout(recalcTimeout);
    recalcTimeout = setTimeout(() => {
      updateMonthData(monthKey, {
        monthlyIncome: manualIncome,
        incomeSource: "manual",
      } as any);
      monthData = getMonthData(monthKey);
    }, 300);
  }

  function addMainCategory() {
    const newCat: FinanceCategory = {
      id: generateCategoryId(),
      name: "Новая категория",
      icon: "📦",
      amount: 0,
      order: monthData.mainAccountCategories.length,
    };
    updateMonthData(monthKey, {
      mainAccountCategories: [...monthData.mainAccountCategories, newCat],
    });
    monthData = getMonthData(monthKey);
  }

  function removeMainCategory(id: string) {
    updateMonthData(monthKey, {
      mainAccountCategories: monthData.mainAccountCategories.filter(
        (c) => c.id !== id,
      ),
    });
    monthData = getMonthData(monthKey);
  }

  function updateMainCategory(id: string, changes: Partial<FinanceCategory>) {
    updateMonthData(monthKey, {
      mainAccountCategories: monthData.mainAccountCategories.map((c) =>
        c.id === id ? { ...c, ...changes } : c,
      ),
    });
    monthData = getMonthData(monthKey);
  }

  function addSavingsCategory() {
    const newCat: FinanceCategory = {
      id: generateCategoryId(),
      name: "Новая цель",
      icon: "🎯",
      amount: 0,
      order: monthData.savingsCategories.length,
    };
    updateMonthData(monthKey, {
      savingsCategories: [...monthData.savingsCategories, newCat],
    });
    monthData = getMonthData(monthKey);
  }

  function removeSavingsCategory(id: string) {
    updateMonthData(monthKey, {
      savingsCategories: monthData.savingsCategories.filter((c) => c.id !== id),
    });
    monthData = getMonthData(monthKey);
  }

  function updateSavingsCategory(
    id: string,
    changes: Partial<FinanceCategory>,
  ) {
    updateMonthData(monthKey, {
      savingsCategories: monthData.savingsCategories.map((c) =>
        c.id === id ? { ...c, ...changes } : c,
      ),
    });
    monthData = getMonthData(monthKey);
  }

  function updateGoals(goals: string[]) {
    updateMonthData(monthKey, { monthGoals: goals });
    monthData = getMonthData(monthKey);
  }

  function addGoal() {
    const goals = [...(monthData.monthGoals || []), ""];
    updateGoals(goals);
  }

  function updateGoal(index: number, value: string) {
    const goals = [...(monthData.monthGoals || [])];
    goals[index] = value;
    updateGoals(goals);
  }

  function removeGoal(index: number) {
    const goals = (monthData.monthGoals || []).filter((_, i) => i !== index);
    updateGoals(goals);
  }

  function updateRules(value: string) {
    const rules = value.split("\n").filter((r) => r.trim());
    updateMonthData(monthKey, { distributionRules: rules });
    monthData = getMonthData(monthKey);
  }

  function formatMoney(amount: number): string {
    return amount.toLocaleString("ru-RU");
  }

  // --- Очистка данных ---
  let showCleanup = false;
  $: storedKeys = $financeData ? getStoredMonthKeys() : [];
  $: oldKeys = storedKeys.filter((k) => k < getCurrentMonthKey());

  function clearCurrentMonth(): void {
    if (!confirm(`Очистить данные за ${displayMonthName}?`)) return;
    updateMonthData(monthKey, {
      mainAccountCategories: [],
      savingsCategories: [],
      monthGoals: [],
      distributionRules: [],
      monthlyIncome: 0,
    });
    monthData = getMonthData(monthKey);
  }

  function clearOldMonths(): void {
    if (oldKeys.length === 0) return;
    const count = deleteMonthsBefore(getCurrentMonthKey());
    alert(`Удалены данные за ${count} мес.`);
  }

  function clearAllData(): void {
    if (!confirm("Удалить ВСЕ данные финансов? Это необратимо.")) return;
    for (const k of storedKeys) deleteMonthData(k);
    monthData = getMonthData(monthKey);
  }

  let prevMonthKey: string | null = null;

  $: {
    const allData = $financeData || {};
    const keys = Object.keys(allData);
    const d = new Date(displayYear, displayMonth - 2, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    prevMonthKey = keys.includes(key) ? key : null;
  }

  function duplicatePrevMonth(): void {
    if (!prevMonthKey) return;
    const prev = getMonthData(prevMonthKey);
    const blankCat = (c: FinanceCategory): FinanceCategory => ({
      id: generateCategoryId(),
      name: c.name,
      icon: c.icon,
      amount: 0,
      order: c.order,
    });
    updateMonthData(monthKey, {
      mainAccountCategories: prev.mainAccountCategories.map(blankCat),
      distributionRules: [...prev.distributionRules],
    });
    monthData = getMonthData(monthKey);
  }
</script>

<div class="finance-tracker">
  <div class="month-nav">
    <button class="month-nav-btn" on:click={prevMonth}>&#8249;</button>
    <button class="month-nav-title" on:click={goToday}>
      {displayMonthName}
      {#if !isCurrentMonth}
        <span class="month-today-dot"></span>
      {/if}
    </button>
    <button class="month-nav-btn" on:click={nextMonth}>&#8250;</button>
  </div>
  {#if prevMonthKey}
    <button class="dup-btn" on:click={duplicatePrevMonth}>
      Дублировать траты с прошлого месяца
    </button>
  {/if}
  <h2>💰 Распределение финансовых средств</h2>

  <!-- Блок 1: Общий баланс -->
  <div class="glass-card">
    <div class="glass-card-header">
      <span class="glass-icon">💎</span>
      <h3>Общий баланс</h3>
    </div>
    <div class="income-toggle">
      <button
        class="toggle-btn"
        class:active={incomeSource === "analytics"}
        on:click={() => setIncomeSource("analytics")}>Из аналитики</button
      >
      <button
        class="toggle-btn"
        class:active={incomeSource === "manual"}
        on:click={() => setIncomeSource("manual")}>Вручную</button
      >
    </div>
    <div class="balance-grid">
      <div class="balance-item">
        <span class="balance-label">Поступления</span>
        {#if incomeSource === "analytics"}
          <span class="balance-value income"
            >{formatMoney(monthData.monthlyIncome)} ₽</span
          >
        {:else}
          <input
            type="number"
            value={manualIncome}
            on:input={(e) => updateManualIncome(e.target.value)}
            min="0"
            class="balance-input income-input"
          />
        {/if}
      </div>
      <div class="balance-item">
        <span class="balance-label">Основные расходы</span>
        <span class="balance-value expense">{formatMoney(mainTotal)} ₽</span>
      </div>
      <div class="balance-item total">
        <span class="balance-label">Остаток</span>
        <span class="balance-value {balanceStatus}"
          >{formatMoney(balance)} ₽</span
        >
      </div>
    </div>
  </div>

  <!-- Блок 2: Основной счёт -->
  <div class="glass-card">
    <div class="glass-card-header">
      <span class="glass-icon">🏦</span>
      <h3>Основной счёт</h3>
      <span class="glass-badge">{formatMoney(mainTotal)} ₽</span>
    </div>
    <div class="categories-list">
      {#each monthData.mainAccountCategories as cat (cat.id)}
        <div class="category-row">
          <input
            type="text"
            value={cat.icon}
            on:change={(e) =>
              updateMainCategory(cat.id, { icon: e.target.value })}
            class="cat-icon"
            maxlength="2"
          />
          <input
            type="text"
            value={cat.name}
            on:change={(e) =>
              updateMainCategory(cat.id, { name: e.target.value })}
            class="cat-name"
          />
          <input
            type="number"
            value={cat.amount}
            on:change={(e) =>
              updateMainCategory(cat.id, {
                amount: parseFloat(e.target.value) || 0,
              })}
            min="0"
            class="cat-amount"
          />
          <button class="cat-delete" on:click={() => removeMainCategory(cat.id)}
            >✕</button
          >
        </div>
      {/each}
    </div>
    <button class="glass-add-btn" on:click={addMainCategory}>+ Добавить</button>
  </div>

  <!-- Блок 3: Цели на месяц -->
  <div class="glass-card">
    <div class="glass-card-header">
      <span class="glass-icon">🎯</span>
      <h3>Цели на месяц</h3>
    </div>
    <div class="goals-list">
      {#each (monthData.monthGoals || []) as goal, i (i)}
        <div class="goal-row">
          <input
            type="text"
            value={goal}
            on:input={(e) => updateGoal(i, e.target.value)}
            class="goal-input"
            placeholder="Цель..."
          />
          <button class="goal-remove-btn" on:click={() => removeGoal(i)} title="Удалить">&#10005;</button>
        </div>
      {/each}
    </div>
    <button class="glass-add-btn" on:click={addGoal}>+ Добавить цель</button>
  </div>

  <!-- Блок 4: Куда отложить -->
  <div class="glass-card" class:over-budget={savingsTotal > balance}>
    <div class="glass-card-header">
      <span class="glass-icon">💰</span>
      <h3>Куда отложить</h3>
      <span class="glass-badge" class:badge-warn={savingsTotal > balance}
        >осталось {formatMoney(Math.max(0, balance - savingsTotal))} ₽</span
      >
    </div>
    <div class="categories-list">
      {#each monthData.savingsCategories as cat (cat.id)}
        <div class="category-row">
          <input
            type="text"
            value={cat.icon}
            on:change={(e) =>
              updateSavingsCategory(cat.id, { icon: e.target.value })}
            class="cat-icon"
            maxlength="2"
          />
          <input
            type="text"
            value={cat.name}
            on:change={(e) =>
              updateSavingsCategory(cat.id, { name: e.target.value })}
            class="cat-name"
          />
          <input
            type="number"
            value={cat.amount}
            on:change={(e) =>
              updateSavingsCategory(cat.id, {
                amount: parseFloat(e.target.value) || 0,
              })}
            min="0"
            class="cat-amount"
          />
          <button
            class="cat-delete"
            on:click={() => removeSavingsCategory(cat.id)}>✕</button
          >
        </div>
      {/each}
    </div>
    <button class="glass-add-btn" on:click={addSavingsCategory}
      >+ Добавить</button
    >
    {#if savingsTotal > balance}
      <div class="glass-warning">
        ⚠️ Превышение бюджета на {formatMoney(savingsTotal - balance)} ₽
      </div>
    {/if}
  </div>

  <!-- Блок 5: Правила распределения -->
  <div class="glass-card">
    <div class="glass-card-header">
      <span class="glass-icon">📋</span>
      <h3>Правила распределения</h3>
    </div>
    <textarea
      class="glass-textarea rules"
      value={monthData.distributionRules.join("\n")}
      on:input={(e) => updateRules(e.target.value)}
      placeholder="Правила распределения..."
      rows="8"
    ></textarea>
  </div>

  <!-- Блок 6: Управление данными -->
  <div class="glass-card cleanup-card">
    <button class="cleanup-toggle" on:click={() => showCleanup = !showCleanup}>
      <span class="glass-icon">🗑️</span>
      <span>Управление данными</span>
      <span class="cleanup-arrow" class:open={showCleanup}>&#8250;</span>
    </button>
    {#if showCleanup}
      <div class="cleanup-body">
        <div class="cleanup-info">
          Хранится месяцев: <strong>{storedKeys.length}</strong>
          {#if oldKeys.length > 0}
            <span class="cleanup-old">({oldKeys.length} устаревших)</span>
          {/if}
        </div>
        <div class="cleanup-actions">
          <button class="cleanup-btn" on:click={clearCurrentMonth}>
            Очистить текущий месяц
          </button>
          {#if oldKeys.length > 0}
            <button class="cleanup-btn warn" on:click={clearOldMonths}>
              Удалить {oldKeys.length} устаревших мес.
            </button>
          {/if}
          <button class="cleanup-btn danger" on:click={clearAllData}>
            Удалить всё
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* ── Soft finance palette ─────────────────────────────── */
  .finance-tracker {
    --fi-bg: var(--background-primary);
    --fi-surface: var(--background-secondary);
    --fi-border: rgba(128, 128, 128, 0.10);
    --fi-border-focus: rgba(128, 128, 128, 0.22);
    --fi-muted: var(--text-muted);
    --fi-text: var(--text-normal);
    --fi-accent: var(--interactive-accent);
    --fi-green: #5a9e7a;
    --fi-green-bg: rgba(90, 158, 122, 0.08);
    --fi-red: #c06058;
    --fi-red-bg: rgba(192, 96, 88, 0.07);
    --fi-amber: #b8924a;
    --fi-amber-bg: rgba(184, 146, 74, 0.08);
    --fi-radius: 14px;
    --fi-radius-sm: 10px;

    padding: 20px 16px 32px;
    height: 100%;
    overflow-y: auto;
    background: var(--fi-bg);
    color: var(--fi-text);
  }

  .finance-tracker h2 {
    margin: 0 0 20px;
    font-size: 18px;
    font-weight: 600;
    color: var(--fi-text);
    text-align: center;
    letter-spacing: -0.01em;
  }

  /* ── Month navigator ─────────────────────────────────── */
  .month-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-bottom: 18px;
  }

  .month-nav-btn {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--fi-border);
    border-radius: 9px;
    background: var(--fi-surface);
    color: var(--fi-muted);
    cursor: pointer;
    font-size: 16px;
    padding: 0;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }

  .month-nav-btn:hover {
    background: var(--fi-border);
    color: var(--fi-text);
  }

  .month-nav-title {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 14px;
    border: 1px solid var(--fi-border);
    border-radius: 9px;
    background: var(--fi-surface);
    color: var(--fi-text);
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    transition: background 0.15s, border-color 0.15s;
  }

  .month-nav-title:hover {
    background: var(--fi-border);
  }

  .month-today-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--fi-accent);
    opacity: 0.8;
  }

  /* ── Duplicate button ────────────────────────────────── */
  .dup-btn {
    display: block;
    width: 100%;
    margin-bottom: 14px;
    padding: 9px 12px;
    border: 1px solid var(--fi-border);
    border-radius: var(--fi-radius-sm);
    background: var(--fi-surface);
    color: var(--fi-accent);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    transition: background 0.15s, border-color 0.15s;
  }

  .dup-btn:hover {
    background: var(--fi-border);
    border-color: var(--fi-accent);
  }

  /* ── Glass card ──────────────────────────────────────── */
  .glass-card {
    background: var(--fi-surface);
    border: 1px solid var(--fi-border);
    border-radius: var(--fi-radius);
    padding: 16px;
    margin-bottom: 14px;
    transition: border-color 0.2s;
  }

  .glass-card:hover {
    border-color: var(--fi-border-focus);
  }

  .glass-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--fi-border);
  }

  .glass-icon {
    font-size: 16px;
    opacity: 0.85;
  }

  .glass-card-header h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--fi-text);
    flex: 1;
    letter-spacing: 0.01em;
  }

  .glass-badge {
    font-size: 13px;
    font-weight: 600;
    color: var(--fi-accent);
    background: var(--fi-bg);
    padding: 3px 10px;
    border-radius: 8px;
    letter-spacing: -0.01em;
  }

  .glass-badge.badge-warn {
    color: var(--fi-red);
    background: var(--fi-red-bg);
  }

  /* ── Income toggle ───────────────────────────────────── */
  .income-toggle {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
  }

  .toggle-btn {
    flex: 1;
    padding: 7px 10px;
    border: 1px solid var(--fi-border);
    border-radius: var(--fi-radius-sm);
    background: var(--fi-bg);
    color: var(--fi-muted);
    cursor: pointer;
    font-size: 11.5px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.15s;
  }

  .toggle-btn.active {
    background: var(--fi-accent);
    color: var(--text-on-accent, #fff);
    border-color: var(--fi-accent);
  }

  .toggle-btn:hover:not(.active) {
    background: var(--fi-border);
    color: var(--fi-text);
  }

  .income-input {
    color: var(--fi-green) !important;
    font-weight: 700 !important;
  }

  /* ── Balance grid ────────────────────────────────────── */
  .balance-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .balance-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 8px;
    background: var(--fi-bg);
    border-radius: var(--fi-radius-sm);
    border: 1px solid var(--fi-border);
    transition: border-color 0.2s;
  }

  .balance-item.total {
    border-color: rgba(128, 128, 128, 0.18);
  }

  .balance-label {
    font-size: 10px;
    color: var(--fi-muted);
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-bottom: 5px;
    opacity: 0.8;
  }

  .balance-value {
    font-size: 17px;
    font-weight: 700;
    color: var(--fi-text);
    letter-spacing: -0.02em;
  }

  .balance-value.income {
    color: var(--fi-green);
  }

  .balance-value.expense {
    color: var(--fi-red);
  }

  .balance-value.ok {
    color: var(--fi-green);
  }

  .balance-value.warn {
    color: var(--fi-amber);
  }

  .balance-value.danger {
    color: var(--fi-red);
  }

  .balance-input {
    width: 100%;
    text-align: center;
    padding: 6px 6px;
    border: 1px solid var(--fi-border);
    border-radius: 8px;
    background: var(--fi-bg);
    color: var(--fi-text);
    font-size: 14px;
    font-weight: 600;
    font-family: inherit;
    transition: border-color 0.15s;
  }

  .balance-input:focus {
    border-color: var(--fi-accent);
    outline: none;
  }

  /* ── Categories list ─────────────────────────────────── */
  .categories-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .category-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    background: var(--fi-bg);
    border-radius: var(--fi-radius-sm);
    border: 1px solid var(--fi-border);
    transition: border-color 0.15s;
  }

  .category-row:hover {
    border-color: var(--fi-border-focus);
  }

  .cat-icon {
    width: 34px;
    text-align: center;
    font-size: 15px;
    padding: 5px 2px;
    border: 1px solid var(--fi-border);
    border-radius: 8px;
    background: var(--fi-surface);
    color: var(--fi-text);
    transition: border-color 0.15s;
  }

  .cat-name {
    flex: 1;
    padding: 5px 8px;
    border: 1px solid var(--fi-border);
    border-radius: 8px;
    background: var(--fi-surface);
    color: var(--fi-text);
    font-size: 12.5px;
    font-family: inherit;
    transition: border-color 0.15s;
  }

  .cat-amount {
    width: 90px;
    text-align: right;
    padding: 5px 8px;
    border: 1px solid var(--fi-border);
    border-radius: 8px;
    background: var(--fi-surface);
    color: var(--fi-text);
    font-size: 12.5px;
    font-weight: 600;
    font-family: inherit;
    transition: border-color 0.15s;
  }

  .cat-icon:focus,
  .cat-name:focus,
  .cat-amount:focus {
    border-color: var(--fi-accent);
    outline: none;
  }

  .cat-delete {
    background: none;
    border: none;
    color: var(--fi-muted);
    cursor: pointer;
    padding: 4px 6px;
    font-size: 12px;
    border-radius: 6px;
    opacity: 0.4;
    transition: opacity 0.15s, color 0.15s, background 0.15s;
  }

  .category-row:hover .cat-delete {
    opacity: 1;
  }

  .cat-delete:hover {
    color: var(--fi-red);
    background: var(--fi-red-bg);
  }

  /* ── Add button ──────────────────────────────────────── */
  .glass-add-btn {
    display: block;
    width: 100%;
    margin-top: 8px;
    padding: 7px;
    background: transparent;
    border: 1px dashed var(--fi-border);
    border-radius: var(--fi-radius-sm);
    color: var(--fi-muted);
    cursor: pointer;
    font-size: 11.5px;
    font-family: inherit;
    transition: all 0.15s;
  }

  .glass-add-btn:hover {
    border-color: var(--fi-accent);
    color: var(--fi-accent);
    background: rgba(95, 153, 225, 0.04);
  }

  /* ── Goals list ──────────────────────────────────────── */
  .goals-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .goal-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .goal-input {
    flex: 1;
    padding: 7px 10px;
    border: 1px solid var(--fi-border);
    border-radius: var(--fi-radius-sm);
    background: var(--fi-bg);
    color: var(--fi-text);
    font-size: 12.5px;
    font-family: inherit;
    transition: border-color 0.15s;
  }

  .goal-input:focus {
    border-color: var(--fi-accent);
    outline: none;
  }

  .goal-remove-btn {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--fi-border);
    border-radius: var(--fi-radius-sm);
    background: transparent;
    color: var(--fi-muted);
    cursor: pointer;
    font-size: 11px;
    flex-shrink: 0;
    transition: all 0.15s;
  }

  .goal-remove-btn:hover {
    border-color: var(--fi-danger, #e55);
    color: var(--fi-danger, #e55);
    background: rgba(238, 85, 85, 0.08);
  }

  /* ── Textarea ────────────────────────────────────────── */
  .glass-textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--fi-border);
    border-radius: var(--fi-radius-sm);
    background: var(--fi-bg);
    color: var(--fi-text);
    font-size: 12.5px;
    font-family: inherit;
    resize: vertical;
    line-height: 1.6;
    transition: border-color 0.15s;
  }

  .glass-textarea:focus {
    border-color: var(--fi-accent);
    outline: none;
  }

  .glass-textarea.rules {
    white-space: pre-wrap;
    line-height: 1.8;
  }

  /* ── Warning ─────────────────────────────────────────── */
  .glass-warning {
    margin-top: 8px;
    padding: 8px 12px;
    background: var(--fi-amber-bg);
    border: 1px solid rgba(184, 146, 74, 0.15);
    border-radius: var(--fi-radius-sm);
    color: var(--fi-amber);
    font-size: 11.5px;
    font-weight: 500;
  }

  .over-budget {
    border-color: rgba(192, 96, 88, 0.2);
  }

  /* ── Cleanup ─────────────────────────────────────────── */
  .cleanup-card {
    padding: 0;
    overflow: hidden;
  }

  .cleanup-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 12px 16px;
    background: none;
    border: none;
    color: var(--fi-muted);
    cursor: pointer;
    font-size: 12.5px;
    font-family: inherit;
    transition: color 0.15s;
  }

  .cleanup-toggle:hover {
    color: var(--fi-text);
  }

  .cleanup-arrow {
    margin-left: auto;
    font-size: 14px;
    transition: transform 0.2s;
  }

  .cleanup-arrow.open {
    transform: rotate(90deg);
  }

  .cleanup-body {
    padding: 0 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .cleanup-info {
    font-size: 11.5px;
    color: var(--fi-muted);
  }

  .cleanup-old {
    color: var(--fi-amber);
  }

  .cleanup-actions {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .cleanup-btn {
    padding: 7px 12px;
    border: 1px solid var(--fi-border);
    border-radius: var(--fi-radius-sm);
    background: var(--fi-bg);
    color: var(--fi-text);
    cursor: pointer;
    font-size: 11.5px;
    font-family: inherit;
    text-align: left;
    transition: all 0.15s;
  }

  .cleanup-btn:hover {
    background: var(--fi-border);
  }

  .cleanup-btn.warn {
    color: var(--fi-amber);
    border-color: rgba(184, 146, 74, 0.2);
  }

  .cleanup-btn.warn:hover {
    background: var(--fi-amber-bg);
  }

  .cleanup-btn.danger {
    color: var(--fi-red);
    border-color: rgba(192, 96, 88, 0.2);
  }

  .cleanup-btn.danger:hover {
    background: var(--fi-red-bg);
  }

  /* ── Mobile ──────────────────────────────────────────── */
  @media (max-width: 768px) {
    .finance-tracker {
      padding: 14px 10px 28px;
    }

    .balance-grid {
      grid-template-columns: 1fr;
    }

    .cat-amount {
      width: 72px;
    }
  }
</style>
