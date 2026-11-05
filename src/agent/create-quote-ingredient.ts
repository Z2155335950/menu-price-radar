import type { DatabaseSync } from "node:sqlite";

import { withTransaction } from "../db/transaction";
import type { CreateQuoteIngredientInput } from "../domain/catalog";
import type { StandardizationResult } from "../domain/standardization";
import { normalizeName } from "../domain/normalize";
import { yuanStringToMicroYuan } from "../domain/money";
import { standardizeQuote } from "./standardize-quote";

type QuoteItemRow = {
  quote_id: number;
  item_name_raw: string;
  restaurant_id: number;
  supplier_id: number | null;
  quote_date: string | null;
  quote_status: string;
};

type IngredientRow = {
  id: number;
  name: string;
  base_unit: "g" | "ml" | "个";
};

function getQuoteItem(
  database: DatabaseSync,
  quoteId: number,
  quoteItemId: number,
): QuoteItemRow {
  const item = database
    .prepare(
      `
        SELECT
          qi.quote_id, qi.item_name_raw,
          q.restaurant_id, q.supplier_id, q.quote_date,
          q.status AS quote_status
        FROM quote_items qi
        JOIN quotes q ON q.id = qi.quote_id
        WHERE qi.id = ? AND qi.quote_id = ?
        LIMIT 1
      `,
    )
    .get(quoteItemId, quoteId) as QuoteItemRow | undefined;

  if (!item) {
    throw new Error("报价行不属于这份报价。");
  }

  if (item.quote_status === "applied") {
    throw new Error("这份报价的价格已经应用，不能修改食材匹配。");
  }

  return item;
}

function priceMicroYuanPerBaseUnit(
  priceValue: string,
  baseUnit: "g" | "ml" | "个",
): number {
  const displayPriceMicroYuan = yuanStringToMicroYuan(priceValue);

  if (baseUnit === "个") {
    return displayPriceMicroYuan;
  }

  return Math.floor((displayPriceMicroYuan + 500) / 1000);
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function saveAlias(
  database: DatabaseSync,
  restaurantId: number,
  supplierId: number | null,
  alias: string,
  ingredientId: number,
): void {
  const normalizedAlias = normalizeName(alias);
  const existing =
    supplierId === null
      ? (database
          .prepare(
            `
              SELECT id
              FROM ingredient_aliases
              WHERE restaurant_id = ?
                AND normalized_alias = ?
                AND supplier_id IS NULL
              LIMIT 1
            `,
          )
          .get(restaurantId, normalizedAlias) as
          | { id: number }
          | undefined)
      : (database
          .prepare(
            `
              SELECT id
              FROM ingredient_aliases
              WHERE restaurant_id = ?
                AND normalized_alias = ?
                AND supplier_id = ?
              LIMIT 1
            `,
          )
          .get(restaurantId, normalizedAlias, supplierId) as
          | { id: number }
          | undefined);

  if (existing) {
    database
      .prepare(
        `
          UPDATE ingredient_aliases
          SET ingredient_id = ?, source = 'user_confirmed'
          WHERE id = ?
        `,
      )
      .run(ingredientId, existing.id);
    return;
  }

  database
    .prepare(
      `
        INSERT INTO ingredient_aliases (
          restaurant_id, ingredient_id, supplier_id,
          alias, normalized_alias, source
        ) VALUES (?, ?, ?, ?, ?, 'user_confirmed')
      `,
    )
    .run(
      restaurantId,
      ingredientId,
      supplierId,
      alias.trim(),
      normalizedAlias,
    );
}

/**
 * 从报价行直接新增一个标准食材，并立即重新执行标准化。
 *
 * 新食材不会伪造历史价格；成本变化仍由现有分析流程判断数据是否充分。
 */
export function createIngredientForQuoteItem(
  database: DatabaseSync,
  quoteId: number,
  input: CreateQuoteIngredientInput,
): StandardizationResult {
  withTransaction(database, () => {
    const item = getQuoteItem(database, quoteId, input.quoteItemId);
    const normalizedName = normalizeName(input.name);
    let ingredient = database
      .prepare(
        `
          SELECT id, name, base_unit
          FROM ingredients
          WHERE restaurant_id = ? AND normalized_name = ?
          LIMIT 1
        `,
      )
      .get(item.restaurant_id, normalizedName) as IngredientRow | undefined;

    if (ingredient) {
      if (ingredient.base_unit !== input.baseUnit) {
        throw new Error(
          `“${ingredient.name}”已存在，但基础单位是 ${ingredient.base_unit}。`,
        );
      }

      database
        .prepare(
          `
            UPDATE ingredients
            SET is_active = 1,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?
          `,
        )
        .run(ingredient.id);
    } else {
      const inserted = database
        .prepare(
          `
            INSERT INTO ingredients (
              restaurant_id, name, normalized_name, base_unit
            ) VALUES (?, ?, ?, ?)
          `,
        )
        .run(
          item.restaurant_id,
          input.name,
          normalizedName,
          input.baseUnit,
        );
      ingredient = {
        id: Number(inserted.lastInsertRowid),
        name: input.name,
        base_unit: input.baseUnit,
      };

      database
        .prepare(
          `
            INSERT INTO audit_events (
              restaurant_id, quote_id, analysis_run_id,
              entity_type, entity_id, event_type,
              actor_type, actor_label, payload_json
            ) VALUES (?, ?, NULL, 'ingredient', ?, 'ingredient_created', 'user', '演示操作员', ?)
          `,
        )
        .run(
          item.restaurant_id,
          quoteId,
          ingredient.id,
          JSON.stringify({
            name: ingredient.name,
            baseUnit: ingredient.base_unit,
          }),
        );
    }

    database
      .prepare(
        `
          UPDATE quote_items
          SET ingredient_id = ?,
              match_method = 'manual',
              match_confidence = 1,
              match_evidence = '用户新建并匹配标准食材',
              normalized_quantity_base = NULL,
              base_unit = ?,
              normalized_unit_price_micro_yuan = NULL,
              status = 'needs_confirmation',
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?
        `,
      )
      .run(ingredient.id, ingredient.base_unit, input.quoteItemId);

    if (input.rememberAlias) {
      saveAlias(
        database,
        item.restaurant_id,
        item.supplier_id,
        item.item_name_raw,
        ingredient.id,
      );
    }

    if (input.historicalPrice) {
      if (!isValidDate(input.historicalPrice.effectiveDate)) {
        throw new Error("历史价格生效日期不正确。");
      }

      if (
        !item.quote_date ||
        input.historicalPrice.effectiveDate >= item.quote_date
      ) {
        throw new Error("历史价格生效日期必须早于当前报价日期。");
      }

      const historicalPrice = priceMicroYuanPerBaseUnit(
        input.historicalPrice.priceValue,
        ingredient.base_unit,
      );

      if (historicalPrice <= 0) {
        throw new Error("历史参考价必须大于 0。");
      }

      const existing = database
        .prepare(
          `
            SELECT id
            FROM price_history
            WHERE ingredient_id = ?
              AND effective_date = ?
              AND source = 'manual'
            LIMIT 1
          `,
        )
        .get(
          ingredient.id,
          input.historicalPrice.effectiveDate,
        ) as { id: number } | undefined;

      if (existing) {
        throw new Error("这个生效日期已经有一条人工历史价格。");
      }

      const displayUnit =
        ingredient.base_unit === "g"
          ? "kg"
          : ingredient.base_unit === "ml"
            ? "L"
            : "个";
      const insertedPrice = database
        .prepare(
          `
            INSERT INTO price_history (
              ingredient_id, supplier_id, quote_id, quote_item_id,
              price_micro_yuan_per_base_unit, effective_date,
              source, note
            ) VALUES (?, ?, NULL, NULL, ?, ?, 'manual', ?)
          `,
        )
        .run(
          ingredient.id,
          item.supplier_id,
          historicalPrice,
          input.historicalPrice.effectiveDate,
          `新增食材时由用户补充：¥${input.historicalPrice.priceValue}/${displayUnit}`,
        );

      database
        .prepare(
          `
            INSERT INTO audit_events (
              restaurant_id, quote_id, analysis_run_id,
              entity_type, entity_id, event_type,
              actor_type, actor_label, payload_json
            ) VALUES (?, ?, NULL, 'price_history', ?, 'manual_price_added', 'user', '演示操作员', ?)
          `,
        )
        .run(
          item.restaurant_id,
          quoteId,
          Number(insertedPrice.lastInsertRowid),
          JSON.stringify({
            ingredientId: ingredient.id,
            priceValue: input.historicalPrice.priceValue,
            displayUnit,
            effectiveDate: input.historicalPrice.effectiveDate,
          }),
        );
    }

    database
      .prepare(
        `
          INSERT INTO audit_events (
            restaurant_id, quote_id, analysis_run_id,
            entity_type, entity_id, event_type,
            actor_type, actor_label, payload_json
          ) VALUES (?, ?, NULL, 'quote_item', ?, 'ingredient_matched_manually', 'user', '演示操作员', ?)
        `,
      )
      .run(
        item.restaurant_id,
        quoteId,
        input.quoteItemId,
        JSON.stringify({
          ingredientId: ingredient.id,
          rawName: item.item_name_raw,
          rememberedAlias: input.rememberAlias,
        }),
      );
  });

  return standardizeQuote(database, quoteId);
}
