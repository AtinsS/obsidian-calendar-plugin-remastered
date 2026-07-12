import type CalendarPlugin from "src/main";
import type { IHabitTrackerData } from "./types";
import { HABIT_TRACKER_DATA_VERSION } from "./types";
import { loadVaultData, saveVaultKey } from "../io/vaultStorage";
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
    const vaultData = await loadVaultData(plugin.app);
    if (vaultData[HABIT_TRACKER_KEY]) {
      return vaultData[HABIT_TRACKER_KEY] as unknown as IHabitTrackerData;
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
    await saveVaultKey(plugin.app, HABIT_TRACKER_KEY, data);
    return;
  }

  const raw = cachedRawData || (await plugin.loadData()) || {};
  cachedRawData = { ...raw, [HABIT_TRACKER_KEY]: data };
  await plugin.saveData(cachedRawData);
}
