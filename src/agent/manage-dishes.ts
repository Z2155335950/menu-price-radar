import type { DatabaseSync } from "node:sqlite";

import { withTransaction } from "../db/transaction";
import type { BaseUnit } from "../domain/catalog";
import type {
  CatalogDish,
  SaveDishInput,
} from "../domain/dish-catalog";
import { yuanStringToMicroYuan } from "../domain/money";
import { normalizeName } from "../domain/normalize";

const DEMO_RESTAURANT_NAME = "临江小馆";

type RestaurantRow = { id: number };
type DishRow = {
  id: number;
  name: string;
  selling_price_micro_yuan: number;
  target_food_cost_rate_bps: number;
  weekly_sales: number | null;
};
type RecipeRow = {
  dish_id: number;
  ingredient_id: number;
  ingredient_name: string;
  base_unit: BaseUnit;
  quantity_base: number;
};

function getRestaurantId(database: DatabaseSync): number {
  const preferred = database
    .prepare("SELECT id FROM restaurants WHERE name = ? LIMIT 1")
    .get(DEMO_RESTAURANT_NAME) as RestaurantRow | undefined;
  const restaurant =
    preferred ??
    (database
      .prepare("SELECT id FROM restaurants ORDER BY id LIMIT 1")
      .get() as RestaurantRow | undefined);

  if (!restaurant) {
    throw new Error("数据库里没有餐厅，请先运行 npm run seed。");
  }

  return restaurant.id;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function getDish(
  database: DatabaseSync,
  restaurantId: number,
  dishId: number,
): CatalogDish {
  const dish = database
    .prepare(
      `
        SELECT
          id, name, selling_price_micro_yuan,
          target_food_cost_rate_bps, weekly_sales
        FROM dishes
        WHERE id = ? AND restaurant_id = ? AND is_active = 1
        LIMIT 1
      `,
    )
    .get(dishId, restaurantId) as DishRow | undefined;

  if (!dish) {
    throw new Error("菜品不存在或已停用。");
  }

  const recipe = database
    .prepare(
      `
        SELECT
          di.dish_id, di.ingredient_id, i.name AS ingredient_name,
          i.base_unit, di.quantity_base
        FROM dish_ingredients di
        JOIN ingredients i ON i.id = di.ingredient_id
        WHERE di.dish_id = ?
        ORDER BY di.sort_order, di.id
      `,
    )
    .all(dish.id) as RecipeRow[];

  return {
    id: dish.id,
    name: dish.name,
    sellingPriceMicroYuan: dish.selling_price_micro_yuan,
    targetFoodCostRateBps: dish.target_food_cost_rate_bps,
    weeklySales: dish.weekly_sales,
    recipe: recipe.map((line) => ({
      ingredientId: line.ingredient_id,
      ingredientName: line.ingredient_name,
      baseUnit: line.base_unit,
      quantityBase: line.quantity_base,
    })),
  };
}

export function listCatalogDishes(
  database: DatabaseSync,
  query = "",
): CatalogDish[] {
  const restaurantId = getRestaurantId(database);
  const normalizedQuery = normalizeName(query);
  const rows = database
    .prepare(
      `
        SELECT id
        FROM dishes
        WHERE restaurant_id = ?
          AND is_active = 1
          AND (
            ? = ''
            OR normalized_name LIKE ? ESCAPE '\\'
          )
        ORDER BY name COLLATE NOCASE
        LIMIT 200
      `,
    )
    .all(
      restaurantId,
      normalizedQuery,
      `%${escapeLike(normalizedQuery)}%`,
    ) as Array<{ id: number }>;

  return rows.map((row) => getDish(database, restaurantId, row.id));
}

function validateRecipeIngredients(
  database: DatabaseSync,
  restaurantId: number,
  input: SaveDishInput,
): void {
  const getIngredient = database.prepare(
    `
      SELECT id
      FROM ingredients
      WHERE id = ? AND restaurant_id = ? AND is_active = 1
      LIMIT 1
    `,
  );

  for (const line of input.recipe) {
    if (!getIngredient.get(line.ingredientId, restaurantId)) {
      throw new Error("配方中包含不存在或已停用的食材。");
    }
  }
}

function saveDish(
  database: DatabaseSync,
  dishId: number | null,
  input: SaveDishInput,
): CatalogDish {
  const restaurantId = getRestaurantId(database);
  const normalizedName = normalizeName(input.name);
  const sellingPriceMicroYuan = yuanStringToMicroYuan(input.sellingPrice);

  if (sellingPriceMicroYuan <= 0) {
    throw new Error("菜品售价必须大于 0。");
  }

  validateRecipeIngredients(database, restaurantId, input);

  const conflict = database
    .prepare(
      `
        SELECT id
        FROM dishes
        WHERE restaurant_id = ?
          AND normalized_name = ?
          AND (? IS NULL OR id <> ?)
        LIMIT 1
      `,
    )
    .get(restaurantId, normalizedName, dishId, dishId) as
    | { id: number }
    | undefined;

  if (conflict) {
    throw new Error("已经存在同名菜品。");
  }

  let savedDishId = dishId;

  withTransaction(database, () => {
    if (savedDishId === null) {
      const inserted = database
        .prepare(
          `
            INSERT INTO dishes (
              restaurant_id, name, normalized_name,
              selling_price_micro_yuan, target_food_cost_rate_bps,
              weekly_sales
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          restaurantId,
          input.name,
          normalizedName,
          sellingPriceMicroYuan,
          input.targetFoodCostRateBps,
          input.weeklySales,
        );
      savedDishId = Number(inserted.lastInsertRowid);
    } else {
      const existing = database
        .prepare(
          "SELECT id FROM dishes WHERE id = ? AND restaurant_id = ? LIMIT 1",
        )
        .get(savedDishId, restaurantId);

      if (!existing) {
        throw new Error("菜品不存在。");
      }

      database
        .prepare(
          `
            UPDATE dishes
            SET name = ?,
                normalized_name = ?,
                selling_price_micro_yuan = ?,
                target_food_cost_rate_bps = ?,
                weekly_sales = ?,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?
          `,
        )
        .run(
          input.name,
          normalizedName,
          sellingPriceMicroYuan,
          input.targetFoodCostRateBps,
          input.weeklySales,
          savedDishId,
        );
      database
        .prepare("DELETE FROM dish_ingredients WHERE dish_id = ?")
        .run(savedDishId);
    }

    const insertRecipeLine = database.prepare(
      `
        INSERT INTO dish_ingredients (
          dish_id, ingredient_id, quantity_base, sort_order
        ) VALUES (?, ?, ?, ?)
      `,
    );

    input.recipe.forEach((line, index) => {
      insertRecipeLine.run(
        savedDishId,
        line.ingredientId,
        line.quantityBase,
        index + 1,
      );
    });

    database
      .prepare(
        `
          INSERT INTO audit_events (
            restaurant_id, quote_id, analysis_run_id,
            entity_type, entity_id, event_type,
            actor_type, actor_label, payload_json
          ) VALUES (?, NULL, NULL, 'dish', ?, ?, 'user', '演示操作员', ?)
        `,
      )
      .run(
        restaurantId,
        savedDishId,
        dishId === null ? "dish_created" : "dish_updated",
        JSON.stringify({
          name: input.name,
          sellingPriceMicroYuan,
          targetFoodCostRateBps: input.targetFoodCostRateBps,
          weeklySales: input.weeklySales,
          ingredientCount: input.recipe.length,
        }),
      );
  });

  if (savedDishId === null) {
    throw new Error("菜品保存失败。");
  }

  return getDish(database, restaurantId, savedDishId);
}

export function createCatalogDish(
  database: DatabaseSync,
  input: SaveDishInput,
): CatalogDish {
  return saveDish(database, null, input);
}

export function updateCatalogDish(
  database: DatabaseSync,
  dishId: number,
  input: SaveDishInput,
): CatalogDish {
  return saveDish(database, dishId, input);
}
