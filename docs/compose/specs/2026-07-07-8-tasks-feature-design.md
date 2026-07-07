# Obsidian Calendar Plugin - 8 Tasks Feature Design

## [S1] Problem

The plugin needs 8 feature additions/fixes:
1. Recurring tasks broken after kanban states
2. Habit log grows unbounded
3. No habit analytics
4. No time log charts
5. Mobile schedule view needs optimization
6. No task notifications
7. Unused task description field
8. No folder search in settings

## [S2] Solution Overview

Decompose into 8 independent tasks, each self-contained:
- Tasks 1, 2, 7: Bug fixes and cleanup (minimal, safe)
- Tasks 3, 4: New analytics features (medium complexity)
- Task 5: CSS optimization (low risk)
- Task 6: New notification service (medium complexity)
- Task 8: New modal component (low complexity)

## [S3] Task 1: Fix Recurring Tasks with Kanban States

**Problem:** Recurring tasks don't preserve status correctly after kanban introduction.

**Current behavior:**
- `createNextRecurringInstance()` creates next task with `status: "todo"` (correct)
- But when task is marked done, the old task stays with `status: "done"` (correct)
- The issue is that the recurrence check happens BEFORE status update in some code paths

**Fix:**
1. Ensure `handleRecurringNext()` is called AFTER status is set to "done"
2. Verify `createNextRecurringInstance()` copies all fields except status
3. Add `isRecurringInstance: boolean` field to ITask for tracking
4. Add `parentTaskId?: string` to link instances

**Files:**
- `src/task-tracker/types.ts` - add isRecurringInstance, parentTaskId
- `src/task-tracker/stores.ts` - fix createNextRecurringInstance
- `src/task-tracker/TaskPanel.svelte` - fix handleRecurringNext order

## [S4] Task 2: Habit Log Cleanup at 180 Entries

**Problem:** `habitLogs` store grows unbounded.

**Fix:**
1. Add `MAX_HABIT_LOG_ENTRIES = 180` constant
2. Add `cleanupOldHabitLogs()` method to stores
3. Call after `toggleHabitCompletion()` adds a log
4. Call on data load
5. Sort by date, keep newest 180

**Files:**
- `src/habit-tracker/stores.ts` - add cleanup logic
- `src/habit-tracker/types.ts` - add constant

## [S5] Task 3: Habit Analytics View

**Problem:** No habit statistics or visualization.

**Implementation:**
1. Create `HabitAnalyticsView.ts` (ItemView)
2. Create `HabitAnalytics.svelte` component
3. Create `Heatmap.svelte` for yearly activity
4. Create `HabitCard.svelte` for per-habit stats
5. Add methods to stores:
   - `getHeatmapData()` - 365 days of completion counts
   - `getWeeklyStats()` - last 12 weeks
   - `getMonthlyStats()` - last 12 months
   - `getHabitStats(habitId)` - per-habit statistics
6. Register view and command in main.ts
7. Mobile responsive CSS

**Files:**
- `src/views/HabitAnalyticsView.ts` (new)
- `src/components/HabitAnalytics.svelte` (new)
- `src/components/Heatmap.svelte` (new)
- `src/components/HabitCard.svelte` (new)
- `src/habit-tracker/stores.ts` - add analytics methods
- `src/main.ts` - register view

## [S6] Task 4: Charts in Time Logs

**Problem:** No visualization in time logs.

**Implementation:**
1. Create chart components using Canvas API (no external libs):
   - `LineChart.svelte` - weekly trend
   - `BarChart.svelte` - daily distribution
   - `PieChart.svelte` - habit distribution
2. Add to TimeLogsModal or new analytics view
3. Mobile responsive

**Files:**
- `src/components/charts/LineChart.svelte` (new)
- `src/components/charts/BarChart.svelte` (new)
- `src/components/charts/PieChart.svelte` (new)
- `src/task-tracker/TimeLogsModal.svelte` - integrate charts

## [S7] Task 5: Mobile Schedule Optimization

**Problem:** Calendar truncated on mobile.

**Fix:**
1. Ensure full month grid visible (7x5/7x6)
2. Compact event display (dots/badges)
3. Swipe navigation for months/weeks
4. Responsive time grid (08:00-22:00 visible)
5. Touch-friendly controls

**Files:**
- `src/components/ScheduleCalendar.svelte` - CSS updates
- `src/styles.css` - mobile media queries

## [S8] Task 6: Task Notifications

**Problem:** No reminder system.

**Implementation:**
1. Create `NotificationService.ts`
2. Add `NotificationSettings` interface
3. Add settings UI
4. Implement:
   - Pre-task reminders (N minutes before dueTime)
   - Overdue task alerts
   - Daily summary
5. Use Notification API
6. Start/stop with plugin lifecycle

**Files:**
- `src/services/NotificationService.ts` (new)
- `src/settings.ts` - add notification settings
- `src/main.ts` - start/stop service
- `src/components/NotificationSettings.svelte` (new)

## [S9] Task 7: Remove Task Description

**Problem:** Description field unused, adds complexity.

**Fix:**
1. Remove `description` from ITask interface
2. Remove from TaskModal
3. Remove from TaskItem display
4. Remove description CSS
5. Add storage migration v4->v5 (strip description from existing data)

**Files:**
- `src/task-tracker/types.ts` - remove description
- `src/task-tracker/TaskModal.ts` - remove description UI
- `src/task-tracker/TaskItem.svelte` - remove description display
- `src/task-tracker/storage.ts` - add migration
- `src/styles.css` - remove description styles

## [S10] Task 8: Folder Search in Settings

**Problem:** Manual folder path entry.

**Implementation:**
1. Create `FolderSuggestModal.ts` extending SuggestModal
2. Use in settings for archive folder
3. Real-time search filtering
4. Show folder path preview

**Files:**
- `src/modals/FolderSuggestModal.ts` (new)
- `src/settings.ts` - use FolderSuggestModal

## [S11] Testing Strategy

- Run `npm run build` after each task
- Run `npm test` after each task
- Manual verification in Obsidian for UI changes
- Test on mobile viewport for Task 5

## [S12] Risk Assessment

- **Low risk:** Tasks 2, 7, 8 (simple additions/removals)
- **Medium risk:** Tasks 1, 5, 6 (behavioral changes, CSS)
- **High risk:** Tasks 3, 4 (new features, new components)
