import { get } from "svelte/store";
import { tasks, projects, selectedDate, addTask, updateTask, getTasksForDate, addProject } from "../stores";

// Use the correct dateUID format: "day-YYYY-MM-DDTHH:mm:ss"
const TEST_DATE = "day-2026-07-05T00:00:00";

// Reset stores before each test
beforeEach(() => {
  tasks.set([]);
  projects.set([]);
  selectedDate.set(null);
});

describe("full task creation flow", () => {
  it("should create task and find it by date", () => {
    // 1. User selects a date on calendar
    selectedDate.set(TEST_DATE);

    // 2. User opens task modal and creates a task
    addTask({
      title: "My Task",
      completed: false,
      dateUID: get(selectedDate),
      projectId: null,
      notePath: null,
      priority: "medium",
      tags: [],
      sortOrder: 0,
    });

    // 3. Task should be in the store
    expect(get(tasks).length).toBe(1);

    // 4. Task should be findable by date
    const dateTasks = getTasksForDate(get(selectedDate));
    expect(dateTasks.length).toBe(1);
    expect(dateTasks[0].title).toBe("My Task");
  });

  it("should create task with project", () => {
    // 1. Create a project
    const project = addProject({
      name: "Work",
      color: "#4d96ff",
      icon: "💼",
      folder: null,
      archived: false,
      sortOrder: 0,
    });

    // 2. Create task with project
    const task = addTask({
      title: "Work Task",
      completed: false,
      dateUID: TEST_DATE,
      projectId: project.id,
      notePath: null,
      priority: "high",
      tags: [],
      sortOrder: 0,
    });

    // 3. Verify
    expect(task.projectId).toBe(project.id);
    expect(get(tasks).length).toBe(1);
  });

  it("should filter tasks by project", () => {
    const p1 = addProject({ name: "P1", color: "#ff0000", icon: "📁", folder: null, archived: false, sortOrder: 0 });
    const p2 = addProject({ name: "P2", color: "#00ff00", icon: "📁", folder: null, archived: false, sortOrder: 1 });

    addTask({ title: "T1", completed: false, dateUID: TEST_DATE, projectId: p1.id, notePath: null, priority: "low", tags: [], sortOrder: 0 });
    addTask({ title: "T2", completed: false, dateUID: TEST_DATE, projectId: p2.id, notePath: null, priority: "low", tags: [], sortOrder: 1 });
    addTask({ title: "T3", completed: false, dateUID: TEST_DATE, projectId: p1.id, notePath: null, priority: "low", tags: [], sortOrder: 2 });

    // Filter by project
    const p1Tasks = get(tasks).filter((t) => t.projectId === p1.id);
    expect(p1Tasks.length).toBe(2);

    const p2Tasks = get(tasks).filter((t) => t.projectId === p2.id);
    expect(p2Tasks.length).toBe(1);
  });

  it("should handle completed tasks", () => {
    const task = addTask({
      title: "Complete Me",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
    });

    // Initially not completed
    expect(get(tasks)[0].completed).toBe(false);

    // Complete it
    updateTask(task.id, { completed: true });

    expect(get(tasks)[0].completed).toBe(true);
  });
});

describe("edge cases", () => {
  it("should handle empty title gracefully", () => {
    const task = addTask({
      title: "",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
    });

    expect(task.title).toBe("");
    expect(get(tasks).length).toBe(1);
  });

  it("should handle special characters in title", () => {
    const task = addTask({
      title: "Task with <html> & \"quotes\" 'apostrophes'",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
    });

    expect(task.title).toBe("Task with <html> & \"quotes\" 'apostrophes'");
  });

  it("should handle many tasks", () => {
    for (let i = 0; i < 100; i++) {
      addTask({
        title: `Task ${i}`,
        completed: false,
        dateUID: TEST_DATE,
        projectId: null,
        notePath: null,
        priority: "low",
        tags: [],
        sortOrder: i,
      });
    }

    expect(get(tasks).length).toBe(100);
    const dateTasks = getTasksForDate(TEST_DATE);
    expect(dateTasks.length).toBe(100);
  });
});
