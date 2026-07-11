export interface FinanceCategory {
  id: string;
  name: string;
  icon: string;
  amount: number;
  order: number;
}

export interface FinanceMonthData {
  monthlyIncome: number;
  lastMonthExpense: number;
  mainAccountCategories: FinanceCategory[];
  monthGoals: string[];
  savingsCategories: FinanceCategory[];
  distributionRules: string[];
  updatedAt: string;
}

export interface IFinanceData {
  [monthKey: string]: FinanceMonthData;
}

export function createEmptyMonthData(): FinanceMonthData {
  return {
    monthlyIncome: 0,
    lastMonthExpense: 0,
    mainAccountCategories: [],
    monthGoals: [],
    savingsCategories: [],
    distributionRules: [],
    updatedAt: new Date().toISOString(),
  };
}

export function generateCategoryId(): string {
  return `fc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
