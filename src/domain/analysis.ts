import type { RankingGroup, RiskLevel, RiskThresholds } from "./risk";

export type AnalysisAdviceType =
  | "verify_quote"
  | "negotiate"
  | "adjust_portion"
  | "adjust_price"
  | "substitute"
  | "observe";

export type AnalysisAdvice = {
  type: AnalysisAdviceType;
  title: string;
  detail: string;
  evidenceRefs: string[];
  facts: Record<string, string | number | null>;
};

export type AnalysisIngredient = {
  ingredientId: number;
  name: string;
  baseUnit: "g" | "ml" | "个";
  quantityBase: number;
  oldPriceMicroYuanPerBaseUnit: number;
  newPriceMicroYuanPerBaseUnit: number;
  oldCostMicroYuan: number;
  newCostMicroYuan: number;
  deltaMicroYuan: number;
  quoteItemId: number | null;
  evidenceText: string | null;
  lineNo: number | null;
};

export type AnalysisCalculation = {
  sellingPriceMicroYuan: number | null;
  targetFoodCostRateBps: number | null;
  weeklySales: number | null;
  costBeforeMicroYuan: number;
  costAfterMicroYuan: number;
  costDeltaMicroYuan: number;
  foodCostRateBeforeBps: number | null;
  foodCostRateAfterBps: number | null;
  weeklyImpactMicroYuan: number | null;
  priceChangeRatio: number | null;
  causeSentence?: string;
  mainIngredient: AnalysisIngredient | null;
  ingredients: AnalysisIngredient[];
  advice: AnalysisAdvice[];
  riskReason: string;
  thresholds: RiskThresholds;
};

export type AnalysisDishResultView = {
  id: number;
  dishId: number;
  dishName: string;
  costBeforeMicroYuan: number;
  costAfterMicroYuan: number;
  costDeltaMicroYuan: number;
  foodCostRateBeforeBps: number | null;
  foodCostRateAfterBps: number | null;
  targetFoodCostRateBps: number | null;
  weeklySales: number | null;
  weeklyImpactMicroYuan: number | null;
  riskLevel: RiskLevel;
  rankingGroup: RankingGroup | null;
  rankPosition: number | null;
  calculation: AnalysisCalculation;
  dataQuality: string[];
};

export type AnalysisRunView = {
  id: number;
  quoteId: number;
  status: "running" | "completed" | "failed";
  rulesVersion: string;
  summary: AnalysisSummary | null;
  startedAt: string;
  completedAt: string | null;
  results: AnalysisDishResultView[];
};

export type AnalysisSummary = {
  affectedDishes: number;
  critical: number;
  warning: number;
  watch: number;
  missingSales: number;
  totalWeeklyImpactMicroYuan: number;
  skippedDishes: number;
};
