import { get } from "svelte/store";
import { tasks, addTask, createNextRecurringInstance } from "../stores";

const TEST_DATE = "day-2026-07-05T00:00:00";

beforeEach(() => {
  tasks.set([]);
});

describe("createNextRecurringInstance", () => {
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
      status: "todo",
    });

    createNextRecurringInstance(task.id);

    expect(get(tasks).length).toBe(1);
  });

  it("should not create new task if task not found", () => {
    createNextRecurringInstance("nonexistent-id");
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
      status: "todo",
      recurrence: { type: "daily" },
    });

    createNextRecurringInstance(task.id);

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
      status: "todo",
      recurrence: { type: "daily", interval: 3 },
    });

    createNextRecurringInstance(task.id);

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
      status: "todo",
      recurrence: { type: "weekly" },
    });

    createNextRecurringInstance(task.id);

    const allTasks = get(tasks);
    const newTask = allTasks.find((t) => t.id !== task.id);
    expect(newTask).toBeDefined();
    // Should be 7 days after July 5 = July 12
    expect(newTask.dateUID).toContain("2026-07-12");
  });

  it("should create next weekly occurrence for specific days (Mon-Fri using moment convention)", () => {
    // July 5, 2026 is a Sunday (moment.day() = 0)
    // daysOfWeek [1,2,3,4,5] = Mon,Tue,Wed,Thu,Fri in moment convention
    const task = addTask({
      title: "Weekday task",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
      status: "todo",
      recurrence: { type: "weekly", daysOfWeek: [1, 2, 3, 4, 5] },
    });

    createNextRecurringInstance(task.id);

    const allTasks = get(tasks);
    const newTask = allTasks.find((t) => t.id !== task.id);
    expect(newTask).toBeDefined();
    // Sunday + 1 = Monday July 6
    expect(newTask.dateUID).toContain("2026-07-06");
  });

  it("should skip Sat/Sun when daysOfWeek is Mon-Fri", () => {
    // July 10, 2026 is a Friday (moment.day() = 5)
    // daysOfWeek [1,2,3,4,5] = Mon-Fri
    const fridayDate = "day-2026-07-10T00:00:00";
    const task = addTask({
      title: "Weekday task",
      completed: false,
      dateUID: fridayDate,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
      status: "todo",
      recurrence: { type: "weekly", daysOfWeek: [1, 2, 3, 4, 5] },
    });

    createNextRecurringInstance(task.id);

    const allTasks = get(tasks);
    const newTask = allTasks.find((t) => t.id !== task.id);
    expect(newTask).toBeDefined();
    // Friday + 3 = Monday July 13 (skipping Sat/Sun)
    expect(newTask.dateUID).toContain("2026-07-13");
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
      status: "todo",
      recurrence: { type: "monthly" },
    });

    createNextRecurringInstance(task.id);

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
      status: "todo",
      recurrence: { type: "daily" },
    });

    createNextRecurringInstance(task.id);

    const allTasks = get(tasks);
    const newTask = allTasks.find((t) => t.id !== task.id);
    expect(newTask.projectId).toBe("proj-1");
    expect(newTask.priority).toBe("high");
    expect(newTask.tags).toEqual(["urgent"]);
  });

  it("should copy notePath on new occurrence", () => {
    const task = addTask({
      title: "Note task",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: "folder/note.md",
      priority: "low",
      tags: [],
      sortOrder: 0,
      status: "todo",
      recurrence: { type: "daily" },
    });

    createNextRecurringInstance(task.id);

    const allTasks = get(tasks);
    const newTask = allTasks.find((t) => t.id !== task.id);
    expect(newTask.notePath).toBe("folder/note.md");
  });

  it("should set isRecurringInstance and parentTaskId on new occurrence", () => {
    const task = addTask({
      title: "Parent task",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
      status: "todo",
      recurrence: { type: "daily" },
    });

    createNextRecurringInstance(task.id);

    const allTasks = get(tasks);
    const newTask = allTasks.find((t) => t.id !== task.id);
    expect(newTask.isRecurringInstance).toBe(true);
    expect(newTask.parentTaskId).toBe(task.id);
  });

  it("should copy scheduledTime and estimatedTime on recurrence", () => {
    const task = addTask({
      title: "Timed task",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
      status: "todo",
      scheduledTime: "09:00",
      estimatedTime: 60,
      recurrence: { type: "daily" },
    });

    createNextRecurringInstance(task.id);

    const allTasks = get(tasks);
    const newTask = allTasks.find((t) => t.id !== task.id);
    expect(newTask.scheduledTime).toBe("09:00");
    expect(newTask.estimatedTime).toBe(60);
    expect(newTask.totalWorkTime).toBe(0);
  });
});


