import { writable, get } from "svelte/store";
import type CalendarPlugin from "../main";

export interface ManualIncomeSource {
  id: string;
  name: string;
  amount: number;
  date: string;
  createdAt: number;
}

export interface IFinancialAnalyticsData {
  manualIncomeSources: ManualIncomeSource[];
}

export const financialAnalyticsData = writable<IFinancialAnalyticsData>({
  manualIncomeSources: [],
});

let pluginInstance: CalendarPlugin = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export function initFinancialAnalyticsStores(plugin: CalendarPlugin): void {
  pluginInstance = plugin;
  loadFinancialAnalyticsData();
}

export function reloadFinancialAnalyticsStores(): void {
  loadFinancialAnalyticsData();
}

function loadFinancialAnalyticsData(): void {
  if (!pluginInstance) return;
  pluginInstance.loadData().then((data: any) => {
    if (data?.financialAnalytics) {
      financialAnalyticsData.set(data.financialAnalytics);
    }
  });
}

function debouncedSave(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    if (!pluginInstance) return;
    pluginInstance.loadData().then((existing: any) => {
      const data = existing || {};
      data.financialAnalytics = get(financialAnalyticsData);
      pluginInstance.saveData(data);
    });
  }, 300);
}

export function generateIncomeSourceId(): string {
  return `fis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addManualIncomeSource(source: Omit<ManualIncomeSource, "id" | "createdAt">): void {
  const newSource: ManualIncomeSource = {
    ...source,
    id: generateIncomeSourceId(),
    createdAt: Date.now(),
  };
  financialAnalyticsData.update((current) => ({
    ...current,
    manualIncomeSources: [...current.manualIncomeSources, newSource],
  }));
  debouncedSave();
}

export function updateManualIncomeSource(id: string, changes: Partial<ManualIncomeSource>): void {
  financialAnalyticsData.update((current) => ({
    ...current,
    manualIncomeSources: current.manualIncomeSources.map((s) =>
      s.id === id ? { ...s, ...changes } : s
    ),
  }));
  debouncedSave();
}

export function removeManualIncomeSource(id: string): void {
  financialAnalyticsData.update((current) => ({
    ...current,
    manualIncomeSources: current.manualIncomeSources.filter((s) => s.id !== id),
  }));
  debouncedSave();
}

export function getTotalManualIncome(): number {
  const data = get(financialAnalyticsData);
  return data.manualIncomeSources.reduce((sum, s) => sum + s.amount, 0);
}
