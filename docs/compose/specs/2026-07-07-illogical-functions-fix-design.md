# Fix Illogical Functions - Design Spec

## [S1] Problem

The codebase contains 35 functions/methods with design flaws: misleading names, dead code, wrong behavior, multiple responsibilities, global state violations, and inconsistent patterns. These make the code hard to maintain and introduce subtle bugs.

## [S2] Solution Overview

Systematic fix organized into 7 batches, ordered by impact and dependency:

1. **Critical bugs** — wrong behavior affecting users
2. **Misleading names** — rename to match actual behavior
3. **Dead code removal** — remove unused functions/parameters
4. **Multiple responsibilities** — decompose large functions
5. **Global state violations** — pass dependencies explicitly
6. **Inconsistencies** — unify behavior across similar code
7. **Code deduplication** — extract shared utilities

## [S3] Batch 1: Critical Bugs (8 fixes)

### [S3.1] `calculateEndTime` midnight crossing
**File**: `src/components/scheduleUtils.ts:8-18`
**Bug**: Task at 23:00 + 90min shows 00:30 same day instead of next day.
**Fix**: Check if `hours * 60 + minutes + durationMin >= 1440`, if so subtract 1440 and increment date.

### [S3.2] `isTimePassed` ignores date
**File**: `src/task-tracker/TaskItem.svelte:32-36`
**Bug**: Compares only hours/minutes, not date. Yesterday's 09:00 task shows as "time passed".
**Fix**: Accept full `dateUID` and compare full datetime.

### [S3.3] `formatDuration` shows "1 min" for 0ms
**File**: `src/task-tracker/TimerManager.ts:83-95`
**Fix**: Return "0 min" or "< 1 min" for zero duration.

### [S3.4] `loadOptions` saves back immediately
**File**: `src/main.ts:174-184`
**Fix**: Only save if data actually changed (compare before/after).

### [S3.5] `completeRecurringTask` naming
**File**: `src/task-tracker/stores.ts:182-247`
**Fix**: Rename to `createNextRecurringInstance` to match actual behavior.

### [S3.6] `getFormattedTagAttributes` loses emoji tags
**File**: `src/ui/sources/tags.ts:44`
**Fix**: Join all emoji tags with separator instead of taking only first.

### [S3.7] `getMetadataForDate` badge format
**File**: `src/habit-tracker/habitSource.ts:39`
**Fix**: Add space: `` `🔥 ${count}` ``

### [S3.8] `getMetadataForDate` redundant condition
**File**: `src/task-tracker/taskDotSource.ts:82`
**Fix**: Simplify to `if (dateTasks.length > 0)`.

## [S4] Batch 2: Misleading Names (8 fixes)

### [S4.1] `openOrCreateDailyNote` → `selectDateForDay`
**File**: `src/view.ts:397-404`

### [S4.2] `openOrCreateWeeklyNote` → `selectDateForWeek`
**File**: `src/view.ts:388-395`

### [S4.3] `getStreakClasses` → `getNoteExistenceClasses`
**File**: `src/ui/sources/streak.ts:10-14`

### [S4.4] `getDotsForDailyNote` → `getDotsForNote`
**File**: `src/ui/sources/wordCount.ts:41-57`

### [S4.5] `getWordLengthAsDots` → `getWordCountAsDots`
**File**: `src/ui/sources/wordCount.ts:31-39`

### [S4.6] `classList` → `getActiveClasses`
**File**: `src/ui/utils.ts:4-8`

### [S4.7] `showFileMenu` → `showNoteContextMenu`
**File**: `src/ui/fileMenu.ts:3-23`

### [S4.8] `muteColor` → `tintWithAlpha`
**File**: `src/components/scheduleUtils.ts:21-30`

## [S5] Batch 3: Dead Code Removal (5 fixes)

### [S5.1] Remove 7 dead settings methods
**File**: `src/settings.ts:116-314`
**Remove**: `addDotThresholdSetting`, `addConfirmCreateSetting`, `addShowWeeklyNoteSetting`, `addWeeklyNoteFormatSetting`, `addWeeklyNoteTemplateSetting`, `addWeeklyNoteFolderSetting`, `addLocaleOverrideSetting`

### [S5.2] Remove `_inNewSplit` parameter
**File**: `src/view.ts:388-398`

### [S5.3] Remove unnecessary `async`
**File**: `src/view.ts:321,331`

### [S5.4] Remove `handleDrop`/`handleDragOver` no-ops OR implement drag-and-drop
**File**: `src/task-tracker/TaskPanel.svelte:194-200`
**Decision**: Remove for now, add drag-and-drop as separate feature later.

### [S5.5] Remove `calendar.tick()` hack
**File**: `src/view.ts:334`
**Fix**: Make Calendar component properly reactive to stores.

## [S6] Batch 4: Multiple Responsibilities (3 fixes)

### [S6.1] Decompose `updateTaskStatus`
**File**: `src/task-tracker/stores.ts:105-164`
**Extract**: `startTaskTimer`, `stopTaskTimerAndLog`, `setTaskStatus`

### [S6.2] Decompose `handleTaskComplete`
**File**: `src/task-tracker/TaskPanel.svelte:130-150`
**Extract**: `toggleTaskStatus()`, `handleRecurringNext()`, `archiveNoteIfCompleted()`

### [S6.3] Decompose `createNoteTask`
**File**: `src/task-tracker/noteTasks.ts:16-59`
**Extract**: `buildNotePath`, `buildNoteContent`

## [S7] Batch 5: Global State Violations (3 fixes)

### [S7.1] Pass `app` as prop to Svelte components
**Files**: `TaskPanel.svelte`, `TaskItem.svelte`, `HabitPanel.svelte`

### [S7.2] Pass `App` parameter to `getNoteTags`
**File**: `src/ui/sources/tags.ts:16`

### [S7.3] Inject moment via store or parameters
**Files**: `stores.ts`, `view.ts`, `taskDotSource.ts`

## [S8] Batch 6: Inconsistencies (5 fixes)

### [S8.1] Unify `initTaskStores` / `reloadTaskStores`
**File**: `src/task-tracker/stores.ts:60-76`
**Fix**: Always call `autoCleanupCompleted()` on reload.

### [S8.2] Add `getWeeklyMetadata` to `habitSource`
**File**: `src/habit-tracker/habitSource.ts:49-53`

### [S8.3] Simplify `writeOptions` signature
**File**: `src/main.ts:186-191`
**Fix**: Change to `writeOptions(changes: Partial<ISettings>)`.

### [S8.4] Make `partition` generic
**File**: `src/ui/utils.ts:18-34`

### [S8.5] Use shared `generateId`
**Files**: `src/task-tracker/storage.ts`, `src/habit-tracker/storage.ts`
**Fix**: Extract to `src/utils/id.ts`.

## [S9] Batch 7: Code Deduplication

### [S9.1] Extract shared ID generator
**Create**: `src/utils/id.ts`
**Import**: Both `storage.ts` files

### [S9.2] Use `MAX_TIME_LOGS` from types
**File**: `src/task-tracker/TimerManager.ts:77-81`
**Fix**: Import from `types.ts` instead of local constant.

## [S10] Testing Strategy

- Run `npm run build` after each batch to verify no compilation errors
- Run existing tests if any
- Manual verification in Obsidian for critical UI changes

## [S11] Risk Assessment

- **Low risk**: Renames, dead code removal, generic utilities
- **Medium risk**: Function decomposition (may change behavior subtly)
- **High risk**: Global state changes, reactive store changes
