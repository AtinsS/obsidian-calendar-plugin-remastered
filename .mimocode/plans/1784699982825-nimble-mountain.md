# Plan: Hybrid Storage Reliability for calendar-data.json

## Problem

All plugin data (tasks, habits, finance, analytics, notifications) is stored in a single `calendar-data.json` file. This creates:
- **Single point of failure** — file corruption loses everything
- **Race conditions** between modules and external sync (Obsidian Sync, Git, iCloud)
- **No integrity verification** — corrupted JSON is silently accepted
- **No backups** — no recovery path on data loss

## Solution: Split Files + Backups + Checksums

### Target Structure

```
calendar-data/
├── tasks.json          # taskTracker data
├── habits.json         # habitTracker data
├── finance.json        # finance data
├── analytics.json      # financialAnalytics data
├── notifications.json  # notificationSync settings
└── meta.json           # checksums, schema version, timestamps
```

### File: `src/io/vaultStorage.ts` (major rewrite)

**Keep:**
- `enqueueWrite()` queue pattern (but make per-module)
- `VaultData` interface (for migration compatibility)

**Add:**
- `VAULT_DATA_DIR = "calendar-data"` constant
- `loadModuleData(app, moduleName)` — reads `calendar-data/<module>.json`
  - On parse error or missing file → try `<module>.json.bak`
  - On backup failure → return empty `{}` (current behavior)
  - Verify checksum from `meta.json` if present; skip if meta missing (backward compat)
- `saveModuleData(app, moduleName, data)` — writes with backup
  - Before write: copy current file → `<module>.json.bak`
  - Write new content to `<module>.json`
  - Update checksum in `meta.json`
- `saveVaultKey(app, key, value)` — **kept for backward compat during migration**, delegates to `saveModuleData`
- `loadVaultData(app)` — **kept for migration** (reads old single file)
- `migrateFromSingleFile(app)` — one-time migration:
  1. Check if `calendar-data.json` exists
  2. Read and parse it
  3. Write each key to its own module file
  4. Rename original to `calendar-data.json.migrated`
  5. Run on plugin load, before any module init

**Per-module write queue:**
```typescript
const moduleQueues: Map<string, Promise<void>> = new Map();

function enqueueModuleWrite(moduleName: string, fn: () => Promise<void>): Promise<void> {
  const current = moduleQueues.get(moduleName) || Promise.resolve();
  const next = current.then(fn, fn); // run even if previous failed
  moduleQueues.set(moduleName, next.catch(() => {}));
  return next;
}
```

**Checksum algorithm:**
```typescript
// Simple string hash (fast, no crypto dependency needed for Obsidian)
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}
```

**meta.json structure:**
```json
{
  "schemaVersion": 2,
  "checksums": {
    "tasks": "a1b2c3",
    "habits": "d4e5f6",
    "finance": "g7h8i9",
    "analytics": "j0k1l2",
    "notifications": "m3n4o5"
  },
  "lastUpdated": "2026-07-22T12:00:00.000Z"
}
```

### File: `src/task-tracker/storage.ts`

- Replace `loadVaultData(plugin.app)` → `loadModuleData(plugin.app, "taskTracker")`
- Replace `saveVaultKey(plugin.app, "taskTracker", data)` → `saveModuleData(plugin.app, "taskTracker", data)`
- No other changes needed (migration logic stays as-is)

### File: `src/habit-tracker/storage.ts`

- Same pattern: replace `loadVaultData`/`saveVaultKey` with `loadModuleData`/`saveModuleData` using key `"habitTracker"`

### File: `src/finance/storage.ts`

- Same pattern: replace with key `"finance"`

### File: `src/finance/financialAnalyticsStorage.ts`

- Same pattern: replace with key `"financialAnalytics"`

### File: `src/main.ts`

- Add migration call before `initTaskStores`:
  ```typescript
  await migrateFromSingleFile(this.app);
  ```
- Update vault event listeners (lines 294-307) to watch the `calendar-data/` directory:
  ```typescript
  // Watch for changes to any file in calendar-data/ directory
  this.registerEvent(
    this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.path.startsWith("calendar-data/")) {
        debouncedSyncReload();
      }
    })
  );
  this.registerEvent(
    this.app.vault.on("create", (file) => {
      if (file instanceof TFile && file.path.startsWith("calendar-data/")) {
        debouncedSyncReload();
      }
    })
  );
  ```
- Export `VAULT_DATA_DIR` constant from vaultStorage.ts so main.ts doesn't hardcode paths

### File: `src/settings.ts`

- Update UI descriptions (lines 507-537) to reflect new `calendar-data/` directory structure
- Update Remotely Save instructions: add `calendar-data/` folder to Include Files
- Keep sync toggle behavior unchanged

### File: `examples/workflows/overdue-check.yml`

Update Python script to read from new locations:
```python
# Before (single file):
with open('calendar-data.json') as f:
    data = json.load(f)

# After (split files):
import os
TASKS_FILE = 'calendar-data/tasks.json'
NOTIF_FILE = 'calendar-data/notifications.json'

if not os.path.exists(TASKS_FILE):
    exit(0)

with open(TASKS_FILE) as f:
    tasks_data = json.load(f)
with open(NOTIF_FILE) as f:
    notif_data = json.load(f)
```

Similarly update the write-back section and `git add` paths.

### File: `src/finance/__tests__/storage-lifecycle.test.ts`

Update mock vault to support directory structure:
- `vaultStore` keys change from `"calendar-data.json"` to `"calendar-data/finance.json"`, etc.
- Add mock for `meta.json` with checksums
- Add tests for backup creation and recovery
- Add tests for checksum verification and fallback
- Add tests for migration from old format

## Migration Flow (on plugin load)

```
1. Check if calendar-data.json exists at vault root
   └─ NO → skip migration (already migrated or fresh install)
   └─ YES ↓
2. Read and parse calendar-data.json
3. For each key (taskTracker, habitTracker, finance, financialAnalytics, notificationSync):
   └─ Write to calendar-data/<module>.json
4. Rename calendar-data.json → calendar-data.json.migrated
5. Continue with normal plugin initialization
```

## Files to Modify

| File | Change Type |
|------|------------|
| `src/io/vaultStorage.ts` | Major rewrite — split file support, backups, checksums, migration |
| `src/main.ts` | Update event listeners, add migration call |
| `src/task-tracker/storage.ts` | Switch to `loadModuleData`/`saveModuleData` |
| `src/habit-tracker/storage.ts` | Switch to `loadModuleData`/`saveModuleData` |
| `src/finance/storage.ts` | Switch to `loadModuleData`/`saveModuleData` |
| `src/finance/financialAnalyticsStorage.ts` | Switch to `loadModuleData`/`saveModuleData` |
| `src/settings.ts` | Update UI text |
| `examples/workflows/overdue-check.yml` | Update file paths in Python script |
| `src/finance/__tests__/storage-lifecycle.test.ts` | Update mocks and add new tests |
| `README.md` | Update documentation |

## Verification

1. **Unit tests**: `npm test` — all existing + new tests pass
2. **Build**: `npm run build` — no TypeScript errors
3. **Manual migration test**:
   - Create a `calendar-data.json` with sample data in vault root
   - Load plugin → verify files split into `calendar-data/` directory
   - Verify `calendar-data.json.migrated` exists
   - Verify all data loads correctly into stores
4. **Backup test**: Manually corrupt `calendar-data/tasks.json` → reload → verify `.bak` fallback works
5. **Checksum test**: Modify `meta.json` checksum → reload → verify fallback to `.bak`
6. **Concurrent write test**: Trigger rapid updates to multiple modules → verify no data loss
7. **GitHub Actions**: Run `overdue-check.yml` locally against new file structure
