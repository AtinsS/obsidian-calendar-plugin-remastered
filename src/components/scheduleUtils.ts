import type { ITask, IProject } from "../task-tracker/types";

export function extractDateFromUID(dateUID: string): string | null {
  const match = dateUID.match(/^day-(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function calculateEndTime(
  date: string,
  time: string,
  durationMin: number
): string {
  const [hours, minutes] = time.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + durationMin;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;

  let endDate = date;
  if (totalMinutes >= 1440) {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + 1);
    endDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  return `${endDate}T${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}:00`;
}

/** Десaturация цвета проекта для glassmorphism-стиля — сохраняем тёмные тона */
function tintWithAlpha(hex: string, alpha = 0.85): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Минимальное осветление — 85% оригинала + 15% белого (сохраняем тёмный цвет)
  const mr = Math.round(r * 0.85 + 255 * 0.15);
  const mg = Math.round(g * 0.85 + 255 * 0.15);
  const mb = Math.round(b * 0.85 + 255 * 0.15);
  return `rgba(${mr}, ${mg}, ${mb}, ${alpha})`;
}

/** Цвет статуса — мягкие пастельные тона */
export function getStatusColor(status: string): string {
  switch (status) {
    case "progress":
      return "rgba(180, 145, 85, 0.85)";
    case "done":
      return "rgba(85, 160, 130, 0.8)";
    case "todo":
    default:
      return "rgba(110, 130, 160, 0.8)";
  }
}

/** Цвет бордюра статуса — насыщеннее */
export function getStatusBorder(status: string): string {
  switch (status) {
    case "progress":
      return "rgba(200, 165, 100, 1)";
    case "done":
      return "rgba(95, 175, 145, 1)";
    case "todo":
    default:
      return "rgba(120, 145, 175, 1)";
  }
}

export interface ScheduleEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: {
    task: ITask;
    projectId: string | null;
  };
}

export function taskToEvent(
  task: ITask,
  projects: IProject[]
): ScheduleEvent | null {
  const dateStr = extractDateFromUID(task.dateUID);
  if (!dateStr) return null;

  const start = task.scheduledTime
    ? `${dateStr}T${task.scheduledTime}:00`
    : `${dateStr}T09:00:00`;

  const end = calculateEndTime(
    dateStr,
    task.scheduledTime || "09:00",
    task.estimatedTime || 60
  );

  const project = projects.find((p) => p.id === task.projectId);
  const hasProject = !!project;

  return {
    id: task.id,
    title: task.title,
    start,
    end,
    backgroundColor: hasProject
      ? tintWithAlpha(project.color, 0.85)
      : getStatusColor(task.status),
    borderColor: hasProject
      ? tintWithAlpha(project.color, 1)
      : getStatusBorder(task.status),
    textColor: "#e8ecf0",
    extendedProps: {
      task,
      projectId: task.projectId,
    },
  };
}

export function tasksToEvents(
  tasks: ITask[],
  projects: IProject[]
): ScheduleEvent[] {
  return tasks
    .filter((t) => t.dateUID)
    .map((task) => taskToEvent(task, projects))
    .filter(Boolean) as ScheduleEvent[];
}
