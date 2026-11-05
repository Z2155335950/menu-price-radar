import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { applyQuotePrices } from "../src/agent/apply-quote-prices";
import { extractAndSaveQuote } from "../src/agent/extract-quote";
import { standardizeQuote } from "../src/agent/standardize-quote";
import { runMigrations } from "../src/db/migrate";
import { seedDemoData } from "../src/db/seed/seed-demo";
import { getNonFoodExclusionReason } from "../src/domain/non-food";
import type { ExtractedQuote } from "../src/domain/quote-extraction";
import type { QuoteExtractionProvider } from "../src/providers/quote-extraction-provider";

const databases: DatabaseSync[] = [];

function createSeededDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  runMigrations(database);
  seedDemoData(database);
  return database;
}

function providerWithSupplies(): QuoteExtractionProvider {
  const quote: ExtractedQuote = {
    supplierNameRaw: "鲜源蔬菜配送",
    quoteDate: "2026-11-01",
    currency: "CNY",
    items: [
      {
        lineNo: 1,
        itemNameRaw: "去骨鸡腿",
        quantityValue: "2",
        quantityUnit: "袋",
        packageSpecRaw: "5kg/袋",
        packageQuantityValue: "5",
        packageUnit: "kg",
        priceType: "total",
        priceValue: "220.00",
        priceUnit: "元",
        lineTotal: "220.00",
        evidenceText: "去骨鸡腿 2袋×5kg 220.00",
        confidence: 0.98,
        fieldConfidence: {
          itemNameRaw: 0.98,
          quantity: 0.98,
          package: 0.98,
          price: 0.98,
          priceUnit: 0.98,
        },
        notes: null,
      },
      {
        lineNo: 2,
        itemNameRaw: "一次性筷子",
        quantityValue: "10",
        quantityUnit: "包",
        packageSpecRaw: null,
        packageQuantityValue: null,
        packageUnit: null,
        priceType: "total",
        priceValue: "20.00",
        priceUnit: "元",
        lineTotal: "20.00",
        evidenceText: "一次性筷子 10包 20.00",
        confidence: 0.98,
        fieldConfidence: {
          itemNameRaw: 0.98,
          quantity: 0.98,
          package: 0.4,
          price: 0.98,
          priceUnit: 0.98,
        },
        notes: null,
      },
    ],
    warnings: [],
  };

  return {
    id: "non-food-test",
    async extract() {
      return quote;
    },
  };
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

describe("non-food quote items", () => {
  it("recognizes common restaurant supplies without rejecting food", () => {
    expect(getNonFoodExclusionReason("纸巾 10包")).not.toBeNull();
    expect(getNonFoodExclusionReason("一次性筷子 100双")).not.toBeNull();
    expect(getNonFoodExclusionReason("洗洁精 2桶")).not.toBeNull();
    expect(getNonFoodExclusionReason("去骨鸡腿 2袋")).toBeNull();
    expect(getNonFoodExclusionReason("纸杯蛋糕 20个")).toBeNull();
  });

  it("skips supplies and excludes them from price application", async () => {
    const database = createSeededDatabase();
    const extracted = await extractAndSaveQuote(
      database,
      "测试供应商送货单",
      { provider: providerWithSupplies() },
    );

    expect(extracted.items[0]).toMatchObject({
      itemNameRaw: "去骨鸡腿",
      status: "draft",
    });
    expect(extracted.items[1]).toMatchObject({
      itemNameRaw: "一次性筷子",
      status: "skipped",
    });
    expect(extracted.items[1].exclusionReason).toContain("非食材耗材");

    // 模拟升级前已经保存、尚未标准化的报价行。
    database
      .prepare(
        "UPDATE quote_items SET status = 'draft' WHERE quote_id = ? AND line_no = 2",
      )
      .run(extracted.quoteId);

    const standardized = standardizeQuote(database, extracted.quoteId);

    expect(standardized.summary).toMatchObject({
      totalItems: 1,
      skippedItems: 1,
      matchedItems: 1,
      blockingQuestions: 0,
    });
    expect(standardized.items[1]).toMatchObject({
      itemNameRaw: "一次性筷子",
      status: "skipped",
    });

    const applied = applyQuotePrices(database, extracted.quoteId);
    const itemStatuses = database
      .prepare(
        "SELECT item_name_raw, status FROM quote_items WHERE quote_id = ? ORDER BY line_no",
      )
      .all(extracted.quoteId) as Array<{
      item_name_raw: string;
      status: string;
    }>;

    expect(applied).toEqual({ applied: true, insertedPrices: 1 });
    expect(itemStatuses).toEqual([
      { item_name_raw: "去骨鸡腿", status: "applied" },
      { item_name_raw: "一次性筷子", status: "skipped" },
    ]);
  });
});
