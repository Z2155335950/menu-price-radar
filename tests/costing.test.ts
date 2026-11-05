import { describe, expect, it } from "vitest";

import { calculateDishCost } from "../src/domain/costing";

describe("dish costing", () => {
  it("computes before/after costs and weekly impact", () => {
    const result = calculateDishCost({
      sellingPriceMicroYuan: 26_000_000,
      targetFoodCostRateBps: 3500,
      weeklySales: 600,
      ingredients: [
        {
          ingredientId: 1,
          name: "去骨鸡腿",
          quantityBase: 250,
          oldPriceMicroYuanPerBaseUnit: 18_000,
          newPriceMicroYuanPerBaseUnit: 22_000,
          quoteItemId: 10,
          evidenceText: "去骨鸡腿 2袋×5kg 220.00",
          lineNo: 1,
        },
        {
          ingredientId: 2,
          name: "宫保酱汁",
          quantityBase: 100,
          oldPriceMicroYuanPerBaseUnit: 25_000,
          newPriceMicroYuanPerBaseUnit: 25_000,
          quoteItemId: null,
          evidenceText: null,
          lineNo: null,
        },
        {
          ingredientId: 3,
          name: "花生米",
          quantityBase: 50,
          oldPriceMicroYuanPerBaseUnit: 18_000,
          newPriceMicroYuanPerBaseUnit: 18_000,
          quoteItemId: null,
          evidenceText: null,
          lineNo: null,
        },
        {
          ingredientId: 4,
          name: "黄瓜",
          quantityBase: 100,
          oldPriceMicroYuanPerBaseUnit: 5000,
          newPriceMicroYuanPerBaseUnit: 5000,
          quoteItemId: null,
          evidenceText: null,
          lineNo: null,
        },
        {
          ingredientId: 5,
          name: "干辣椒",
          quantityBase: 50,
          oldPriceMicroYuanPerBaseUnit: 20_000,
          newPriceMicroYuanPerBaseUnit: 20_000,
          quoteItemId: null,
          evidenceText: null,
          lineNo: null,
        },
        {
          ingredientId: 6,
          name: "食用油",
          quantityBase: 30,
          oldPriceMicroYuanPerBaseUnit: 12_000,
          newPriceMicroYuanPerBaseUnit: 12_000,
          quoteItemId: null,
          evidenceText: null,
          lineNo: null,
        },
        {
          ingredientId: 7,
          name: "大蒜",
          quantityBase: 20,
          oldPriceMicroYuanPerBaseUnit: 12_000,
          newPriceMicroYuanPerBaseUnit: 12_000,
          quoteItemId: null,
          evidenceText: null,
          lineNo: null,
        },
      ],
    });

    expect(result.costBeforeMicroYuan).toBe(10_000_000);
    expect(result.costAfterMicroYuan).toBe(11_000_000);
    expect(result.costDeltaMicroYuan).toBe(1_000_000);
    expect(result.foodCostRateBeforeBps).toBe(3846);
    expect(result.foodCostRateAfterBps).toBe(4231);
    expect(result.weeklyImpactMicroYuan).toBe(600_000_000);
    expect(result.mainIngredient?.name).toBe("去骨鸡腿");
  });

  it("returns nulls when an old price is missing", () => {
    const result = calculateDishCost({
      sellingPriceMicroYuan: 10_000_000,
      targetFoodCostRateBps: 3000,
      weeklySales: 100,
      ingredients: [
        {
          ingredientId: 1,
          name: "未知食材",
          quantityBase: 100,
          oldPriceMicroYuanPerBaseUnit: null,
          newPriceMicroYuanPerBaseUnit: 10_000,
          quoteItemId: 1,
          evidenceText: "未知食材 100g 10元",
          lineNo: 1,
        },
      ],
    });

    expect(result.costBeforeMicroYuan).toBeNull();
    expect(result.foodCostRateAfterBps).toBeNull();
    expect(result.weeklyImpactMicroYuan).toBeNull();
    expect(result.dataQuality).toContain("missing_old_price:1");
  });

  it("does not invent weekly impact when sales are missing", () => {
    const result = calculateDishCost({
      sellingPriceMicroYuan: 20_000_000,
      targetFoodCostRateBps: 2500,
      weeklySales: null,
      ingredients: [
        {
          ingredientId: 1,
          name: "番茄",
          quantityBase: 200,
          oldPriceMicroYuanPerBaseUnit: 5000,
          newPriceMicroYuanPerBaseUnit: 5400,
          quoteItemId: 1,
          evidenceText: "番茄 8kg 43.20",
          lineNo: 1,
        },
      ],
    });

    expect(result.costDeltaMicroYuan).toBe(80_000);
    expect(result.weeklyImpactMicroYuan).toBeNull();
    expect(result.dataQuality).toContain("missing_weekly_sales");
  });
});
