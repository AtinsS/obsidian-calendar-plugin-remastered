import { App, TFile } from "obsidian";

/** Запись праздника */
export interface Holiday {
  id: string;
  name: string;
  /** Дата в формате MM-DD (повторяется ежегодно) */
  date: string;
  /** Цвет фона (hex) */
  color?: string;
}

const HOLIDAYS_FILE = "holidays.json";

/**
 * Загружает список праздников из vault.
 */
export async function loadHolidays(app: App): Promise<Holiday[]> {
  const file = app.vault.getAbstractFileByPath(HOLIDAYS_FILE);
  if (!(file instanceof TFile)) return [];

  try {
    const content = await app.vault.read(file);
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Сохраняет список праздников в vault.
 */
export async function saveHolidays(app: App, holidays: Holiday[]): Promise<void> {
  const file = app.vault.getAbstractFileByPath(HOLIDAYS_FILE);
  const content = JSON.stringify(holidays, null, 2);

  if (file instanceof TFile) {
    await app.vault.modify(file, content);
  } else {
    await app.vault.create(HOLIDAYS_FILE, content);
  }
}

/**
 * Генерирует ID для праздника.
 */
export function generateHolidayId(): string {
  return "hol-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}
