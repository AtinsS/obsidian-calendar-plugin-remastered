import type CalendarPlugin from "src/main";

import { ITaskTrackerData, TASK_TRACKER_DATA_VERSION } from "./types";
import { loadVaultData, saveVaultData } from "../io/vaultStorage";
import { generateId } from "../utils/id";

export { generateId };

const TASK_TRACKER_KEY = "taskTracker";

// Cache the full plugin data to avoid re-reading on every save
let cachedRawData: Record<string, unknown> | null = null;
let syncEnabled = false;

export function setSyncEnabled(enabled: boolean): void {
  syncEnabled = enabled;
}

export async function loadTaskData(
  plugin: CalendarPlugin
): Promise<ITaskTrackerData> {
  if (syncEnabled) {
    const vaultData = await loadVaultData(plugin.app);
    if (vaultData[TASK_TRACKER_KEY]) {
      const data = vaultData[TASK_TRACKER_KEY] as unknown as ITaskTrackerData;
      if (data.version < TASK_TRACKER_DATA_VERSION) {
        return migrateData(data);
      }
      return data;
    }
    return { tasks: [], projects: [], timeLogs: [], version: TASK_TRACKER_DATA_VERSION };
  }

  const raw = await plugin.loadData();
  cachedRawData = raw || {};
  if (raw && raw[TASK_TRACKER_KEY]) {
    const data = raw[TASK_TRACKER_KEY] as ITaskTrackerData;
    if (data.version < TASK_TRACKER_DATA_VERSION) {
      return migrateData(data);
    }
    return data;
  }
  return { tasks: [], projects: [], timeLogs: [], version: TASK_TRACKER_DATA_VERSION };
}

export async function saveTaskData(
  plugin: CalendarPlugin,
  data: ITaskTrackerData
): Promise<void> {
  if (syncEnabled) {
    const vaultData = await loadVaultData(plugin.app);
    vaultData[TASK_TRACKER_KEY] = data as unknown as Record<string, unknown>;
    await saveVaultData(plugin.app, vaultData);
    return;
  }

  const raw = cachedRawData || (await plugin.loadData()) || {};
  cachedRawData = { ...raw, [TASK_TRACKER_KEY]: data };
  await plugin.saveData(cachedRawData);
}

function migrateData(data: ITaskTrackerData): ITaskTrackerData {
  let migrated = { ...data };

  // v1 -> v2: add description and recurrence fields to tasks
  if (data.version < 2) {
    migrated = {
      ...migrated,
      tasks: data.tasks.map((t) => ({
        ...t,
        description: undefined,
        recurrence: undefined,
      })),
      version: 2,
    };
  }

  // v2 -> v3: add status field, migrate completed -> status
  if (data.version < 3) {
    migrated = {
      ...migrated,
      tasks: migrated.tasks.map((t) => ({
        ...t,
        status: t.completed ? "done" : ("todo" as const),
      })),
      version: 3,
    };
  }

  // v3 -> v4: add timeLogs array
  if (data.version < 4) {
    migrated = {
      ...migrated,
      timeLogs: [],
      version: 4,
    };
  }

  // v4 -> v5: remove description field from tasks
  if (data.version < 5) {
    migrated = {
      ...migrated,
      tasks: migrated.tasks.map((t) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { description: _desc, ...rest } = t as any;
        return rest;
      }),
      version: 5,
    };
  }

  return { ...migrated, version: TASK_TRACKER_DATA_VERSION };
}
