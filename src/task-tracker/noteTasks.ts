import { App, TFile } from "obsidian";
import { get } from "svelte/store";

import type CalendarPlugin from "src/main";
import type { ITask, IProject } from "./types";
import { tasks, projects, updateTask } from "./stores";

let isSyncing = false;

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 200);
}

function buildNotePath(task: ITask, project: IProject | null, customPath?: string): string {
  if (customPath) {
    return customPath.endsWith(".md") ? customPath : customPath + ".md";
  }
  const folder = project?.folder || "";
  const filename = sanitizeFilename(task.title) + ".md";
  return folder ? `${folder}/${filename}` : filename;
}

function buildNoteContent(task: ITask, project: IProject | null): string {
  const frontmatter = [
    "---",
    `task_id: ${task.id}`,
    `completed: ${task.completed}`,
    `date: ${task.dateUID}`,
    `priority: ${task.priority}`,
    project ? `project: ${project.name}` : "",
    task.deadline ? `deadline: ${task.deadline}` : "",
    task.deadlineTime ? `deadline_time: ${task.deadlineTime}` : "",
    "---",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return [frontmatter, "", `# ${task.title}`, ""].join("\n");
}

export async function createNoteTask(
  task: ITask,
  project: IProject | null,
  app: App,
  customPath?: string
): Promise<TFile> {
  const path = buildNotePath(task, project, customPath);

  const parts = path.split("/");
  if (parts.length > 1) {
    const folderPath = parts.slice(0, -1).join("/");
    const folderObj = app.vault.getAbstractFileByPath(folderPath);
    if (!folderObj) {
      await app.vault.createFolder(folderPath);
    }
  }

  const content = buildNoteContent(task, project);
  const file = await app.vault.create(path, content);
  return file;
}

export async function deleteNoteTask(
  notePath: string,
  app: App
): Promise<void> {
  const file = app.vault.getAbstractFileByPath(notePath);
  if (file instanceof TFile) {
    await app.vault.delete(file);
  }
}

export async function archiveNoteTask(
  notePath: string,
  archiveFolder: string,
  app: App
): Promise<string | null> {
  const file = app.vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile)) return null;

  // Ensure archive folder exists
  if (archiveFolder) {
    const folderObj = app.vault.getAbstractFileByPath(archiveFolder);
    if (!folderObj) {
      await app.vault.createFolder(archiveFolder);
    }
  }

  const newPath = archiveFolder
    ? `${archiveFolder}/${file.name}`
    : file.name;

  await app.vault.rename(file, newPath);
  return newPath;
}

export async function syncTaskToFrontmatter(
  task: ITask,
  app: App
): Promise<void> {
  if (!task.notePath) return;

  const file = app.vault.getAbstractFileByPath(task.notePath);
  if (!(file instanceof TFile)) return;

  const cache = app.metadataCache.getFileCache(file);
  const frontmatter = cache?.frontmatter;
  if (!frontmatter) return;

  const content = await app.vault.cachedRead(file);
  const lines = content.split("\n");

  const fmStart = lines.indexOf("---");
  const fmEnd = lines.indexOf("---", fmStart + 1);
  if (fmStart === -1 || fmEnd === -1) return;

  const newFrontmatter: string[] = ["---"];
  newFrontmatter.push(`task_id: ${task.id}`);
  newFrontmatter.push(`completed: ${task.completed}`);
  newFrontmatter.push(`date: ${task.dateUID}`);
  newFrontmatter.push(`priority: ${task.priority}`);

  const project = get(projects).find((p) => p.id === task.projectId);
  if (project) {
    newFrontmatter.push(`project: ${project.name}`);
  }
  if (task.deadline) {
    newFrontmatter.push(`deadline: ${task.deadline}`);
  }
  if (task.deadlineTime) {
    newFrontmatter.push(`deadline_time: ${task.deadlineTime}`);
  }

  newFrontmatter.push("---");

  const bodyLines = lines.slice(fmEnd + 1);

  const newContent = [
    ...newFrontmatter,
    ...bodyLines,
  ].join("\n");

  isSyncing = true;
  await app.vault.modify(file, newContent);
  isSyncing = false;
}

export function setupNoteTaskSync(app: App, plugin: CalendarPlugin): void {
  plugin.registerEvent(
    app.vault.on("modify", async (file) => {
    if (isSyncing) return;
    if (!(file instanceof TFile)) return;

    const cache = app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    if (!frontmatter?.task_id) return;

    const taskId = frontmatter.task_id;
    const allTasks = get(tasks);
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) return;

    const changes: Partial<ITask> = {};

    if (frontmatter.title && frontmatter.title !== task.title) {
      changes.title = frontmatter.title;
    }

    if (
      frontmatter.completed !== undefined &&
      frontmatter.completed !== task.completed
    ) {
      changes.completed = frontmatter.completed;
    }

    if (frontmatter.date && frontmatter.date !== task.dateUID) {
      changes.dateUID = frontmatter.date;
    }

    if (
      frontmatter.priority &&
      frontmatter.priority !== task.priority
    ) {
      changes.priority = frontmatter.priority;
    }

    if (frontmatter.deadline !== undefined && frontmatter.deadline !== task.deadline) {
      changes.deadline = frontmatter.deadline || undefined;
    }

    if (frontmatter.deadline_time !== undefined && frontmatter.deadline_time !== task.deadlineTime) {
      changes.deadlineTime = frontmatter.deadline_time || undefined;
    }

    if (Object.keys(changes).length > 0) {
      isSyncing = true;
      updateTask(taskId, changes);
      isSyncing = false;
    }
    })
  );
}
