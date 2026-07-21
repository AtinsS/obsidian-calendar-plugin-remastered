import type { App, CachedMetadata, FrontMatterCache } from "obsidian";
import type { Person, PersonContacts } from "./types";

/**
 * Сканирует хранилище Obsidian через app.metadataCache
 * и собирает все файлы с type: person в YAML-фронтматтере.
 *
 * Работает быстро — не читает содержимое файлов, только кэш метаданных.
 */
export function collectPersons(app: App): Person[] {
  const persons: Person[] = [];
  const cache = app.metadataCache;

  // Перебираем все файлы в кэше метаданных
  const files = app.vault.getMarkdownFiles();

  for (const file of files) {
    const cached: CachedMetadata | null = cache.getFileCache(file);
    if (!cached?.frontmatter) continue;

    const fm: FrontMatterCache = cached.frontmatter;

    // Проверяем, что тип файла — person
    if (fm.type !== "person") continue;

    // Имя обязательно
    const name = fm.name;
    if (typeof name !== "string" || !name.trim()) continue;

    const person: Person = {
      id: file.basename,
      path: file.path,
      name: name.trim(),
    };

    // Парсим контакты (объект с telegram, github и т.д.)
    if (fm.contacts && typeof fm.contacts === "object" && !Array.isArray(fm.contacts)) {
      person.contacts = {} as PersonContacts;
      for (const [key, value] of Object.entries(fm.contacts)) {
        if (typeof value === "string") {
          person.contacts[key] = value;
        }
      }
    }

    // Навыки — массив строк
    if (Array.isArray(fm.skills)) {
      person.skills = fm.skills.filter((s): s is string => typeof s === "string");
    }

    // Контекст
    if (typeof fm.context === "string") {
      person.context = fm.context;
    }

    // День рождения — строка YYYY-MM-DD
    if (typeof fm.birthday === "string" || typeof fm.birthday === "number") {
      const bd = String(fm.birthday);
      // Валидируем формат YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(bd)) {
        person.birthday = bd;
      }
    }

    // Последний контакт
    if (typeof fm.last_contact === "string" || typeof fm.last_contact === "number") {
      person.last_contact = String(fm.last_contact);
    }

    // Заметка
    if (typeof fm.note === "string") {
      person.note = fm.note;
    }

    // Связи — массив имён
    if (Array.isArray(fm.connections)) {
      person.connections = fm.connections.filter((c): c is string => typeof c === "string");
    }

    // Цвет узла
    if (typeof fm.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(fm.color)) {
      person.color = fm.color;
    }

    // Аватар
    if (typeof fm.avatar === "string" && fm.avatar.trim()) {
      person.avatar = fm.avatar.trim();
    }

    persons.push(person);
  }

  return persons;
}

/**
 * Строит индекс «имя → Person» для быстрого поиска по имени.
 * Используется при построении графа связей.
 */
export function buildNameIndex(persons: Person[]): Map<string, Person> {
  const index = new Map<string, Person>();
  for (const person of persons) {
    index.set(person.name, person);
  }
  return index;
}
