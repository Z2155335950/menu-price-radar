import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { confirmQuoteItem } from "../src/agent/confirm-quote";
import { extractAndSaveQuote } from "../src/agent/extract-quote";
import { standardizeQuote } from "../src/agent/standardize-quote";
import { runMigrations } from "../src/db/migrate";
import { seedDemoData } from "../src/db/seed/seed-demo";
import { normalizeName } from "../src/domain/normalize";
import { DEMO_QUOTE_TEXT } from "../src/lib/demo-quote-text";
import { MockQuoteExtractionProvider } from "../src/providers/mock-quote-provider";

const databases: DatabaseSync[] = [];

function createSeededDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  runMigrations(database);
  seedDemoData(database);
  return database;
}

async function createExtractedQuote(database: DatabaseSync): Promise<number> {
  const result = await extractAndSaveQuote(database, DEMO_QUOTE_TEXT, {
    provider: new MockQuoteExtractionProvider(),
  });

  return result.quoteId;
}

function getItemId(
  database: DatabaseSync,
  quoteId: number,
  lineNo: number,
): number {
  const row = database
    .prepare(
      "SELECT id FROM quote_items WHERE quote_id = ? AND line_no = ?",
    )
    .get(quoteId, lineNo) as { id: number } | undefined;

  if (!row) {
    throw new Error("Quote item not found");
  }

  return row.id;
}

function getPriceHistoryCount(database: DatabaseSync): number {
  const row = database
    .prepare("SELECT COUNT(*) AS count FROM price_history")
    .get() as { count: number };

  return Number(row.count);
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    try {
      database.close();
    } catch {
      // Preserve the original test failure.
    }
  }
});

describe("quote standardization", () => {
  it("matches the demo names and blocks the potato package", async () => {
    const database = createSeededDatabase();
    const quoteId = await createExtractedQuote(database);

    const result = standardizeQuote(database, quoteId);

    expect(result.status).toBe("needs_confirmation");
    expect(result.summary).toMatchObject({
      totalItems: 12,
      matchedItems: 12,
      readyItems: 11,
      blockingQuestions: 1,
    });

    const chicken = result.items.find((item) => item.lineNo === 1);
    const potato = result.items.find((item) => item.lineNo === 2);

    expect(chicken).toMatchObject({
      ingredientName: "去骨鸡腿",
      baseUnit: "g",
      normalizedQuantityBase: 10_000,
      normalizedUnitPriceMicroYuan: 22_000,
      status: "ready",
    });
    expect(potato).toMatchObject({
      ingredientName: "土豆",
      normalizedQuantityBase: null,
      normalizedUnitPriceMicroYuan: null,
      status: "needs_confirmation",
    });
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]).toMatchObject({
      type: "package_unknown",
      lineNo: 2,
    });
    expect(getPriceHistoryCount(database)).toBe(38);
  });

  it("remembers a confirmed package conversion and becomes ready", async () => {
    const database = createSeededDatabase();
    const quoteId = await createExtractedQuote(database);
    const standardized = standardizeQuote(database, quoteId);
    const potato = standardized.items.find((item) => item.lineNo === 2);

    if (!potato) {
      throw new Error("Potato item missing");
    }

    const result = confirmQuoteItem(database, quoteId, {
      type: "package_unknown",
      quoteItemId: potato.id,
      remember: true,
      packageQuantityValue: "20",
      packageUnit: "kg",
    });

    expect(result.status).toBe("ready");
    expect(result.summary.blockingQuestions).toBe(0);
    expect(result.summary.readyItems).toBe(12);

    const updatedPotato = result.items.find((item) => item.lineNo === 2);
    expect(updatedPotato).toMatchObject({
      normalizedQuantityBase: 20_000,
      normalizedUnitPriceMicroYuan: 4_800,
      status: "ready",
    });

    const quote = database
      .prepare("SELECT status FROM quotes WHERE id = ?")
      .get(quoteId) as { status: string };
    const confirmation = database
      .prepare(
        "SELECT type, scope FROM confirmations WHERE quote_id = ? AND quote_item_id = ? ORDER BY id DESC LIMIT 1",
      )
      .get(quoteId, potato.id) as { type: string; scope: string };
    const conversion = database
      .prepare(
        "SELECT factor, source FROM unit_conversions WHERE ingredient_id = ? AND from_unit = '箱' AND to_unit = 'g'",
      )
      .get(updatedPotato?.ingredientId ?? 0) as
      | { factor: number; source: string }
      | undefined;

    expect(quote.status).toBe("ready");
    expect(confirmation).toEqual({
      type: "package_unknown",
      scope: "remember",
    });
    expect(conversion).toEqual({ factor: 20_000, source: "user_confirmed" });
    expect(getPriceHistoryCount(database)).toBe(38);
  });

  it("asks for abnormal price confirmation and remembers the acknowledgment", async () => {
    const database = createSeededDatabase();
    const quoteId = await createExtractedQuote(database);
    const first = standardizeQuote(database, quoteId);
    const potato = first.items.find((item) => item.lineNo === 2);

    if (!potato) {
      throw new Error("Potato item missing");
    }

    confirmQuoteItem(database, quoteId, {
      type: "package_unknown",
      quoteItemId: potato.id,
      remember: true,
      packageQuantityValue: "20",
      packageUnit: "kg",
    });

    database
      .prepare(
        "UPDATE quote_items SET price_value_micro_yuan = 240000000 WHERE quote_id = ? AND line_no = 1",
      )
      .run(quoteId);

    const abnormal = standardizeQuote(database, quoteId);
    const abnormalQuestion = abnormal.questions.find(
      (item) => item.type === "abnormal_price",
    );

    expect(abnormal.status).toBe("needs_confirmation");
    expect(abnormalQuestion).toMatchObject({
      lineNo: 1,
      blocking: true,
    });

    const chickenId = getItemId(database, quoteId, 1);
    const ready = confirmQuoteItem(database, quoteId, {
      type: "abnormal_price",
      quoteItemId: chickenId,
      remember: false,
      acknowledged: true,
    });

    expect(ready.status).toBe("ready");
    expect(ready.questions).toHaveLength(0);
    expect(getPriceHistoryCount(database)).toBe(38);
  });

  it("remembers a confirmed ambiguous mapping", async () => {
    const database = createSeededDatabase();
    const quoteId = await createExtractedQuote(database);
    const restaurant = database
      .prepare("SELECT id FROM restaurants LIMIT 1")
      .get() as { id: number };
    const potatoIngredient = database
      .prepare(
        "SELECT id FROM ingredients WHERE restaurant_id = ? AND name = '土豆'",
      )
      .get(restaurant.id) as { id: number };
    const tomatoIngredient = database
      .prepare(
        "SELECT id FROM ingredients WHERE restaurant_id = ? AND name = '番茄'",
      )
      .get(restaurant.id) as { id: number };

    database
      .prepare(
        `
          INSERT INTO ingredient_aliases (
            restaurant_id, ingredient_id, supplier_id,
            alias, normalized_alias, source
          ) VALUES (?, ?, NULL, '土豆', '土豆', 'seed')
        `,
      )
      .run(restaurant.id, tomatoIngredient.id);

    const ambiguous = standardizeQuote(database, quoteId);
    const mappingQuestion = ambiguous.questions.find(
      (item) => item.type === "mapping_ambiguous" && item.lineNo === 2,
    );

    expect(mappingQuestion).toBeDefined();
    expect(mappingQuestion?.options.map((item) => item.id).sort()).toEqual(
      [potatoIngredient.id, tomatoIngredient.id].sort(),
    );

    const potatoItemId = getItemId(database, quoteId, 2);
    const result = confirmQuoteItem(database, quoteId, {
      type: "mapping_ambiguous",
      quoteItemId: potatoItemId,
      remember: true,
      ingredientId: potatoIngredient.id,
    });

    const updated = result.items.find((item) => item.lineNo === 2);
    expect(updated?.ingredientName).toBe("土豆");
    expect(result.questions.some((item) => item.type === "package_unknown")).toBe(
      true,
    );

    const confirmation = database
      .prepare(
        "SELECT type, scope FROM confirmations WHERE quote_id = ? AND quote_item_id = ? ORDER BY id DESC LIMIT 1",
      )
      .get(quoteId, potatoItemId) as { type: string; scope: string };
    const rememberedAlias = database
      .prepare(
        `
          SELECT ingredient_id, source
          FROM ingredient_aliases
          WHERE restaurant_id = ? AND normalized_alias = ? AND supplier_id IS NOT NULL
          ORDER BY id DESC LIMIT 1
        `,
      )
      .get(restaurant.id, normalizeName("土豆")) as
      | { ingredient_id: number; source: string }
      | undefined;

    expect(confirmation).toEqual({
      type: "mapping_ambiguous",
      scope: "remember",
    });
    expect(rememberedAlias).toEqual({
      ingredient_id: potatoIngredient.id,
      source: "user_confirmed",
    });
  });
});
