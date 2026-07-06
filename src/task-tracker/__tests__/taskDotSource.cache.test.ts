import { getDateUID } from "obsidian-daily-notes-interface";
import { tasks, addTask, updateTask, removeTask } from "../stores";
import { taskDotSource } from "../taskDotSource";

// Use getDateUID to get the exact format the source uses
const TEST_DATE = getDateUID(window.moment("2026-07-05"), "day");
const TEST_MOMENT = () => window.moment("2026-07-05");

beforeEach(() => {
  tasks.set([]);
});

describe("taskDotSource cache", () => {
  it("should return cached result when store unchanged", async () => {
    addTask({
      title: "Task",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
    });

    const meta1 = await taskDotSource.getDailyMetadata(TEST_MOMENT());
    const meta2 = await taskDotSource.getDailyMetadata(TEST_MOMENT());

    expect(meta1.dataAttributes["data-task-count"]).toBe("1");
    expect(meta2.dataAttributes["data-task-count"]).toBe("1");
  });

  it("should reflect new tasks after store update", async () => {
    addTask({
      title: "First",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
    });

    const meta1 = await taskDotSource.getDailyMetadata(TEST_MOMENT());
    expect(meta1.dataAttributes["data-task-count"]).toBe("1");

    addTask({
      title: "Second",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 1,
    });

    const meta2 = await taskDotSource.getDailyMetadata(TEST_MOMENT());
    expect(meta2.dataAttributes["data-task-count"]).toBe("2");
  });

  it("should reflect completed tasks", async () => {
    const t1 = addTask({
      title: "Done",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
    });

    addTask({
      title: "Active",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 1,
    });

    const meta1 = await taskDotSource.getDailyMetadata(TEST_MOMENT());
    expect(meta1.dataAttributes["data-task-count"]).toBe("2");

    updateTask(t1.id, { completed: true });

    const meta2 = await taskDotSource.getDailyMetadata(TEST_MOMENT());
    expect(meta2.dataAttributes["data-task-count"]).toBe("1");
  });

  it("should show checkmark when all tasks completed", async () => {
    const t1 = addTask({
      title: "A",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
    });
    const t2 = addTask({
      title: "B",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 1,
    });

    updateTask(t1.id, { completed: true });
    updateTask(t2.id, { completed: true });

    const meta = await taskDotSource.getDailyMetadata(TEST_MOMENT());
    expect(meta.dataAttributes["data-task-count"]).toBe("\u2713");
    expect(meta.classes).toContain("all-completed");
  });

  it("should clear badge when all tasks removed", async () => {
    const t = addTask({
      title: "Only",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
    });

    let meta = await taskDotSource.getDailyMetadata(TEST_MOMENT());
    expect(meta.dataAttributes["data-task-count"]).toBe("1");

    removeTask(t.id);

    meta = await taskDotSource.getDailyMetadata(TEST_MOMENT());
    expect(meta).toEqual({});
  });

  it("should separate tasks by date", async () => {
    const date5 = getDateUID(window.moment("2026-07-05"), "day");
    const date6 = getDateUID(window.moment("2026-07-06"), "day");

    addTask({
      title: "July 5",
      completed: false,
      dateUID: date5,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
    });
    addTask({
      title: "July 6",
      completed: false,
      dateUID: date6,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
    });

    const meta5 = await taskDotSource.getDailyMetadata(
      window.moment("2026-07-05")
    );
    const meta6 = await taskDotSource.getDailyMetadata(
      window.moment("2026-07-06")
    );

    expect(meta5.dataAttributes["data-task-count"]).toBe("1");
    expect(meta6.dataAttributes["data-task-count"]).toBe("1");
  });
});
