import { readFileSync, unlinkSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { normalizeName } from "../../domain/normalize.ts";
import { withTransaction } from "../transaction.ts";

const DEMO_RESTAURANT_NAME = "临江小馆";
const DEMO_SEED_PATH = fileURLToPath(
  new URL("../../../data/fixtures/demo-seed.json", import.meta.url),
);

type BaseUnit = "g" | "ml" | "个";

type DemoAlias = {
  alias: string;
  supplierKey?: string | null;
};

type DemoIngredient = {
  key: string;
  name: string;
  baseUnit: BaseUnit;
  aliases?: DemoAlias[];
};

type DemoUnitConversion = {
  ingredientKey?: string | null;
  fromUnit: string;
  toUnit: string;
  factor: number;
  source: "system" | "user_confirmed";
};

type DemoRecipeLine = {
  ingredientKey: string;
  quantityBase: number;
};

type DemoDish = {
  key: string;
  name: string;
  sellingPriceMicroYuan: number;
  targetFoodCostRateBps: number;
  weeklySales: number | null;
  recipe: DemoRecipeLine[];
};

type DemoPriceHistory = {
  ingredientKey: string;
  supplierKey?: string | null;
  priceMicroPerBaseUnit: number;
  effectiveDate: string;
};

type DemoQuoteItem = {
  lineNo: number;
  itemNameRaw: string;
  ingredientKey: string;
  quantityValue: string | null;
  quantityUnit: string | null;
  packageSpecRaw: string | null;
  packageQuantityValue: string | null;
  packageUnit: string | null;
  priceType: "total" | "unit" | null;
  priceValueMicroYuan: number | null;
  priceUnit: string | null;
  lineTotalMicroYuan: number | null;
  normalizedQuantityBase: number | null;
  baseUnit: BaseUnit | null;
  normalizedUnitPriceMicroYuan: number | null;
  confidence: number | null;
  fieldConfidence: Record<string, number>;
  evidenceText: string | null;
  evidencePage: number | null;
  matchMethod:
    | "exact_alias"
    | "exact_name"
    | "normalized_name"
    | "confirmed"
    | "ai_suggested"
    | "manual"
    | null;
  matchConfidence: number | null;
  matchEvidence: string | null;
  status: "draft" | "needs_confirmation" | "ready" | "applied" | "skipped" | "failed";
};

type DemoQuote = {
  supplierKey: string;
  supplierNameRaw: string;
  quoteDate: string;
  currency: string;
  sourceType: "text" | "image" | "pdf";
  sourceText: string;
  status: "draft" | "extracting" | "extracted" | "needs_confirmation" | "ready" | "applied" | "failed";
  items: DemoQuoteItem[];
};

type DemoSeedData = {
  restaurant: {
    name: string;
    currency: string;
    timezone: string;
  };
  suppliers: Array<{ key: string; name: string }>;
  ingredients: DemoIngredient[];
  unitConversions: DemoUnitConversion[];
  dishes: DemoDish[];
  priceHistory: DemoPriceHistory[];
  quote: DemoQuote;
};

export type DemoCounts = {
  restaurants: number;
  suppliers: number;
  ingredients: number;
  aliases: number;
  unitConversions: number;
  dishes: number;
  recipeLines: number;
  quotes: number;
  quoteItems: number;
  priceHistory: number;
};

export type DemoSeedResult = {
  seeded: boolean;
  restaurantId: number;
  counts: DemoCounts;
};

export type DemoResetResult = DemoSeedResult & {
  deleted: boolean;
};

const EMPTY_COUNTS: DemoCounts = {
  restaurants: 0,
  suppliers: 0,
  ingredients: 0,
  aliases: 0,
  unitConversions: 0,
  dishes: 0,
  recipeLines: 0,
  quotes: 0,
  quoteItems: 0,
  priceHistory: 0,
};

function loadDemoSeedData(): DemoSeedData {
  const parsed = JSON.parse(readFileSync(DEMO_SEED_PATH, "utf8")) as DemoSeedData;

  if (
    !parsed?.restaurant ||
    !Array.isArray(parsed.suppliers) ||
    !Array.isArray(parsed.ingredients) ||
    !Array.isArray(parsed.dishes) ||
    !Array.isArray(parsed.priceHistory) ||
    !parsed.quote
  ) {
    throw new Error("演示数据文件结构不完整，请检查 data/fixtures/demo-seed.json。");
  }

  return parsed;
}

function getDemoRestaurantId(database: DatabaseSync): number | null {
  const row = database
    .prepare("SELECT id FROM restaurants WHERE name = ?")
    .get(DEMO_RESTAURANT_NAME) as { id: number } | undefined;

  return row?.id ?? null;
}

function count(database: DatabaseSync, sql: string, ...params: number[]): number {
  const row = database.prepare(sql).get(...params) as { count: number };
  return Number(row.count);
}

export function getDemoCounts(database: DatabaseSync): DemoCounts {
  const restaurantId = getDemoRestaurantId(database);

  if (restaurantId === null) {
    return { ...EMPTY_COUNTS };
  }

  return {
    restaurants: 1,
    suppliers: count(
      database,
      "SELECT COUNT(*) AS count FROM suppliers WHERE restaurant_id = ?",
      restaurantId,
    ),
    ingredients: count(
      database,
      "SELECT COUNT(*) AS count FROM ingredients WHERE restaurant_id = ?",
      restaurantId,
    ),
    aliases: count(
      database,
      "SELECT COUNT(*) AS count FROM ingredient_aliases WHERE restaurant_id = ?",
      restaurantId,
    ),
    unitConversions: count(
      database,
      "SELECT COUNT(*) AS count FROM unit_conversions WHERE restaurant_id = ?",
      restaurantId,
    ),
    dishes: count(
      database,
      "SELECT COUNT(*) AS count FROM dishes WHERE restaurant_id = ?",
      restaurantId,
    ),
    recipeLines: count(
      database,
      `
        SELECT COUNT(*) AS count
        FROM dish_ingredients di
        JOIN dishes d ON d.id = di.dish_id
        WHERE d.restaurant_id = ?
      `,
      restaurantId,
    ),
    quotes: count(
      database,
      "SELECT COUNT(*) AS count FROM quotes WHERE restaurant_id = ?",
      restaurantId,
    ),
    quoteItems: count(
      database,
      `
        SELECT COUNT(*) AS count
        FROM quote_items qi
        JOIN quotes q ON q.id = qi.quote_id
        WHERE q.restaurant_id = ?
      `,
      restaurantId,
    ),
    priceHistory: count(
      database,
      `
        SELECT COUNT(*) AS count
        FROM price_history ph
        JOIN ingredients i ON i.id = ph.ingredient_id
        WHERE i.restaurant_id = ?
      `,
      restaurantId,
    ),
  };
}

/**
 * 写入固定演示数据。
 *
 * 如果“临江小馆”已经存在，则不再重复插入，直接返回当前计数。
 * 需要重建时使用 resetDemoData()。
 */
export function seedDemoData(database: DatabaseSync): DemoSeedResult {
  const existingRestaurantId = getDemoRestaurantId(database);

  if (existingRestaurantId !== null) {
    return {
      seeded: false,
      restaurantId: existingRestaurantId,
      counts: getDemoCounts(database),
    };
  }

  const data = loadDemoSeedData();
  let restaurantId = 0;

  withTransaction(database, () => {
    const restaurantResult = database
      .prepare(
        "INSERT INTO restaurants (name, currency, timezone) VALUES (?, ?, ?)",
      )
      .run(
        data.restaurant.name,
        data.restaurant.currency,
        data.restaurant.timezone,
      );
    restaurantId = Number(restaurantResult.lastInsertRowid);

    const supplierIds = new Map<string, number>();

    for (const supplier of data.suppliers) {
      const result = database
        .prepare(
          "INSERT INTO suppliers (restaurant_id, name, normalized_name) VALUES (?, ?, ?)",
        )
        .run(restaurantId, supplier.name, normalizeName(supplier.name));
      supplierIds.set(supplier.key, Number(result.lastInsertRowid));
    }

    const ingredientIds = new Map<string, number>();

    for (const ingredient of data.ingredients) {
      const result = database
        .prepare(
          "INSERT INTO ingredients (restaurant_id, name, normalized_name, base_unit) VALUES (?, ?, ?, ?)",
        )
        .run(
          restaurantId,
          ingredient.name,
          normalizeName(ingredient.name),
          ingredient.baseUnit,
        );
      ingredientIds.set(ingredient.key, Number(result.lastInsertRowid));
    }

    const requireIngredientId = (key: string): number => {
      const id = ingredientIds.get(key);

      if (!id) {
        throw new Error(`演示数据引用了不存在的食材：${key}`);
      }

      return id;
    };

    const requireSupplierId = (key: string): number => {
      const id = supplierIds.get(key);

      if (!id) {
        throw new Error(`演示数据引用了不存在的供应商：${key}`);
      }

      return id;
    };

    for (const ingredient of data.ingredients) {
      for (const alias of ingredient.aliases ?? []) {
        const supplierId = alias.supplierKey
          ? requireSupplierId(alias.supplierKey)
          : null;

        database
          .prepare(
            `
              INSERT INTO ingredient_aliases (
                restaurant_id, ingredient_id, supplier_id,
                alias, normalized_alias, source
              ) VALUES (?, ?, ?, ?, ?, 'seed')
            `,
          )
          .run(
            restaurantId,
            requireIngredientId(ingredient.key),
            supplierId,
            alias.alias,
            normalizeName(alias.alias),
          );
      }
    }

    for (const conversion of data.unitConversions) {
      const ingredientId = conversion.ingredientKey
        ? requireIngredientId(conversion.ingredientKey)
        : null;

      database
        .prepare(
          `
            INSERT INTO unit_conversions (
              restaurant_id, ingredient_id, from_unit, to_unit, factor, source
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          restaurantId,
          ingredientId,
          conversion.fromUnit,
          conversion.toUnit,
          conversion.factor,
          conversion.source,
        );
    }

    const dishIds = new Map<string, number>();

    for (const dish of data.dishes) {
      const result = database
        .prepare(
          `
            INSERT INTO dishes (
              restaurant_id, name, normalized_name, selling_price_micro_yuan,
              target_food_cost_rate_bps, weekly_sales
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          restaurantId,
          dish.name,
          normalizeName(dish.name),
          dish.sellingPriceMicroYuan,
          dish.targetFoodCostRateBps,
          dish.weeklySales,
        );

      const dishId = Number(result.lastInsertRowid);
      dishIds.set(dish.key, dishId);

      dish.recipe.forEach((line, index) => {
        database
          .prepare(
            `
              INSERT INTO dish_ingredients (
                dish_id, ingredient_id, quantity_base, sort_order
              ) VALUES (?, ?, ?, ?)
            `,
          )
          .run(
            dishId,
            requireIngredientId(line.ingredientKey),
            line.quantityBase,
            index + 1,
          );
      });
    }

    const supplierId = requireSupplierId(data.quote.supplierKey);

    const quoteResult = database
      .prepare(
        `
          INSERT INTO quotes (
            restaurant_id, supplier_id, supplier_name_raw, quote_date,
            currency, source_type, source_file_path, source_text, status
          ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
        `,
      )
      .run(
        restaurantId,
        supplierId,
        data.quote.supplierNameRaw,
        data.quote.quoteDate,
        data.quote.currency,
        data.quote.sourceType,
        data.quote.sourceText,
        data.quote.status,
      );

    const quoteId = Number(quoteResult.lastInsertRowid);

    for (const item of data.quote.items) {
      database
        .prepare(
          `
            INSERT INTO quote_items (
              quote_id, line_no, item_name_raw, ingredient_id,
              quantity_value, quantity_unit, package_spec_raw,
              package_quantity_value, package_unit, price_type,
              price_value_micro_yuan, price_unit, line_total_micro_yuan,
              normalized_quantity_base, base_unit,
              normalized_unit_price_micro_yuan, confidence,
              field_confidence_json, evidence_text, evidence_page,
              evidence_bbox_json, match_method, match_confidence,
              match_evidence, status
            ) VALUES (
              ?, ?, ?, ?,
              ?, ?, ?,
              ?, ?, ?,
              ?, ?, ?,
              ?, ?,
              ?, ?,
              ?, ?, ?,
              NULL, ?, ?,
              ?, ?
            )
          `,
        )
        .run(
          quoteId,
          item.lineNo,
          item.itemNameRaw,
          requireIngredientId(item.ingredientKey),
          item.quantityValue,
          item.quantityUnit,
          item.packageSpecRaw,
          item.packageQuantityValue,
          item.packageUnit,
          item.priceType,
          item.priceValueMicroYuan,
          item.priceUnit,
          item.lineTotalMicroYuan,
          item.normalizedQuantityBase,
          item.baseUnit,
          item.normalizedUnitPriceMicroYuan,
          item.confidence,
          JSON.stringify(item.fieldConfidence),
          item.evidenceText,
          item.evidencePage,
          item.matchMethod,
          item.matchConfidence,
          item.matchEvidence,
          item.status,
        );
    }

    for (const price of data.priceHistory) {
      const historySupplierId = price.supplierKey
        ? requireSupplierId(price.supplierKey)
        : null;

      database
        .prepare(
          `
            INSERT INTO price_history (
              ingredient_id, supplier_id, quote_id, quote_item_id,
              price_micro_yuan_per_base_unit, effective_date, source, note
            ) VALUES (?, ?, NULL, NULL, ?, ?, 'manual', ?)
          `,
        )
        .run(
          requireIngredientId(price.ingredientKey),
          historySupplierId,
          price.priceMicroPerBaseUnit,
          price.effectiveDate,
          "演示初始价格",
        );
    }
  });

  return {
    seeded: true,
    restaurantId,
    counts: getDemoCounts(database),
  };
}

function deleteSourceFiles(filePaths: string[]): void {
  const uploadsRoot = resolve(process.cwd(), "data", "uploads");

  for (const filePath of filePaths) {
    const absolutePath = resolve(process.cwd(), filePath);
    const relativeToUploads = relative(uploadsRoot, absolutePath);

    if (
      relativeToUploads.startsWith("..") ||
      isAbsolute(relativeToUploads)
    ) {
      continue;
    }

    try {
      unlinkSync(absolutePath);
    } catch {
      // 文件可能已经被手动删除；数据库重建不应因此失败。
    }
  }
}

/**
 * 删除“临江小馆”及其所有关联演示数据，然后重新导入。
 * 不会删除其他餐厅的数据；会清理演示报价关联的上传原件。
 */
export function resetDemoData(database: DatabaseSync): DemoResetResult {
  const existingRestaurantId = getDemoRestaurantId(database);
  let deleted = false;
  let sourceFiles: string[] = [];

  if (existingRestaurantId !== null) {
    const sourceRows = database
      .prepare(
        `
          SELECT source_file_path
          FROM quotes
          WHERE restaurant_id = ? AND source_file_path IS NOT NULL
        `,
      )
      .all(existingRestaurantId) as Array<{ source_file_path: string }>;
    sourceFiles = sourceRows.map((row) => row.source_file_path);

    withTransaction(database, () => {
      database
        .prepare("DELETE FROM restaurants WHERE id = ?")
        .run(existingRestaurantId);
    });
    deleted = true;
    deleteSourceFiles(sourceFiles);
  }

  const seeded = seedDemoData(database);

  return {
    deleted,
    ...seeded,
  };
}
