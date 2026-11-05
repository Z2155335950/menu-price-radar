export type RiskLevel =
  | "critical"
  | "warning"
  | "watch"
  | "normal"
  | "insufficient_data";

export type RankingGroup = "weekly" | "per_serving";

export type RiskThresholds = {
  criticalRateGapBps: number;
  criticalWeeklyImpactMicroYuan: number;
  warningWeeklyImpactMicroYuan: number;
};

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  criticalRateGapBps: 500,
  criticalWeeklyImpactMicroYuan: 500_000_000,
  warningWeeklyImpactMicroYuan: 200_000_000,
};

export type RiskInput = {
  costDeltaMicroYuan: number | null;
  foodCostRateAfterBps: number | null;
  targetFoodCostRateBps: number | null;
  weeklyImpactMicroYuan: number | null;
};

export type RiskResult = {
  level: RiskLevel;
  reason: string;
};

/**
 * 四档风险 + 数据不足。
 *
 * 金额单位是微元，比率单位是基点。
 * 没有触发任何风险阈值的涨价菜品仍然进入“观察”。
 */
export function classifyRisk(
  input: RiskInput,
  thresholds: RiskThresholds = DEFAULT_RISK_THRESHOLDS,
): RiskResult {
  if (input.costDeltaMicroYuan === null || input.costDeltaMicroYuan <= 0) {
    return { level: "normal", reason: "单份成本没有上升" };
  }

  const rateAfter = input.foodCostRateAfterBps;
  const target = input.targetFoodCostRateBps;
  const weekly = input.weeklyImpactMicroYuan;

  if (rateAfter === null && weekly === null) {
    return {
      level: "insufficient_data",
      reason: "缺少售价和目标成本率，也没有周销量",
    };
  }

  if (
    (rateAfter !== null &&
      target !== null &&
      rateAfter - target >= thresholds.criticalRateGapBps) ||
    (weekly !== null &&
      weekly >= thresholds.criticalWeeklyImpactMicroYuan)
  ) {
    return {
      level: "critical",
      reason:
        weekly !== null && weekly >= thresholds.criticalWeeklyImpactMicroYuan
          ? "预计周食材毛利影响达到严重阈值"
          : "食材成本率明显超过目标",
    };
  }

  if (
    (rateAfter !== null && target !== null && rateAfter > target) ||
    (weekly !== null &&
      weekly >= thresholds.warningWeeklyImpactMicroYuan)
  ) {
    return {
      level: "warning",
      reason:
        rateAfter !== null && target !== null && rateAfter > target
          ? "食材成本率超过目标"
          : "预计周食材毛利影响达到警告阈值",
    };
  }

  return {
    level: "watch",
    reason: "成本上升，但未达到警告阈值",
  };
}
