import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { analyzeQuote } from "../src/agent/analyze-quote";
import { applyQuotePrices } from "../src/agent/apply-quote-prices";
import { confirmQuoteItem } from "../src/agent/confirm-quote";
import { extractAndSaveQuote } from "../src/agent/extract-quote";
import { standardizeQuote } from "../src/agent/standardize-quote";
import { runMigrations } from "../src/db/migrate";
import { seedDemoData } from "../src/db/seed/seed-demo";
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

async function prepareReadyQuote(database: DatabaseSync): Promise<number> {
  const extraction = await extractAndSaveQuote(database, DEMO_QUOTE_TEXT, {
    provider: new MockQuoteExtractionProvider(),
  });
  const standardized = standardizeQuote(database, extraction.quoteId);
  const potato = standardized.items.find((item) => item.lineNo === 2);

  if (!potato) {
    throw new Error("Potato item missing");
  }

  const confirmed = confirmQuoteItem(database, extraction.quoteId, {
    type: "package_unknown",
    quoteItemId: potato.id,
    remember: true,
    packageQuantityValue: "20",
    packageUnit: "kg",
  });

  expect(confirmed.status).toBe("ready");
  return extraction.quoteId;
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

describe("quote analysis", () => {
  it("blocks price application and analysis before confirmation", async () => {
    const database = createSeededDatabase();
    const extraction = await extractAndSaveQuote(database, DEMO_QUOTE_TEXT, {
      provider: new MockQuoteExtractionProvider(),
    });
    standardizeQuote(database, extraction.quoteId);

    expect(() =>
      applyQuotePrices(database, extraction.quoteId),
    ).toThrow("还没有完成全部确认");
    expect(() => analyzeQuote(database, extraction.quoteId)).toThrow();
    expect(getPriceHistoryCount(database)).toBe(38);
  });

  it("applies prices once and ranks the five affected dishes", async () => {
    const database = createSeededDatabase();
    const quoteId = await prepareReadyQuote(database);

    const analysis = analyzeQuote(database, quoteId);

    expect(analysis.summary).toEqual({
      affectedDishes: 5,
      critical: 1,
      warning: 2,
      watch: 2,
      missingSales: 1,
      totalWeeklyImpactMicroYuan: 979_200_000,
      skippedDishes: 0,
    });
    expect(getPriceHistoryCount(database)).toBe(50);

    const quote = database
      .prepare("SELECT status, applied_at FROM quotes WHERE id = ?")
      .get(quoteId) as { status: string; applied_at: string | null };
    const items = database
      .prepare(
        "SELECT status FROM quote_items WHERE quote_id = ?",
      )
      .all(quoteId) as Array<{ status: string }>;

    expect(quote.status).toBe("applied");
    expect(quote.applied_at).not.toBeNull();
    expect(items.every((item) => item.status === "applied")).toBe(true);

    const results = database
      .prepare(
        `
          SELECT
            dish_name_snapshot, cost_before_micro_yuan,
            cost_after_micro_yuan, cost_delta_micro_yuan,
            food_cost_rate_before_bps, food_cost_rate_after_bps,
            weekly_impact_micro_yuan, risk_level,
            ranking_group, rank_position, calculation_json
          FROM analysis_dish_results
          WHERE analysis_run_id = ?
          ORDER BY rank_position
        `,
      )
      .all(analysis.analysisId) as Array<{
      dish_name_snapshot: string;
      cost_before_micro_yuan: number;
      cost_after_micro_yuan: number;
      cost_delta_micro_yuan: number;
      food_cost_rate_before_bps: number;
      food_cost_rate_after_bps: number;
      weekly_impact_micro_yuan: number | null;
      risk_level: string;
      ranking_group: string;
      rank_position: number;
      calculation_json: string;
    }>;

    expect(results.map((item) => item.dish_name_snapshot)).toEqual([
      "宫保鸡丁",
      "红烧肉",
      "青椒土豆丝",
      "麻婆豆腐",
      "番茄炒蛋",
    ]);
    expect(results[0]).toMatchObject({
      cost_before_micro_yuan: 10_000_000,
      cost_after_micro_yuan: 11_000_000,
      cost_delta_micro_yuan: 1_000_000,
      food_cost_rate_before_bps: 3846,
      food_cost_rate_after_bps: 4231,
      weekly_impact_micro_yuan: 600_000_000,
      risk_level: "critical",
      ranking_group: "weekly",
      rank_position: 1,
    });
    expect(results[1]).toMatchObject({
      cost_before_micro_yuan: 10_040_000,
      cost_after_micro_yuan: 10_744_000,
      weekly_impact_micro_yuan: 211_200_000,
      risk_level: "warning",
    });
    expect(results[4]).toMatchObject({
      dish_name_snapshot: "番茄炒蛋",
      weekly_impact_micro_yuan: null,
      risk_level: "warning",
      ranking_group: "per_serving",
      rank_position: 5,
    });

    const calculation = JSON.parse(results[0].calculation_json) as {
      advice: Array<{ type: string }>;
      mainIngredient: { name: string; quoteItemId: number };
    };

    expect(calculation.mainIngredient.name).toBe("去骨鸡腿");
    expect(calculation.mainIngredient.quoteItemId).toBeGreaterThan(0);
    expect(calculation.advice.map((item) => item.type)).toEqual(
      expect.arrayContaining(["verify_quote", "negotiate", "adjust_price"]),
    );
  });

  it("does not duplicate prices or analysis when run twice", async () => {
    const database = createSeededDatabase();
    const quoteId = await prepareReadyQuote(database);

    const first = analyzeQuote(database, quoteId);
    const second = analyzeQuote(database, quoteId);

    expect(second.analysisId).not.toBe(first.analysisId);
    expect(getPriceHistoryCount(database)).toBe(50);

    const runCount = database
      .prepare(
        "SELECT COUNT(*) AS count FROM analysis_runs WHERE quote_id = ? AND status = 'completed'",
      )
      .get(quoteId) as { count: number };

    expect(runCount.count).toBe(2);

    const resultCount = database
      .prepare(
        "SELECT COUNT(*) AS count FROM analysis_dish_results WHERE analysis_run_id = ?",
      )
      .get(second.analysisId) as { count: number };

    expect(resultCount.count).toBe(5);
  });
});
