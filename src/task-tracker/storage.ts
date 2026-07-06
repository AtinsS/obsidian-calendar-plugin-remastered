import type CalendarPlugin from "src/main";

import { ITaskTrackerData, TASK_TRACKER_DATA_VERSION } from "./types";
import { loadVaultData, saveVaultData } from "../io/vaultStorage";

const TASK_TRACKER_KEY = "taskTracker";

// Cache the full plugin data to avoid re-reading on every save
let cachedRawData: Record<string, unknown> | null = null;
let syncEnabled = false;

export function setSyncEnabled(enabled: boolean): void {
  syncEnabled = enabled;
}

export function isSyncEnabled(): boolean {
  return syncEnabled;
}

export function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
    return { tasks: [], projects: [], version: TASK_TRACKER_DATA_VERSION };
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
  return { tasks: [], projects: [], version: TASK_TRACKER_DATA_VERSION };
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

  return { ...migrated, version: TASK_TRACKER_DATA_VERSION };
}
