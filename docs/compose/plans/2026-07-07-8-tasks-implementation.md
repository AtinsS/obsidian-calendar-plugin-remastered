# 8 Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 8 feature additions/fixes for Obsidian Calendar Plugin Remastered.

**Architecture:** Independent tasks, each self-contained. Tasks 1,2,7 are bug fixes/cleanup. Tasks 3,4 are new analytics. Task 5 is CSS. Task 6 is new service. Task 8 is new modal.

**Tech Stack:** TypeScript, Svelte 3, Obsidian API, FullCalendar, Canvas API (for charts)

## Global Constraints

- TypeScript strict mode — no `any` types
- Follow existing code patterns (Svelte stores, Modal API, ItemView)
- Build must pass after each task: `npm run build`
- Tests must pass after each task: `npm test`

---

### Task 1: Fix Recurring Tasks with Kanban States

**Covers:** [S3]

**Files:**
- Modify: `src/task-tracker/types.ts`
- Modify: `src/task-tracker/stores.ts`
- Modify: `src/task-tracker/TaskPanel.svelte`

- [ ] **Step 1: Add isRecurringInstance and parentTaskId to ITask**

```typescript
// src/task-tracker/types.ts
export interface ITask {
  // ... existing fields
  isRecurringInstance?: boolean;
  parentTaskId?: string;
}
```

- [ ] **Step 2: Fix createNextRecurringInstance to copy all fields**

```typescript
// src/task-tracker/stores.ts
export async function createNextRecurringInstance(task: ITask): Promise<void> {
  if (!task.recurrence) return;
  
  const nextDate = calculateNextDate(task);
  if (!nextDate) return;
  
  const newTask: ITask = {
    id: generateId(),
    title: task.title,
    status: "todo",
    completed: false,
    dateUID: getDateUID(moment(nextDate), "day"),
    projectId: task.projectId,
    priority: task.priority,
    tags: task.tags,
    sortOrder: task.sortOrder,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    recurrence: task.recurrence,
    scheduledTime: task.scheduledTime,
    estimatedTime: task.estimatedTime,
    isRecurringInstance: true,
    parentTaskId: task.id,
  };
  
  await addTask(newTask);
}
```

- [ ] **Step 3: Fix handleRecurringNext to be called AFTER status update**

```svelte
<!-- src/task-tracker/TaskPanel.svelte -->
async function handleTaskComplete(task: ITask) {
  const newStatus = toggleTaskStatus(task);
  await updateTaskStatus(task.id, newStatus);
  
  if (newStatus === "done" && task.recurrence) {
    await createNextRecurringInstance(task);
  }
}
```

- [ ] **Step 4: Run build and tests**

```bash
npm run build && npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/task-tracker/types.ts src/task-tracker/stores.ts src/task-tracker/TaskPanel.svelte
git commit -m "fix: recurring tasks preserve kanban state correctly"
```

---

### Task 2: Habit Log Cleanup at 180 Entries

**Covers:** [S4]

**Files:**
- Modify: `src/habit-tracker/types.ts`
- Modify: `src/habit-tracker/stores.ts`

- [ ] **Step 1: Add MAX_HABIT_LOG_ENTRIES constant**

```typescript
// src/habit-tracker/types.ts
export const MAX_HABIT_LOG_ENTRIES = 180;
```

- [ ] **Step 2: Add cleanupOldHabitLogs function**

```typescript
// src/habit-tracker/stores.ts
import { MAX_HABIT_LOG_ENTRIES } from "./types";

function cleanupOldHabitLogs(): void {
  const logs = get(habitLogsStore);
  if (logs.length <= MAX_HABIT_LOG_ENTRIES) return;
  
  const sorted = [...logs].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  const trimmed = sorted.slice(-MAX_HABIT_LOG_ENTRIES);
  habitLogsStore.set(trimmed);
  debouncedSave();
}
```

- [ ] **Step 3: Call cleanup after toggleHabitCompletion**

```typescript
// src/habit-tracker/stores.ts
export async function toggleHabitCompletion(habitId: string, date: string): Promise<void> {
  // ... existing logic
  
  // Add cleanup call at end
  cleanupOldHabitLogs();
}
```

- [ ] **Step 4: Call cleanup on data load**

```typescript
// src/habit-tracker/stores.ts
export async function loadHabitData(): Promise<void> {
  // ... existing load logic
  
  cleanupOldHabitLogs();
}
```

- [ ] **Step 5: Run build and tests**

```bash
npm run build && npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/habit-tracker/types.ts src/habit-tracker/stores.ts
git commit -m "feat: auto-cleanup habit logs at 180 entries"
```

---

### Task 3: Remove Task Description

**Covers:** [S9]

**Files:**
- Modify: `src/task-tracker/types.ts`
- Modify: `src/task-tracker/TaskModal.ts`
- Modify: `src/task-tracker/TaskItem.svelte`
- Modify: `src/task-tracker/storage.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Remove description from ITask interface**

```typescript
// src/task-tracker/types.ts
export interface ITask {
  // Remove: description?: string;
  // ... keep all other fields
}
```

- [ ] **Step 2: Remove description from TaskModal**

```typescript
// src/task-tracker/TaskModal.ts
// Remove the description textarea section from display() method
// Remove description from createTask() call
```

- [ ] **Step 3: Remove description from TaskItem**

```svelte
<!-- src/task-tracker/TaskItem.svelte -->
<!-- Remove description preview display -->
<!-- Remove description popup toggle button -->
<!-- Remove description badge -->
```

- [ ] **Step 4: Add storage migration v4->v5**

```typescript
// src/task-tracker/storage.ts
const DATA_VERSION = 5;

function migrateData(data: any): any {
  if (data.version < 5) {
    // Remove description from all tasks
    if (data.tasks) {
      data.tasks = data.tasks.map((task: any) => {
        const { description, ...rest } = task;
        return rest;
      });
    }
    data.version = 5;
  }
  return data;
}
```

- [ ] **Step 5: Remove description CSS**

```css
/* src/styles.css */
/* Remove .task-description-* styles */
/* Remove .badge-item styles */
```

- [ ] **Step 6: Run build and tests**

```bash
npm run build && npm test
```

- [ ] **Step 7: Commit**

```bash
git add src/task-tracker/types.ts src/task-tracker/TaskModal.ts src/task-tracker/TaskItem.svelte src/task-tracker/storage.ts src/styles.css
git commit -m "refactor: remove unused task description field"
```

---

### Task 4: Folder Search in Settings

**Covers:** [S10]

**Files:**
- Create: `src/modals/FolderSuggestModal.ts`
- Modify: `src/settings.ts`

- [ ] **Step 1: Create FolderSuggestModal**

```typescript
// src/modals/FolderSuggestModal.ts
import { App, TFolder, SuggestModal } from "obsidian";

export class FolderSuggestModal extends SuggestModal<TFolder> {
  private onSelect: (folder: TFolder) => void;
  
  constructor(app: App, onSelect: (folder: TFolder) => void) {
    super(app);
    this.onSelect = onSelect;
    this.setPlaceholder("Search folders...");
  }
  
  getSuggestions(query: string): TFolder[] {
    const folders = this.app.vault.getAllLoadedFiles()
      .filter((f): f is TFolder => f instanceof TFolder);
    
    if (!query) return folders;
    
    return folders.filter(f => 
      f.path.toLowerCase().includes(query.toLowerCase())
    );
  }
  
  renderSuggestion(folder: TFolder, el: HTMLElement) {
    el.createEl("div", { text: folder.path });
  }
  
  onChooseSuggestion(folder: TFolder) {
    this.onSelect(folder);
  }
}
```

- [ ] **Step 2: Update settings to use FolderSuggestModal**

```typescript
// src/settings.ts
import { FolderSuggestModal } from "./modals/FolderSuggestModal";

// In display() method, replace prompt() with:
new FolderSuggestModal(this.app, (folder) => {
  this.plugin.writeOptions(() => ({
    archiveFolderPath: folder.path,
  }));
  this.display();
}).open();
```

- [ ] **Step 3: Run build and tests**

```bash
npm run build && npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/modals/FolderSuggestModal.ts src/settings.ts
git commit -m "feat: add folder search modal for settings"
```

---

### Task 5: Task Notifications

**Covers:** [S8]

**Files:**
- Create: `src/services/NotificationService.ts`
- Modify: `src/settings.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Add NotificationSettings interface**

```typescript
// src/settings.ts
export interface NotificationSettings {
  enabled: boolean;
  remindBeforeMinutes: number;
  notifyOverdue: boolean;
  notifyDaily: boolean;
  dailyReminderTime: string;
  soundEnabled: boolean;
}

export const defaultNotificationSettings: NotificationSettings = {
  enabled: false,
  remindBeforeMinutes: 15,
  notifyOverdue: true,
  notifyDaily: false,
  dailyReminderTime: "09:00",
  soundEnabled: false,
};
```

- [ ] **Step 2: Create NotificationService**

```typescript
// src/services/NotificationService.ts
import { App, Notice } from "obsidian";
import { ITask } from "../task-tracker/types";
import { NotificationSettings } from "../settings";

export class NotificationService {
  private app: App;
  private settings: NotificationSettings;
  private checkInterval: number | null = null;
  private getTasks: () => ITask[];
  
  constructor(
    app: App,
    settings: NotificationSettings,
    getTasks: () => ITask[]
  ) {
    this.app = app;
    this.settings = settings;
    this.getTasks = getTasks;
  }
  
  start() {
    if (!this.settings.enabled) return;
    
    if (Notification.permission !== "granted") {
      Notification.requestPermission();
    }
    
    this.checkInterval = window.setInterval(() => {
      this.checkTaskReminders();
    }, 60000);
    
    this.checkOverdueTasks();
  }
  
  stop() {
    if (this.checkInterval) {
      window.clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
  
  updateSettings(settings: NotificationSettings) {
    this.settings = settings;
    this.stop();
    this.start();
  }
  
  private checkTaskReminders() {
    const tasks = this.getTasks();
    const now = new Date();
    
    for (const task of tasks) {
      if (!task.scheduledTime || task.status === "done") continue;
      
      const taskTime = new Date(`${task.dateUID.split("day-")[1]}T${task.scheduledTime}`);
      const diff = taskTime.getTime() - now.getTime();
      const minutesUntil = diff / 1000 / 60;
      
      if (minutesUntil > 0 && minutesUntil <= this.settings.remindBeforeMinutes) {
        new Notice(`Reminder: ${task.title} starts in ${Math.round(minutesUntil)} minutes`);
      }
    }
  }
  
  private checkOverdueTasks() {
    if (!this.settings.notifyOverdue) return;
    
    const tasks = this.getTasks();
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    
    const overdue = tasks.filter(t => 
      t.status !== "done" && 
      t.dateUID.includes(today) &&
      t.scheduledTime
    );
    
    if (overdue.length > 0) {
      new Notice(`You have ${overdue.length} overdue tasks`);
    }
  }
}
```

- [ ] **Step 3: Register service in main.ts**

```typescript
// src/main.ts
import { NotificationService } from "./services/NotificationService";

// In onload():
this.notificationService = new NotificationService(
  this.app,
  this.options.notification || defaultNotificationSettings,
  () => get(taskStore)
);
this.notificationService.start();

// In onunload():
this.notificationService?.stop();
```

- [ ] **Step 4: Add notification settings UI**

```typescript
// src/settings.ts
// In display() method, add:
containerEl.createEl("h3", { text: "Notifications" });

new Setting(containerEl)
  .setName("Enable notifications")
  .setDesc("Show reminders for tasks with scheduled time")
  .addToggle(toggle => toggle
    .setValue(this.plugin.options.notification?.enabled ?? false)
    .onChange(async value => {
      await this.plugin.writeOptions(() => ({
        notification: { ...this.plugin.options.notification, enabled: value }
      }));
    }));
```

- [ ] **Step 5: Run build and tests**

```bash
npm run build && npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/services/NotificationService.ts src/settings.ts src/main.ts
git commit -m "feat: add task notification service with reminders"
```

---

### Task 6: Mobile Schedule Optimization

**Covers:** [S7]

**Files:**
- Modify: `src/components/ScheduleCalendar.svelte`

- [ ] **Step 1: Update mobile CSS for month view**

```css
/* src/components/ScheduleCalendar.svelte */
<style>
  @media (max-width: 768px) {
    /* Full month grid visible */
    :global(.fc-dayGridMonth-view .fc-daygrid-day) {
      min-height: 60px;
      padding: 2px;
    }
    
    :global(.fc-dayGridMonth-view .fc-daygrid-day-number) {
      font-size: 12px;
    }
    
    :global(.fc-dayGridMonth-view .fc-event) {
      font-size: 10px;
      padding: 1px 3px;
      margin: 1px;
    }
    
    /* Compact event dots */
    :global(.fc-dayGridMonth-view .fc-event-dot) {
      width: 6px;
      height: 6px;
    }
  }
  
  @media (max-width: 480px) {
    :global(.fc-dayGridMonth-view .fc-daygrid-day) {
      min-height: 50px;
    }
    
    :global(.fc-dayGridMonth-view .fc-event) {
      font-size: 9px;
    }
  }
</style>
```

- [ ] **Step 2: Update mobile CSS for week view**

```css
<style>
  @media (max-width: 768px) {
    /* All 7 days visible */
    :global(.fc-timeGridWeek-view .fc-col-header-cell) {
      padding: 4px 0;
    }
    
    :global(.fc-timeGridWeek-view .fc-daygrid-day-number) {
      font-size: 11px;
    }
    
    /* Compact time slots */
    :global(.fc-timeGridWeek-view .fc-timegrid-slot) {
      height: 40px;
    }
    
    :global(.fc-timeGridWeek-view .fc-timegrid-slot-label) {
      font-size: 10px;
      width: 45px;
    }
    
    /* Horizontal scroll for time grid */
    :global(.fc-timeGridWeek-view .fc-scrollgrid) {
      overflow-x: auto;
    }
    
    :global(.fc-timeGridWeek-view .fc-timegrid-slots td) {
      min-width: 60px;
    }
  }
</style>
```

- [ ] **Step 3: Run build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ScheduleCalendar.svelte
git commit -m "fix: optimize mobile schedule view for full calendar display"
```

---

### Task 7: Habit Analytics View

**Covers:** [S5]

**Files:**
- Create: `src/views/HabitAnalyticsView.ts`
- Create: `src/components/HabitAnalytics.svelte`
- Create: `src/components/Heatmap.svelte`
- Create: `src/components/HabitCard.svelte`
- Modify: `src/habit-tracker/stores.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Add analytics methods to habit stores**

```typescript
// src/habit-tracker/stores.ts
import moment from "moment";

export function getHeatmapData(): { date: string; count: number }[] {
  const logs = get(habitLogsStore);
  const now = moment();
  const startDate = now.clone().subtract(365, "days");
  
  const dateCounts: Record<string, number> = {};
  
  logs.forEach(log => {
    if (moment(log.date).isAfter(startDate)) {
      dateCounts[log.date] = (dateCounts[log.date] || 0) + 1;
    }
  });
  
  return Object.entries(dateCounts).map(([date, count]) => ({ date, count }));
}

export function getWeeklyStats(): { week: string; count: number }[] {
  const logs = get(habitLogsStore);
  const weeks: Record<string, number> = {};
  
  logs.forEach(log => {
    const week = moment(log.date).startOf("week").format("YYYY-MM-DD");
    weeks[week] = (weeks[week] || 0) + 1;
  });
  
  return Object.entries(weeks)
    .slice(-12)
    .map(([week, count]) => ({ week, count }));
}

export function getHabitStats(habitId: string) {
  const logs = get(habitLogsStore).filter(l => l.habitId === habitId);
  const now = moment();
  const thirtyDaysAgo = now.clone().subtract(30, "days");
  
  const recentLogs = logs.filter(l => 
    moment(l.date).isAfter(thirtyDaysAgo)
  );
  
  const streak = calculateStreak(habitId);
  const totalCompleted = logs.filter(l => l.completed).length;
  const completionRate = recentLogs.length / 30;
  
  return {
    totalCompleted,
    currentStreak: streak,
    completionRate: Math.round(completionRate * 100),
    recentDays: recentLogs.length,
  };
}
```

- [ ] **Step 2: Create Heatmap component**

```svelte
<!-- src/components/Heatmap.svelte -->
<script lang="ts">
  export let data: { date: string; count: number }[];
  
  $: weeks = groupByWeeks(data);
  
  function groupByWeeks(data: { date: string; count: number }[]) {
    // Group data into weeks for display
    const weeks: { date: string; count: number }[][] = [];
    let currentWeek: { date: string; count: number }[] = [];
    
    data.forEach((item, i) => {
      currentWeek.push(item);
      if (currentWeek.length === 7 || i === data.length - 1) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });
    
    return weeks;
  }
  
  function getColor(count: number): string {
    if (count === 0) return "var(--background-secondary)";
    if (count === 1) return "var(--interactive-accent)";
    if (count === 2) return "var(--interactive-accent-hover)";
    return "var(--text-accent)";
  }
</script>

<div class="heatmap">
  {#each weeks as week}
    <div class="week">
      {#each week as day}
        <div 
          class="day" 
          style="background-color: {getColor(day.count)}"
          title="{day.date}: {day.count} completed"
        ></div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .heatmap {
    display: flex;
    gap: 3px;
    overflow-x: auto;
    padding: 8px 0;
  }
  
  .week {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  
  .day {
    width: 12px;
    height: 12px;
    border-radius: 2px;
  }
  
  @media (max-width: 768px) {
    .day {
      width: 8px;
      height: 8px;
    }
  }
</style>
```

- [ ] **Step 3: Create HabitCard component**

```svelte
<!-- src/components/HabitCard.svelte -->
<script lang="ts">
  import type { IHabit } from "../habit-tracker/types";
  import { getHabitStats } from "../habit-tracker/stores";
  
  export let habit: IHabit;
  
  $: stats = getHabitStats(habit.id);
</script>

<div class="habit-card">
  <div class="habit-header">
    <span class="habit-icon">{habit.icon}</span>
    <span class="habit-title">{habit.title}</span>
  </div>
  
  <div class="habit-stats">
    <div class="stat">
      <span class="stat-value">{stats.currentStreak}</span>
      <span class="stat-label">Streak 🔥</span>
    </div>
    <div class="stat">
      <span class="stat-value">{stats.totalCompleted}</span>
      <span class="stat-label">Total</span>
    </div>
    <div class="stat">
      <span class="stat-value">{stats.completionRate}%</span>
      <span class="stat-label">30d Rate</span>
    </div>
  </div>
</div>

<style>
  .habit-card {
    padding: 12px;
    border-radius: 8px;
    background: var(--background-secondary);
    margin-bottom: 8px;
  }
  
  .habit-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  
  .habit-icon {
    font-size: 20px;
  }
  
  .habit-title {
    font-weight: 600;
  }
  
  .habit-stats {
    display: flex;
    gap: 16px;
  }
  
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  
  .stat-value {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-accent);
  }
  
  .stat-label {
    font-size: 11px;
    color: var(--text-muted);
  }
</style>
```

- [ ] **Step 4: Create HabitAnalytics component**

```svelte
<!-- src/components/HabitAnalytics.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { habitStore, getHeatmapData, getWeeklyStats } from "../habit-tracker/stores";
  import Heatmap from "./Heatmap.svelte";
  import HabitCard from "./HabitCard.svelte";
  
  let heatmapData: { date: string; count: number }[] = [];
  let weeklyStats: { week: string; count: number }[] = [];
  
  onMount(() => {
    heatmapData = getHeatmapData();
    weeklyStats = getWeeklyStats();
  });
  
  $: habits = $habitStore.filter(h => !h.archived);
</script>

<div class="habit-analytics">
  <h2>Habit Analytics</h2>
  
  <div class="section">
    <h3>Activity (Last Year)</h3>
    <Heatmap data={heatmapData} />
  </div>
  
  <div class="section">
    <h3>Weekly Trend</h3>
    <div class="weekly-chart">
      {#each weeklyStats as week}
        <div class="bar" style="height: {week.count * 10}px" title="{week.week}: {week.count}"></div>
      {/each}
    </div>
  </div>
  
  <div class="section">
    <h3>Habits</h3>
    {#each habits as habit}
      <HabitCard {habit} />
    {/each}
  </div>
</div>

<style>
  .habit-analytics {
    padding: 16px;
  }
  
  .section {
    margin-bottom: 24px;
  }
  
  h3 {
    margin-bottom: 12px;
    color: var(--text-normal);
  }
  
  .weekly-chart {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    height: 120px;
    padding: 8px 0;
  }
  
  .bar {
    flex: 1;
    background: var(--interactive-accent);
    border-radius: 4px 4px 0 0;
    min-height: 4px;
  }
</style>
```

- [ ] **Step 5: Create HabitAnalyticsView**

```typescript
// src/views/HabitAnalyticsView.ts
import { ItemView, WorkspaceLeaf } from "obsidian";
import HabitAnalytics from "../components/HabitAnalytics.svelte";

export const HABIT_ANALYTICS_VIEW_TYPE = "habit-analytics-view";

export class HabitAnalyticsView extends ItemView {
  private component: HabitAnalytics | null = null;
  
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }
  
  getViewType(): string {
    return HABIT_ANALYTICS_VIEW_TYPE;
  }
  
  getDisplayText(): string {
    return "Habit Analytics";
  }
  
  getIcon(): string {
    return "bar-chart";
  }
  
  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    
    this.component = new HabitAnalytics({
      target: container,
    });
  }
  
  async onClose(): Promise<void> {
    this.component?.$destroy();
  }
}
```

- [ ] **Step 6: Register view in main.ts**

```typescript
// src/main.ts
import { HabitAnalyticsView, HABIT_ANALYTICS_VIEW_TYPE } from "./views/HabitAnalyticsView";

// In onload():
this.registerView(
  HABIT_ANALYTICS_VIEW_TYPE,
  (leaf) => new HabitAnalyticsView(leaf)
);

this.addCommand({
  id: "open-habit-analytics",
  name: "Open Habit Analytics",
  callback: () => this.activateView(),
});

// Add method:
async activateView() {
  const { workspace } = this.app;
  
  const existing = workspace.getLeavesOfType(HABIT_ANALYTICS_VIEW_TYPE);
  if (existing.length > 0) {
    workspace.revealLeaf(existing[0]);
    return;
  }
  
  await workspace.getRightLeaf(false).setViewState({
    type: HABIT_ANALYTICS_VIEW_TYPE,
    active: true,
  });
}
```

- [ ] **Step 7: Run build and tests**

```bash
npm run build && npm test
```

- [ ] **Step 8: Commit**

```bash
git add src/views/HabitAnalyticsView.ts src/components/HabitAnalytics.svelte src/components/Heatmap.svelte src/components/HabitCard.svelte src/habit-tracker/stores.ts src/main.ts
git commit -m "feat: add habit analytics view with heatmap and stats"
```

---

### Task 8: Charts in Time Logs

**Covers:** [S6]

**Files:**
- Create: `src/components/charts/BarChart.svelte`
- Modify: `src/task-tracker/TimeLogsModal.svelte`

- [ ] **Step 1: Create BarChart component**

```svelte
<!-- src/components/charts/BarChart.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  
  export let data: { label: string; value: number }[];
  export let width = 400;
  export let height = 200;
  
  let canvas: HTMLCanvasElement;
  
  onMount(() => {
    drawChart();
  });
  
  function drawChart() {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    const maxValue = Math.max(...data.map(d => d.value), 1);
    const barWidth = chartWidth / data.length - 4;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw axes
    ctx.strokeStyle = "var(--background-modifier-border)";
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
    
    // Draw bars
    ctx.fillStyle = "var(--interactive-accent)";
    data.forEach((point, i) => {
      const x = padding + i * (barWidth + 4) + 2;
      const barHeight = (point.value / maxValue) * chartHeight;
      const y = height - padding - barHeight;
      
      ctx.fillRect(x, y, barWidth, barHeight);
      
      // Label
      ctx.fillStyle = "var(--text-muted)";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(point.label, x + barWidth / 2, height - padding + 15);
      ctx.fillStyle = "var(--interactive-accent)";
    });
  }
</script>

<canvas bind:this={canvas} {width} {height}></canvas>

<style>
  canvas {
    max-width: 100%;
    height: auto;
  }
</style>
```

- [ ] **Step 2: Integrate chart into TimeLogsModal**

```typescript
// src/task-tracker/TimeLogsModal.ts
// Add chart data calculation and render BarChart component
```

- [ ] **Step 3: Run build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/charts/BarChart.svelte src/task-tracker/TimeLogsModal.ts
git commit -m "feat: add bar chart to time logs modal"
```

---

### Task 9: Final Verification

**Covers:** All

- [ ] **Step 1: Run full build**

```bash
npm run build
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```

- [ ] **Step 3: Manual verification checklist**

- [ ] Recurring tasks create next instance on completion
- [ ] Habit logs capped at 180 entries
- [ ] Habit analytics view opens and shows data
- [ ] Charts render in time logs
- [ ] Mobile calendar shows full month/week views
- [ ] Notifications settings save and apply
- [ ] Task description removed from UI
- [ ] Folder search works in settings

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: final verification fixes"
```
