import { writable, get } from "svelte/store";
import type CalendarPlugin from "../main";
import type { IFinanceData, FinanceMonthData } from "./types";
import { createEmptyMonthData } from "./types";

export const financeData = writable<IFinanceData>({});

let pluginInstance: CalendarPlugin = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export function initFinanceStores(plugin: CalendarPlugin): void {
  pluginInstance = plugin;
  loadFinanceData();
}

export function reloadFinanceStores(): void {
  loadFinanceData();
}

function loadFinanceData(): void {
  if (!pluginInstance) return;
  pluginInstance.loadData().then((data: any) => {
    if (data?.finance) {
      financeData.set(data.finance);
    }
  });
}

function debouncedSave(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    if (!pluginInstance) return;
    pluginInstance.loadData().then((existing: any) => {
      const data = existing || {};
      data.finance = get(financeData);
      pluginInstance.saveData(data);
    });
  }, 300);
}

export function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function getMonthData(monthKey: string): FinanceMonthData {
  const allData = get(financeData);
  if (!allData[monthKey]) {
    return createEmptyMonthData();
  }
  return allData[monthKey];
}

export function updateMonthData(monthKey: string, changes: Partial<FinanceMonthData>): void {
  financeData.update((current) => ({
    ...current,
    [monthKey]: {
      ...(current[monthKey] || createEmptyMonthData()),
      ...changes,
      updatedAt: new Date().toISOString(),
    },
  }));
  debouncedSave();
}

export function addIncome(amount: number): void {
  const monthKey = getCurrentMonthKey();
  const data = getMonthData(monthKey);
  updateMonthData(monthKey, { monthlyIncome: data.monthlyIncome + amount });
}

export function getMainAccountTotal(monthKey: string): number {
  const data = getMonthData(monthKey);
  return data.mainAccountCategories.reduce((sum, c) => sum + c.amount, 0);
}

export function getSavingsTotal(monthKey: string): number {
  const data = getMonthData(monthKey);
  return data.savingsCategories.reduce((sum, c) => sum + c.amount, 0);
}

export function getCurrentBalance(monthKey: string): number {
  const data = getMonthData(monthKey);
  return data.monthlyIncome - data.lastMonthExpense;
}

export function getStoredMonthKeys(): string[] {
  return Object.keys(get(financeData)).sort();
}

export function deleteMonthData(monthKey: string): void {
  financeData.update((current) => {
    const next = { ...current };
    delete next[monthKey];
    return next;
  });
  debouncedSave();
}

export function deleteMonthsBefore(cutoffKey: string): number {
  const all = get(financeData);
  const keys = Object.keys(all).filter((k) => k < cutoffKey);
  if (keys.length === 0) return 0;
  financeData.update((current) => {
    const next = { ...current };
    for (const k of keys) delete next[k];
    return next;
  });
  debouncedSave();
  return keys.length;
}
