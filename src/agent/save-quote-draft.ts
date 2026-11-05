import type { DatabaseSync } from "node:sqlite";

import {
  CONFIDENCE_THRESHOLD,
  type ExtractedQuote,
  type ExtractedQuoteItem,
  type ExtractionQuestion,
  type ExtractionResponse,
} from "../domain/quote-extraction";
import { yuanStringToMicroYuan } from "../domain/money";
import { normalizeName } from "../domain/normalize";
import { withTransaction } from "../db/transaction";

const DEMO_RESTAURANT_NAME = "临江小馆";
const PACKAGE_UNITS = new Set(["箱", "袋", "包", "件"]);

type IdRow = { id: number };

export type QuoteSource = {
  type: "text" | "image" | "pdf";
  sourceText: string | null;
  sourceFilePath: string | null;
  evidencePage: number | null;
};

export type SaveQuoteDraftOptions = {
  providerId: string;
  source: QuoteSource;
};

function getRestaurantId(database: DatabaseSync): number {
  const preferred = database
    .prepare("SELECT id FROM restaurants WHERE name = ? LIMIT 1")
    .get(DEMO_RESTAURANT_NAME) as IdRow | undefined;

  if (preferred) {
    return preferred.id;
  }

  const fallback = database
    .prepare("SELECT id FROM restaurants ORDER BY id LIMIT 1")
    .get() as IdRow | undefined;

  if (!fallback) {
    throw new Error("数据库里没有餐厅，请先运行 npm run seed。");
  }

  return fallback.id;
}

function getSupplierId(
  database: DatabaseSync,
  restaurantId: number,
  supplierName: string,
): number | null {
  const row = database
    .prepare(
      "SELECT id FROM suppliers WHERE restaurant_id = ? AND normalized_name = ? LIMIT 1",
    )
    .get(restaurantId, normalizeName(supplierName)) as IdRow | undefined;

  return row?.id ?? null;
}

function getFieldConfidence(
  item: ExtractedQuoteItem,
  field: string,
): number {
  const value = item.fieldConfidence[field];
  return typeof value === "number" ? value : item.confidence;
}

function buildQuestions(
  supplierMatched: boolean,
  supplierNameRaw: string,
  items: ExtractedQuoteItem[],
): ExtractionQuestion[] {
  const questions: ExtractionQuestion[] = [];

  if (!supplierMatched) {
    questions.push({
      type: "supplier_unmatched",
      lineNo: null,
      field: "supplierNameRaw",
      message: `没有匹配到供应商“${supplierNameRaw}”，请确认是否新建供应商或修正名称。`,
      evidenceText: supplierNameRaw,
    });
  }

  for (const item of items) {
    const linePrefix = `第 ${item.lineNo} 行“${item.itemNameRaw}”`;
    const beforeCount = questions.length;

    const packageUnknown =
      item.quantityUnit !== null &&
      PACKAGE_UNITS.has(item.quantityUnit) &&
      (!item.packageQuantityValue || !item.packageUnit);

    if (packageUnknown) {
      questions.push({
        type: "package_unknown",
        lineNo: item.lineNo,
        field: "package",
        message: `${linePrefix}写了 ${item.quantityValue ?? ""}${item.quantityUnit}，但没有写明每${item.quantityUnit}多少公斤，需要确认。`,
        evidenceText: item.evidenceText,
      });
    } else if (getFieldConfidence(item, "package") < CONFIDENCE_THRESHOLD) {
      questions.push({
        type: "low_confidence",
        lineNo: item.lineNo,
        field: "package",
        message: `${linePrefix}的包装规格置信度较低，需要确认。`,
        evidenceText: item.evidenceText,
      });
    }

    if (getFieldConfidence(item, "itemNameRaw") < CONFIDENCE_THRESHOLD) {
      questions.push({
        type: "low_confidence",
        lineNo: item.lineNo,
        field: "itemNameRaw",
        message: `${linePrefix}的食材名称识别置信度较低，需要确认。`,
        evidenceText: item.evidenceText,
      });
    }

    if (getFieldConfidence(item, "quantity") < CONFIDENCE_THRESHOLD) {
      questions.push({
        type: "low_confidence",
        lineNo: item.lineNo,
        field: "quantity",
        message: `${linePrefix}的数量识别置信度较低，需要确认。`,
        evidenceText: item.evidenceText,
      });
    }

    const priceConfidence = Math.min(
      getFieldConfidence(item, "price"),
      getFieldConfidence(item, "priceUnit"),
    );

    if (priceConfidence < CONFIDENCE_THRESHOLD) {
      questions.push({
        type: "low_confidence",
        lineNo: item.lineNo,
        field: "price",
        message: `${linePrefix}的价格或单位置信度较低，需要确认。`,
        evidenceText: item.evidenceText,
      });
    }

    if (
      questions.length === beforeCount &&
      item.confidence < CONFIDENCE_THRESHOLD
    ) {
      questions.push({
        type: "low_confidence",
        lineNo: item.lineNo,
        field: "item",
        message: `${linePrefix}整体置信度较低，需要确认。`,
        evidenceText: item.evidenceText,
      });
    }
  }

  return questions;
}

/**
 * 把已经校验过的提取结果保存为报价草稿。
 *
 * 不写 price_history，也不改变 ingredients 或 dishes。
 */
export function saveExtractedQuote(
  database: DatabaseSync,
  quote: ExtractedQuote,
  options: SaveQuoteDraftOptions,
): ExtractionResponse {
  const restaurantId = getRestaurantId(database);
  const supplierId = getSupplierId(
    database,
    restaurantId,
    quote.supplierNameRaw,
  );
  const questions = buildQuestions(
    supplierId !== null,
    quote.supplierNameRaw,
    quote.items,
  );
  const quoteStatus =
    questions.length > 0 ? "needs_confirmation" : "extracted";
  const lineStatus = new Map<number, "draft" | "needs_confirmation">();

  for (const item of quote.items) {
    lineStatus.set(
      item.lineNo,
      questions.some((question) => question.lineNo === item.lineNo)
        ? "needs_confirmation"
        : "draft",
    );
  }

  let quoteId = 0;

  withTransaction(database, () => {
    const quoteResult = database
      .prepare(
        `
          INSERT INTO quotes (
            restaurant_id, supplier_id, supplier_name_raw, quote_date,
            currency, source_type, source_file_path, source_text, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        restaurantId,
        supplierId,
        quote.supplierNameRaw,
        quote.quoteDate,
        quote.currency,
        options.source.type,
        options.source.sourceFilePath,
        options.source.sourceText,
        quoteStatus,
      );

    quoteId = Number(quoteResult.lastInsertRowid);

    for (const item of quote.items) {
      const priceMicroYuan = yuanStringToMicroYuan(item.priceValue);

      if (priceMicroYuan <= 0) {
        throw new Error(`${item.itemNameRaw} 的价格必须大于 0。`);
      }

      const lineTotalMicroYuan = item.lineTotal
        ? yuanStringToMicroYuan(item.lineTotal)
        : item.priceType === "total"
          ? priceMicroYuan
          : null;

      if (lineTotalMicroYuan !== null && lineTotalMicroYuan <= 0) {
        throw new Error(`${item.itemNameRaw} 的行总价必须大于 0。`);
      }

      database
        .prepare(
          `
            INSERT INTO quote_items (
              quote_id, line_no, item_name_raw,
              quantity_value, quantity_unit, package_spec_raw,
              package_quantity_value, package_unit, price_type,
              price_value_micro_yuan, price_unit, line_total_micro_yuan,
              confidence, field_confidence_json, evidence_text,
              evidence_page, status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          quoteId,
          item.lineNo,
          item.itemNameRaw,
          item.quantityValue,
          item.quantityUnit,
          item.packageSpecRaw,
          item.packageQuantityValue,
          item.packageUnit,
          item.priceType,
          priceMicroYuan,
          item.priceUnit,
          lineTotalMicroYuan,
          item.confidence,
          JSON.stringify(item.fieldConfidence),
          item.evidenceText,
          options.source.evidencePage,
          lineStatus.get(item.lineNo) ?? "draft",
          item.notes ?? null,
        );
    }

    database
      .prepare(
        `
          INSERT INTO audit_events (
            restaurant_id, quote_id, analysis_run_id,
            entity_type, entity_id, event_type,
            actor_type, actor_label, payload_json
          ) VALUES (?, ?, NULL, 'quote', ?, 'quote_extracted', ?, ?, ?)
        `,
      )
      .run(
        restaurantId,
        quoteId,
        quoteId,
        options.providerId === "mock" ? "system" : "model",
        options.providerId,
        JSON.stringify({
          provider: options.providerId,
          sourceType: options.source.type,
          itemCount: quote.items.length,
          questionCount: questions.length,
          status: quoteStatus,
        }),
      );
  });

  return {
    quoteId,
    provider: options.providerId,
    status: quoteStatus,
    supplierNameRaw: quote.supplierNameRaw,
    quoteDate: quote.quoteDate,
    currency: quote.currency,
    sourceType: options.source.type,
    sourceUrl:
      options.source.type === "text"
        ? null
        : `/api/quotes/${quoteId}/source`,
    items: quote.items.map((item) => ({
      ...item,
      status: lineStatus.get(item.lineNo) ?? "draft",
    })),
    questions,
    warnings: quote.warnings,
  };
}
