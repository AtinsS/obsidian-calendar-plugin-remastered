
# 📅 Calendar Plugin Remastered

Календарь, трекер задач и привычек для [Obsidian](https://obsidian.md).  
Модифицированная версия [Calendar](https://github.com/liamcain/obsidian-calendar-plugin) от Liam Cain.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Obsidian](https://img.shields.io/badge/Obsidian-0.9.11+-7C3AED?logo=obsidian)](https://obsidian.md)
[![Svelte](https://img.shields.io/badge/Svelte-3.x-FF3E00?logo=svelte)](https://svelte.dev/)

---
![alt text](image.png)

## Возможности

**Календарь** — месячный вид, еженедельные заметки, индикаторы серий и подсчёт слов;

**Расписание (использован FullCalendar)** — дневной/недельный/месячный вида, создание пзадачи по клику и drag&drop;

**Трекер задач** — 3 статуса (мини-канбан), проекты, приоритеты, повторяющиеся задачи, таймер учёта времени, привязка к заметкам, архивация, логи с графиками.

**Трекер привычек** — ежедневные/еженедельные привычки, иконки и цвета, подсчёт серий.

**Аналитика** — график активности за 12 недель, визуализация логов, статистика по привычкам, текущая/лучшая серия, процент выполнения за 30 дней.

**Уведомления** — нативные напоминания о задачах (1–60 минут до начала), оповещения о просроченных.

**Синхронизация** — данные в `calendar-data.json`, этот файл лежит в корне, совместимость с Obsidian Sync и Remotely Save. Реешние синхронизации задач межд устройствами

---

## Установка

### Через BRAT (рекомендуется)
1. Установите [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Настройки BRAT → **Add Beta Plugin**
3. URL: `https://github.com/AtinsS/obsidian-calendar-plugin-remastered`

### Вручную
Скачайте `main.js`, `manifest.json`, `styles.css` из [релизов](https://github.com/AtinsS/obsidian-calendar-plugin-remastered/releases) и скопируйте в `.obsidian/plugins/calendar/`.


---

## Настройки

| Параметр | По умолчанию |
|----------|--------------|
| Начало недели | Системный |
| Трекер задач / привычек | Включено |
| Архивация завершённых заметок | Выкл. |
| Папка архива | `Archive` |
| Синхронизация в хранилище | Вкл. |
| Уведомления | Выкл. |
| Напоминание за | 15 мин |

---

## Стек

[Svelte 3.x](https://svelte.dev/) · [FullCalendar 6.x](https://fullcalendar.io/) · [Luxon 3.x](https://moment.github.io/luxon/) · [TypeScript 4.x](https://www.typescriptlang.org/) · Canvas API

---

## Roadmap

- [x] Мобильная адаптация
- [x] Аналитика с графиками
- [x] Уведомления
- [x] Повторяющиеся задачи
- [x] Поиск папок в настройках
- [ ] Telegram-бот с напоминаниями❓
- [ ] Аналитика финансов 


---

## Поддержи проект

- ⭐ Звезда репозиторию
- ☕ [Купить мне кофе с булочкой](https://pay.cloudtips.ru/p/cbaa3c81)

---

<div align="center">
Сделано с 💜 для сообщества Obsidian
</div>

---