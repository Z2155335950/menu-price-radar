import type { DatabaseSync } from "node:sqlite";

import type { ConfirmationInput, StandardizationResult } from "../domain/standardization";
import { decimalToScaledInteger } from "../domain/quantity";
import { normalizeName } from "../domain/normalize";
import {
  findConversionFactor,
  type UnitConversionRecord,
} from "../domain/unit-conversion";
import { withTransaction } from "../db/transaction";
import { standardizeQuote } from "./standardize-quote";

type QuoteRow = {
  id: number;
  restaurant_id: number;
  supplier_id: number | null;
  quote_date: string | null;
  status: string;
};

type ItemRow = {
  id: number;
  quote_id: number;
  line_no: number;
  item_name_raw: string;
  ingredient_id: number | null;
  quantity_unit: string | null;
  package_quantity_value: string | null;
  package_unit: string | null;
  package_spec_raw: string | null;
  evidence_text: string | null;
};

type IngredientRow = {
  id: number;
  name: string;
  base_unit: "g" | "ml" | "个";
};

type ConversionRow = {
  ingredient_id: number | null;
  from_unit: string;
  to_unit: string;
  factor: number;
};

function getQuote(database: DatabaseSync, quoteId: number): QuoteRow {
  const quote = database
    .prepare(
      "SELECT id, restaurant_id, supplier_id, quote_date, status FROM quotes WHERE id = ? LIMIT 1",
    )
    .get(quoteId) as QuoteRow | undefined;

  if (!quote) {
    throw new Error("找不到这份报价。");
  }

  if (quote.status === "applied") {
    throw new Error("这份报价的价格已经应用，不能继续确认。");
  }

  return quote;
}

function getItem(
  database: DatabaseSync,
  quoteId: number,
  itemId: number | null,
): ItemRow {
  if (itemId === null) {
    throw new Error("这个确认项没有关联报价行。");
  }

  const item = database
    .prepare(
      `
        SELECT
          id, quote_id, line_no, item_name_raw, ingredient_id,
          quantity_unit, package_quantity_value, package_unit,
          package_spec_raw, evidence_text
        FROM quote_items
        WHERE id = ? AND quote_id = ?
        LIMIT 1
      `,
    )
    .get(itemId, quoteId) as ItemRow | undefined;

  if (!item) {
    throw new Error("报价行不属于这份报价。");
  }

  return item;
}

function getIngredient(
  database: DatabaseSync,
  restaurantId: number,
  ingredientId: number,
): IngredientRow {
  const ingredient = database
    .prepare(
      "SELECT id, name, base_unit FROM ingredients WHERE id = ? AND restaurant_id = ? LIMIT 1",
    )
    .get(ingredientId, restaurantId) as IngredientRow | undefined;

  if (!ingredient) {
    throw new Error("所选食材不属于当前餐厅。");
  }

  return ingredient;
}

function getConversions(
  database: DatabaseSync,
  restaurantId: number,
): UnitConversionRecord[] {
  const rows = database
    .prepare(
      "SELECT ingredient_id, from_unit, to_unit, factor FROM unit_conversions WHERE restaurant_id = ?",
    )
    .all(restaurantId) as ConversionRow[];

  return rows.map((row) => ({
    ingredientId: row.ingredient_id,
    fromUnit: row.from_unit,
    toUnit: row.to_unit,
    factor: row.factor,
  }));
}

function upsertAlias(
  database: DatabaseSync,
  restaurantId: number,
  supplierId: number | null,
  itemNameRaw: string,
  ingredientId: number,
): void {
  const normalizedAlias = normalizeName(itemNameRaw);
  const existing =
    supplierId === null
      ? (database
          .prepare(
            `
              SELECT id FROM ingredient_aliases
              WHERE restaurant_id = ? AND normalized_alias = ? AND supplier_id IS NULL
              LIMIT 1
            `,
          )
          .get(restaurantId, normalizedAlias) as { id: number } | undefined)
      : (database
          .prepare(
            `
              SELECT id FROM ingredient_aliases
              WHERE restaurant_id = ? AND normalized_alias = ? AND supplier_id = ?
              LIMIT 1
            `,
          )
          .get(restaurantId, normalizedAlias, supplierId) as
          | { id: number }
          | undefined);

  if (existing) {
    database
      .prepare("UPDATE ingredient_aliases SET ingredient_id = ? WHERE id = ?")
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
      itemNameRaw,
      normalizedAlias,
    );
}

function upsertConversion(
  database: DatabaseSync,
  restaurantId: number,
  ingredientId: number,
  fromUnit: string,
  toUnit: string,
  factor: number,
): void {
  const existing = database
    .prepare(
      `
        SELECT id FROM unit_conversions
        WHERE restaurant_id = ? AND ingredient_id = ? AND from_unit = ? AND to_unit = ?
        LIMIT 1
      `,
    )
    .get(restaurantId, ingredientId, fromUnit, toUnit) as
    | { id: number }
    | undefined;

  if (existing) {
    database
      .prepare(
        "UPDATE unit_conversions SET factor = ?, source = 'user_confirmed' WHERE id = ?",
      )
      .run(factor, existing.id);
    return;
  }

  database
    .prepare(
      `
        INSERT INTO unit_conversions (
          restaurant_id, ingredient_id, from_unit, to_unit, factor, source
        ) VALUES (?, ?, ?, ?, ?, 'user_confirmed')
      `,
    )
    .run(restaurantId, ingredientId, fromUnit, toUnit, factor);
}

function questionText(
  type: ConfirmationInput["type"],
  item: ItemRow,
  ingredient: IngredientRow | null,
  input: ConfirmationInput,
): string {
  if (type === "mapping_not_found" || type === "mapping_ambiguous") {
    return `第 ${item.line_no} 行“${item.item_name_raw}”应匹配哪个标准食材？`;
  }

  if (type === "package_unknown" || type === "unit_unknown") {
    return `第 ${item.line_no} 行“${item.item_name_raw}”每${item.quantity_unit ?? "包装"}对应多少${ingredient?.base_unit ?? "基础单位"}？`;
  }

  if (type === "abnormal_price") {
    return `确认第 ${item.line_no} 行“${item.item_name_raw}”的价格变化是否真实？`;
  }

  if (type === "backdated_quote") {
    return `确认第 ${item.line_no} 行“${item.item_name_raw}”按历史报价处理？`;
  }

  return `确认第 ${item.line_no} 行“${item.item_name_raw}”的数据？`;
}

/**
 * 记录用户确认，并在需要时写入别名或单位换算。
 *
 * 这里仍然不写 price_history；正式改价留给后续工作流。
 */
export function confirmQuoteItem(
  database: DatabaseSync,
  quoteId: number,
  input: ConfirmationInput,
): StandardizationResult {
  const quote = getQuote(database, quoteId);
  const item = getItem(database, quoteId, input.quoteItemId);
  let ingredient: IngredientRow | null = item.ingredient_id
    ? getIngredient(database, quote.restaurant_id, item.ingredient_id)
    : null;
  let beforeJson: string | null = null;
  let afterJson: string | null = null;
  let optionsJson: string | null = null;
  let scope: "this_quote" | "remember" = "this_quote";

  withTransaction(database, () => {
    if (
      input.type === "mapping_not_found" ||
      input.type === "mapping_ambiguous"
    ) {
      if (!input.ingredientId) {
        throw new Error("请选择一个标准食材。");
      }

      ingredient = getIngredient(
        database,
        quote.restaurant_id,
        input.ingredientId,
      );
      beforeJson = JSON.stringify({
        ingredientId: item.ingredient_id,
        ingredientName: ingredient?.name ?? null,
      });

      database
        .prepare(
          `
            UPDATE quote_items
            SET ingredient_id = ?, match_method = 'confirmed',
                match_confidence = 1, match_evidence = '用户确认',
                normalized_quantity_base = NULL, base_unit = ?,
                normalized_unit_price_micro_yuan = NULL,
                status = 'needs_confirmation',
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?
          `,
        )
        .run(ingredient.id, ingredient.base_unit, item.id);

      scope = input.remember ? "remember" : "this_quote";
      if (scope === "remember") {
        upsertAlias(
          database,
          quote.restaurant_id,
          quote.supplier_id,
          item.item_name_raw,
          ingredient.id,
        );
      }

      optionsJson = JSON.stringify([
        { id: ingredient.id, name: ingredient.name },
      ]);
      afterJson = JSON.stringify({
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
      });
    } else if (
      input.type === "package_unknown" ||
      input.type === "unit_unknown"
    ) {
      if (!ingredient) {
        throw new Error("请先确认食材，再确认包装换算。");
      }

      if (!input.packageQuantityValue || !input.packageUnit) {
        throw new Error("请填写包装数量和单位。");
      }

      if (!item.quantity_unit) {
        throw new Error("报价行缺少原始数量单位，无法建立换算。");
      }

      const conversions = getConversions(database, quote.restaurant_id);
      const factor = findConversionFactor(
        input.packageUnit,
        ingredient.base_unit,
        ingredient.id,
        conversions,
      );

      if (factor === null) {
        throw new Error(
          `单位“${input.packageUnit}”无法换算为“${ingredient.base_unit}”。`,
        );
      }

      const packageBaseQuantity = decimalToScaledInteger(
        input.packageQuantityValue,
        factor,
      );
      beforeJson = JSON.stringify({
        packageQuantityValue: item.package_quantity_value,
        packageUnit: item.package_unit,
        packageSpecRaw: item.package_spec_raw,
      });

      const packageSpecRaw = `${input.packageQuantityValue}${input.packageUnit}/${item.quantity_unit}`;

      database
        .prepare(
          `
            UPDATE quote_items
            SET package_quantity_value = ?, package_unit = ?,
                package_spec_raw = ?, status = 'needs_confirmation',
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?
          `,
        )
        .run(
          input.packageQuantityValue,
          input.packageUnit,
          packageSpecRaw,
          item.id,
        );

      scope = input.remember ? "remember" : "this_quote";
      if (scope === "remember") {
        upsertConversion(
          database,
          quote.restaurant_id,
          ingredient.id,
          item.quantity_unit,
          ingredient.base_unit,
          packageBaseQuantity,
        );
      }

      optionsJson = JSON.stringify({
        packageQuantityValue: input.packageQuantityValue,
        packageUnit: input.packageUnit,
      });
      afterJson = JSON.stringify({
        packageQuantityValue: input.packageQuantityValue,
        packageUnit: input.packageUnit,
        packageSpecRaw,
        packageBaseQuantity,
      });
    } else if (input.type === "abnormal_price") {
      if (!input.acknowledged) {
        throw new Error("请确认报价价格无误。");
      }

      beforeJson = JSON.stringify({ acknowledged: false });
      afterJson = JSON.stringify({ acknowledged: true });
      scope = "this_quote";
    } else if (input.type === "backdated_quote") {
      if (!input.acknowledged) {
        throw new Error("请确认是否按历史报价处理。");
      }

      beforeJson = JSON.stringify({ acknowledged: false });
      afterJson = JSON.stringify({ acknowledged: true });
      scope = "this_quote";
    } else {
      throw new Error("当前确认类型暂不支持自动处理。");
    }

    database
      .prepare(
        `
          INSERT INTO confirmations (
            quote_id, quote_item_id, type, question,
            options_json, answer_json, scope, confirmed_by,
            evidence_text, before_json, after_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, '演示操作员', ?, ?, ?)
        `,
      )
      .run(
        quoteId,
        item.id,
        input.type,
        questionText(input.type, item, ingredient, input),
        optionsJson,
        JSON.stringify({
          type: input.type,
          ingredientId: input.ingredientId ?? null,
          packageQuantityValue: input.packageQuantityValue ?? null,
          packageUnit: input.packageUnit ?? null,
          acknowledged: input.acknowledged ?? false,
        }),
        scope,
        item.evidence_text,
        beforeJson,
        afterJson,
      );

    database
      .prepare(
        `
          INSERT INTO audit_events (
            restaurant_id, quote_id, analysis_run_id,
            entity_type, entity_id, event_type,
            actor_type, actor_label, payload_json
          ) VALUES (?, ?, NULL, 'quote', ?, 'confirmation_recorded', 'user', '演示操作员', ?)
        `,
      )
      .run(
        quote.restaurant_id,
        quoteId,
        quoteId,
        JSON.stringify({
          quoteItemId: item.id,
          type: input.type,
          scope,
        }),
      );
  });

  return standardizeQuote(database, quoteId);
}
