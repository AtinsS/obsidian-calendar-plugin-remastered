import { get } from "svelte/store";
import { financeData, getCurrentMonthKey, getMonthData, updateMonthData, getStoredMonthKeys, deleteMonthData, deleteMonthsBefore } from "../storage";
import { createEmptyMonthData } from "../types";

beforeEach(() => {
  financeData.set({});
});

describe("getCurrentMonthKey", () => {
  it("should return YYYY-MM format", () => {
    const key = getCurrentMonthKey();
    expect(key).toMatch(/^\d{4}-\d{2}$/);
  });

  it("should match current date", () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    expect(getCurrentMonthKey()).toBe(expected);
  });
});

describe("getMonthData", () => {
  it("should return empty month data for new key", () => {
    const data = getMonthData("2026-01");
    expect(data).toBeDefined();
    expect(data.monthlyIncome).toBe(0);
    expect(data.mainAccountCategories).toEqual([]);
    expect(data.savingsCategories).toEqual([]);
  });

  it("should persist data in store after update", () => {
    updateMonthData("2026-01", { monthlyIncome: 1000 });
    const stored = get(financeData);
    expect(stored["2026-01"]).toBeDefined();
  });

  it("should return existing data for known key", () => {
    updateMonthData("2026-01", { monthlyIncome: 50000 });
    const data = getMonthData("2026-01");
    expect(data.monthlyIncome).toBe(50000);
  });
});

describe("updateMonthData", () => {
  it("should merge changes into existing data", () => {
    updateMonthData("2026-01", { monthlyIncome: 50000 });
    updateMonthData("2026-01", { distributionRules: ["rule1", "rule2"] });
    const data = getMonthData("2026-01");
    expect(data.monthlyIncome).toBe(50000);
    expect(data.distributionRules).toEqual(["rule1", "rule2"]);
  });

  it("should set updatedAt timestamp", () => {
    updateMonthData("2026-01", { monthlyIncome: 1000 });
    const data = getMonthData("2026-01");
    expect(data.updatedAt).toBeTruthy();
    expect(new Date(data.updatedAt).getTime()).toBeGreaterThan(0);
  });

  it("should create month data if not exists", () => {
    updateMonthData("2026-03", { monthlyIncome: 70000 });
    const data = getMonthData("2026-03");
    expect(data.monthlyIncome).toBe(70000);
  });
});

describe("getStoredMonthKeys", () => {
  it("should return empty array when no data", () => {
    expect(getStoredMonthKeys()).toEqual([]);
  });

  it("should return sorted keys", () => {
    updateMonthData("2026-03", { monthlyIncome: 1 });
    updateMonthData("2026-01", { monthlyIncome: 2 });
    updateMonthData("2026-02", { monthlyIncome: 3 });
    const keys = getStoredMonthKeys();
    expect(keys).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
});

describe("deleteMonthData", () => {
  it("should remove month from store", () => {
    updateMonthData("2026-01", { monthlyIncome: 50000 });
    deleteMonthData("2026-01");
    const stored = get(financeData);
    expect(stored["2026-01"]).toBeUndefined();
  });

  it("should not affect other months", () => {
    updateMonthData("2026-01", { monthlyIncome: 1 });
    updateMonthData("2026-02", { monthlyIncome: 2 });
    deleteMonthData("2026-01");
    const data = getMonthData("2026-02");
    expect(data.monthlyIncome).toBe(2);
  });
});

describe("deleteMonthsBefore", () => {
  it("should delete months before cutoff", () => {
    updateMonthData("2026-01", { monthlyIncome: 1 });
    updateMonthData("2026-02", { monthlyIncome: 2 });
    updateMonthData("2026-03", { monthlyIncome: 3 });
    const count = deleteMonthsBefore("2026-03");
    expect(count).toBe(2);
    const keys = getStoredMonthKeys();
    expect(keys).toEqual(["2026-03"]);
  });

  it("should return 0 when nothing to delete", () => {
    updateMonthData("2026-03", { monthlyIncome: 1 });
    const count = deleteMonthsBefore("2026-01");
    expect(count).toBe(0);
  });

  it("should not delete months equal to cutoff", () => {
    updateMonthData("2026-01", { monthlyIncome: 1 });
    updateMonthData("2026-02", { monthlyIncome: 2 });
    deleteMonthsBefore("2026-02");
    const keys = getStoredMonthKeys();
    expect(keys).toEqual(["2026-02"]);
  });
});

describe("createEmptyMonthData", () => {
  it("should have correct defaults", () => {
    const data = createEmptyMonthData();
    expect(data.monthlyIncome).toBe(0);
    expect(data.lastMonthExpense).toBe(0);
    expect(data.mainAccountCategories).toEqual([]);
    expect(data.savingsCategories).toEqual([]);
    expect(data.monthGoals).toEqual([]);
    expect(data.distributionRules).toEqual([]);
    expect(data.updatedAt).toBeTruthy();
  });
});
