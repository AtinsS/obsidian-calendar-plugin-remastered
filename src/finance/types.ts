export interface FinanceCategory {
  id: string;
  name: string;
  icon: string;
  amount: number;
  order: number;
}

export interface MonthGoal {
  id: string;
  icon: string;
  name: string;
  currentAmount: number;
  targetAmount: number;
}

export interface SavingsCategory extends FinanceCategory {
  percent: number;
  completed: boolean;
}

export interface FinanceMonthData {
  monthlyIncome: number;
  lastMonthExpense: number;
  mainAccountCategories: FinanceCategory[];
  monthGoals: MonthGoal[];
  savingsCategories: SavingsCategory[];
  distributionRules: string[];
  incomeSource?: "analytics" | "manual";
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

export function generateGoalId(): string {
  return `fg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateCategoryId(): string {
  return `fc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
