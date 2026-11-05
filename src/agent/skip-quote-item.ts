import type { DatabaseSync } from "node:sqlite";

import { withTransaction } from "../db/transaction";
import type { StandardizationResult } from "../domain/standardization";
import { standardizeQuote } from "./standardize-quote";

type ItemRow = {
  id: number;
  quote_id: number;
  line_no: number;
  item_name_raw: string;
  status: string;
  notes: string | null;
  restaurant_id: number;
  quote_status: string;
};

export function skipQuoteItem(
  database: DatabaseSync,
  quoteId: number,
  quoteItemId: number,
): StandardizationResult {
  withTransaction(database, () => {
    const item = database
      .prepare(
        `
          SELECT
            qi.id, qi.quote_id, qi.line_no, qi.item_name_raw,
            qi.status, qi.notes,
            q.restaurant_id, q.status AS quote_status
          FROM quote_items qi
          JOIN quotes q ON q.id = qi.quote_id
          WHERE qi.id = ? AND qi.quote_id = ?
          LIMIT 1
        `,
      )
      .get(quoteItemId, quoteId) as ItemRow | undefined;

    if (!item) {
      throw new Error("报价行不属于这份报价。");
    }

    if (item.quote_status === "applied") {
      throw new Error("这份报价的价格已经应用，不能忽略报价行。");
    }

    if (item.status === "skipped") {
      return;
    }

    const reason = "用户忽略：非食材耗材";
    const notes = [item.notes, reason]
      .filter((value): value is string => Boolean(value))
      .join("；");

    database
      .prepare(
        `
          UPDATE quote_items
          SET ingredient_id = NULL,
              match_method = NULL,
              match_confidence = NULL,
              match_evidence = ?,
              normalized_quantity_base = NULL,
              base_unit = NULL,
              normalized_unit_price_micro_yuan = NULL,
              status = 'skipped',
              notes = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?
        `,
      )
      .run(reason, notes, item.id);

    database
      .prepare(
        `
          INSERT INTO audit_events (
            restaurant_id, quote_id, analysis_run_id,
            entity_type, entity_id, event_type,
            actor_type, actor_label, payload_json
          ) VALUES (?, ?, NULL, 'quote_item', ?, 'quote_item_skipped', 'user', '演示操作员', ?)
        `,
      )
      .run(
        item.restaurant_id,
        quoteId,
        item.id,
        JSON.stringify({
          lineNo: item.line_no,
          itemNameRaw: item.item_name_raw,
          reason: "非食材耗材",
        }),
      );
  });

  return standardizeQuote(database, quoteId);
}
