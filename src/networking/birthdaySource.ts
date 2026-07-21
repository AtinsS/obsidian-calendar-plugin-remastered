import type { Person, BirthdayEntry } from "./types";

/**
 * Извлекает записи дней рождения из массива Person[]
 * и возвращает структуру для отрисовки маркеров 🎂 в сетке календаря.
 *
 * День рождения повторяется каждый год — поле month+day используется
 * для ежегодного отображения.
 */
export function extractBirthdays(persons: Person[]): BirthdayEntry[] {
  const birthdays: BirthdayEntry[] = [];

  for (const person of persons) {
    if (!person.birthday) continue;

    const parts = person.birthday.split("-");
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);

    if (isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
      continue;
    }

    birthdays.push({
      name: person.name,
      day,
      month,
      date: person.birthday,
      path: person.path,
    });
  }

  return birthdays;
}

/**
 * Возвращает список дней рождения для указанного месяца.
 *
 * @param birthdays — массив записей из extractBirthdays()
 * @param month — номер месяца (1–12)
 * @returns записи для данного месяца
 */
export function getBirthdaysForMonth(
  birthdays: BirthdayEntry[],
  month: number
): BirthdayEntry[] {
  return birthdays.filter((b) => b.month === month);
}

/**
 * Возвращает список дней рождения для указанного дня ( month + day ).
 * Используется для отображения в конкретной ячейке календаря.
 *
 * @param birthdays — массив записей из extractBirthdays()
 * @param month — номер месяца (1–12)
 * @param day — номер дня (1–31)
 * @returns записи для данной даты
 */
export function getBirthdaysForDay(
  birthdays: BirthdayEntry[],
  month: number,
  day: number
): BirthdayEntry[] {
  return birthdays.filter((b) => b.month === month && b.day === day);
}

/**
 * Вычисляет возраст человека по дате рождения на заданную дату.
 *
 * @param birthday — строка YYYY-MM-DD
 * @param referenceDate — дата, на которую считаем возраст (по умолчанию сегодня)
 * @returns возраст в годах
 */
export function calculateAge(birthday: string, referenceDate?: Date): number {
  const today = referenceDate || new Date();
  const parts = birthday.split("-");
  const birthYear = parseInt(parts[0], 10);
  const birthMonth = parseInt(parts[1], 10) - 1; // 0-indexed
  const birthDay = parseInt(parts[2], 10);

  let age = today.getFullYear() - birthYear;
  if (
    today.getMonth() < birthMonth ||
    (today.getMonth() === birthMonth && today.getDate() < birthDay)
  ) {
    age--;
  }
  return age;
}
