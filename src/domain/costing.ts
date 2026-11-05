export type CostingIngredient = {
  ingredientId: number;
  name: string;
  baseUnit?: "g" | "ml" | "个";
  quantityBase: number;
  oldPriceMicroYuanPerBaseUnit: number | null;
  newPriceMicroYuanPerBaseUnit: number | null;
  quoteItemId: number | null;
  evidenceText: string | null;
  lineNo: number | null;
};

export type DishCostInput = {
  sellingPriceMicroYuan: number | null;
  targetFoodCostRateBps: number | null;
  weeklySales: number | null;
  ingredients: CostingIngredient[];
};

export type IngredientCostBreakdown = {
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

export type DishCostResult = {
  costBeforeMicroYuan: number | null;
  costAfterMicroYuan: number | null;
  costDeltaMicroYuan: number | null;
  foodCostRateBeforeBps: number | null;
  foodCostRateAfterBps: number | null;
  weeklyImpactMicroYuan: number | null;
  breakdown: IngredientCostBreakdown[];
  mainIngredient: IngredientCostBreakdown | null;
  dataQuality: string[];
};

/**
 * 用菜谱用量和价格计算单份食材成本。
 *
 * 所有金额都是整数微元，数量都是整数基础单位。
 * 没有历史价格的菜品返回 null，而不是用 0 代替。
 */
export function calculateDishCost(input: DishCostInput): DishCostResult {
  const dataQuality: string[] = [];
  const breakdown: IngredientCostBreakdown[] = [];
  let costBefore = 0;
  let costAfter = 0;
  let complete = true;

  for (const ingredient of input.ingredients) {
    if (ingredient.oldPriceMicroYuanPerBaseUnit === null) {
      dataQuality.push(`missing_old_price:${ingredient.ingredientId}`);
      complete = false;
      continue;
    }

    if (ingredient.newPriceMicroYuanPerBaseUnit === null) {
      dataQuality.push(`missing_new_price:${ingredient.ingredientId}`);
      complete = false;
      continue;
    }

    const oldCost =
      ingredient.quantityBase * ingredient.oldPriceMicroYuanPerBaseUnit;
    const newCost =
      ingredient.quantityBase * ingredient.newPriceMicroYuanPerBaseUnit;

    costBefore += oldCost;
    costAfter += newCost;

    breakdown.push({
      ingredientId: ingredient.ingredientId,
      name: ingredient.name,
      baseUnit: ingredient.baseUnit ?? "g",
      quantityBase: ingredient.quantityBase,
      oldPriceMicroYuanPerBaseUnit:
        ingredient.oldPriceMicroYuanPerBaseUnit,
      newPriceMicroYuanPerBaseUnit:
        ingredient.newPriceMicroYuanPerBaseUnit,
      oldCostMicroYuan: oldCost,
      newCostMicroYuan: newCost,
      deltaMicroYuan: newCost - oldCost,
      quoteItemId: ingredient.quoteItemId,
      evidenceText: ingredient.evidenceText,
      lineNo: ingredient.lineNo,
    });
  }

  if (!complete) {
    return {
      costBeforeMicroYuan: null,
      costAfterMicroYuan: null,
      costDeltaMicroYuan: null,
      foodCostRateBeforeBps: null,
      foodCostRateAfterBps: null,
      weeklyImpactMicroYuan: null,
      breakdown,
      mainIngredient: null,
      dataQuality,
    };
  }

  const costDelta = costAfter - costBefore;
  const price = input.sellingPriceMicroYuan;
  const foodCostRateBeforeBps =
    price !== null && price > 0
      ? Math.round((costBefore * 10_000) / price)
      : null;
  const foodCostRateAfterBps =
    price !== null && price > 0
      ? Math.round((costAfter * 10_000) / price)
      : null;
  const weeklyImpact =
    input.weeklySales !== null ? costDelta * input.weeklySales : null;

  if (input.weeklySales === null) {
    dataQuality.push("missing_weekly_sales");
  }

  if (price === null) {
    dataQuality.push("missing_selling_price");
  }

  if (input.targetFoodCostRateBps === null) {
    dataQuality.push("missing_target_food_cost_rate");
  }

  const mainIngredient = [...breakdown]
    .filter((item) => item.deltaMicroYuan > 0)
    .sort((a, b) => b.deltaMicroYuan - a.deltaMicroYuan)[0] ?? null;

  return {
    costBeforeMicroYuan: costBefore,
    costAfterMicroYuan: costAfter,
    costDeltaMicroYuan: costDelta,
    foodCostRateBeforeBps,
    foodCostRateAfterBps,
    weeklyImpactMicroYuan: weeklyImpact,
    breakdown,
    mainIngredient,
    dataQuality,
  };
}
