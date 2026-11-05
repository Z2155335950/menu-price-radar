import type { DatabaseSync } from "node:sqlite";

import { withTransaction } from "../db/transaction";

type QuoteRow = {
  id: number;
  restaurant_id: number;
  supplier_id: number | null;
  quote_date: string | null;
  status: string;
};

type ItemRow = {
  id: number;
  line_no: number;
  ingredient_id: number | null;
  normalized_unit_price_micro_yuan: number | null;
  status: string;
};

export type ApplyQuotePricesResult = {
  applied: boolean;
  insertedPrices: number;
};

/**
 * 在用户完成全部阻塞确认后，把报价行的归一化价格写入价格历史。
 *
 * 这一步是正式的“改价”，所以必须满足：
 * - 报价状态为 ready 或 applied；
 * - 没有 needs_confirmation 的报价行；
 * - 每条报价行有匹配食材和归一化价格；
 * - 价格历史和报价行状态在同一个事务中更新。
 */
export function applyQuotePrices(
  database: DatabaseSync,
  quoteId: number,
): ApplyQuotePricesResult {
  const quote = database
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

  if (quote.status === "applied") {
    return { applied: false, insertedPrices: 0 };
  }

  if (quote.status !== "ready") {
    throw new Error("报价还没有完成全部确认，不能写入价格历史。");
  }

  if (!quote.quote_date) {
    throw new Error("报价日期缺失，不能写入价格历史。");
  }

  const items = database
    .prepare(
      `
        SELECT
          id, line_no, ingredient_id,
          normalized_unit_price_micro_yuan, status
        FROM quote_items
        WHERE quote_id = ?
        ORDER BY line_no
      `,
    )
    .all(quoteId) as ItemRow[];

  if (items.length === 0) {
    throw new Error("报价没有可应用的价格行。");
  }

  if (items.some((item) => item.status === "needs_confirmation")) {
    throw new Error("仍有待确认报价行，不能写入价格历史。");
  }

  if (
    items.some(
      (item) =>
        item.ingredient_id === null ||
        item.normalized_unit_price_micro_yuan === null,
    )
  ) {
    throw new Error("仍有未匹配或未归一化的报价行，不能写入价格历史。");
  }

  let insertedPrices = 0;

  withTransaction(database, () => {
    const existingPrice = database.prepare(
      "SELECT id FROM price_history WHERE quote_item_id = ? LIMIT 1",
    );
    const insertPrice = database.prepare(
      `
        INSERT INTO price_history (
          ingredient_id, supplier_id, quote_id, quote_item_id,
          price_micro_yuan_per_base_unit, effective_date, source, note
        ) VALUES (?, ?, ?, ?, ?, ?, 'quote', ?)
      `,
    );

    for (const item of items) {
      if (existingPrice.get(item.id)) {
        continue;
      }

      insertPrice.run(
        item.ingredient_id,
        quote.supplier_id,
        quoteId,
        item.id,
        item.normalized_unit_price_micro_yuan,
        quote.quote_date,
        `来自报价 #${quoteId} 第 ${item.line_no} 行`,
      );
      insertedPrices += 1;
    }

    database
      .prepare(
        `
          UPDATE quote_items
          SET status = 'applied',
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE quote_id = ?
        `,
      )
      .run(quoteId);

    database
      .prepare(
        `
          UPDATE quotes
          SET status = 'applied',
              applied_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?
        `,
      )
      .run(quoteId);

    database
      .prepare(
        `
          INSERT INTO audit_events (
            restaurant_id, quote_id, analysis_run_id,
            entity_type, entity_id, event_type,
            actor_type, actor_label, payload_json
          ) VALUES (?, ?, NULL, 'quote', ?, 'prices_applied', 'system', 'price-service', ?)
        `,
      )
      .run(
        quote.restaurant_id,
        quoteId,
        quoteId,
        JSON.stringify({
          insertedPrices,
          effectiveDate: quote.quote_date,
        }),
      );
  });

  return { applied: true, insertedPrices };
}
