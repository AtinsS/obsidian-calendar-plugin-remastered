import type CalendarPlugin from "src/main";
import type { IHabitTrackerData } from "./types";
import { HABIT_TRACKER_DATA_VERSION } from "./types";
import { loadModuleData, saveModuleData } from "../io/vaultStorage";
import { generateId } from "../utils/id";

export { generateId };

const HABIT_TRACKER_KEY = "habitTracker";

// Cache the full plugin data to avoid re-reading on every save
let cachedRawData: Record<string, unknown> | null = null;
let syncEnabled = false;

export function setSyncEnabled(enabled: boolean): void {
  syncEnabled = enabled;
}

export async function loadHabitData(
  plugin: CalendarPlugin
): Promise<IHabitTrackerData> {
  if (syncEnabled) {
    const moduleData = await loadModuleData(plugin.app, "habitTracker");
    if (moduleData && Object.keys(moduleData).length > 0) {
      return moduleData as unknown as IHabitTrackerData;
    }
    return {
      habits: [],
      habitLogs: [],
      version: HABIT_TRACKER_DATA_VERSION,
    };
  }

  const raw = await plugin.loadData();
  cachedRawData = raw || {};
  if (raw && raw[HABIT_TRACKER_KEY]) {
    return raw[HABIT_TRACKER_KEY] as IHabitTrackerData;
  }
  return {
    habits: [],
    habitLogs: [],
    version: HABIT_TRACKER_DATA_VERSION,
  };
}

export async function saveHabitData(
  plugin: CalendarPlugin,
  data: IHabitTrackerData
): Promise<void> {
  if (syncEnabled) {
    await saveModuleData(plugin.app, "habitTracker", data as unknown as Record<string, unknown>);
    return;
  }

  const raw = cachedRawData || (await plugin.loadData()) || {};
  cachedRawData = { ...raw, [HABIT_TRACKER_KEY]: data };
  await plugin.saveData(cachedRawData);
}
