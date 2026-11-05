import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createIngredientForQuoteItem } from "../src/agent/create-quote-ingredient";
import { extractAndSaveQuote } from "../src/agent/extract-quote";
import {
  deleteCatalogUnitConversion,
  deleteCatalogIngredientAlias,
  listCatalogIngredients,
  renameCatalogIngredient,
  saveCatalogIngredientAlias,
  saveCatalogUnitConversion,
  updateCatalogIngredientAlias,
  updateCatalogUnitConversion,
} from "../src/agent/manage-catalog";
import { resolveQuoteSupplier } from "../src/agent/resolve-quote-supplier";
import { skipQuoteItem } from "../src/agent/skip-quote-item";
import { standardizeQuote } from "../src/agent/standardize-quote";
import { runMigrations } from "../src/db/migrate";
import { seedDemoData } from "../src/db/seed/seed-demo";
import { normalizeName } from "../src/domain/normalize";
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

function catalogProvider(): QuoteExtractionProvider {
  const quote: ExtractedQuote = {
    supplierNameRaw: "鲜源配送",
    quoteDate: "2026-11-01",
    currency: "CNY",
    items: [
      {
        lineNo: 1,
        itemNameRaw: "西兰花",
        quantityValue: "1",
        quantityUnit: "kg",
        packageSpecRaw: null,
        packageQuantityValue: null,
        packageUnit: null,
        priceType: "total",
        priceValue: "20.00",
        priceUnit: "元",
        lineTotal: "20.00",
        evidenceText: "西兰花 1kg 20.00",
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
    ],
    warnings: [],
  };

  return {
    id: "catalog-test",
    async extract() {
      return quote;
    },
  };
}

function bottleQuoteProvider(): QuoteExtractionProvider {
  const quote: ExtractedQuote = {
    supplierNameRaw: "鲜源蔬菜配送",
    quoteDate: "2026-11-01",
    currency: "CNY",
    items: [
      {
        lineNo: 1,
        itemNameRaw: "香醋",
        quantityValue: "1",
        quantityUnit: "瓶",
        packageSpecRaw: null,
        packageQuantityValue: null,
        packageUnit: null,
        priceType: "total",
        priceValue: "2.50",
        priceUnit: "元",
        lineTotal: "2.50",
        evidenceText: "香醋 1瓶 2.50",
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
      {
        lineNo: 2,
        itemNameRaw: "食用油",
        quantityValue: "1",
        quantityUnit: "瓶",
        packageSpecRaw: null,
        packageQuantityValue: null,
        packageUnit: null,
        priceType: "total",
        priceValue: "3.00",
        priceUnit: "元",
        lineTotal: "3.00",
        evidenceText: "食用油 1瓶 3.00",
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
    id: "bottle-unit-test",
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

describe("customer-maintained catalog", () => {
  it("searches, renames, and updates ingredient-specific conversions", () => {
    const database = createSeededDatabase();
    const vinegar = database
      .prepare("SELECT id FROM ingredients WHERE name = '香醋'")
      .get() as { id: number };
    const oil = database
      .prepare("SELECT id FROM ingredients WHERE name = '食用油'")
      .get() as { id: number };

    const vinegarUnit = saveCatalogUnitConversion(database, vinegar.id, {
      fromUnit: "瓶",
      factor: 500,
    });
    const oilUnit = saveCatalogUnitConversion(database, oil.id, {
      fromUnit: "瓶",
      factor: 250,
    });

    expect(vinegarUnit).toMatchObject({
      fromUnit: "瓶",
      toUnit: "g",
      factor: 500,
    });
    expect(oilUnit).toMatchObject({
      fromUnit: "瓶",
      toUnit: "ml",
      factor: 250,
    });

    const aliasSearch = listCatalogIngredients(database, "菜籽油");
    expect(aliasSearch.map((item) => item.name)).toContain("食用油");

    const renamed = renameCatalogIngredient(database, vinegar.id, {
      name: "陈醋",
      keepOldNameAsAlias: true,
    });
    expect(renamed.name).toBe("陈醋");
    expect(renamed.aliases.map((item) => item.alias)).toContain("香醋");

    const alias = saveCatalogIngredientAlias(database, vinegar.id, {
      alias: "镇江香醋",
    });
    const updatedAlias = updateCatalogIngredientAlias(
      database,
      vinegar.id,
      alias.id,
      { alias: "镇江陈醋" },
    );
    expect(updatedAlias.alias).toBe("镇江陈醋");

    deleteCatalogIngredientAlias(database, vinegar.id, alias.id);
    expect(
      listCatalogIngredients(database, "陈醋")[0].aliases.some(
        (item) => item.id === alias.id,
      ),
    ).toBe(false);

    const updated = updateCatalogUnitConversion(
      database,
      vinegar.id,
      vinegarUnit.id,
      { fromUnit: "瓶", factor: 600 },
    );
    expect(updated.factor).toBe(600);

    deleteCatalogUnitConversion(database, oil.id, oilUnit.id);
    expect(
      listCatalogIngredients(database, "食用油")[0].unitConversions.some(
        (unit) => unit.id === oilUnit.id,
      ),
    ).toBe(false);
  });

  it("can correct a typo without keeping the old name as an alias", () => {
    const database = createSeededDatabase();
    const vinegar = database
      .prepare("SELECT id FROM ingredients WHERE name = '香醋'")
      .get() as { id: number };

    const renamed = renameCatalogIngredient(database, vinegar.id, {
      name: "香腊",
      keepOldNameAsAlias: false,
    });
    const corrected = renameCatalogIngredient(database, vinegar.id, {
      name: "香醋",
      keepOldNameAsAlias: false,
    });

    expect(renamed.name).toBe("香腊");
    expect(corrected.name).toBe("香醋");
    expect(corrected.aliases.map((item) => item.alias)).not.toContain("香腊");
  });

  it("uses different bottle capacities for different ingredients", async () => {
    const database = createSeededDatabase();
    const vinegar = database
      .prepare("SELECT id FROM ingredients WHERE name = '香醋'")
      .get() as { id: number };
    const oil = database
      .prepare("SELECT id FROM ingredients WHERE name = '食用油'")
      .get() as { id: number };

    saveCatalogUnitConversion(database, vinegar.id, {
      fromUnit: "瓶",
      factor: 500,
    });
    saveCatalogUnitConversion(database, oil.id, {
      fromUnit: "瓶",
      factor: 250,
    });

    const extracted = await extractAndSaveQuote(
      database,
      "瓶装调料报价",
      { provider: bottleQuoteProvider() },
    );
    const standardized = standardizeQuote(database, extracted.quoteId);
    const vinegarItem = standardized.items.find(
      (item) => item.itemNameRaw === "香醋",
    );
    const oilItem = standardized.items.find(
      (item) => item.itemNameRaw === "食用油",
    );

    expect(vinegarItem).toMatchObject({
      baseUnit: "g",
      normalizedQuantityBase: 500,
    });
    expect(oilItem).toMatchObject({
      baseUnit: "ml",
      normalizedQuantityBase: 250,
    });
    expect(standardized.questions).toEqual([]);
  });

  it("resolves a supplier and reuses the remembered alias", async () => {
    const database = createSeededDatabase();
    const first = await extractAndSaveQuote(
      database,
      "测试报价",
      { provider: catalogProvider() },
    );

    expect(first.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "supplier_unmatched" }),
      ]),
    );

    const supplier = database
      .prepare("SELECT id FROM suppliers WHERE name = '鲜源蔬菜配送'")
      .get() as { id: number };
    const resolution = resolveQuoteSupplier(database, first.quoteId, {
      supplierId: supplier.id,
      rememberAlias: true,
    });

    expect(resolution.supplier).toMatchObject({
      id: supplier.id,
      name: "鲜源蔬菜配送",
    });

    const alias = database
      .prepare(
        `
          SELECT supplier_id, source
          FROM supplier_aliases
          WHERE normalized_alias = ?
        `,
      )
      .get(normalizeName("鲜源配送")) as {
      supplier_id: number;
      source: string;
    };

    expect(alias).toEqual({
      supplier_id: supplier.id,
      source: "user_confirmed",
    });

    const second = await extractAndSaveQuote(
      database,
      "第二份测试报价",
      { provider: catalogProvider() },
    );

    expect(
      second.questions.some(
        (question) => question.type === "supplier_unmatched",
      ),
    ).toBe(false);

    const secondQuote = database
      .prepare("SELECT supplier_id FROM quotes WHERE id = ?")
      .get(second.quoteId) as { supplier_id: number | null };
    expect(secondQuote.supplier_id).toBe(supplier.id);
  });

  it("creates an ingredient from an unmatched quote line", async () => {
    const database = createSeededDatabase();
    const extracted = await extractAndSaveQuote(
      database,
      "测试报价",
      { provider: catalogProvider() },
    );
    const standardized = standardizeQuote(database, extracted.quoteId);
    const mapping = standardized.questions.find(
      (question) => question.type === "mapping_not_found",
    );

    expect(mapping).toBeDefined();

    if (!mapping) {
      throw new Error("Expected an unmatched ingredient question");
    }

    const result = createIngredientForQuoteItem(
      database,
      extracted.quoteId,
      {
        quoteItemId: mapping.quoteItemId,
        name: "西兰花",
        baseUnit: "g",
        rememberAlias: true,
        historicalPrice: {
          priceValue: "18.00",
          effectiveDate: "2026-10-31",
        },
      },
    );
    const updated = result.items.find(
      (item) => item.id === mapping.quoteItemId,
    );

    expect(updated).toMatchObject({
      ingredientName: "西兰花",
      baseUnit: "g",
      normalizedQuantityBase: 1000,
      previousPriceMicroYuan: 18_000,
      status: "ready",
    });
    expect(
      result.questions.some(
        (question) => question.type === "mapping_not_found",
      ),
    ).toBe(false);
    expect(
      result.questions.some(
        (question) => question.type === "new_ingredient_without_baseline",
      ),
    ).toBe(false);

    const ingredient = database
      .prepare(
        `
          SELECT id, name, base_unit
          FROM ingredients
          WHERE normalized_name = ?
        `,
      )
      .get(normalizeName("西兰花")) as {
      id: number;
      name: string;
      base_unit: string;
    };
    const alias = database
      .prepare(
        `
          SELECT ingredient_id, source
          FROM ingredient_aliases
          WHERE normalized_alias = ?
        `,
      )
      .get(normalizeName("西兰花")) as {
      ingredient_id: number;
      source: string;
    };

    expect(ingredient).toEqual({
      id: updated?.ingredientId,
      name: "西兰花",
      base_unit: "g",
    });
    expect(alias).toEqual({
      ingredient_id: ingredient.id,
      source: "user_confirmed",
    });

    const historicalPrice = database
      .prepare(
        `
          SELECT price_micro_yuan_per_base_unit, effective_date, source
          FROM price_history
          WHERE ingredient_id = ? AND source = 'manual'
        `,
      )
      .get(ingredient.id) as {
      price_micro_yuan_per_base_unit: number;
      effective_date: string;
      source: string;
    };

    expect(historicalPrice).toEqual({
      price_micro_yuan_per_base_unit: 18_000,
      effective_date: "2026-10-31",
      source: "manual",
    });
  });

  it("keeps historical price optional for a new ingredient", async () => {
    const database = createSeededDatabase();
    const extracted = await extractAndSaveQuote(
      database,
      "测试报价",
      { provider: catalogProvider() },
    );
    const standardized = standardizeQuote(database, extracted.quoteId);
    const mapping = standardized.questions.find(
      (question) => question.type === "mapping_not_found",
    );

    if (!mapping) {
      throw new Error("Expected an unmatched ingredient question");
    }

    const result = createIngredientForQuoteItem(
      database,
      extracted.quoteId,
      {
        quoteItemId: mapping.quoteItemId,
        name: "西兰花",
        baseUnit: "g",
        rememberAlias: true,
      },
    );

    expect(result.status).toBe("ready");
    expect(
      result.questions.some(
        (question) => question.type === "new_ingredient_without_baseline",
      ),
    ).toBe(true);
  });

  it("allows a user to skip an unmatched line as a non-food item", async () => {
    const database = createSeededDatabase();
    const extracted = await extractAndSaveQuote(
      database,
      "测试报价",
      { provider: catalogProvider() },
    );
    const standardized = standardizeQuote(database, extracted.quoteId);
    const mapping = standardized.questions.find(
      (question) => question.type === "mapping_not_found",
    );

    if (!mapping) {
      throw new Error("Expected an unmatched ingredient question");
    }

    const result = skipQuoteItem(
      database,
      extracted.quoteId,
      mapping.quoteItemId,
    );

    expect(result.summary).toMatchObject({
      totalItems: 0,
      skippedItems: 1,
      blockingQuestions: 0,
    });
    expect(result.items[0]).toMatchObject({
      itemNameRaw: "西兰花",
      status: "skipped",
    });
    expect(
      result.questions.some(
        (question) => question.type === "mapping_not_found",
      ),
    ).toBe(false);
  });
});
