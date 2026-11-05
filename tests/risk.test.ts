import { describe, expect, it } from "vitest";

import {
  DEFAULT_RISK_THRESHOLDS,
  classifyRisk,
} from "../src/domain/risk";

const base = {
  costDeltaMicroYuan: 1_000_000,
  foodCostRateAfterBps: 4230,
  targetFoodCostRateBps: 3500,
  weeklyImpactMicroYuan: 600_000_000,
};

describe("risk classification", () => {
  it("marks a five-point target gap as critical", () => {
    expect(
      classifyRisk({
        ...base,
        weeklyImpactMicroYuan: null,
      }),
    ).toMatchObject({ level: "critical" });
  });

  it("marks a large weekly impact as critical", () => {
    expect(
      classifyRisk({
        ...base,
        foodCostRateAfterBps: 3500,
        targetFoodCostRateBps: 3500,
        weeklyImpactMicroYuan:
          DEFAULT_RISK_THRESHOLDS.criticalWeeklyImpactMicroYuan,
      }),
    ).toMatchObject({ level: "critical" });
  });

  it("marks a target breach or 200 yuan weekly impact as warning", () => {
    expect(
      classifyRisk({
        ...base,
        foodCostRateAfterBps: 2600,
        targetFoodCostRateBps: 2500,
        weeklyImpactMicroYuan: null,
      }),
    ).toMatchObject({ level: "warning" });

    expect(
      classifyRisk({
        ...base,
        foodCostRateAfterBps: 2000,
        targetFoodCostRateBps: 3000,
        weeklyImpactMicroYuan: 200_000_000,
      }),
    ).toMatchObject({ level: "warning" });
  });

  it("marks a small increase as watch and a decrease as normal", () => {
    expect(
      classifyRisk({
        ...base,
        foodCostRateAfterBps: 2600,
        targetFoodCostRateBps: 3000,
        weeklyImpactMicroYuan: 100_000_000,
      }),
    ).toMatchObject({ level: "watch" });

    expect(
      classifyRisk({
        ...base,
        costDeltaMicroYuan: -1,
      }),
    ).toMatchObject({ level: "normal" });
  });

  it("returns insufficient data when neither rate nor weekly impact exists", () => {
    expect(
      classifyRisk({
        ...base,
        foodCostRateAfterBps: null,
        targetFoodCostRateBps: null,
        weeklyImpactMicroYuan: null,
      }),
    ).toMatchObject({ level: "insufficient_data" });
  });
});
