import { calculateTaskEarnings } from "../stores";
import type { ITask } from "../types";

function createWorkTask(overrides: Partial<ITask> = {}): ITask {
  return {
    id: "test-id",
    title: "Test Work Task",
    completed: true,
    status: "done",
    dateUID: "day-2026-07-05T00:00:00",
    projectId: null,
    notePath: null,
    priority: "medium",
    tags: [],
    sortOrder: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isWorkTask: true,
    paymentType: "hour",
    rate: 1000,
    totalWorkTime: 3600000, // 1 hour in ms
    ...overrides,
  };
}

describe("calculateTaskEarnings", () => {
  describe("basic hourly payment", () => {
    it("should calculate earnings for 1 hour at 1000 rate", () => {
      const task = createWorkTask({ totalWorkTime: 3600000 }); // 1 hour
      expect(calculateTaskEarnings(task)).toBe(1000);
    });

    it("should calculate earnings for 2.5 hours at 500 rate", () => {
      const task = createWorkTask({ rate: 500, totalWorkTime: 9000000 }); // 2.5 hours
      expect(calculateTaskEarnings(task)).toBe(1250);
    });

    it("should calculate earnings for 8 hours at 1000 rate", () => {
      const task = createWorkTask({ totalWorkTime: 28800000 }); // 8 hours
      expect(calculateTaskEarnings(task)).toBe(8000);
    });
  });

  describe("overtime calculations", () => {
    it("should apply overtime multiplier after overtimeStart hours", () => {
      const task = createWorkTask({
        rate: 1000,
        totalWorkTime: 36000000, // 10 hours
        overtimeStart: 8,
        overtimeMultiplier: 1.5,
      });
      // 8 regular hours + 2 overtime hours * 1.5
      // 8000 + 2 * 1000 * 1.5 = 8000 + 3000 = 11000
      expect(calculateTaskEarnings(task)).toBe(11000);
    });

    it("should not apply overtime when total hours <= overtimeStart", () => {
      const task = createWorkTask({
        rate: 1000,
        totalWorkTime: 28800000, // 8 hours
        overtimeStart: 8,
        overtimeMultiplier: 1.5,
      });
      // 8 regular hours, no overtime
      expect(calculateTaskEarnings(task)).toBe(8000);
    });

    it("should not apply overtime when overtimeStart is 0", () => {
      const task = createWorkTask({
        rate: 1000,
        totalWorkTime: 36000000, // 10 hours
        overtimeStart: 0,
        overtimeMultiplier: 1.5,
      });
      // No overtime configured, just 10 hours at regular rate
      expect(calculateTaskEarnings(task)).toBe(10000);
    });

    it("should not apply overtime when overtimeMultiplier is 1", () => {
      const task = createWorkTask({
        rate: 1000,
        totalWorkTime: 36000000, // 10 hours
        overtimeStart: 8,
        overtimeMultiplier: 1,
      });
      // Overtime multiplier is 1, same as regular rate
      expect(calculateTaskEarnings(task)).toBe(10000);
    });

    it("should handle overtime with 2x multiplier", () => {
      const task = createWorkTask({
        rate: 1000,
        totalWorkTime: 43200000, // 12 hours
        overtimeStart: 8,
        overtimeMultiplier: 2,
      });
      // 8 regular hours + 4 overtime hours * 2
      // 8000 + 4 * 1000 * 2 = 8000 + 8000 = 16000
      expect(calculateTaskEarnings(task)).toBe(16000);
    });

    it("should handle fractional overtime hours", () => {
      const task = createWorkTask({
        rate: 1000,
        totalWorkTime: 30600000, // 8.5 hours
        overtimeStart: 8,
        overtimeMultiplier: 1.5,
      });
      // 8 regular hours + 0.5 overtime hours * 1.5
      // 8000 + 0.5 * 1000 * 1.5 = 8000 + 750 = 8750
      expect(calculateTaskEarnings(task)).toBe(8750);
    });

    it("should round the result", () => {
      const task = createWorkTask({
        rate: 1000,
        totalWorkTime: 30600000, // 8.5 hours
        overtimeStart: 8,
        overtimeMultiplier: 1.3,
      });
      // 8000 + 0.5 * 1000 * 1.3 = 8000 + 650 = 8650
      expect(calculateTaskEarnings(task)).toBe(8650);
    });
  });

  describe("daily payment", () => {
    it("should return fixed rate for daily payment", () => {
      const task = createWorkTask({
        paymentType: "day",
        rate: 5000,
        totalWorkTime: 36000000, // 10 hours
      });
      expect(calculateTaskEarnings(task)).toBe(5000);
    });

    it("should ignore overtime for daily payment", () => {
      const task = createWorkTask({
        paymentType: "day",
        rate: 5000,
        totalWorkTime: 36000000,
        overtimeStart: 8,
        overtimeMultiplier: 2,
      });
      expect(calculateTaskEarnings(task)).toBe(5000);
    });
  });

  describe("edge cases", () => {
    it("should return 0 for non-work tasks", () => {
      const task = createWorkTask({ isWorkTask: false });
      expect(calculateTaskEarnings(task)).toBe(0);
    });

    it("should return 0 for tasks without rate", () => {
      const task = createWorkTask({ rate: undefined });
      expect(calculateTaskEarnings(task)).toBe(0);
    });

    it("should return 0 for tasks not done", () => {
      const task = createWorkTask({ status: "progress", completed: false });
      expect(calculateTaskEarnings(task)).toBe(0);
    });

    it("should return 0 for paused tasks", () => {
      const task = createWorkTask({ status: "paused", completed: false });
      expect(calculateTaskEarnings(task)).toBe(0);
    });

    it("should return 0 when totalWorkTime is undefined", () => {
      const task = createWorkTask({ totalWorkTime: undefined });
      expect(calculateTaskEarnings(task)).toBe(0);
    });

    it("should handle very small work time", () => {
      const task = createWorkTask({ totalWorkTime: 60000 }); // 1 minute
      // 1000 * (60000 / 3600000) = 1000 * 0.01666... ≈ 17
      expect(calculateTaskEarnings(task)).toBe(17);
    });

    it("should handle zero work time", () => {
      const task = createWorkTask({ totalWorkTime: 0 });
      expect(calculateTaskEarnings(task)).toBe(0);
    });
  });

  describe("overtime with fractional rates", () => {
    it("should handle fractional rate with overtime", () => {
      const task = createWorkTask({
        rate: 150.5,
        totalWorkTime: 32400000, // 9 hours
        overtimeStart: 8,
        overtimeMultiplier: 1.5,
      });
      // 8 * 150.5 + 1 * 150.5 * 1.5 = 1204 + 225.75 = 1429.75
      // Math.round(1429.75) = 1430
      expect(calculateTaskEarnings(task)).toBe(1430);
    });

    it("should handle overtime multiplier with decimals", () => {
      const task = createWorkTask({
        rate: 1000,
        totalWorkTime: 37800000, // 10.5 hours
        overtimeStart: 8,
        overtimeMultiplier: 1.25,
      });
      // 8000 + 2.5 * 1000 * 1.25 = 8000 + 3125 = 11125
      expect(calculateTaskEarnings(task)).toBe(11125);
    });
  });
});
