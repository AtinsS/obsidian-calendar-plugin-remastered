import { get } from "svelte/store";
import { tasks, addTask, updateTask, completeRecurringTask } from "../stores";

const TEST_DATE = "day-2026-07-05T00:00:00";

beforeEach(() => {
  tasks.set([]);
});

describe("completeRecurringTask", () => {
  it("should not create new task if task has no recurrence", () => {
    const task = addTask({
      title: "One-off",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
    });

    completeRecurringTask(task.id);

    expect(get(tasks).length).toBe(1);
  });

  it("should not create new task if task not found", () => {
    completeRecurringTask("nonexistent-id");
    expect(get(tasks).length).toBe(0);
  });

  it("should create next daily occurrence", () => {
    const task = addTask({
      title: "Daily task",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "medium",
      tags: [],
      sortOrder: 0,
      recurrence: { type: "daily" },
    });

    completeRecurringTask(task.id);

    const allTasks = get(tasks);
    expect(allTasks.length).toBe(2);

    const newTask = allTasks.find((t) => t.id !== task.id);
    expect(newTask).toBeDefined();
    expect(newTask.completed).toBe(false);
    expect(newTask.title).toBe("Daily task");
    expect(newTask.recurrence.type).toBe("daily");
  });

  it("should create next daily occurrence with interval", () => {
    const task = addTask({
      title: "Every 3 days",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
      recurrence: { type: "daily", interval: 3 },
    });

    completeRecurringTask(task.id);

    const allTasks = get(tasks);
    const newTask = allTasks.find((t) => t.id !== task.id);
    expect(newTask).toBeDefined();
    // Should be 3 days after July 5 = July 8
    expect(newTask.dateUID).toContain("2026-07-08");
  });

  it("should create next weekly occurrence", () => {
    const task = addTask({
      title: "Weekly task",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
      recurrence: { type: "weekly" },
    });

    completeRecurringTask(task.id);

    const allTasks = get(tasks);
    const newTask = allTasks.find((t) => t.id !== task.id);
    expect(newTask).toBeDefined();
    // Should be 7 days after July 5 = July 12
    expect(newTask.dateUID).toContain("2026-07-12");
  });

  it("should create next monthly occurrence", () => {
    const task = addTask({
      title: "Monthly task",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
      recurrence: { type: "monthly" },
    });

    completeRecurringTask(task.id);

    const allTasks = get(tasks);
    const newTask = allTasks.find((t) => t.id !== task.id);
    expect(newTask).toBeDefined();
    // Should be 1 month after July 5 = Aug 5
    expect(newTask.dateUID).toContain("2026-08-05");
  });

  it("should preserve project and priority on recurrence", () => {
    const task = addTask({
      title: "Important daily",
      completed: false,
      dateUID: TEST_DATE,
      projectId: "proj-1",
      notePath: null,
      priority: "high",
      tags: ["urgent"],
      sortOrder: 0,
      recurrence: { type: "daily" },
    });

    completeRecurringTask(task.id);

    const allTasks = get(tasks);
    const newTask = allTasks.find((t) => t.id !== task.id);
    expect(newTask.projectId).toBe("proj-1");
    expect(newTask.priority).toBe("high");
    expect(newTask.tags).toEqual(["urgent"]);
  });

  it("should set notePath to null on new occurrence", () => {
    const task = addTask({
      title: "Note task",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: "folder/note.md",
      priority: "low",
      tags: [],
      sortOrder: 0,
      recurrence: { type: "daily" },
    });

    completeRecurringTask(task.id);

    const allTasks = get(tasks);
    const newTask = allTasks.find((t) => t.id !== task.id);
    expect(newTask.notePath).toBeNull();
  });
});

describe("task with description", () => {
  it("should store description", () => {
    const task = addTask({
      title: "Task with desc",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
      description: "This is a description",
    });

    expect(task.description).toBe("This is a description");
  });

  it("should update description", () => {
    const task = addTask({
      title: "Task",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
      description: "Old desc",
    });

    updateTask(task.id, { description: "New desc" });

    const updated = get(tasks).find((t) => t.id === task.id);
    expect(updated.description).toBe("New desc");
  });
});
