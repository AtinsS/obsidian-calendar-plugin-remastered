import type { Person } from "./types";

/**
 * Генерирует содержимое .md файла для карточки контакта.
 * YAML-фронтматтер + визуальное тело заметки.
 */
export function buildPersonNote(person: Person): string {
  const lines: string[] = [];

  // YAML-фронтматтер
  lines.push("---");
  lines.push("type: person");
  lines.push(`name: ${escapeYaml(person.name)}`);

  if (person.contacts && Object.keys(person.contacts).length > 0) {
    lines.push("contacts:");
    for (const [key, value] of Object.entries(person.contacts)) {
      if (value) lines.push(`  ${key}: ${escapeYaml(value)}`);
    }
  }

  if (person.skills && person.skills.length > 0) {
    lines.push(`skills: [${person.skills.map(s => escapeYaml(s)).join(", ")}]`);
  }

  if (person.context) lines.push(`context: ${escapeYaml(person.context)}`);
  if (person.birthday) lines.push(`birthday: ${person.birthday}`);
  if (person.last_contact) lines.push(`last_contact: ${person.last_contact}`);
  if (person.note) lines.push(`note: ${escapeYaml(person.note)}`);

  if (person.connections && person.connections.length > 0) {
    lines.push(`connections: [${person.connections.map(c => escapeYaml(c)).join(", ")}]`);
  }

  if (person.color) lines.push(`color: ${escapeYaml(person.color)}`);
  if (person.avatar) lines.push(`avatar: ${escapeYaml(person.avatar)}`);

  lines.push("---");
  lines.push("");

  // Визуальное тело заметки
  lines.push(`# ${person.name}`);
  lines.push("");

  if (person.birthday) {
    const age = calculateAge(person.birthday);
    const bdFormatted = formatDate(person.birthday);
    lines.push(`🎂 **День рождения:** ${bdFormatted}${age !== null ? ` (${age} лет)` : ""}`);
  }

  if (person.last_contact) {
    lines.push(`📅 **Последний контакт:** ${formatDate(person.last_contact)}`);
  }

  if (person.context) {
    lines.push(`💡 **Контекст:** ${person.context}`);
  }

  if (person.skills && person.skills.length > 0) {
    lines.push(`🛠 **Навыки:** ${person.skills.join(", ")}`);
  }

  // Контакты
  if (person.contacts && Object.keys(person.contacts).length > 0) {
    const contactLines: string[] = [];
    for (const [key, value] of Object.entries(person.contacts)) {
      if (value) {
        const label = key.charAt(0).toUpperCase() + key.slice(1);
        contactLines.push(`${label}: ${value}`);
      }
    }
    if (contactLines.length > 0) {
      lines.push(`📞 **Контакты:** ${contactLines.join(" | ")}`);
    }
  }

  if (person.connections && person.connections.length > 0) {
    lines.push(`🔗 **Связи:** ${person.connections.join(", ")}`);
  }

  if (person.note) {
    lines.push("");
    lines.push(`> ${person.note}`);
  }

  return lines.join("\n");
}

/**
 * Парсит содержимое .md файла обратно в объект Person.
 * Используется при синхронизации: если тело заметки изменилось,
 * обновляем YAML.
 */
export function parsePersonNote(content: string, filePath: string): Person | null {
  const lines = content.split("\n");

  // Ищем YAML-фронтматтер
  if (lines[0]?.trim() !== "---") return null;
  const endIdx = lines.indexOf("---", 1);
  if (endIdx === -1) return null;

  const yamlLines = lines.slice(1, endIdx);
  const bodyLines = lines.slice(endIdx + 1);

  // Парсим YAML (упрощённый парсер)
  const fm: Record<string, unknown> = {};
  let inContacts = false;
  const contacts: Record<string, string> = {};

  for (const line of yamlLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Контакты (вложенный объект)
    if (inContacts) {
      const contactMatch = trimmed.match(/^(\w+):\s*"?([^"]*)"?$/);
      if (contactMatch && !trimmed.startsWith("type:") && !trimmed.startsWith("name:")) {
        contacts[contactMatch[1]] = contactMatch[2];
        continue;
      }
      inContacts = false;
    }

    if (trimmed === "contacts:") {
      inContacts = true;
      continue;
    }

    // Массивы [a, b, c]
    const arrMatch = trimmed.match(/^(\w+):\s*\[(.+)\]$/);
    if (arrMatch) {
      const values = arrMatch[2].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
      fm[arrMatch[1]] = values;
      continue;
    }

    // Ключ: значение
    const kvMatch = trimmed.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
    if (kvMatch) {
      fm[kvMatch[1]] = kvMatch[2];
    }
  }

  if (Object.keys(contacts).length > 0) {
    fm.contacts = contacts;
  }

  const name = (fm.name as string) || "";
  if (!name) return null;

  // Извлекаем имя из body (первая строка # Имя)
  let bodyName = name;
  for (const line of bodyLines) {
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      bodyName = h1Match[1].trim();
      break;
    }
  }

  const person: Person = {
    id: filePath.replace(/\.md$/, "").split("/").pop() || name.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-"),
    path: filePath,
    name: bodyName || name,
  };

  if (fm.contacts && typeof fm.contacts === "object") {
    person.contacts = fm.contacts as Person["contacts"];
  }
  if (Array.isArray(fm.skills)) person.skills = fm.skills;
  if (typeof fm.context === "string") person.context = fm.context;
  if (typeof fm.birthday === "string") person.birthday = fm.birthday;
  if (typeof fm.last_contact === "string") person.last_contact = fm.last_contact;
  if (typeof fm.note === "string") person.note = fm.note;
  if (Array.isArray(fm.connections)) person.connections = fm.connections;
  if (typeof fm.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(fm.color)) person.color = fm.color;
  if (typeof fm.avatar === "string" && fm.avatar.trim()) person.avatar = fm.avatar.trim();

  return person;
}

/**
 * Синхронизирует YAML-фронтматтер с телом заметки.
 * Если тело изменилось (новый день рождения, навыки и т.д.),
 * обновляет YAML. Возвращает обновлённое содержимое файла.
 */
export function syncPersonNote(content: string, person: Person): string {
  const newContent = buildPersonNote(person);

  // Если тело изменилось — перезаписываем файл
  if (content !== newContent) {
    return newContent;
  }
  return content;
}

function escapeYaml(value: string): string {
  // Если значение содержит спецсимволы — используем одинарные кавычки
  // (в одинарных кавычках YAML нет escape-последовательностей, кроме '')
  if (/[\\#:[\]{}&*!|>%@`]/.test(value) || value.includes("?")) {
    return "'" + value.replace(/'/g, "''") + "'";
  }
  // Иначе — двойные кавычки с экранированием
  return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

function calculateAge(birthday: string): number | null {
  const parts = birthday.split("-");
  if (parts.length !== 3) return null;
  const birthYear = parseInt(parts[0], 10);
  const birthMonth = parseInt(parts[1], 10) - 1;
  const birthDay = parseInt(parts[2], 10);
  if (isNaN(birthYear)) return null;

  const today = new Date();
  let age = today.getFullYear() - birthYear;
  if (today.getMonth() < birthMonth || (today.getMonth() === birthMonth && today.getDate() < birthDay)) {
    age--;
  }
  return age;
}

function formatDate(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const months = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const day = parseInt(parts[2], 10);
  const month = parseInt(parts[1], 10) - 1;
  return `${day} ${months[month] || "?"} ${parts[0]}`;
}
