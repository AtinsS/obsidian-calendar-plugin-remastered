import type { Person, PersonContacts } from "./types";

interface VCardEntry {
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string;
  telegram: string;
  organization: string;
  title: string;
  birthday: string;
  note: string;
  photo: string;
}

/**
 * Парсит содержимое .vcf файла (vCard 3.0/4.0) в массив Person-объектов.
 */
export function parseVCard(content: string): VCardEntry[] {
  const entries: VCardEntry[] = [];

  // Разделяем на отдельные vCard блоки (BEGIN:VCARD ... END:VCARD)
  const cards = content.split(/(?=BEGIN:VCARD)/i);

  for (const card of cards) {
    if (!card.trim()) continue;
    if (!card.toUpperCase().includes("BEGIN:VCARD")) continue;

    const entry: VCardEntry = {
      firstName: "",
      lastName: "",
      fullName: "",
      phone: "",
      email: "",
      telegram: "",
      organization: "",
      title: "",
      birthday: "",
      note: "",
      photo: "",
    };

    // Разбиваем на строки (vCard использует продолжения строк с пробелом/табом)
    const lines = unfoldVCardLines(card);

    for (const line of lines) {
      const upperLine = line.toUpperCase().trim();

      // FN (Full Name)
      if (upperLine.startsWith("FN:") || upperLine.startsWith("FN;")) {
        const val = extractValue(line);
        if (val) entry.fullName = val;
      }

      // N (Name: Last;First;Middle;Prefix;Suffix)
      if (upperLine.startsWith("N:") || upperLine.startsWith("N;")) {
        const val = extractValue(line);
        if (val) {
          const parts = val.split(";");
          entry.lastName = parts[0] || "";
          entry.firstName = parts[1] || "";
        }
      }

      // TEL
      if (upperLine.startsWith("TEL") && !entry.phone) {
        const val = extractValue(line);
        if (val) entry.phone = val.replace(/[^\d+\-\s()]/g, "");
      }

      // EMAIL
      if (upperLine.startsWith("EMAIL") && !entry.email) {
        const val = extractValue(line);
        if (val) entry.email = val;
      }

      // ORG
      if (upperLine.startsWith("ORG")) {
        const val = extractValue(line);
        if (val) entry.organization = val.replace(/;/g, ", ").trim();
      }

      // TITLE
      if (upperLine.startsWith("TITLE")) {
        const val = extractValue(line);
        if (val) entry.title = val;
      }

      // BDAY
      if (upperLine.startsWith("BDAY")) {
        const val = extractValue(line);
        if (val) entry.birthday = normalizeBirthday(val);
      }

      // NOTE
      if (upperLine.startsWith("NOTE")) {
        const val = extractValue(line);
        if (val) entry.note = val.replace(/\\n/g, "\n").replace(/\\,/g, ",");
      }

      // PHOTO
      if (upperLine.startsWith("PHOTO")) {
        const val = extractValue(line);
        if (val && !val.startsWith("data:")) {
          entry.photo = val;
        }
      }

      // X-TELEGRAM (кастомное поле для Telegram)
      if (upperLine.startsWith("X-TELEGRAM") || upperLine.includes("TELEGRAM")) {
        const val = extractValue(line);
        if (val) entry.telegram = val.replace(/^@/, "");
      }
    }

    // Если FN не задан, собираем из First/Last
    if (!entry.fullName) {
      entry.fullName = [entry.firstName, entry.lastName].filter(Boolean).join(" ");
    }

    // Если есть имя — добавляем запись
    if (entry.fullName.trim()) {
      entries.push(entry);
    }
  }

  return entries;
}

/**
 * Конвертирует VCardEntry в Person.
 */
export function vcardToPerson(entry: VCardEntry, folderPath: string): Person {
  const name = entry.fullName.trim();
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-|-$/g, "");

  const person: Person = {
    id,
    path: `${folderPath}/${name}.md`,
    name,
  };

  // Контакты
  const contacts: PersonContacts = {};
  if (entry.phone) contacts.phone = entry.phone;
  if (entry.email) contacts.email = entry.email;
  if (entry.telegram) contacts.telegram = entry.telegram;
  if (entry.organization) contacts.organization = entry.organization;
  if (entry.title) contacts.title = entry.title;
  if (Object.keys(contacts).length > 0) person.contacts = contacts;

  if (entry.birthday) person.birthday = entry.birthday;
  if (entry.note) person.note = entry.note;

  return person;
}

/**
 * Разворачивает многострочные vCard поля (строки, начинающиеся с пробела/таба — продолжение).
 */
function unfoldVCardLines(content: string): string[] {
  const rawLines = content.split(/\r?\n/);
  const result: string[] = [];

  for (const line of rawLines) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      // Продолжение предыдущей строки
      if (result.length > 0) {
        result[result.length - 1] += line.substring(1);
      }
    } else {
      result.push(line);
    }
  }

  return result;
}

/**
 * Извлекает значение из строки vCard (после двоеточия, игнорируя параметры).
 */
function extractValue(line: string): string {
  // Формат: PROPERTY;params=value или PROPERTY=value
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return "";
  return line.substring(colonIdx + 1).trim();
}

/**
 * Нормализует дату рождения из various форматов vCard в YYYY-MM-DD.
 */
function normalizeBirthday(val: string): string {
  // YYYYMMDD
  if (/^\d{8}$/.test(val)) {
    return `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return val;
  }
  // DD/MM/YYYY или MM/DD/YYYY — пытаемся определить
  const slashMatch = val.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (slashMatch) {
    const [, p1, p2, year] = slashMatch;
    // Если первый компонент > 12, это день (DD/MM/YYYY)
    const month = parseInt(p1, 10) > 12 ? p2 : p1;
    const day = parseInt(p1, 10) > 12 ? p1 : p2;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return "";
}
