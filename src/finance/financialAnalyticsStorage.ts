import { writable, get } from "svelte/store";
import type CalendarPlugin from "../main";
import { loadVaultData, saveVaultKey } from "../io/vaultStorage";

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
let loaded = false;

export function initFinancialAnalyticsStores(plugin: CalendarPlugin): void {
  pluginInstance = plugin;
  loadFinancialAnalyticsData();
}

export function reloadFinancialAnalyticsStores(): void {
  loadFinancialAnalyticsData();
}

async function loadFinancialAnalyticsData(): Promise<void> {
  if (!pluginInstance) return;

  // Always uses vaultStorage (calendar-data.json)
  const vaultData = await loadVaultData(pluginInstance.app);
  if (vaultData.financialAnalytics) {
    financialAnalyticsData.set(vaultData.financialAnalytics as IFinancialAnalyticsData);
  }
  loaded = true;
}

async function debouncedSave(): Promise<void> {
  if (!loaded) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    if (!pluginInstance) return;

    // Use queued save to prevent race conditions with other modules
    await saveVaultKey(pluginInstance.app, "financialAnalytics", get(financialAnalyticsData));
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
