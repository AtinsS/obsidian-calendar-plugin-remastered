import { getDateUID } from "obsidian-daily-notes-interface";
import { tasks, addTask } from "../stores";
import { taskDotSource } from "../taskDotSource";

// Use moment to get the same dateUID format the source uses
const TEST_MOMENT = window.moment("2026-07-05");
const TEST_DATE = getDateUID(TEST_MOMENT, "day");

beforeEach(() => {
  tasks.set([]);
});

describe("taskDotSource", () => {
  it("should return empty metadata for date with no tasks", async () => {
    const metadata = await taskDotSource.getDailyMetadata(
      window.moment("2026-07-05")
    );
    expect(metadata.dataAttributes).toBeUndefined();
    expect(metadata.classes).toBeUndefined();
  });

  it("should return task count badge", async () => {
    addTask({
      title: "Task 1",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
      status: "todo",
    });

    const metadata = await taskDotSource.getDailyMetadata(
      window.moment("2026-07-05")
    );
    expect(metadata.dataAttributes["data-task-count"]).toBe("1");
    expect(metadata.classes).toContain("has-task-tracker-tasks");
  });

  it("should show count for multiple tasks", async () => {
    for (let i = 0; i < 5; i++) {
      addTask({
        title: `Task ${i}`,
        completed: false,
        dateUID: TEST_DATE,
        projectId: null,
        notePath: null,
        priority: "low",
        tags: [],
        sortOrder: i,
        status: "todo",
      });
    }

    const metadata = await taskDotSource.getDailyMetadata(
      window.moment("2026-07-05")
    );
    expect(metadata.dataAttributes["data-task-count"]).toBe("5");
  });

  it("should show 9+ for 10+ tasks", async () => {
    for (let i = 0; i < 12; i++) {
      addTask({
        title: `Task ${i}`,
        completed: false,
        dateUID: TEST_DATE,
        projectId: null,
        notePath: null,
        priority: "low",
        tags: [],
        sortOrder: i,
        status: "todo",
      });
    }

    const metadata = await taskDotSource.getDailyMetadata(
      window.moment("2026-07-05")
    );
    expect(metadata.dataAttributes["data-task-count"]).toBe("9+");
  });

  it("should show checkmark when all tasks completed", async () => {
    addTask({
      title: "Done 1",
      completed: true,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
      status: "todo",
    });
    addTask({
      title: "Done 2",
      completed: true,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 1,
      status: "todo",
    });

    const metadata = await taskDotSource.getDailyMetadata(
      window.moment("2026-07-05")
    );
    expect(metadata.dataAttributes["data-task-count"]).toBe("\u2713");
    expect(metadata.classes).toContain("all-completed");
    expect(metadata.classes).toContain("has-task-tracker-tasks");
  });

  it("should count only uncompleted tasks for badge number", async () => {
    addTask({
      title: "Done",
      completed: true,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
      status: "todo",
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
      status: "todo",
    });
    addTask({
      title: "Active 2",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 2,
      status: "todo",
    });

    const metadata = await taskDotSource.getDailyMetadata(
      window.moment("2026-07-05")
    );
    expect(metadata.dataAttributes["data-task-count"]).toBe("2");
  });

  it("should not return data attributes for empty date", async () => {
    const metadata = await taskDotSource.getDailyMetadata(
      window.moment("2026-12-25")
    );
    expect(metadata).toEqual({});
  });
});
