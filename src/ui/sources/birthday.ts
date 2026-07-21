import type { Moment } from "moment";
import type { ICalendarSource, IDayMetadata } from "obsidian-calendar-ui";
import { get } from "svelte/store";

import { app } from "src/stores/appStore";
import { collectPersons } from "src/networking/personCollector";
import { extractBirthdays, getBirthdaysForDay } from "src/networking/birthdaySource";
import type { BirthdayEntry } from "src/networking/types";

/**
 * Кэш записей дней рождения.
 * Пересчитывается при каждом обращении, если прошло > 60 секунд.
 */
let cachedBirthdays: BirthdayEntry[] | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60_000;

function getBirthdays(): BirthdayEntry[] {
  const now = Date.now();
  if (cachedBirthdays && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedBirthdays;
  }

  const appInstance = get(app);
  if (!appInstance) {
    return cachedBirthdays || [];
  }

  const persons = collectPersons(appInstance);
  cachedBirthdays = extractBirthdays(persons);
  lastCacheTime = now;
  return cachedBirthdays;
}

/**
 * Источник данных для календаря: показывает маркер 🎂
 * в дни, когда у кого-то из contacts есть день рождения.
 */
export const birthdaySource: ICalendarSource = {
  getDailyMetadata: async (date: Moment): Promise<IDayMetadata> => {
    const month = date.month() + 1; // Moment: 0-indexed
    const day = date.date();

    const birthdays = getBirthdays();
    const dayBirthdays = getBirthdaysForDay(birthdays, month, day);

    if (dayBirthdays.length === 0) {
      return { dots: [] };
    }

    // Показываем эмодзи торта как точку
    const dots = dayBirthdays.slice(0, 3).map(() => ({
      className: "birthday-dot",
      color: "#f0a030",
      isFilled: true,
    }));

    return {
      dots,
      classes: ["has-birthday"],
      dataAttributes: {
        "data-birthday": dayBirthdays.map((b) => b.name).join(", "),
      },
    };
  },
  getWeeklyMetadata: async (_date: Moment): Promise<IDayMetadata> => {
    return { dots: [] };
  },
};
