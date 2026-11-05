import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { extractAndSaveQuote } from "../src/agent/extract-quote";
import { runMigrations } from "../src/db/migrate";
import { seedDemoData } from "../src/db/seed/seed-demo";
import type { ExtractedQuote } from "../src/domain/quote-extraction";
import { DEMO_QUOTE_TEXT } from "../src/lib/demo-quote-text";
import { MockQuoteExtractionProvider } from "../src/providers/mock-quote-provider";
import type { QuoteExtractionProvider } from "../src/providers/quote-extraction-provider";

const databases: DatabaseSync[] = [];

function createSeededDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  runMigrations(database);
  seedDemoData(database);
  return database;
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    try {
      database.close();
    } catch {
      // Keep the first test failure visible.
    }
  }
});

describe("quote text extraction", () => {
  it("extracts the demo text into twelve structured items", async () => {
    const database = createSeededDatabase();

    const result = await extractAndSaveQuote(database, DEMO_QUOTE_TEXT, {
      provider: new MockQuoteExtractionProvider(),
    });

    expect(result.provider).toBe("mock");
    expect(result.status).toBe("needs_confirmation");
    expect(result.supplierNameRaw).toBe("鲜源蔬菜配送");
    expect(result.quoteDate).toBe("2026-11-01");
    expect(result.items).toHaveLength(12);
    expect(result.items[0]).toMatchObject({
      lineNo: 1,
      itemNameRaw: "去骨鸡腿",
      priceValue: "220.00",
      packageQuantityValue: "5",
      packageUnit: "kg",
    });
    expect(result.items[1].itemNameRaw).toBe("土豆");
    expect(result.items[1].status).toBe("needs_confirmation");
  });

  it("turns the missing potato package into one blocking question", async () => {
    const database = createSeededDatabase();

    const result = await extractAndSaveQuote(database, DEMO_QUOTE_TEXT, {
      provider: new MockQuoteExtractionProvider(),
    });

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]).toMatchObject({
      type: "package_unknown",
      lineNo: 2,
      field: "package",
    });
    expect(result.questions[0].message).toContain("每箱多少公斤");
    expect(result.questions[0].evidenceText).toContain("土豆 1箱 96.00");
    expect(result.warnings[0]).toContain("包装规格不完整");
  });

  it("saves a draft without touching prices or price history", async () => {
    const database = createSeededDatabase();
    const before = database
      .prepare("SELECT COUNT(*) AS count FROM price_history")
      .get() as { count: number };

    const result = await extractAndSaveQuote(database, DEMO_QUOTE_TEXT, {
      provider: new MockQuoteExtractionProvider(),
    });

    const after = database
      .prepare("SELECT COUNT(*) AS count FROM price_history")
      .get() as { count: number };
    const quote = database
      .prepare(
        "SELECT status, source_text, supplier_id FROM quotes WHERE id = ?",
      )
      .get(result.quoteId) as {
      status: string;
      source_text: string;
      supplier_id: number | null;
    };
    const newItems = database
      .prepare(`
        SELECT ingredient_id, normalized_unit_price_micro_yuan
        FROM quote_items
        WHERE quote_id = ?
      `)
      .all(result.quoteId) as Array<{
      ingredient_id: number | null;
      normalized_unit_price_micro_yuan: number | null;
    }>;

    expect(before.count).toBe(38);
    expect(after.count).toBe(38);
    expect(quote.status).toBe("needs_confirmation");
    expect(quote.source_text).toBe(DEMO_QUOTE_TEXT);
    expect(quote.supplier_id).not.toBeNull();
    expect(newItems).toHaveLength(12);
    expect(
      newItems.every(
        (item) =>
          item.ingredient_id === null &&
          item.normalized_unit_price_micro_yuan === null,
      ),
    ).toBe(true);
  });

  it("keeps the original quote and the new draft separately", async () => {
    const database = createSeededDatabase();

    const result = await extractAndSaveQuote(database, DEMO_QUOTE_TEXT, {
      provider: new MockQuoteExtractionProvider(),
    });

    const counts = database
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM quotes) AS quotes,
          (SELECT COUNT(*) FROM quote_items) AS quoteItems
      `)
      .get() as { quotes: number; quoteItems: number };
    const seedQuote = database
      .prepare("SELECT source_text FROM quotes WHERE id != ?")
      .get(result.quoteId) as { source_text: string };
    const audit = database
      .prepare(
        "SELECT event_type, actor_type FROM audit_events WHERE quote_id = ?",
      )
      .get(result.quoteId) as {
      event_type: string;
      actor_type: string;
    };

    expect(counts.quotes).toBe(2);
    expect(counts.quoteItems).toBe(24);
    expect(seedQuote.source_text).toBe(DEMO_QUOTE_TEXT);
    expect(audit).toEqual({
      event_type: "quote_extracted",
      actor_type: "system",
    });
  });

  it("does not save anything when the provider output is invalid", async () => {
    const database = createSeededDatabase();
    const invalidProvider: QuoteExtractionProvider = {
      id: "invalid",
      async extract() {
        return {
          supplierNameRaw: "",
          quoteDate: "2026-11-01",
          currency: "CNY",
          items: [],
          warnings: [],
        } as ExtractedQuote;
      },
    };

    await expect(
      extractAndSaveQuote(database, "任何文本", {
        provider: invalidProvider,
      }),
    ).rejects.toThrow();

    const count = database
      .prepare("SELECT COUNT(*) AS count FROM quotes")
      .get() as { count: number };

    expect(count.count).toBe(1);
  });
});
