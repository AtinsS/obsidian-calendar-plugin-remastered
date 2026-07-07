import type { Moment } from "moment";
import type {
  ICalendarSource,
  IDayMetadata,
} from "obsidian-calendar-ui";
import { get } from "svelte/store";

import { habitLogs, habits } from "./stores";
import type { IHabitLog } from "./types";

// --- Cached lookup to avoid N store reads per render ---
let cachedLogs: IHabitLog[] = [];
let cachedMap: Map<string, number> = new Map();

function getLogsMap(): Map<string, number> {
  const current = get(habitLogs);
  if (current !== cachedLogs) {
    cachedLogs = current;
    cachedMap = new Map();
    for (const log of current) {
      if (!log.completed) continue;
      cachedMap.set(log.date, (cachedMap.get(log.date) || 0) + 1);
    }
  }
  return cachedMap;
}

function getMetadataForDate(dateStr: string): IDayMetadata {
  const map = getLogsMap();
  const count = map.get(dateStr) || 0;

  if (count === 0) {
    return {};
  }

  const allHabits = get(habits);
  const activeCount = allHabits.filter((h) => !h.archived).length;
  const allCompleted = activeCount > 0 && count >= activeCount;
  const badge = allCompleted ? "\uD83C\uDFC6" : "\uD83D\uDD25" + " " + String(count);

  return {
    dataAttributes: {
      "data-habit-count": badge,
    },
    classes: ["has-habit-logs"],
  };
}

export const habitSource: ICalendarSource = {
  getDailyMetadata: async (date: Moment): Promise<IDayMetadata> => {
    const dateStr = date.format("YYYY-MM-DD");
    return getMetadataForDate(dateStr);
  },
};
