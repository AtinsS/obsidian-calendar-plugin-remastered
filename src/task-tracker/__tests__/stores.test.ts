import { get } from "svelte/store";
import { tasks, projects, addTask, updateTask, removeTask, moveTask, getTasksForDate, addProject, removeProject } from "../stores";

// Use the correct dateUID format: "day-YYYY-MM-DDTHH:mm:ss"
const TEST_DATE = "day-2026-07-05T00:00:00";
const TEST_DATE_2 = "day-2026-07-06T00:00:00";

// Reset stores before each test
beforeEach(() => {
  tasks.set([]);
  projects.set([]);
});

describe("addTask", () => {
  it("should create a task with generated id and timestamps", () => {
    const task = addTask({
      title: "Test Task",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "medium",
      tags: [],
      sortOrder: 0,
    });

    expect(task.id).toBeDefined();
    expect(task.id.length).toBeGreaterThan(0);
    expect(task.title).toBe("Test Task");
    expect(task.completed).toBe(false);
    expect(task.dateUID).toBe(TEST_DATE);
    expect(task.createdAt).toBeDefined();
    expect(task.updatedAt).toBeDefined();
  });

  it("should add task to the store", () => {
    addTask({
      title: "Task 1",
      completed: false,
      dateUID: TEST_DATE,
      projectId: null,
      notePath: null,
      priority: "low",
      tags: [],
      sortOrder: 0,
    });

    const allTasks = get(tasks);
    expect(allTasks.length).toBe(1);
    expect(allTasks[0].title).toBe("Task 1");
  });

  it("should add multiple tasks", () => {
    addTask({ title: "Task 1", completed: false, dateUID: TEST_DATE, projectId: null, notePath: null, priority: "low", tags: [], sortOrder: 0 });
    addTask({ title: "Task 2", completed: false, dateUID: TEST_DATE, projectId: null, notePath: null, priority: "high", tags: [], sortOrder: 1 });

    const allTasks = get(tasks);
    expect(allTasks.length).toBe(2);
  });
});

describe("getTasksForDate", () => {
  it("should return tasks for matching dateUID", () => {
    addTask({ title: "Task A", completed: false, dateUID: TEST_DATE, projectId: null, notePath: null, priority: "low", tags: [], sortOrder: 0 });
    addTask({ title: "Task B", completed: false, dateUID: TEST_DATE_2, projectId: null, notePath: null, priority: "low", tags: [], sortOrder: 0 });

    const result = getTasksForDate(TEST_DATE);
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("Task A");
  });

  it("should return empty array for no matching date", () => {
    addTask({ title: "Task A", completed: false, dateUID: TEST_DATE, projectId: null, notePath: null, priority: "low", tags: [], sortOrder: 0 });

    const result = getTasksForDate("day-2026-07-10T00:00:00");
    expect(result.length).toBe(0);
  });

  it("should return empty array for empty store", () => {
    const result = getTasksForDate(TEST_DATE);
    expect(result.length).toBe(0);
  });
});

describe("updateTask", () => {
  it("should update task fields", () => {
    const task = addTask({ title: "Original", completed: false, dateUID: TEST_DATE, projectId: null, notePath: null, priority: "low", tags: [], sortOrder: 0 });

    updateTask(task.id, { title: "Updated", completed: true });

    const allTasks = get(tasks);
    const updated = allTasks.find((t) => t.id === task.id);
    expect(updated.title).toBe("Updated");
    expect(updated.completed).toBe(true);
  });
});

describe("removeTask", () => {
  it("should remove task by id", () => {
    const task = addTask({ title: "To Delete", completed: false, dateUID: TEST_DATE, projectId: null, notePath: null, priority: "low", tags: [], sortOrder: 0 });

    removeTask(task.id);

    const allTasks = get(tasks);
    expect(allTasks.length).toBe(0);
  });
});

describe("moveTask", () => {
  it("should change task dateUID", () => {
    const task = addTask({ title: "Movable", completed: false, dateUID: TEST_DATE, projectId: null, notePath: null, priority: "low", tags: [], sortOrder: 0 });

    moveTask(task.id, "day-2026-07-10T00:00:00");

    const allTasks = get(tasks);
    const moved = allTasks.find((t) => t.id === task.id);
    expect(moved.dateUID).toBe("day-2026-07-10T00:00:00");
  });
});

describe("addProject", () => {
  it("should create a project", () => {
    const project = addProject({
      name: "Test Project",
      color: "#ff0000",
      icon: "📁",
      folder: null,
      archived: false,
      sortOrder: 0,
    });

    expect(project.id).toBeDefined();
    expect(project.name).toBe("Test Project");
    expect(project.color).toBe("#ff0000");
  });
});

describe("removeProject", () => {
  it("should remove project and unassign tasks", () => {
    const project = addProject({ name: "P1", color: "#ff0000", icon: "📁", folder: null, archived: false, sortOrder: 0 });
    addTask({ title: "Task", completed: false, dateUID: TEST_DATE, projectId: project.id, notePath: null, priority: "low", tags: [], sortOrder: 0 });

    removeProject(project.id);

    const allProjects = get(projects);
    expect(allProjects.length).toBe(0);

    const allTasks = get(tasks);
    expect(allTasks[0].projectId).toBeNull();
  });
});
