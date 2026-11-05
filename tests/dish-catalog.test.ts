import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import {
  createCatalogDish,
  listCatalogDishes,
  updateCatalogDish,
} from "../src/agent/manage-dishes";
import { runMigrations } from "../src/db/migrate";
import { seedDemoData } from "../src/db/seed/seed-demo";

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

describe("dish catalog", () => {
  it("creates, searches, and updates a dish with its recipe", () => {
    const database = createSeededDatabase();
    const cucumber = database
      .prepare("SELECT id FROM ingredients WHERE name = '黄瓜'")
      .get() as { id: number };
    const pork = database
      .prepare("SELECT id FROM ingredients WHERE name = '五花肉'")
      .get() as { id: number };
    const oil = database
      .prepare("SELECT id FROM ingredients WHERE name = '食用油'")
      .get() as { id: number };

    const created = createCatalogDish(database, {
      name: "测试小炒",
      sellingPrice: "26.00",
      targetFoodCostRateBps: 3_500,
      weeklySales: 300,
      recipe: [
        { ingredientId: cucumber.id, quantityBase: 200 },
        { ingredientId: pork.id, quantityBase: 100 },
      ],
    });

    expect(created).toMatchObject({
      name: "测试小炒",
      sellingPriceMicroYuan: 26_000_000,
      targetFoodCostRateBps: 3_500,
      weeklySales: 300,
    });
    expect(created.recipe).toHaveLength(2);
    expect(listCatalogDishes(database, "测试小炒")).toEqual([created]);

    const updated = updateCatalogDish(database, created.id, {
      name: "测试家常小炒",
      sellingPrice: "28.50",
      targetFoodCostRateBps: 3_000,
      weeklySales: null,
      recipe: [
        { ingredientId: cucumber.id, quantityBase: 250 },
        { ingredientId: oil.id, quantityBase: 30 },
      ],
    });

    expect(updated).toMatchObject({
      id: created.id,
      name: "测试家常小炒",
      sellingPriceMicroYuan: 28_500_000,
      targetFoodCostRateBps: 3_000,
      weeklySales: null,
    });
    expect(updated.recipe).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ingredientId: cucumber.id,
          quantityBase: 250,
        }),
        expect.objectContaining({
          ingredientId: oil.id,
          quantityBase: 30,
        }),
      ]),
    );
    expect(listCatalogDishes(database, "测试小炒")).toEqual([]);
    expect(listCatalogDishes(database, "家常小炒")).toEqual([updated]);

    const audit = database
      .prepare(
        `
          SELECT event_type
          FROM audit_events
          WHERE entity_type = 'dish' AND entity_id = ?
          ORDER BY id
        `,
      )
      .all(updated.id) as Array<{ event_type: string }>;
    expect(audit.map((item) => item.event_type)).toEqual([
      "dish_created",
      "dish_updated",
    ]);
  });

  it("rejects duplicate dish names", () => {
    const database = createSeededDatabase();
    const ingredient = database
      .prepare("SELECT id FROM ingredients LIMIT 1")
      .get() as { id: number };
    const input = {
      name: "宫保鸡丁",
      sellingPrice: "26.00",
      targetFoodCostRateBps: 3_500,
      weeklySales: 100,
      recipe: [{ ingredientId: ingredient.id, quantityBase: 100 }],
    };

    expect(() => createCatalogDish(database, input)).toThrow("同名菜品");
  });
});
