import type { DatabaseSync } from "node:sqlite";

import {
  matchIngredient,
  type AliasRecord,
  type IngredientRecord,
} from "../domain/ingredient-matching";
import { normalizeQuoteItem } from "../domain/unit-conversion";
import type {
  IngredientOption,
  StandardizationQuestion,
  StandardizationQuestionType,
  StandardizationResult,
  StandardizedItem,
} from "../domain/standardization";
import { withTransaction } from "../db/transaction";

const ABNORMAL_PRICE_THRESHOLD = 0.3;

type QuoteRow = {
  id: number;
  restaurant_id: number;
  supplier_id: number | null;
  quote_date: string | null;
};

type ItemRow = {
  id: number;
  line_no: number;
  item_name_raw: string;
  ingredient_id: number | null;
  quantity_value: string | null;
  quantity_unit: string | null;
  package_quantity_value: string | null;
  package_unit: string | null;
  price_type: "total" | "unit" | null;
  price_value_micro_yuan: number | null;
  price_unit: string | null;
  confidence: number | null;
  evidence_text: string | null;
  match_method: string | null;
  match_confidence: number | null;
  match_evidence: string | null;
};

type IngredientRow = {
  id: number;
  name: string;
  normalized_name: string;
  base_unit: "g" | "ml" | "个";
};

type AliasRow = {
  ingredient_id: number;
  supplier_id: number | null;
  normalized_alias: string;
};

type ConversionRow = {
  ingredient_id: number | null;
  from_unit: string;
  to_unit: string;
  factor: number;
};

type PriceRow = {
  price_micro_yuan_per_base_unit: number;
  effective_date: string;
};

function toIngredientOption(ingredient: IngredientRecord): IngredientOption {
  return {
    id: ingredient.id,
    name: ingredient.name,
    baseUnit: ingredient.baseUnit,
  };
}

function question(
  params: Omit<StandardizationQuestion, "id">,
): StandardizationQuestion {
  return {
    ...params,
    id: `${params.type}:${params.quoteItemId}`,
  };
}

function hasConfirmation(
  database: DatabaseSync,
  quoteItemId: number,
  type: StandardizationQuestionType,
): boolean {
  const row = database
    .prepare(
      "SELECT 1 AS found FROM confirmations WHERE quote_item_id = ? AND type = ? LIMIT 1",
    )
    .get(quoteItemId, type) as { found: number } | undefined;

  return row?.found === 1;
}

function getLatestPrice(
  database: DatabaseSync,
  ingredientId: number,
): PriceRow | null {
  const row = database
    .prepare(
      `
        SELECT price_micro_yuan_per_base_unit, effective_date
        FROM price_history
        WHERE ingredient_id = ?
        ORDER BY effective_date DESC, id DESC
        LIMIT 1
      `,
    )
    .get(ingredientId) as PriceRow | undefined;

  return row ?? null;
}

function getLatestPriceBefore(
  database: DatabaseSync,
  ingredientId: number,
  quoteDate: string,
): PriceRow | null {
  const row = database
    .prepare(
      `
        SELECT price_micro_yuan_per_base_unit, effective_date
        FROM price_history
        WHERE ingredient_id = ? AND effective_date < ?
        ORDER BY effective_date DESC, id DESC
        LIMIT 1
      `,
    )
    .get(ingredientId, quoteDate) as PriceRow | undefined;

  return row ?? null;
}

/**
 * 对一份报价执行规则匹配、单位换算和异常价格检查。
 *
 * 只更新报价行的匹配/归一化字段和 quotes.status，
 * 不写 price_history，也不改食材正式价格。
 */
export function standardizeQuote(
  database: DatabaseSync,
  quoteId: number,
): StandardizationResult {
  let result: StandardizationResult | null = null;

  withTransaction(database, () => {
    const quote = database
      .prepare(
        `
          SELECT id, restaurant_id, supplier_id, quote_date
          FROM quotes
          WHERE id = ?
          LIMIT 1
        `,
      )
      .get(quoteId) as QuoteRow | undefined;

    if (!quote) {
      throw new Error("找不到这份报价。");
    }

    const itemRows = database
      .prepare(
        `
          SELECT
            id, line_no, item_name_raw, ingredient_id,
            quantity_value, quantity_unit,
            package_quantity_value, package_unit,
            price_type, price_value_micro_yuan, price_unit,
            confidence, evidence_text, match_method,
            match_confidence, match_evidence
          FROM quote_items
          WHERE quote_id = ?
          ORDER BY line_no
        `,
      )
      .all(quoteId) as ItemRow[];

    const ingredientRows = database
      .prepare(
        `
          SELECT id, name, normalized_name, base_unit
          FROM ingredients
          WHERE restaurant_id = ? AND is_active = 1
        `,
      )
      .all(quote.restaurant_id) as IngredientRow[];

    const aliasRows = database
      .prepare(
        `
          SELECT ingredient_id, supplier_id, normalized_alias
          FROM ingredient_aliases
          WHERE restaurant_id = ?
        `,
      )
      .all(quote.restaurant_id) as AliasRow[];

    const conversionRows = database
      .prepare(
        `
          SELECT ingredient_id, from_unit, to_unit, factor
          FROM unit_conversions
          WHERE restaurant_id = ?
        `,
      )
      .all(quote.restaurant_id) as ConversionRow[];

    const ingredients: IngredientRecord[] = ingredientRows.map((row) => ({
      id: row.id,
      name: row.name,
      normalizedName: row.normalized_name,
      baseUnit: row.base_unit,
    }));
    const ingredientsById = new Map(
      ingredients.map((ingredient) => [ingredient.id, ingredient]),
    );
    const aliases: AliasRecord[] = aliasRows.map((row) => ({
      ingredientId: row.ingredient_id,
      supplierId: row.supplier_id,
      normalizedAlias: row.normalized_alias,
    }));
    const conversions = conversionRows.map((row) => ({
      ingredientId: row.ingredient_id,
      fromUnit: row.from_unit,
      toUnit: row.to_unit,
      factor: row.factor,
    }));

    const questions: StandardizationQuestion[] = [];
    const standardizedItems: StandardizedItem[] = [];

    for (const item of itemRows) {
      let ingredient = item.ingredient_id
        ? ingredientsById.get(item.ingredient_id) ?? null
        : null;
      let matchMethod = item.match_method;
      let matchConfidence = item.match_confidence;
      let matchEvidence = item.match_evidence;

      if (!ingredient) {
        const match = matchIngredient(
          item.item_name_raw,
          quote.supplier_id,
          ingredients,
          aliases,
        );

        if (match.status === "ambiguous") {
          const message = `“${item.item_name_raw}”匹配到多个标准食材，请选择正确的一个。`;
          questions.push(
            question({
              type: "mapping_ambiguous",
              quoteItemId: item.id,
              lineNo: item.line_no,
              itemNameRaw: item.item_name_raw,
              message,
              evidenceText: item.evidence_text,
              blocking: true,
              rememberable: true,
              baseUnit: null,
              quantityUnit: item.quantity_unit,
              options: match.candidates.map(toIngredientOption),
            }),
          );

          database
            .prepare(
              `
                UPDATE quote_items
                SET ingredient_id = NULL, match_method = NULL,
                    match_confidence = NULL, match_evidence = ?,
                    normalized_quantity_base = NULL, base_unit = NULL,
                    normalized_unit_price_micro_yuan = NULL,
                    status = 'needs_confirmation',
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = ?
              `,
            )
            .run(message, item.id);

          standardizedItems.push({
            id: item.id,
            lineNo: item.line_no,
            itemNameRaw: item.item_name_raw,
            ingredientId: null,
            ingredientName: null,
            baseUnit: null,
            matchMethod: null,
            matchConfidence: null,
            matchEvidence: message,
            quantityValue: item.quantity_value,
            quantityUnit: item.quantity_unit,
            packageQuantityValue: item.package_quantity_value,
            packageUnit: item.package_unit,
            normalizedQuantityBase: null,
            normalizedUnitPriceMicroYuan: null,
            previousPriceMicroYuan: null,
            priceChangeRatio: null,
            status: "needs_confirmation",
            evidenceText: item.evidence_text,
          });
          continue;
        }

        if (match.status === "not_found") {
          const message = `没有找到“${item.item_name_raw}”对应的标准食材，请选择或新建食材。`;
          questions.push(
            question({
              type: "mapping_not_found",
              quoteItemId: item.id,
              lineNo: item.line_no,
              itemNameRaw: item.item_name_raw,
              message,
              evidenceText: item.evidence_text,
              blocking: true,
              rememberable: true,
              baseUnit: null,
              quantityUnit: item.quantity_unit,
              options: match.candidates.map(toIngredientOption),
            }),
          );

          database
            .prepare(
              `
                UPDATE quote_items
                SET ingredient_id = NULL, match_method = NULL,
                    match_confidence = NULL, match_evidence = ?,
                    normalized_quantity_base = NULL, base_unit = NULL,
                    normalized_unit_price_micro_yuan = NULL,
                    status = 'needs_confirmation',
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = ?
              `,
            )
            .run(message, item.id);

          standardizedItems.push({
            id: item.id,
            lineNo: item.line_no,
            itemNameRaw: item.item_name_raw,
            ingredientId: null,
            ingredientName: null,
            baseUnit: null,
            matchMethod: null,
            matchConfidence: null,
            matchEvidence: message,
            quantityValue: item.quantity_value,
            quantityUnit: item.quantity_unit,
            packageQuantityValue: item.package_quantity_value,
            packageUnit: item.package_unit,
            normalizedQuantityBase: null,
            normalizedUnitPriceMicroYuan: null,
            previousPriceMicroYuan: null,
            priceChangeRatio: null,
            status: "needs_confirmation",
            evidenceText: item.evidence_text,
          });
          continue;
        }

        ingredient = match.ingredient;
        matchMethod = match.method;
        matchConfidence = match.confidence;
        matchEvidence = match.evidence;
      }

      const normalization = normalizeQuoteItem({
        ingredientId: ingredient.id,
        baseUnit: ingredient.baseUnit,
        quantityValue: item.quantity_value,
        quantityUnit: item.quantity_unit,
        packageQuantityValue: item.package_quantity_value,
        packageUnit: item.package_unit,
        priceType: item.price_type,
        priceValueMicroYuan: item.price_value_micro_yuan,
        priceUnit: item.price_unit,
        conversions,
      });

      if (!normalization.ok) {
        const questionType: StandardizationQuestionType =
          normalization.type === "quantity_unknown"
            ? "unit_unknown"
            : normalization.type;

        questions.push(
          question({
            type: questionType,
            quoteItemId: item.id,
            lineNo: item.line_no,
            itemNameRaw: item.item_name_raw,
            message: normalization.message,
            evidenceText: item.evidence_text,
            blocking: true,
            rememberable:
              questionType === "package_unknown" ||
              questionType === "unit_unknown",
            baseUnit: ingredient.baseUnit,
            quantityUnit: item.quantity_unit,
            options: [],
          }),
        );

        database
          .prepare(
            `
              UPDATE quote_items
              SET ingredient_id = ?, match_method = ?, match_confidence = ?,
                  match_evidence = ?, normalized_quantity_base = NULL,
                  base_unit = ?, normalized_unit_price_micro_yuan = NULL,
                  status = 'needs_confirmation',
                  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
              WHERE id = ?
            `,
          )
          .run(
            ingredient.id,
            matchMethod,
            matchConfidence,
            matchEvidence,
            ingredient.baseUnit,
            item.id,
          );

        standardizedItems.push({
          id: item.id,
          lineNo: item.line_no,
          itemNameRaw: item.item_name_raw,
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          baseUnit: ingredient.baseUnit,
          matchMethod,
          matchConfidence,
          matchEvidence,
          quantityValue: item.quantity_value,
          quantityUnit: item.quantity_unit,
          packageQuantityValue: item.package_quantity_value,
          packageUnit: item.package_unit,
          normalizedQuantityBase: null,
          normalizedUnitPriceMicroYuan: null,
          previousPriceMicroYuan: null,
          priceChangeRatio: null,
          status: "needs_confirmation",
          evidenceText: item.evidence_text,
        });
        continue;
      }

      const latestBefore = quote.quote_date
        ? getLatestPriceBefore(database, ingredient.id, quote.quote_date)
        : null;
      const latestAny = getLatestPrice(database, ingredient.id);
      const backdated =
        quote.quote_date !== null &&
        latestAny !== null &&
        latestAny.effective_date > quote.quote_date;
      const backdatedConfirmed = hasConfirmation(
        database,
        item.id,
        "backdated_quote",
      );
      const abnormalConfirmed = hasConfirmation(
        database,
        item.id,
        "abnormal_price",
      );
      const priceChangeRatio = latestBefore
        ? (normalization.normalizedUnitPriceMicroYuan -
            latestBefore.price_micro_yuan_per_base_unit) /
          latestBefore.price_micro_yuan_per_base_unit
        : null;

      let itemStatus: "ready" | "needs_confirmation" = "ready";
      let blockingQuestionForItem = false;

      if (!latestBefore) {
        questions.push(
          question({
            type: "new_ingredient_without_baseline",
            quoteItemId: item.id,
            lineNo: item.line_no,
            itemNameRaw: item.item_name_raw,
            message: `“${item.item_name_raw}”没有涨价前的历史价格，无法计算成本变化。`,
            evidenceText: item.evidence_text,
            blocking: false,
            rememberable: false,
            baseUnit: ingredient.baseUnit,
            quantityUnit: item.quantity_unit,
            options: [],
          }),
        );
      }

      if (backdated && !backdatedConfirmed) {
        questions.push(
          question({
            type: "backdated_quote",
            quoteItemId: item.id,
            lineNo: item.line_no,
            itemNameRaw: item.item_name_raw,
            message: `报价日期早于“${ingredient.name}”当前最新价格，是否按历史报价处理？`,
            evidenceText: item.evidence_text,
            blocking: true,
            rememberable: false,
            baseUnit: ingredient.baseUnit,
            quantityUnit: item.quantity_unit,
            options: [],
          }),
        );
        itemStatus = "needs_confirmation";
        blockingQuestionForItem = true;
      }

      if (
        priceChangeRatio !== null &&
        Math.abs(priceChangeRatio) >= ABNORMAL_PRICE_THRESHOLD &&
        !abnormalConfirmed
      ) {
        const percent = (priceChangeRatio * 100).toFixed(1);
        questions.push(
          question({
            type: "abnormal_price",
            quoteItemId: item.id,
            lineNo: item.line_no,
            itemNameRaw: item.item_name_raw,
            message: `“${item.item_name_raw}”本次归一化价格较历史价格变化 ${percent}%，请核对报价。`,
            evidenceText: item.evidence_text,
            blocking: true,
            rememberable: false,
            baseUnit: ingredient.baseUnit,
            quantityUnit: item.quantity_unit,
            options: [],
          }),
        );
        itemStatus = "needs_confirmation";
        blockingQuestionForItem = true;
      }

      database
        .prepare(
          `
            UPDATE quote_items
            SET ingredient_id = ?, match_method = ?, match_confidence = ?,
                match_evidence = ?, normalized_quantity_base = ?,
                base_unit = ?, normalized_unit_price_micro_yuan = ?,
                status = ?,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?
          `,
        )
        .run(
          ingredient.id,
          matchMethod,
          matchConfidence,
          matchEvidence,
          normalization.normalizedQuantityBase,
          ingredient.baseUnit,
          normalization.normalizedUnitPriceMicroYuan,
          itemStatus,
          item.id,
        );

      standardizedItems.push({
        id: item.id,
        lineNo: item.line_no,
        itemNameRaw: item.item_name_raw,
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        baseUnit: ingredient.baseUnit,
        matchMethod,
        matchConfidence,
        matchEvidence,
        quantityValue: item.quantity_value,
        quantityUnit: item.quantity_unit,
        packageQuantityValue: item.package_quantity_value,
        packageUnit: item.package_unit,
        normalizedQuantityBase: normalization.normalizedQuantityBase,
        normalizedUnitPriceMicroYuan:
          normalization.normalizedUnitPriceMicroYuan,
        previousPriceMicroYuan:
          latestBefore?.price_micro_yuan_per_base_unit ?? null,
        priceChangeRatio,
        status: blockingQuestionForItem ? "needs_confirmation" : itemStatus,
        evidenceText: item.evidence_text,
      });
    }

    const blockingQuestions = questions.filter((item) => item.blocking).length;
    const quoteStatus =
      blockingQuestions > 0 ? "needs_confirmation" : "ready";

    database
      .prepare(
        `
          UPDATE quotes
          SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?
        `,
      )
      .run(quoteStatus, quoteId);

    database
      .prepare(
        `
          INSERT INTO audit_events (
            restaurant_id, quote_id, analysis_run_id,
            entity_type, entity_id, event_type,
            actor_type, actor_label, payload_json
          ) VALUES (?, ?, NULL, 'quote', ?, 'quote_standardized', 'system', 'rule-engine', ?)
        `,
      )
      .run(
        quote.restaurant_id,
        quoteId,
        quoteId,
        JSON.stringify({
          itemCount: itemRows.length,
          blockingQuestions,
          status: quoteStatus,
        }),
      );

    result = {
      quoteId,
      status: quoteStatus,
      items: standardizedItems,
      questions,
      summary: {
        totalItems: itemRows.length,
        matchedItems: standardizedItems.filter(
          (item) => item.ingredientId !== null,
        ).length,
        readyItems: standardizedItems.filter(
          (item) => item.status === "ready",
        ).length,
        blockingQuestions,
      },
    };
  });

  if (!result) {
    throw new Error("标准化没有产生结果。");
  }

  return result;
}
