# Illogical Functions Fix - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 35 illogical functions across the Obsidian Calendar Plugin codebase to improve maintainability, correctness, and code clarity.

**Architecture:** Systematic fixes organized into 7 batches by impact and dependency. Each batch is independently testable. Changes are minimal and focused — no unrelated refactoring.

**Tech Stack:** TypeScript, Svelte, Obsidian API

## Global Constraints

- TypeScript strict mode — no `any` types
- Preserve all existing functionality — no behavioral regressions
- Follow existing code patterns and naming conventions
- Build must pass after each batch: `npm run build`

---

### Task 1: Critical Bugs (8 fixes)

**Covers:** [S3.1-S3.8]

**Files:**
- Modify: `src/components/scheduleUtils.ts:8-18,21-30`
- Modify: `src/task-tracker/TaskItem.svelte:32-36`
- Modify: `src/task-tracker/TimerManager.ts:77-81,83-95`
- Modify: `src/main.ts:174-184`
- Modify: `src/task-tracker/stores.ts:182-247`
- Modify: `src/ui/sources/tags.ts:44`
- Modify: `src/habit-tracker/habitSource.ts:39`
- Modify: `src/task-tracker/taskDotSource.ts:82`

- [ ] **Step 1: Fix `calculateEndTime` midnight crossing**

```typescript
// src/components/scheduleUtils.ts:8-18
export function calculateEndTime(
  startTime: string,
  durationMin: number
): string {
  const [hours, minutes] = startTime.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + durationMin;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  return `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
}
```

- [ ] **Step 2: Fix `isTimePassed` to include date**

```typescript
// src/task-tracker/TaskItem.svelte:32-36
function isTimePassed(dateUID: string, time: string | undefined): boolean {
  if (!time) return false;
  const [hours, minutes] = time.split(":").map(Number);
  const taskDate = moment(dateUID, "YYYY-MM-DD");
  const now = moment();
  const taskDateTime = taskDate.clone().hour(hours).minute(minutes);
  return taskDateTime.isBefore(now);
}
```

- [ ] **Step 3: Fix `formatDuration` for zero duration**

```typescript
// src/task-tracker/TimerManager.ts:83-95
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}
```

- [ ] **Step 4: Fix `loadOptions` to only save if changed**

```typescript
// src/main.ts:174-184
async loadOptions(): Promise<void> {
  const savedData = await this.loadData();
  if (savedData) {
    const before = JSON.stringify(this.options);
    this.options = {
      ...this.options,
      ...savedData,
    };
    const after = JSON.stringify(this.options);
    if (before !== after) {
      await this.saveData(this.options);
    }
  }
}
```

- [ ] **Step 5: Rename `completeRecurringTask` to `createNextRecurringInstance`**

```typescript
// src/task-tracker/stores.ts:182-247
export async function createNextRecurringInstance(task: Task): Promise<void> {
  // ... existing implementation unchanged
}
```

- [ ] **Step 6: Fix `getFormattedTagAttributes` to join all emoji tags**

```typescript
// src/ui/sources/tags.ts:44
attrs["data-emoji-tag"] = emojiTags.join(", ");
```

- [ ] **Step 7: Fix badge format in `habitSource`**

```typescript
// src/habit-tracker/habitSource.ts:39
const badge = allCompleted ? "🏆" : `🔥 ${count}`;
```

- [ ] **Step 8: Simplify redundant condition in `taskDotSource`**

```typescript
// src/task-tracker/taskDotSource.ts:82
if (dateTasks.length > 0) {
  classes.push("has-task-tracker-tasks");
}
```

- [ ] **Step 9: Run build to verify**

```bash
npm run build
```

- [ ] **Step 10: Commit**

```bash
git add src/components/scheduleUtils.ts src/task-tracker/TaskItem.svelte src/task-tracker/TimerManager.ts src/main.ts src/task-tracker/stores.ts src/ui/sources/tags.ts src/habit-tracker/habitSource.ts src/task-tracker/taskDotSource.ts
git commit -m "fix: correct critical bugs in time calculation, duration formatting, and data loading"
```

---

### Task 2: Misleading Names (8 fixes)

**Covers:** [S4.1-S4.8]

**Files:**
- Modify: `src/view.ts:388-404`
- Modify: `src/ui/sources/streak.ts:10-14`
- Modify: `src/ui/sources/wordCount.ts:31-39,41-57,70`
- Modify: `src/ui/utils.ts:4-8`
- Modify: `src/ui/fileMenu.ts:3-23`
- Modify: `src/components/scheduleUtils.ts:21-30`
- Update all callers of renamed functions

- [ ] **Step 1: Rename `openOrCreateDailyNote` to `selectDateForDay`**

```typescript
// src/view.ts:397-404
private selectDateForDay(date: MomentDate): void {
  const dateUID = getDateUID(date, "day");
  selectedDate.set(dateUID);
  activeFile.setUID(dateUID);
}
```

- [ ] **Step 2: Rename `openOrCreateWeeklyNote` to `selectDateForWeek`**

```typescript
// src/view.ts:388-395
private selectDateForWeek(date: MomentDate): void {
  const dateUID = getDateUID(date, "week");
  selectedDate.set(dateUID);
  activeFile.setUID(dateUID);
}
```

- [ ] **Step 3: Update all callers of renamed view methods**

Search for `openOrCreateDailyNote` and `openOrCreateWeeklyNote` in all files and update to new names.

- [ ] **Step 4: Rename `getStreakClasses` to `getNoteExistenceClasses`**

```typescript
// src/ui/sources/streak.ts:10-14
function getNoteExistenceClasses(dateUID: string, file?: TFile): string[] {
  return file ? ["has-note"] : [];
}
```

- [ ] **Step 5: Rename `getDotsForDailyNote` to `getDotsForNote`**

```typescript
// src/ui/sources/wordCount.ts:41-57
function getDotsForNote(file: TFile, wordCountThreshold: number): number[] {
  // ... existing implementation
}
```

- [ ] **Step 6: Rename `getWordLengthAsDots` to `getWordCountAsDots`**

```typescript
// src/ui/sources/wordCount.ts:31-39
function getWordCountAsDots(wordCount: number, threshold: number): number[] {
  // ... existing implementation
}
```

- [ ] **Step 7: Update callers in `wordCount.ts`**

```typescript
// src/ui/sources/wordCount.ts:70
const dots = getDotsForNote(file, this.wordCountThreshold);
```

- [ ] **Step 8: Rename `classList` to `getActiveClasses`**

```typescript
// src/ui/utils.ts:4-8
export function getActiveClasses(classes: Record<string, boolean>): string[] {
  return Object.entries(classes)
    .filter(([, active]) => active)
    .map(([name]) => name);
}
```

- [ ] **Step 9: Update all callers of `classList`**

Search for `classList(` in all files and update to `getActiveClasses(`.

- [ ] **Step 10: Rename `showFileMenu` to `showNoteContextMenu`**

```typescript
// src/ui/fileMenu.ts:3-23
export function showNoteContextMenu(event: MouseEvent, file: TFile, app: App): void {
  // ... existing implementation
}
```

- [ ] **Step 11: Update callers of `showFileMenu`**

Search for `showFileMenu` in all files and update to `showNoteContextMenu`.

- [ ] **Step 12: Rename `muteColor` to `tintWithAlpha`**

```typescript
// src/components/scheduleUtils.ts:21-30
export function tintWithAlpha(hex: string, alpha: number): string {
  // ... existing implementation
}
```

- [ ] **Step 13: Update callers of `muteColor`**

Search for `muteColor` in all files and update to `tintWithAlpha`.

- [ ] **Step 14: Run build to verify**

```bash
npm run build
```

- [ ] **Step 15: Commit**

```bash
git add src/view.ts src/ui/sources/streak.ts src/ui/sources/wordCount.ts src/ui/utils.ts src/ui/fileMenu.ts src/components/scheduleUtils.ts
git commit -m "refactor: rename misleading functions to match actual behavior"
```

---

### Task 3: Dead Code Removal (5 fixes)

**Covers:** [S5.1-S5.5]

**Files:**
- Modify: `src/settings.ts:116-314`
- Modify: `src/view.ts:321,331,334,388-398`
- Modify: `src/task-tracker/TaskPanel.svelte:194-200`

- [ ] **Step 1: Remove 7 dead settings methods**

```typescript
// src/settings.ts
// Remove these methods entirely:
// - addDotThresholdSetting (line 116)
// - addConfirmCreateSetting (line 158)
// - addShowWeeklyNoteSetting (line 172)
// - addWeeklyNoteFormatSetting (line 185)
// - addWeeklyNoteTemplateSetting (line 198)
// - addWeeklyNoteFolderSetting (line 212)
// - addLocaleOverrideSetting (line 314)
```

- [ ] **Step 2: Remove `_inNewSplit` parameter**

```typescript
// src/view.ts:388-398
private selectDateForWeek(date: MomentDate): void {
  const dateUID = getDateUID(date, "week");
  selectedDate.set(dateUID);
  activeFile.setUID(dateUID);
}

private selectDateForDay(date: MomentDate): void {
  const dateUID = getDateUID(date, "day");
  selectedDate.set(dateUID);
  activeFile.setUID(dateUID);
}
```

- [ ] **Step 3: Update callers that pass `_inNewSplit`**

Search for `selectDateForDay(date,` and `selectDateForWeek(date,` and remove the second argument.

- [ ] **Step 4: Remove unnecessary `async`**

```typescript
// src/view.ts:321
onFileModified(file: TFile): void {
  // ... implementation
}

// src/view.ts:331
onFileDeleted(file: TFile): void {
  // ... implementation
}
```

- [ ] **Step 5: Remove `handleDrop`/`handleDragOver` no-ops**

```svelte
<!-- src/task-tracker/TaskPanel.svelte -->
<!-- Remove on:drop and on:dragover handlers -->
<!-- Remove draggable="true" from TaskItem if present -->
```

- [ ] **Step 6: Run build to verify**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/settings.ts src/view.ts src/task-tracker/TaskPanel.svelte
git commit -m "refactor: remove dead code and unused parameters"
```

---

### Task 4: Multiple Responsibilities (3 fixes)

**Covers:** [S6.1-S6.3]

**Files:**
- Modify: `src/task-tracker/stores.ts:105-164`
- Modify: `src/task-tracker/TaskPanel.svelte:130-150`
- Modify: `src/task-tracker/noteTasks.ts:16-59`

- [ ] **Step 1: Decompose `updateTaskStatus`**

```typescript
// src/task-tracker/stores.ts
function startTaskTimer(taskId: string): void {
  const timerManager = TimerManager.getInstance();
  timerManager.startTimer(taskId);
}

function stopTaskTimerAndLog(taskId: string, durationMs: number): void {
  const timerManager = TimerManager.getInstance();
  timerManager.stopTimer(taskId);
  timerManager.addTimeLog(taskId, durationMs);
}

function setTaskStatus(task: Task, status: TaskStatus): Task {
  const updated = { ...task, status };
  if (status === "done") {
    updated.completed = true;
    updated.completedAt = new Date().toISOString();
  }
  return updated;
}

export async function updateTaskStatus(
  taskId: string,
  newStatus: TaskStatus
): Promise<void> {
  const tasks = get(taskStore);
  const taskIndex = tasks.findIndex((t) => t.id === taskId);
  if (taskIndex === -1) return;

  const task = tasks[taskIndex];
  const oldStatus = task.status;

  if (oldStatus === "progress" && newStatus !== "progress") {
    stopTaskTimerAndLog(taskId, Date.now() - (task.startedAt || Date.now()));
  }

  if (newStatus === "progress" && oldStatus !== "progress") {
    startTaskTimer(taskId);
  }

  const updatedTasks = [...tasks];
  updatedTasks[taskIndex] = setTaskStatus(task, newStatus);
  taskStore.set(updatedTasks);
  debouncedSave();
}
```

- [ ] **Step 2: Decompose `handleTaskComplete`**

```svelte
<!-- src/task-tracker/TaskPanel.svelte -->
<script lang="ts">
  function toggleTaskStatus(task: Task): TaskStatus {
    return task.status === "done" ? "todo" : "done";
  }

  async function handleRecurringNext(task: Task): Promise<void> {
    if (task.recurrence) {
      await createNextRecurringInstance(task);
    }
  }

  async function archiveNoteIfCompleted(task: Task, newStatus: TaskStatus): Promise<void> {
    if (newStatus === "done" && task.notePath) {
      await archiveNoteTask(task);
    }
  }

  async function handleTaskComplete(task: Task): Promise<void> {
    const newStatus = toggleTaskStatus(task);
    await updateTaskStatus(task.id, newStatus);
    await handleRecurringNext(task);
    await archiveNoteIfCompleted(task, newStatus);
  }
</script>
```

- [ ] **Step 3: Decompose `createNoteTask`**

```typescript
// src/task-tracker/noteTasks.ts
function buildNotePath(task: Task, folder: string): string {
  const date = moment(task.dueDate).format("YYYY-MM-DD");
  const sanitizedTitle = task.title.replace(/[<>:"/\\|?*]/g, "_");
  return `${folder}/${date}-${sanitizedTitle}.md`;
}

function buildNoteContent(task: Task): string {
  const frontmatter = [
    "---",
    `title: "${task.title}"`,
    `status: "${task.status}"`,
    `priority: "${task.priority}"`,
    `dueDate: "${task.dueDate}"`,
    "---",
    "",
  ].join("\n");

  const body = [
    `# ${task.title}`,
    "",
    `- [ ] ${task.title}`,
    "",
  ].join("\n");

  return frontmatter + body;
}

export async function createNoteTask(
  task: Task,
  folder: string,
  app: App
): Promise<string> {
  const path = buildNotePath(task, folder);
  const content = buildNoteContent(task);

  const parts = path.split("/");
  const fileName = parts.pop()!;
  const dir = parts.join("/");

  if (!(await app.vault.adapter.exists(dir))) {
    await app.vault.createFolder(dir);
  }

  await app.vault.create(path, content);
  return path;
}
```

- [ ] **Step 4: Run build to verify**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/task-tracker/stores.ts src/task-tracker/TaskPanel.svelte src/task-tracker/noteTasks.ts
git commit -m "refactor: decompose multi-responsibility functions into focused units"
```

---

### Task 5: Global State Violations (3 fixes)

**Covers:** [S7.1-S7.3]

**Files:**
- Modify: `src/task-tracker/TaskPanel.svelte`
- Modify: `src/task-tracker/TaskItem.svelte`
- Modify: `src/habit-tracker/HabitPanel.svelte`
- Modify: `src/ui/sources/tags.ts:16`
- Modify: `src/task-tracker/stores.ts:187`
- Modify: `src/habit-tracker/stores.ts:129`
- Modify: `src/task-tracker/taskDotSource.ts:22`
- Modify: `src/view.ts:367`

- [ ] **Step 1: Create app store**

```typescript
// src/stores/appStore.ts
import { Writable, writable } from "svelte/store";
import { App } from "obsidian";

export const appStore: Writable<App | null> = writable(null);
```

- [ ] **Step 2: Set app store in main plugin**

```typescript
// src/main.ts
import { appStore } from "./stores/appStore";

onload() {
  appStore.set(this.app);
  // ... existing code
}
```

- [ ] **Step 3: Pass app as prop to Svelte components**

```svelte
<!-- src/task-tracker/TaskPanel.svelte -->
<script lang="ts">
  import { appStore } from "../stores/appStore";
  
  const app = $appStore;
</script>
```

- [ ] **Step 4: Update `getNoteTags` to accept App parameter**

```typescript
// src/ui/sources/tags.ts:16
export function getNoteTags(file: TFile, app: App): string[] {
  const cache = app.metadataCache.getFileCache(file);
  // ... rest of implementation
}
```

- [ ] **Step 5: Update callers of `getNoteTags`**

Pass `app` parameter to all `getNoteTags` calls.

- [ ] **Step 6: Replace `window.moment` with imported moment**

```typescript
// src/task-tracker/stores.ts:187
import moment from "moment";
// Use moment() instead of window.moment()
```

Do the same for:
- `src/habit-tracker/stores.ts:129`
- `src/task-tracker/taskDotSource.ts:22`
- `src/view.ts:367`

- [ ] **Step 7: Run build to verify**

```bash
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/stores/appStore.ts src/main.ts src/task-tracker/TaskPanel.svelte src/task-tracker/TaskItem.svelte src/habit-tracker/HabitPanel.svelte src/ui/sources/tags.ts src/task-tracker/stores.ts src/habit-tracker/stores.ts src/task-tracker/taskDotSource.ts src/view.ts
git commit -m "refactor: eliminate global state access violations"
```

---

### Task 6: Inconsistencies (5 fixes)

**Covers:** [S8.1-S8.5]

**Files:**
- Modify: `src/task-tracker/stores.ts:60-76`
- Modify: `src/habit-tracker/habitSource.ts:49-53`
- Modify: `src/main.ts:186-191`
- Modify: `src/ui/utils.ts:18-34`
- Create: `src/utils/id.ts`
- Modify: `src/task-tracker/storage.ts:16-22`
- Modify: `src/habit-tracker/storage.ts:16-22`

- [ ] **Step 1: Unify `initTaskStores` / `reloadTaskStores`**

```typescript
// src/task-tracker/stores.ts:60-76
export async function reloadTaskStores(): Promise<void> {
  const tasks = await loadTaskData();
  taskStore.set(tasks);
  autoCleanupCompleted(); // Add this line
  debouncedSave();
}
```

- [ ] **Step 2: Add `getWeeklyMetadata` to `habitSource`**

```typescript
// src/habit-tracker/habitSource.ts:49-53
getWeeklyMetadata(dateUID: string): SourceMetadata {
  const weekStart = moment(dateUID, "YYYY-MM-DD").startOf("week");
  const weekEnd = moment(dateUID, "YYYY-MM-DD").endOf("week");
  
  let completedCount = 0;
  let totalCount = 0;
  
  for (let i = 0; i < 7; i++) {
    const day = weekStart.clone().add(i, "days");
    const dayUID = day.format("YYYY-MM-DD");
    const dayData = this.getMetadataForDate(dayUID);
    if (dayData.badge) {
      completedCount++;
    }
    totalCount++;
  }
  
  const allCompleted = completedCount === totalCount;
  const badge = allCompleted ? "🏆" : `${completedCount}/${totalCount}`;
  
  return { badge };
}
```

- [ ] **Step 3: Simplify `writeOptions` signature**

```typescript
// src/main.ts:186-191
async writeOptions(changes: Partial<ISettings>): Promise<void> {
  this.options = {
    ...this.options,
    ...changes,
  };
  await this.saveData(this.options);
}
```

- [ ] **Step 4: Update all callers of `writeOptions`**

Search for `writeOptions(` and simplify the lambda wrappers.

- [ ] **Step 5: Make `partition` generic**

```typescript
// src/ui/utils.ts:18-34
export function partition<T>(
  arr: T[],
  predicate: (elem: T) => boolean
): [T[], T[]] {
  const truthy: T[] = [];
  const falsy: T[] = [];
  for (const elem of arr) {
    if (predicate(elem)) {
      truthy.push(elem);
    } else {
      falsy.push(elem);
    }
  }
  return [truthy, falsy];
}
```

- [ ] **Step 6: Create shared ID generator**

```typescript
// src/utils/id.ts
export function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
```

- [ ] **Step 7: Update both storage files to use shared ID**

```typescript
// src/task-tracker/storage.ts
import { generateId } from "../utils/id";

// Remove local generateId function
```

```typescript
// src/habit-tracker/storage.ts
import { generateId } from "../utils/id";

// Remove local generateId function
```

- [ ] **Step 8: Run build to verify**

```bash
npm run build
```

- [ ] **Step 9: Commit**

```bash
git add src/task-tracker/stores.ts src/habit-tracker/habitSource.ts src/main.ts src/ui/utils.ts src/utils/id.ts src/task-tracker/storage.ts src/habit-tracker/storage.ts
git commit -m "refactor: unify inconsistent patterns and extract shared utilities"
```

---

### Task 7: Code Deduplication (1 fix)

**Covers:** [S9.1-S9.2]

**Files:**
- Modify: `src/task-tracker/TimerManager.ts:77-81`

- [ ] **Step 1: Use `MAX_TIME_LOGS` from types**

```typescript
// src/task-tracker/TimerManager.ts:77-81
import { MAX_TIME_LOGS } from "./types";

// Remove local const MAX = 30;
// Use MAX_TIME_LOGS instead of MAX
```

- [ ] **Step 2: Run build to verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/task-tracker/TimerManager.ts
git commit -m "refactor: use shared MAX_TIME_LOGS constant"
```

---

### Task 8: Final Verification

**Covers:** All

- [ ] **Step 1: Run full build**

```bash
npm run build
```

- [ ] **Step 2: Run tests if available**

```bash
npm test
```

- [ ] **Step 3: Manual verification checklist**

- [ ] Calendar opens without errors
- [ ] Daily notes can be selected
- [ ] Weekly notes can be selected
- [ ] Task tracker functions correctly
- [ ] Habit tracker functions correctly
- [ ] Settings panel opens
- [ ] No console errors

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: final verification fixes"
```
