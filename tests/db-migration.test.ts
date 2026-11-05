import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase } from "../src/db/client";
import { listAppliedMigrations, listTables } from "../src/db/inspect";
import { runMigrations } from "../src/db/migrate";
import { withTransaction } from "../src/db/transaction";

const databases: DatabaseSync[] = [];

function createDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  return database;
}

function createCoreRows(database: DatabaseSync) {
  database
    .prepare("INSERT INTO restaurants (name) VALUES (?)")
    .run("临江小馆");

  const restaurant = database
    .prepare("SELECT id FROM restaurants LIMIT 1")
    .get() as { id: number };

  database
    .prepare(
      "INSERT INTO suppliers (restaurant_id, name, normalized_name) VALUES (?, ?, ?)",
    )
    .run(restaurant.id, "鲜源蔬菜配送", "鲜源蔬菜配送");

  const supplier = database
    .prepare("SELECT id FROM suppliers LIMIT 1")
    .get() as { id: number };

  database
    .prepare(
      "INSERT INTO ingredients (restaurant_id, name, normalized_name, base_unit) VALUES (?, ?, ?, ?)",
    )
    .run(restaurant.id, "去骨鸡腿", "去骨鸡腿", "g");

  const ingredient = database
    .prepare("SELECT id FROM ingredients LIMIT 1")
    .get() as { id: number };

  database
    .prepare(
      "INSERT INTO quotes (restaurant_id, supplier_id, quote_date, source_type, source_text) VALUES (?, ?, ?, 'text', ?)",
    )
    .run(restaurant.id, supplier.id, "2026-11-01", "去骨鸡腿 2袋 220元");

  const quote = database
    .prepare("SELECT id FROM quotes LIMIT 1")
    .get() as { id: number };

  database
    .prepare(
      "INSERT INTO quote_items (quote_id, line_no, item_name_raw) VALUES (?, 1, ?)",
    )
    .run(quote.id, "去骨鸡腿");

  const quoteItem = database
    .prepare("SELECT id FROM quote_items LIMIT 1")
    .get() as { id: number };

  return {
    restaurantId: restaurant.id,
    supplierId: supplier.id,
    ingredientId: ingredient.id,
    quoteId: quote.id,
    quoteItemId: quoteItem.id,
  };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    try {
      database.close();
    } catch {
      // Test cleanup should not hide the original assertion failure.
    }
  }
});

describe("database connection", () => {
  it("creates a file database with foreign keys enabled", () => {
    const directory = mkdtempSync(join(tmpdir(), "cai-jia-lei-da-"));
    const databasePath = join(directory, "test.db");
    const database = openDatabase(databasePath);

    try {
      const foreignKeys = database
        .prepare("PRAGMA foreign_keys")
        .get() as { foreign_keys: number };
      const journalMode = database
        .prepare("PRAGMA journal_mode")
        .get() as { journal_mode: string };

      expect(foreignKeys.foreign_keys).toBe(1);
      expect(journalMode.journal_mode).toBe("wal");
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("database migrations", () => {
  it("creates every core table from an empty database", () => {
    const database = createDatabase();
    runMigrations(database);

    const tables = listTables(database);

    expect(tables).toHaveLength(15);
    expect(tables).toEqual(
      expect.arrayContaining([
        "restaurants",
        "suppliers",
        "ingredients",
        "ingredient_aliases",
        "unit_conversions",
        "quotes",
        "quote_items",
        "price_history",
        "dishes",
        "dish_ingredients",
        "confirmations",
        "analysis_runs",
        "analysis_dish_results",
        "audit_events",
        "schema_migrations",
      ]),
    );
    expect(listAppliedMigrations(database)).toEqual(["001"]);
  });

  it("is idempotent and does not reapply the same migration", () => {
    const database = createDatabase();

    const first = runMigrations(database);
    const second = runMigrations(database);

    expect(first.applied).toEqual(["001_initial.sql"]);
    expect(first.currentVersion).toBe("001");
    expect(second.applied).toEqual([]);
    expect(second.alreadyApplied).toBe(1);

    const migrationCount = database
      .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
      .get() as { count: number };

    expect(migrationCount.count).toBe(1);
  });

  it("enforces foreign keys and uniqueness constraints", () => {
    const database = createDatabase();
    runMigrations(database);
    const rows = createCoreRows(database);

    expect(() =>
      database
        .prepare(
          "INSERT INTO quotes (restaurant_id, source_type, source_text) VALUES (999, 'text', 'bad')",
        )
        .run(),
    ).toThrow();

    expect(() =>
      database
        .prepare(
          "INSERT INTO ingredients (restaurant_id, name, normalized_name, base_unit) VALUES (?, ?, ?, 'kg')",
        )
        .run(rows.restaurantId, "错误食材", "错误食材"),
    ).toThrow();

    expect(() =>
      database
        .prepare(
          "INSERT INTO ingredients (restaurant_id, name, normalized_name, base_unit) VALUES (?, ?, ?, 'g')",
        )
        .run(rows.restaurantId, "去骨鸡腿", "去骨鸡腿"),
    ).toThrow();
  });

  it("keeps one price history row per quote item", () => {
    const database = createDatabase();
    runMigrations(database);
    const rows = createCoreRows(database);

    const insertPrice = database.prepare(`
      INSERT INTO price_history (
        ingredient_id, supplier_id, quote_id, quote_item_id,
        price_micro_yuan_per_base_unit, effective_date, source
      ) VALUES (?, ?, ?, ?, ?, ?, 'quote')
    `);

    insertPrice.run(
      rows.ingredientId,
      rows.supplierId,
      rows.quoteId,
      rows.quoteItemId,
      22000,
      "2026-11-01",
    );

    expect(() =>
      insertPrice.run(
        rows.ingredientId,
        rows.supplierId,
        rows.quoteId,
        rows.quoteItemId,
        23000,
        "2026-11-01",
      ),
    ).toThrow();
  });

  it("cascades quote items when a quote is deleted", () => {
    const database = createDatabase();
    runMigrations(database);
    const rows = createCoreRows(database);

    database.prepare("DELETE FROM quotes WHERE id = ?").run(rows.quoteId);

    const remaining = database
      .prepare("SELECT COUNT(*) AS count FROM quote_items")
      .get() as { count: number };

    expect(remaining.count).toBe(0);
  });

  it("rolls back all writes when a transaction fails", () => {
    const database = createDatabase();
    runMigrations(database);

    expect(() =>
      withTransaction(database, () => {
        database
          .prepare("INSERT INTO restaurants (name) VALUES (?)")
          .run("会被回滚的餐厅");
        throw new Error("模拟业务失败");
      }),
    ).toThrow("模拟业务失败");

    const remaining = database
      .prepare("SELECT COUNT(*) AS count FROM restaurants")
      .get() as { count: number };

    expect(remaining.count).toBe(0);
  });
});
