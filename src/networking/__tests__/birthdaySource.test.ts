import type { Person } from "../types";
import {
  extractBirthdays,
  getBirthdaysForMonth,
  getBirthdaysForDay,
  calculateAge,
} from "../birthdaySource";

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: "test",
    path: "test.md",
    name: "Test",
    ...overrides,
  };
}

describe("extractBirthdays", () => {
  it("extracts birthdays from persons with valid birthday", () => {
    const persons = [
      makePerson({ id: "p1", name: "Иван", birthday: "1990-05-15" }),
      makePerson({ id: "p2", name: "Мария", birthday: "1985-12-25" }),
    ];
    const result = extractBirthdays(persons);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: "Иван",
      day: 15,
      month: 5,
      date: "1990-05-15",
      path: "test.md",
    });
    expect(result[1]).toEqual({
      name: "Мария",
      day: 25,
      month: 12,
      date: "1985-12-25",
      path: "test.md",
    });
  });

  it("skips persons without birthday", () => {
    const persons = [
      makePerson({ id: "p1", name: "Без ДР" }),
      makePerson({ id: "p2", name: "С ДР", birthday: "1990-01-01" }),
    ];
    const result = extractBirthdays(persons);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("С ДР");
  });

  it("skips invalid birthday formats (non-dash separators, unparseable)", () => {
    const persons = [
      makePerson({ id: "p1", name: "Bad", birthday: "not-a-date" }),
      makePerson({ id: "p2", name: "Bad2", birthday: "1990/05/15" }),
    ];
    const result = extractBirthdays(persons);
    // "not-a-date" → parts=["not","a","date"] → month=NaN → skipped
    // "1990/05/15" → parts=["1990/05/15"] → parts[1]=undefined → month=NaN → skipped
    expect(result).toHaveLength(0);
  });

  it("accepts short year format (validation is in personCollector)", () => {
    // extractBirthdays only needs valid month/day; year validation happens upstream
    const persons = [
      makePerson({ id: "p3", name: "ShortYear", birthday: "90-05-15" }),
    ];
    const result = extractBirthdays(persons);
    expect(result).toHaveLength(1);
    expect(result[0].month).toBe(5);
    expect(result[0].day).toBe(15);
  });

  it("skips birthdays with invalid month/day ranges", () => {
    const persons = [
      makePerson({ id: "p1", name: "Bad", birthday: "1990-00-15" }),
      makePerson({ id: "p2", name: "Bad2", birthday: "1990-13-15" }),
      makePerson({ id: "p3", name: "Bad3", birthday: "1990-05-00" }),
      makePerson({ id: "p4", name: "Bad4", birthday: "1990-05-32" }),
    ];
    const result = extractBirthdays(persons);
    expect(result).toHaveLength(0);
  });

  it("handles empty array", () => {
    expect(extractBirthdays([])).toEqual([]);
  });
});

describe("getBirthdaysForMonth", () => {
  const birthdays = extractBirthdays([
    makePerson({ name: "Январь", birthday: "1990-01-10" }),
    makePerson({ name: "Февраль", birthday: "1985-02-20" }),
    makePerson({ name: "Январь2", birthday: "2000-01-25" }),
  ]);

  it("returns birthdays for specified month", () => {
    const result = getBirthdaysForMonth(birthdays, 1);
    expect(result).toHaveLength(2);
    expect(result.map((b) => b.name)).toEqual(["Январь", "Январь2"]);
  });

  it("returns empty array for month with no birthdays", () => {
    const result = getBirthdaysForMonth(birthdays, 6);
    expect(result).toEqual([]);
  });
});

describe("getBirthdaysForDay", () => {
  const birthdays = extractBirthdays([
    makePerson({ name: "Алиса", birthday: "1990-07-21" }),
    makePerson({ name: "Борис", birthday: "1985-07-21" }),
    makePerson({ name: "Вера", birthday: "2000-07-22" }),
  ]);

  it("returns birthdays for specific day", () => {
    const result = getBirthdaysForDay(birthdays, 7, 21);
    expect(result).toHaveLength(2);
    expect(result.map((b) => b.name)).toEqual(["Алиса", "Борис"]);
  });

  it("returns empty array for day with no birthdays", () => {
    const result = getBirthdaysForDay(birthdays, 7, 23);
    expect(result).toEqual([]);
  });

  it("returns empty array for wrong month", () => {
    const result = getBirthdaysForDay(birthdays, 8, 21);
    expect(result).toEqual([]);
  });
});

describe("calculateAge", () => {
  it("calculates age correctly before birthday this year", () => {
    // Birthday is in the future (December) — age should be one less
    const ref = new Date(2025, 6, 21); // July 21, 2025
    expect(calculateAge("1990-12-25", ref)).toBe(34);
  });

  it("calculates age correctly after birthday this year", () => {
    // Birthday already passed (January) — age should be full
    const ref = new Date(2025, 6, 21); // July 21, 2025
    expect(calculateAge("1990-01-15", ref)).toBe(35);
  });

  it("calculates age correctly on birthday", () => {
    const ref = new Date(2025, 6, 21); // July 21, 2025
    expect(calculateAge("1990-07-21", ref)).toBe(35);
  });

  it("uses current date when no reference provided", () => {
    const age = calculateAge("1990-01-01");
    const now = new Date();
    const expected = now.getFullYear() - 1990 - (now.getMonth() < 0 || (now.getMonth() === 0 && now.getDate() < 1) ? 1 : 0);
    expect(age).toBe(expected);
  });
});
