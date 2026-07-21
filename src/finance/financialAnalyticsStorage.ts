import { writable, get } from "svelte/store";
import type CalendarPlugin from "../main";
import { loadVaultData, saveVaultKey } from "../io/vaultStorage";

export interface ManualIncomeSource {
  id: string;
  name: string;
  amount: number;
  date: string;
  category: string;
  createdAt: number;
}

export interface IFinancialAnalyticsData {
  manualIncomeSources: ManualIncomeSource[];
  incomeCategories: string[];
}

export const financialAnalyticsData = writable<IFinancialAnalyticsData>({
  manualIncomeSources: [],
  incomeCategories: [],
});

let pluginInstance: CalendarPlugin = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let loaded = false;

export async function initFinancialAnalyticsStores(plugin: CalendarPlugin): Promise<void> {
  pluginInstance = plugin;
  await loadFinancialAnalyticsData();
}

export async function reloadFinancialAnalyticsStores(): Promise<void> {
  await loadFinancialAnalyticsData();
}

async function loadFinancialAnalyticsData(): Promise<void> {
  if (!pluginInstance) return;

  // Always uses vaultStorage (calendar-data.json)
  const vaultData = await loadVaultData(pluginInstance.app);
  if (vaultData.financialAnalytics) {
    const savedData = vaultData.financialAnalytics as IFinancialAnalyticsData;
    // Ensure incomeCategories always exists (migration from old format)
    financialAnalyticsData.set({
      manualIncomeSources: savedData.manualIncomeSources || [],
      incomeCategories: savedData.incomeCategories || [],
    });
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

export async function immediateAnalyticsSave(): Promise<void> {
  if (!loaded || !pluginInstance) return;
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  await saveVaultKey(pluginInstance.app, "financialAnalytics", get(financialAnalyticsData));
}

let idCounter = 0;

export function generateIncomeSourceId(): string {
  return `fis-${Date.now()}-${++idCounter}-${Math.random().toString(36).slice(2, 6)}`;
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

export function getIncomeCategories(): string[] {
  const data = get(financialAnalyticsData);
  return data.incomeCategories || [];
}

export function addIncomeCategory(category: string): void {
  const trimmed = category.trim();
  if (!trimmed) return;
  financialAnalyticsData.update((current) => {
    const cats = current.incomeCategories || [];
    if (cats.includes(trimmed)) return current;
    return { ...current, incomeCategories: [...cats, trimmed] };
  });
  // Save immediately so categories persist without delay
  immediateAnalyticsSave();
}

export function removeIncomeCategory(category: string): void {
  financialAnalyticsData.update((current) => {
    const cats = current.incomeCategories || [];
    return { ...current, incomeCategories: cats.filter((c) => c !== category) };
  });
  // Save immediately so categories persist without delay
  immediateAnalyticsSave();
}

export function getManualIncomeByCategory(): Map<string, ManualIncomeSource[]> {
  const data = get(financialAnalyticsData);
  const map = new Map<string, ManualIncomeSource[]>();
  for (const source of data.manualIncomeSources) {
    const cat = source.category || "Другое";
    const list = map.get(cat);
    if (list) list.push(source);
    else map.set(cat, [source]);
  }
  return map;
}
