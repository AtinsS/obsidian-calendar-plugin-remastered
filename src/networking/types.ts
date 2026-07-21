// Интерфейсы для нетворкинг-модуля плагина-календаря

/** Контакты человека в социальных сетях */
export interface PersonContacts {
  telegram?: string;
  github?: string;
  email?: string;
  phone?: string;
  [key: string]: string | undefined;
}

/** Метаданные одного человека, извлечённые из YAML-фронтматтера */
export interface Person {
  /** Уникальный ID — имя файла без .md */
  id: string;
  /** Путь к файлу в хранилище */
  path: string;
  /** Имя человека (обязательное поле) */
  name: string;
  /** Контакты в соцсетях */
  contacts?: PersonContacts;
  /** Навыки / теги */
  skills?: string[];
  /** Контекст: где познакомились, общие темы */
  context?: string;
  /** День рождения в формате YYYY-MM-DD */
  birthday?: string;
  /** Дата последнего контакта */
  last_contact?: string;
  /** Заметка / напоминание */
  note?: string;
  /** Связи: список имён людей, с которыми есть связь */
  connections?: string[];
  /** Цвет узла в графе связей (hex, например #ff5722) */
  color?: string;
  /** Путь к аватару (путь в vault или URL) */
  avatar?: string;
}

/** Запись дня рождения для отображения в календаре */
export interface BirthdayEntry {
  /** Имя человека */
  name: string;
  /** День (1–31) */
  day: number;
  /** Месяц (1–12) */
  month: number;
  /** Полная дата рождения YYYY-MM-DD (для подсчёта возраста) */
  date: string;
  /** Путь к файлу человека */
  path: string;
}

/** Узел графа связей (для D3.js) */
export interface GraphNode {
  id: string;
  name: string;
  skills?: string[];
  contacts?: PersonContacts;
  path: string;
  color?: string;
  avatar?: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

/** Ребро графа связей (для D3.js) */
export interface GraphLink {
  source: string;
  target: string;
}
