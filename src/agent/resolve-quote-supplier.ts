import type { DatabaseSync } from "node:sqlite";

import { withTransaction } from "../db/transaction";
import type {
  CatalogSupplier,
  SupplierResolutionInput,
  SupplierResolutionResponse,
} from "../domain/catalog";
import { normalizeName } from "../domain/normalize";

type QuoteRow = {
  id: number;
  restaurant_id: number;
  supplier_id: number | null;
  supplier_name_raw: string | null;
  status: string;
};

type SupplierRow = {
  id: number;
  name: string;
};

function getQuote(database: DatabaseSync, quoteId: number): QuoteRow {
  const quote = database
    .prepare(
      `
        SELECT
          id, restaurant_id, supplier_id,
          supplier_name_raw, status
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
    throw new Error("这份报价的价格已经应用，不能修改供应商。");
  }

  return quote;
}

function listSuppliers(
  database: DatabaseSync,
  restaurantId: number,
): CatalogSupplier[] {
  return database
    .prepare(
      `
        SELECT id, name
        FROM suppliers
        WHERE restaurant_id = ? AND is_active = 1
        ORDER BY name COLLATE NOCASE
      `,
    )
    .all(restaurantId) as CatalogSupplier[];
}

function getSupplier(
  database: DatabaseSync,
  restaurantId: number,
  supplierId: number,
): SupplierRow {
  const supplier = database
    .prepare(
      `
        SELECT id, name
        FROM suppliers
        WHERE id = ? AND restaurant_id = ? AND is_active = 1
        LIMIT 1
      `,
    )
    .get(supplierId, restaurantId) as SupplierRow | undefined;

  if (!supplier) {
    throw new Error("所选供应商不存在或已停用。");
  }

  return supplier;
}

function saveSupplierAlias(
  database: DatabaseSync,
  restaurantId: number,
  supplier: SupplierRow,
  rawName: string,
): void {
  const normalizedAlias = normalizeName(rawName);

  if (normalizedAlias === normalizeName(supplier.name)) {
    return;
  }

  const canonicalConflict = database
    .prepare(
      `
        SELECT id
        FROM suppliers
        WHERE restaurant_id = ? AND normalized_name = ? AND id <> ?
        LIMIT 1
      `,
    )
    .get(restaurantId, normalizedAlias, supplier.id) as
    | { id: number }
    | undefined;

  if (canonicalConflict) {
    throw new Error("这个名称已经是另一个供应商的标准名称。");
  }

  const existing = database
    .prepare(
      `
        SELECT supplier_id
        FROM supplier_aliases
        WHERE restaurant_id = ? AND normalized_alias = ?
        LIMIT 1
      `,
    )
    .get(restaurantId, normalizedAlias) as
    | { supplier_id: number }
    | undefined;

  if (existing) {
    if (existing.supplier_id !== supplier.id) {
      throw new Error("这个名称已经被设置为另一个供应商的别名。");
    }

    return;
  }

  database
    .prepare(
      `
        INSERT INTO supplier_aliases (
          restaurant_id, supplier_id, alias,
          normalized_alias, source
        ) VALUES (?, ?, ?, ?, 'user_confirmed')
      `,
    )
    .run(restaurantId, supplier.id, rawName.trim(), normalizedAlias);
}

function buildResponse(
  database: DatabaseSync,
  quote: QuoteRow,
  supplierId: number | null,
): SupplierResolutionResponse {
  const supplier = supplierId
    ? (database
        .prepare("SELECT id, name FROM suppliers WHERE id = ? LIMIT 1")
        .get(supplierId) as SupplierRow | undefined)
    : undefined;

  return {
    supplierNameRaw: quote.supplier_name_raw ?? "",
    supplier: supplier ?? null,
    suppliers: listSuppliers(database, quote.restaurant_id),
  };
}

export function getQuoteSupplierResolution(
  database: DatabaseSync,
  quoteId: number,
): SupplierResolutionResponse {
  const quote = getQuote(database, quoteId);
  return buildResponse(database, quote, quote.supplier_id);
}

/**
 * 将报价单中的供应商写法绑定到当前餐厅的供应商主数据。
 *
 * 选择已有供应商时可以同时记住原始名称；填写新名称时若规范化后
 * 已存在相同供应商，则复用已有记录，避免重复主数据。
 */
export function resolveQuoteSupplier(
  database: DatabaseSync,
  quoteId: number,
  input: SupplierResolutionInput,
): SupplierResolutionResponse {
  let supplierId = 0;
  let response: SupplierResolutionResponse | null = null;

  withTransaction(database, () => {
    const quote = getQuote(database, quoteId);
    let supplier: SupplierRow;

    if (input.supplierId) {
      supplier = getSupplier(database, quote.restaurant_id, input.supplierId);
    } else {
      const newName = input.newName?.trim();

      if (!newName) {
        throw new Error("请选择已有供应商，或填写一个新供应商名称。");
      }

      const normalizedName = normalizeName(newName);
      const existing = database
        .prepare(
          `
            SELECT id, name
            FROM suppliers
            WHERE restaurant_id = ? AND normalized_name = ?
            LIMIT 1
          `,
        )
        .get(quote.restaurant_id, normalizedName) as
        | SupplierRow
        | undefined;

      if (existing) {
        supplier = existing;
      } else {
        const inserted = database
          .prepare(
            `
              INSERT INTO suppliers (
                restaurant_id, name, normalized_name
              ) VALUES (?, ?, ?)
            `,
          )
          .run(quote.restaurant_id, newName, normalizedName);
        supplier = {
          id: Number(inserted.lastInsertRowid),
          name: newName,
        };
      }
    }

    supplierId = supplier.id;

    database
      .prepare(
        `
          UPDATE quotes
          SET supplier_id = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?
        `,
      )
      .run(supplier.id, quoteId);

    if (input.rememberAlias && quote.supplier_name_raw) {
      saveSupplierAlias(
        database,
        quote.restaurant_id,
        supplier,
        quote.supplier_name_raw,
      );
    }

    database
      .prepare(
        `
          INSERT INTO audit_events (
            restaurant_id, quote_id, analysis_run_id,
            entity_type, entity_id, event_type,
            actor_type, actor_label, payload_json
          ) VALUES (?, ?, NULL, 'supplier', ?, 'supplier_resolved', 'user', '演示操作员', ?)
        `,
      )
      .run(
        quote.restaurant_id,
        quoteId,
        supplier.id,
        JSON.stringify({
          previousSupplierId: quote.supplier_id,
          supplierId: supplier.id,
          rawName: quote.supplier_name_raw,
          rememberedAlias: input.rememberAlias,
        }),
      );

    response = buildResponse(database, quote, supplier.id);
  });

  if (!response || supplierId === 0) {
    throw new Error("供应商保存失败。");
  }

  return response;
}
