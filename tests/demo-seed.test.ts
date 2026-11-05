import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { runMigrations } from "../src/db/migrate";
import {
  getDemoCounts,
  resetDemoData,
  seedDemoData,
} from "../src/db/seed/seed-demo";

const databases: DatabaseSync[] = [];

function createSeededDatabase() {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  runMigrations(database);
  const result = seedDemoData(database);
  return { database, result };
}

function getDishCost(database: DatabaseSync, dishName: string): number {
  const dish = database
    .prepare("SELECT id FROM dishes WHERE name = ?")
    .get(dishName) as { id: number } | undefined;

  if (!dish) {
    throw new Error(`Dish not found: ${dishName}`);
  }

  const row = database
    .prepare(`
      SELECT COALESCE(SUM(di.quantity_base * ph.price_micro_yuan_per_base_unit), 0) AS cost
      FROM dish_ingredients di
      JOIN price_history ph ON ph.ingredient_id = di.ingredient_id
      WHERE di.dish_id = ?
    `)
    .get(dish.id) as { cost: number };

  return Number(row.cost);
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    try {
      database.close();
    } catch {
      // Preserve the original test failure if cleanup also fails.
    }
  }
});

describe("demo seed", () => {
  it("reports an empty demo before seeding", () => {
    const database = new DatabaseSync(":memory:");
    databases.push(database);
    runMigrations(database);

    expect(getDemoCounts(database)).toEqual({
      restaurants: 0,
      suppliers: 0,
      ingredients: 0,
      aliases: 0,
      unitConversions: 0,
      dishes: 0,
      recipeLines: 0,
      quotes: 0,
      quoteItems: 0,
      priceHistory: 0,
    });
  });

  it("creates the complete fictional restaurant dataset", () => {
    const { database, result } = createSeededDatabase();

    expect(result.seeded).toBe(true);
    expect(result.counts).toEqual({
      restaurants: 1,
      suppliers: 3,
      ingredients: 38,
      aliases: 8,
      unitConversions: 4,
      dishes: 15,
      recipeLines: 87,
      quotes: 1,
      quoteItems: 12,
      priceHistory: 38,
    });
  });

  it("keeps the expected old costs for the five demo dishes", () => {
    const { database } = createSeededDatabase();

    expect(getDishCost(database, "宫保鸡丁")).toBe(10_000_000);
    expect(getDishCost(database, "红烧肉")).toBe(10_040_000);
    expect(getDishCost(database, "青椒土豆丝")).toBe(4_000_000);
    expect(getDishCost(database, "麻婆豆腐")).toBe(3_500_000);
    expect(getDishCost(database, "番茄炒蛋")).toBe(5_350_000);
  });

  it("leaves exactly the potato package unresolved", () => {
    const { database } = createSeededDatabase();

    const quote = database
      .prepare("SELECT status FROM quotes LIMIT 1")
      .get() as { status: string };
    const pendingItems = database
      .prepare(`
        SELECT item_name_raw, package_spec_raw, normalized_unit_price_micro_yuan
        FROM quote_items
        WHERE status = 'needs_confirmation'
      `)
      .all() as Array<{
      item_name_raw: string;
      package_spec_raw: string;
      normalized_unit_price_micro_yuan: number | null;
    }>;

    expect(quote.status).toBe("needs_confirmation");
    expect(pendingItems).toHaveLength(1);
    expect(pendingItems[0].item_name_raw).toBe("土豆");
    expect(pendingItems[0].package_spec_raw).toContain("未注明重量");
    expect(pendingItems[0].normalized_unit_price_micro_yuan).toBeNull();
  });

  it("does not duplicate data when seed is run twice", () => {
    const { database, result: first } = createSeededDatabase();
    const second = seedDemoData(database);

    expect(first.seeded).toBe(true);
    expect(second.seeded).toBe(false);
    expect(second.counts).toEqual(first.counts);
  });

  it("resets only the demo restaurant and rebuilds it", () => {
    const { database } = createSeededDatabase();

    database
      .prepare("INSERT INTO restaurants (name) VALUES ('另一家店')")
      .run();

    const reset = resetDemoData(database);
    const restaurants = database
      .prepare("SELECT name FROM restaurants ORDER BY name")
      .all() as Array<{ name: string }>;

    expect(reset.deleted).toBe(true);
    expect(reset.seeded).toBe(true);
    expect(reset.counts).toEqual({
      restaurants: 1,
      suppliers: 3,
      ingredients: 38,
      aliases: 8,
      unitConversions: 4,
      dishes: 15,
      recipeLines: 87,
      quotes: 1,
      quoteItems: 12,
      priceHistory: 38,
    });
    expect(restaurants.map((row) => row.name)).toEqual([
      "临江小馆",
      "另一家店",
    ]);
  });
});
