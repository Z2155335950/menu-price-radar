import type { DatabaseSync } from "node:sqlite";

import type {
  AnalysisAdvice,
  AnalysisCalculation,
  AnalysisDishResultView,
  AnalysisSummary,
} from "../domain/analysis";
import { calculateDishCost } from "../domain/costing";
import {
  DEFAULT_RISK_THRESHOLDS,
  classifyRisk,
  type RankingGroup,
  type RiskLevel,
} from "../domain/risk";
import { withTransaction } from "../db/transaction";
import { applyQuotePrices } from "./apply-quote-prices";

const RULES_VERSION = "v0.2";

type QuoteRow = {
  id: number;
  restaurant_id: number;
  supplier_id: number | null;
  quote_date: string | null;
  status: string;
};

type QuoteItemRow = {
  id: number;
  line_no: number;
  ingredient_id: number;
  normalized_unit_price_micro_yuan: number;
  evidence_text: string | null;
};

type IngredientRow = {
  id: number;
  name: string;
  base_unit: "g" | "ml" | "个";
};

type DishRow = {
  id: number;
  name: string;
  selling_price_micro_yuan: number | null;
  target_food_cost_rate_bps: number | null;
  weekly_sales: number | null;
};

type RecipeRow = {
  dish_id: number;
  ingredient_id: number;
  quantity_base: number;
};

type PriceRow = {
  ingredient_id: number;
  price_micro_yuan_per_base_unit: number;
};

type CalculatedDish = AnalysisDishResultView & {
  rankingGroup: RankingGroup;
};

function formatYuanFromMicroYuan(value: number): string {
  return `¥${(value / 1_000_000).toFixed(2)}`;
}

function formatIngredientQuantity(
  quantityBase: number,
  baseUnit: "g" | "ml" | "个",
): string {
  if (baseUnit === "g" || baseUnit === "ml") {
    return `${(quantityBase / 1000).toLocaleString("zh-CN", {
      maximumFractionDigits: 3,
    })} ${baseUnit === "g" ? "kg" : "L"}`;
  }

  return `${quantityBase.toLocaleString("zh-CN")} 个`;
}

function formatIngredientUnitPrice(
  value: number,
  baseUnit: "g" | "ml" | "个",
): string {
  if (baseUnit === "g") {
    return `${formatYuanFromMicroYuan(value * 1000)}/kg`;
  }

  if (baseUnit === "ml") {
    return `${formatYuanFromMicroYuan(value * 1000)}/L`;
  }

  return `${formatYuanFromMicroYuan(value)}/个`;
}

function buildCauseSentence(
  dishName: string,
  calculated: ReturnType<typeof calculateDishCost>,
): string {
  const main = calculated.mainIngredient;

  if (!main) {
    return `${dishName}的单份食材成本发生了变化，但当前数据中没有明确的主要涨价食材。`;
  }

  const changePercent =
    main.oldPriceMicroYuanPerBaseUnit > 0
      ? ((main.newPriceMicroYuanPerBaseUnit -
          main.oldPriceMicroYuanPerBaseUnit) /
          main.oldPriceMicroYuanPerBaseUnit) *
        100
      : null;
  const priceSentence = `“${main.name}”的采购价从 ${formatIngredientUnitPrice(
    main.oldPriceMicroYuanPerBaseUnit,
    main.baseUnit,
  )} 涨到 ${formatIngredientUnitPrice(
    main.newPriceMicroYuanPerBaseUnit,
    main.baseUnit,
  )}${
    changePercent === null
      ? ""
      : `，涨幅 ${changePercent.toFixed(1)}%`
  }`;
  const quantitySentence = `按每份 ${formatIngredientQuantity(
    main.quantityBase,
    main.baseUnit,
  )} 的用量计算，它使单份成本增加了 ${formatYuanFromMicroYuan(
    main.deltaMicroYuan,
  )}`;
  const otherIncreases = calculated.breakdown
    .filter(
      (ingredient) =>
        ingredient.ingredientId !== main.ingredientId &&
        ingredient.deltaMicroYuan > 0,
    )
    .sort((a, b) => b.deltaMicroYuan - a.deltaMicroYuan)
    .slice(0, 2);
  const otherSentence =
    otherIncreases.length > 0
      ? `此外，${otherIncreases
          .map((ingredient) => `“${ingredient.name}”`)
          .join("和")}的价格也上涨，进一步推高了这道菜的成本。`
      : "";
  const weeklySentence =
    calculated.weeklyImpactMicroYuan !== null
      ? `按当前周销量估算，每周食材毛利预计减少 ${formatYuanFromMicroYuan(
          calculated.weeklyImpactMicroYuan,
        )}。`
      : "";

  return `“${dishName}”成本上升，主要是因为${priceSentence}。${quantitySentence}，所以这道菜的单份食材成本从 ${formatYuanFromMicroYuan(
    calculated.costBeforeMicroYuan ?? 0,
  )} 增加到 ${formatYuanFromMicroYuan(
    calculated.costAfterMicroYuan ?? 0,
  )}。${otherSentence}${weeklySentence}`;
}

function buildAdvice(
  dishName: string,
  calculated: ReturnType<typeof calculateDishCost>,
  riskLevel: RiskLevel,
  mainIngredient: ReturnType<typeof calculateDishCost>["mainIngredient"],
  targetFoodCostRateBps: number | null,
  sellingPriceMicroYuan: number | null,
  weeklyImpactMicroYuan: number | null,
): AnalysisAdvice[] {
  const advice: AnalysisAdvice[] = [];
  const causeSentence = buildCauseSentence(dishName, calculated);
  const evidenceRefs =
    mainIngredient?.quoteItemId !== null &&
    mainIngredient?.quoteItemId !== undefined
      ? [`quote_item:${mainIngredient.quoteItemId}`]
      : [];

  if (riskLevel === "critical" || riskLevel === "warning") {
    advice.push({
      type: "verify_quote",
      title: "先核对这次涨价",
      detail: `${causeSentence}请先确认报价日期、包装和单位与原始报价单一致，再决定是否接受。`,
      evidenceRefs,
      facts: {},
    });

    if (
      mainIngredient &&
      calculated.costDeltaMicroYuan !== null
    ) {
      advice.push({
        type: "negotiate",
        title: "针对涨价原因去沟通",
        detail: `${causeSentence}建议拿着这条报价先和供应商核对涨价原因，再决定是否议价或接受。`,
        evidenceRefs,
        facts: {
          costDeltaMicroYuan: calculated.costDeltaMicroYuan,
          weeklyImpactMicroYuan,
        },
      });
    }
  }

  if (
    targetFoodCostRateBps !== null &&
    targetFoodCostRateBps > 0 &&
    calculated.costAfterMicroYuan !== null &&
    calculated.foodCostRateAfterBps !== null &&
    calculated.foodCostRateAfterBps > targetFoodCostRateBps
  ) {
    const requiredPrice = Math.ceil(
      (calculated.costAfterMicroYuan * 10_000) / targetFoodCostRateBps,
    );

    if (
      sellingPriceMicroYuan === null ||
      requiredPrice > sellingPriceMicroYuan
    ) {
      advice.push({
        type: "adjust_price",
        title: "评估调整售价",
        detail: `若只靠调价，按目标食材成本率 ${(
          targetFoodCostRateBps / 100
        ).toFixed(1)}% 测算，最低售价约为 ¥${(
          requiredPrice / 1_000_000
        ).toFixed(2)}。系统不会自动修改菜单。`,
        evidenceRefs,
        facts: {
          requiredSellingPriceMicroYuan: requiredPrice,
          currentSellingPriceMicroYuan: sellingPriceMicroYuan,
          targetFoodCostRateBps,
        },
      });
    }
  }

  if (riskLevel === "critical" && mainIngredient) {
    advice.push({
      type: "adjust_portion",
      title: "复核主料用量和损耗",
      detail: `复核 ${mainIngredient.name} 的单份用量 ${mainIngredient.quantityBase} 基础单位，确认是否存在损耗、试菜或多余分量。不要为了降成本直接减少顾客份量。`,
      evidenceRefs,
      facts: {
        quantityBase: mainIngredient.quantityBase,
      },
    });
  }

  if (riskLevel === "watch") {
    advice.push({
      type: "observe",
      title: "继续观察",
      detail: "当前影响还小，可以继续观察后续报价；如果同一食材连续上涨，再考虑议价或调价。",
      evidenceRefs,
      facts: {},
    });
  }

  return advice;
}

/**
 * 应用价格并生成一次分析快照。
 *
 * 价格历史写入只会发生一次；重复分析不会重复改价。
 */
export function analyzeQuote(
  database: DatabaseSync,
  quoteId: number,
): { analysisId: number; summary: AnalysisSummary } {
  let quote = database
    .prepare(
      `
        SELECT id, restaurant_id, supplier_id, quote_date, status
        FROM quotes
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(quoteId) as QuoteRow | undefined;

  if (!quote) {
    throw new Error("找不到这份报价。");
  }

  if (quote.status === "ready") {
    applyQuotePrices(database, quoteId);
    quote = database
      .prepare(
        `
          SELECT id, restaurant_id, supplier_id, quote_date, status
          FROM quotes
          WHERE id = ?
          LIMIT 1
        `,
      )
      .get(quoteId) as QuoteRow;
  }

  if (quote.status !== "applied") {
    throw new Error("报价还没有完成确认或价格应用，不能分析。");
  }

  if (!quote.quote_date) {
    throw new Error("报价日期缺失，不能分析。");
  }

  const quoteItems = database
    .prepare(
      `
        SELECT
          id, line_no, ingredient_id,
          normalized_unit_price_micro_yuan, evidence_text
        FROM quote_items
        WHERE quote_id = ?
          AND ingredient_id IS NOT NULL
          AND normalized_unit_price_micro_yuan IS NOT NULL
        ORDER BY line_no
      `,
    )
    .all(quoteId) as QuoteItemRow[];

  const quoteItemByIngredient = new Map<number, QuoteItemRow>();
  for (const item of quoteItems) {
    quoteItemByIngredient.set(item.ingredient_id, item);
  }

  const ingredients = database
    .prepare(
      "SELECT id, name, base_unit FROM ingredients WHERE restaurant_id = ?",
    )
    .all(quote.restaurant_id) as IngredientRow[];
  const ingredientById = new Map(
    ingredients.map((ingredient) => [ingredient.id, ingredient]),
  );

  const oldPriceRows = database
    .prepare(
      `
        SELECT ph.ingredient_id, ph.price_micro_yuan_per_base_unit
        FROM price_history ph
        JOIN ingredients i ON i.id = ph.ingredient_id
        WHERE i.restaurant_id = ? AND ph.effective_date < ?
        ORDER BY ph.ingredient_id, ph.effective_date DESC, ph.id DESC
      `,
    )
    .all(quote.restaurant_id, quote.quote_date) as PriceRow[];
  const oldPrices = new Map<number, number>();
  for (const row of oldPriceRows) {
    if (!oldPrices.has(row.ingredient_id)) {
      oldPrices.set(row.ingredient_id, row.price_micro_yuan_per_base_unit);
    }
  }

  const dishes = database
    .prepare(
      `
        SELECT
          id, name, selling_price_micro_yuan,
          target_food_cost_rate_bps, weekly_sales
        FROM dishes
        WHERE restaurant_id = ? AND is_active = 1
        ORDER BY id
      `,
    )
    .all(quote.restaurant_id) as DishRow[];

  const recipeRows = database
    .prepare(
      `
        SELECT di.dish_id, di.ingredient_id, di.quantity_base
        FROM dish_ingredients di
        JOIN dishes d ON d.id = di.dish_id
        WHERE d.restaurant_id = ? AND d.is_active = 1
        ORDER BY di.dish_id, di.sort_order, di.id
      `,
    )
    .all(quote.restaurant_id) as RecipeRow[];

  const recipeByDish = new Map<number, RecipeRow[]>();
  for (const row of recipeRows) {
    const lines = recipeByDish.get(row.dish_id) ?? [];
    lines.push(row);
    recipeByDish.set(row.dish_id, lines);
  }

  const calculated: CalculatedDish[] = [];
  let skippedDishes = 0;

  for (const dish of dishes) {
    const recipe = recipeByDish.get(dish.id) ?? [];

    if (recipe.length === 0) {
      skippedDishes += 1;
      continue;
    }

    const costing = calculateDishCost({
      sellingPriceMicroYuan: dish.selling_price_micro_yuan,
      targetFoodCostRateBps: dish.target_food_cost_rate_bps,
      weeklySales: dish.weekly_sales,
      ingredients: recipe.map((line) => {
        const ingredient = ingredientById.get(line.ingredient_id);
        const quoteItem = quoteItemByIngredient.get(line.ingredient_id);
        const oldPrice = oldPrices.get(line.ingredient_id) ?? null;
        const newPrice =
          quoteItem?.normalized_unit_price_micro_yuan ?? oldPrice;

        return {
          ingredientId: line.ingredient_id,
          name: ingredient?.name ?? `食材 ${line.ingredient_id}`,
          baseUnit: ingredient?.base_unit ?? "g",
          quantityBase: line.quantity_base,
          oldPriceMicroYuanPerBaseUnit: oldPrice,
          newPriceMicroYuanPerBaseUnit: newPrice,
          quoteItemId: quoteItem?.id ?? null,
          evidenceText: quoteItem?.evidence_text ?? null,
          lineNo: quoteItem?.line_no ?? null,
        };
      }),
    });

    if (
      costing.costBeforeMicroYuan === null ||
      costing.costAfterMicroYuan === null ||
      costing.costDeltaMicroYuan === null
    ) {
      skippedDishes += 1;
      continue;
    }

    if (costing.costDeltaMicroYuan <= 0) {
      continue;
    }

    const risk = classifyRisk({
      costDeltaMicroYuan: costing.costDeltaMicroYuan,
      foodCostRateAfterBps: costing.foodCostRateAfterBps,
      targetFoodCostRateBps: dish.target_food_cost_rate_bps,
      weeklyImpactMicroYuan: costing.weeklyImpactMicroYuan,
    });
    const rankingGroup: RankingGroup =
      dish.weekly_sales !== null ? "weekly" : "per_serving";
    const main = costing.mainIngredient;
    const advice = buildAdvice(
      dish.name,
      costing,
      risk.level,
      main,
      dish.target_food_cost_rate_bps,
      dish.selling_price_micro_yuan,
      costing.weeklyImpactMicroYuan,
    );
    const priceChangeRatio = main?.deltaMicroYuan
      ? main.deltaMicroYuan / main.oldCostMicroYuan
      : null;

    const calculation: AnalysisCalculation = {
      sellingPriceMicroYuan: dish.selling_price_micro_yuan,
      targetFoodCostRateBps: dish.target_food_cost_rate_bps,
      weeklySales: dish.weekly_sales,
      costBeforeMicroYuan: costing.costBeforeMicroYuan,
      costAfterMicroYuan: costing.costAfterMicroYuan,
      costDeltaMicroYuan: costing.costDeltaMicroYuan,
      foodCostRateBeforeBps: costing.foodCostRateBeforeBps,
      foodCostRateAfterBps: costing.foodCostRateAfterBps,
      weeklyImpactMicroYuan: costing.weeklyImpactMicroYuan,
      priceChangeRatio,
      causeSentence: buildCauseSentence(dish.name, costing),
      mainIngredient: main,
      ingredients: costing.breakdown,
      advice,
      riskReason: risk.reason,
      thresholds: DEFAULT_RISK_THRESHOLDS,
    };

    calculated.push({
      id: 0,
      dishId: dish.id,
      dishName: dish.name,
      costBeforeMicroYuan: costing.costBeforeMicroYuan,
      costAfterMicroYuan: costing.costAfterMicroYuan,
      costDeltaMicroYuan: costing.costDeltaMicroYuan,
      foodCostRateBeforeBps: costing.foodCostRateBeforeBps,
      foodCostRateAfterBps: costing.foodCostRateAfterBps,
      targetFoodCostRateBps: dish.target_food_cost_rate_bps,
      weeklySales: dish.weekly_sales,
      weeklyImpactMicroYuan: costing.weeklyImpactMicroYuan,
      riskLevel: risk.level,
      rankingGroup,
      rankPosition: null,
      calculation,
      dataQuality: costing.dataQuality,
    });
  }

  const weeklyGroup = calculated
    .filter((item) => item.rankingGroup === "weekly")
    .sort(
      (a, b) =>
        (b.weeklyImpactMicroYuan ?? 0) -
          (a.weeklyImpactMicroYuan ?? 0) ||
        (b.calculation.foodCostRateAfterBps ?? 0) -
          (a.calculation.foodCostRateAfterBps ?? 0) ||
        b.costDeltaMicroYuan - a.costDeltaMicroYuan ||
        a.dishId - b.dishId,
    );
  const perServingGroup = calculated
    .filter((item) => item.rankingGroup === "per_serving")
    .sort(
      (a, b) =>
        b.costDeltaMicroYuan - a.costDeltaMicroYuan ||
        (b.calculation.foodCostRateAfterBps ?? 0) -
          (a.calculation.foodCostRateAfterBps ?? 0) ||
        a.dishId - b.dishId,
    );
  const ordered = [...weeklyGroup, ...perServingGroup].map((item, index) => ({
    ...item,
    rankPosition: index + 1,
  }));

  const summary: AnalysisSummary = {
    affectedDishes: ordered.length,
    critical: ordered.filter((item) => item.riskLevel === "critical").length,
    warning: ordered.filter((item) => item.riskLevel === "warning").length,
    watch: ordered.filter((item) => item.riskLevel === "watch").length,
    missingSales: ordered.filter(
      (item) => item.weeklyImpactMicroYuan === null,
    ).length,
    totalWeeklyImpactMicroYuan: weeklyGroup.reduce(
      (sum, item) => sum + (item.weeklyImpactMicroYuan ?? 0),
      0,
    ),
    skippedDishes,
  };

  let analysisId = 0;

  withTransaction(database, () => {
    const runResult = database
      .prepare(
        `
          INSERT INTO analysis_runs (
            restaurant_id, quote_id, status, rules_version,
            thresholds_json, started_at
          ) VALUES (?, ?, 'running', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        `,
      )
      .run(
        quote.restaurant_id,
        quoteId,
        RULES_VERSION,
        JSON.stringify({
          risk: DEFAULT_RISK_THRESHOLDS,
          abnormalPriceRatio: 0.3,
        }),
      );

    analysisId = Number(runResult.lastInsertRowid);

    database
      .prepare(
        `
          INSERT INTO audit_events (
            restaurant_id, quote_id, analysis_run_id,
            entity_type, entity_id, event_type,
            actor_type, actor_label, payload_json
          ) VALUES (?, ?, ?, 'analysis_run', ?, 'analysis_started', 'system', 'cost-engine', ?)
        `,
      )
      .run(
        quote.restaurant_id,
        quoteId,
        analysisId,
        analysisId,
        JSON.stringify({ rulesVersion: RULES_VERSION }),
      );

    const insertResult = database.prepare(
      `
        INSERT INTO analysis_dish_results (
          analysis_run_id, dish_id, dish_name_snapshot,
          cost_before_micro_yuan, cost_after_micro_yuan,
          cost_delta_micro_yuan, food_cost_rate_before_bps,
          food_cost_rate_after_bps, target_food_cost_rate_bps,
          weekly_sales, weekly_impact_micro_yuan,
          risk_level, ranking_group, rank_position,
          calculation_json, data_quality_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    for (const result of ordered) {
      insertResult.run(
        analysisId,
        result.dishId,
        result.dishName,
        result.costBeforeMicroYuan,
        result.costAfterMicroYuan,
        result.costDeltaMicroYuan,
        result.foodCostRateBeforeBps,
        result.foodCostRateAfterBps,
        result.targetFoodCostRateBps,
        result.weeklySales,
        result.weeklyImpactMicroYuan,
        result.riskLevel,
        result.rankingGroup,
        result.rankPosition,
        JSON.stringify(result.calculation),
        JSON.stringify(result.dataQuality),
      );
    }

    database
      .prepare(
        `
          UPDATE analysis_runs
          SET status = 'completed',
              summary_json = ?,
              completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?
        `,
      )
      .run(JSON.stringify(summary), analysisId);

    database
      .prepare(
        `
          INSERT INTO audit_events (
            restaurant_id, quote_id, analysis_run_id,
            entity_type, entity_id, event_type,
            actor_type, actor_label, payload_json
          ) VALUES (?, ?, ?, 'analysis_run', ?, 'analysis_completed', 'system', 'cost-engine', ?)
        `,
      )
      .run(
        quote.restaurant_id,
        quoteId,
        analysisId,
        analysisId,
        JSON.stringify({ summary }),
      );

    database
      .prepare(
        `
          INSERT INTO audit_events (
            restaurant_id, quote_id, analysis_run_id,
            entity_type, entity_id, event_type,
            actor_type, actor_label, payload_json
          ) VALUES (?, ?, ?, 'analysis_run', ?, 'advice_generated', 'system', 'rule-engine', ?)
        `,
      )
      .run(
        quote.restaurant_id,
        quoteId,
        analysisId,
        analysisId,
        JSON.stringify({ adviceCount: ordered.reduce((n, item) => n + item.calculation.advice.length, 0) }),
      );
  });

  return { analysisId, summary };
}
