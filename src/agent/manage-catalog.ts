import type { DatabaseSync } from "node:sqlite";

import { withTransaction } from "../db/transaction";
import type {
  CatalogIngredient,
  CatalogIngredientAlias,
  CatalogUnitConversion,
  IngredientAliasInput,
  RenameIngredientInput,
  SaveUnitConversionInput,
} from "../domain/catalog";
import { normalizeName } from "../domain/normalize";

const DEMO_RESTAURANT_NAME = "临江小馆";

type RestaurantRow = { id: number };
type IngredientRow = {
  id: number;
  name: string;
  base_unit: "g" | "ml" | "个";
};
type AliasRow = {
  id: number;
  ingredient_id: number;
  alias: string;
  supplier_id: number | null;
  supplier_name: string | null;
};
type ConversionRow = {
  id: number;
  ingredient_id: number;
  from_unit: string;
  to_unit: "g" | "ml" | "个";
  factor: number;
  source: "system" | "user_confirmed";
};
type AliasRecordRow = {
  id: number;
  ingredient_id: number;
  supplier_id: number | null;
  alias: string;
  normalized_alias: string;
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

function getIngredient(
  database: DatabaseSync,
  restaurantId: number,
  ingredientId: number,
): IngredientRow {
  const ingredient = database
    .prepare(
      `
        SELECT id, name, base_unit
        FROM ingredients
        WHERE id = ? AND restaurant_id = ? AND is_active = 1
        LIMIT 1
      `,
    )
    .get(ingredientId, restaurantId) as IngredientRow | undefined;

  if (!ingredient) {
    throw new Error("食材不存在或已停用。");
  }

  return ingredient;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function listCatalogIngredients(
  database: DatabaseSync,
  query = "",
): CatalogIngredient[] {
  const restaurantId = getRestaurantId(database);
  const normalizedQuery = normalizeName(query);
  const ingredientRows = database
    .prepare(
      `
        SELECT DISTINCT i.id, i.name, i.base_unit
        FROM ingredients i
        LEFT JOIN ingredient_aliases ia ON ia.ingredient_id = i.id
        WHERE i.restaurant_id = ?
          AND i.is_active = 1
          AND (
            ? = ''
            OR i.normalized_name LIKE ? ESCAPE '\\'
            OR ia.normalized_alias LIKE ? ESCAPE '\\'
          )
        ORDER BY i.name COLLATE NOCASE
        LIMIT 200
      `,
    )
    .all(
      restaurantId,
      normalizedQuery,
      `%${escapeLike(normalizedQuery)}%`,
      `%${escapeLike(normalizedQuery)}%`,
    ) as IngredientRow[];

  if (ingredientRows.length === 0) {
    return [];
  }

  const aliases = database
    .prepare(
      `
        SELECT
          ia.id, ia.ingredient_id, ia.alias,
          ia.supplier_id, s.name AS supplier_name
        FROM ingredient_aliases ia
        LEFT JOIN suppliers s ON s.id = ia.supplier_id
        WHERE ia.restaurant_id = ?
        ORDER BY ia.alias COLLATE NOCASE
      `,
    )
    .all(restaurantId) as AliasRow[];
  const conversions = database
    .prepare(
      `
        SELECT
          id, ingredient_id, from_unit, to_unit, factor, source
        FROM unit_conversions
        WHERE restaurant_id = ? AND ingredient_id IS NOT NULL
        ORDER BY from_unit COLLATE NOCASE
      `,
    )
    .all(restaurantId) as ConversionRow[];

  const aliasesByIngredient = new Map<number, CatalogIngredientAlias[]>();
  for (const alias of aliases) {
    const rows = aliasesByIngredient.get(alias.ingredient_id) ?? [];
    rows.push({
      id: alias.id,
      alias: alias.alias,
      supplierId: alias.supplier_id,
      supplierName: alias.supplier_name,
    });
    aliasesByIngredient.set(alias.ingredient_id, rows);
  }

  const conversionsByIngredient = new Map<number, CatalogUnitConversion[]>();
  for (const conversion of conversions) {
    const rows = conversionsByIngredient.get(conversion.ingredient_id) ?? [];
    rows.push({
      id: conversion.id,
      fromUnit: conversion.from_unit,
      toUnit: conversion.to_unit,
      factor: conversion.factor,
      source: conversion.source,
    });
    conversionsByIngredient.set(conversion.ingredient_id, rows);
  }

  return ingredientRows.map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    baseUnit: ingredient.base_unit,
    aliases: aliasesByIngredient.get(ingredient.id) ?? [],
    unitConversions: conversionsByIngredient.get(ingredient.id) ?? [],
  }));
}

function validateAlias(
  database: DatabaseSync,
  restaurantId: number,
  ingredientId: number,
  alias: string,
  supplierId: number | null,
  excludeAliasId: number | null = null,
): void {
  const normalizedAlias = normalizeName(alias);

  if (normalizedAlias === normalizeName(
    getIngredient(database, restaurantId, ingredientId).name,
  )) {
    throw new Error("别名不能和食材名称完全相同。");
  }

  const canonicalConflict = database
    .prepare(
      `
        SELECT id
        FROM ingredients
        WHERE restaurant_id = ?
          AND normalized_name = ?
          AND id <> ?
        LIMIT 1
      `,
    )
    .get(restaurantId, normalizedAlias, ingredientId) as
    | { id: number }
    | undefined;

  if (canonicalConflict) {
    throw new Error("这个叫法已经是另一个食材的名称。");
  }

  const existing = database
    .prepare(
      `
        SELECT ingredient_id
        FROM ingredient_aliases
        WHERE restaurant_id = ?
          AND normalized_alias = ?
          AND (? IS NULL OR id <> ?)
        LIMIT 1
      `,
    )
    .get(
      restaurantId,
      normalizedAlias,
      excludeAliasId,
      excludeAliasId,
    ) as { ingredient_id: number } | undefined;

  if (existing && existing.ingredient_id !== ingredientId) {
    throw new Error("这个叫法已经属于另一个食材。");
  }

  if (supplierId !== null) {
    const supplier = database
      .prepare(
        `
          SELECT id
          FROM suppliers
          WHERE id = ? AND restaurant_id = ? AND is_active = 1
          LIMIT 1
        `,
      )
      .get(supplierId, restaurantId) as { id: number } | undefined;

    if (!supplier) {
      throw new Error("指定的供应商不存在或已停用。");
    }
  }
}

function aliasResponse(
  database: DatabaseSync,
  aliasId: number,
): CatalogIngredientAlias {
  const row = database
    .prepare(
      `
        SELECT
          ia.id, ia.alias, ia.supplier_id,
          s.name AS supplier_name
        FROM ingredient_aliases ia
        LEFT JOIN suppliers s ON s.id = ia.supplier_id
        WHERE ia.id = ?
        LIMIT 1
      `,
    )
    .get(aliasId) as
    | {
        id: number;
        alias: string;
        supplier_id: number | null;
        supplier_name: string | null;
      }
    | undefined;

  if (!row) {
    throw new Error("别名不存在。");
  }

  return {
    id: row.id,
    alias: row.alias,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
  };
}

export function saveCatalogIngredientAlias(
  database: DatabaseSync,
  ingredientId: number,
  input: IngredientAliasInput,
): CatalogIngredientAlias {
  const restaurantId = getRestaurantId(database);
  getIngredient(database, restaurantId, ingredientId);
  const supplierId = input.supplierId ?? null;
  validateAlias(
    database,
    restaurantId,
    ingredientId,
    input.alias,
    supplierId,
  );
  const normalizedAlias = normalizeName(input.alias);
  let aliasId = 0;

  withTransaction(database, () => {
    const existing = database
      .prepare(
        `
          SELECT id, ingredient_id
          FROM ingredient_aliases
          WHERE restaurant_id = ?
            AND normalized_alias = ?
            AND (
              (? IS NULL AND supplier_id IS NULL)
              OR supplier_id = ?
            )
          LIMIT 1
        `,
      )
      .get(
        restaurantId,
        normalizedAlias,
        supplierId,
        supplierId,
      ) as { id: number; ingredient_id: number } | undefined;

    if (existing) {
      if (existing.ingredient_id !== ingredientId) {
        throw new Error("这个叫法已经属于另一个食材。");
      }

      aliasId = existing.id;
      database
        .prepare(
          `
            UPDATE ingredient_aliases
            SET alias = ?, source = 'user_confirmed'
            WHERE id = ?
          `,
        )
        .run(input.alias.trim(), existing.id);
    } else {
      const inserted = database
        .prepare(
          `
            INSERT INTO ingredient_aliases (
              restaurant_id, ingredient_id, supplier_id,
              alias, normalized_alias, source
            ) VALUES (?, ?, ?, ?, ?, 'user_confirmed')
          `,
        )
        .run(
          restaurantId,
          ingredientId,
          supplierId,
          input.alias.trim(),
          normalizedAlias,
        );
      aliasId = Number(inserted.lastInsertRowid);
    }

    database
      .prepare(
        `
          INSERT INTO audit_events (
            restaurant_id, quote_id, analysis_run_id,
            entity_type, entity_id, event_type,
            actor_type, actor_label, payload_json
          ) VALUES (?, NULL, NULL, 'ingredient_alias', ?, 'ingredient_alias_saved', 'user', '演示操作员', ?)
        `,
      )
      .run(
        restaurantId,
        aliasId,
        JSON.stringify({
          ingredientId,
          alias: input.alias.trim(),
          supplierId,
        }),
      );
  });

  return aliasResponse(database, aliasId);
}

export function updateCatalogIngredientAlias(
  database: DatabaseSync,
  ingredientId: number,
  aliasId: number,
  input: IngredientAliasInput,
): CatalogIngredientAlias {
  const restaurantId = getRestaurantId(database);
  getIngredient(database, restaurantId, ingredientId);
  const existing = database
    .prepare(
      `
        SELECT id, ingredient_id, supplier_id, alias, normalized_alias
        FROM ingredient_aliases
        WHERE id = ? AND ingredient_id = ? AND restaurant_id = ?
        LIMIT 1
      `,
    )
    .get(aliasId, ingredientId, restaurantId) as
    | AliasRecordRow
    | undefined;

  if (!existing) {
    throw new Error("别名不存在。");
  }

  const supplierId =
    input.supplierId === undefined
      ? existing.supplier_id
      : input.supplierId;
  validateAlias(
    database,
    restaurantId,
    ingredientId,
    input.alias,
    supplierId,
    aliasId,
  );

  withTransaction(database, () => {
    database
      .prepare(
        `
          UPDATE ingredient_aliases
          SET alias = ?, normalized_alias = ?,
              supplier_id = ?, source = 'user_confirmed'
          WHERE id = ?
        `,
      )
      .run(
        input.alias.trim(),
        normalizeName(input.alias),
        supplierId,
        aliasId,
      );

    database
      .prepare(
        `
          INSERT INTO audit_events (
            restaurant_id, quote_id, analysis_run_id,
            entity_type, entity_id, event_type,
            actor_type, actor_label, payload_json
          ) VALUES (?, NULL, NULL, 'ingredient_alias', ?, 'ingredient_alias_updated', 'user', '演示操作员', ?)
        `,
      )
      .run(
        restaurantId,
        aliasId,
        JSON.stringify({
          ingredientId,
          beforeAlias: existing.alias,
          afterAlias: input.alias.trim(),
          supplierId,
        }),
      );
  });

  return aliasResponse(database, aliasId);
}

export function deleteCatalogIngredientAlias(
  database: DatabaseSync,
  ingredientId: number,
  aliasId: number,
): void {
  const restaurantId = getRestaurantId(database);
  const existing = database
    .prepare(
      `
        SELECT id, ingredient_id, supplier_id, alias, normalized_alias
        FROM ingredient_aliases
        WHERE id = ? AND ingredient_id = ? AND restaurant_id = ?
        LIMIT 1
      `,
    )
    .get(aliasId, ingredientId, restaurantId) as
    | AliasRecordRow
    | undefined;

  if (!existing) {
    throw new Error("别名不存在。");
  }

  withTransaction(database, () => {
    database.prepare("DELETE FROM ingredient_aliases WHERE id = ?").run(aliasId);

    database
      .prepare(
        `
          INSERT INTO audit_events (
            restaurant_id, quote_id, analysis_run_id,
            entity_type, entity_id, event_type,
            actor_type, actor_label, payload_json
          ) VALUES (?, NULL, NULL, 'ingredient_alias', ?, 'ingredient_alias_deleted', 'user', '演示操作员', ?)
        `,
      )
      .run(
        restaurantId,
        aliasId,
        JSON.stringify({
          ingredientId,
          alias: existing.alias,
          supplierId: existing.supplier_id,
        }),
      );
  });
}

export function renameCatalogIngredient(
  database: DatabaseSync,
  ingredientId: number,
  input: RenameIngredientInput,
): CatalogIngredient {
  const name = input.name;
  const restaurantId = getRestaurantId(database);
  const normalizedName = normalizeName(name);
  const ingredient = getIngredient(database, restaurantId, ingredientId);
  const conflict = database
    .prepare(
      `
        SELECT id
        FROM ingredients
        WHERE restaurant_id = ?
          AND normalized_name = ?
          AND id <> ?
        LIMIT 1
      `,
    )
    .get(restaurantId, normalizedName, ingredientId) as
    | { id: number }
    | undefined;

  if (conflict) {
    throw new Error("已经存在同名食材。");
  }

  const aliasConflict = database
    .prepare(
      `
        SELECT id
        FROM ingredient_aliases
        WHERE restaurant_id = ?
          AND normalized_alias = ?
          AND ingredient_id <> ?
        LIMIT 1
      `,
    )
    .get(restaurantId, normalizedName, ingredientId) as
    | { id: number }
    | undefined;

  if (aliasConflict) {
    throw new Error("这个名称已经被其他食材用作别名。");
  }

  withTransaction(database, () => {
    const previousNormalizedName = normalizeName(ingredient.name);
    const previousAliasConflict =
      !input.keepOldNameAsAlias ||
      previousNormalizedName === normalizedName
        ? undefined
        : (database
            .prepare(
              `
                SELECT id
                FROM ingredient_aliases
                WHERE restaurant_id = ?
                  AND normalized_alias = ?
                  AND supplier_id IS NULL
                  AND ingredient_id <> ?
                LIMIT 1
              `,
            )
            .get(restaurantId, previousNormalizedName, ingredientId) as
            | { id: number }
            | undefined);

    if (previousAliasConflict) {
      throw new Error("旧名称已被其他食材用作别名，不能安全修改。");
    }

    database
      .prepare(
        `
          UPDATE ingredients
          SET name = ?,
              normalized_name = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?
        `,
      )
      .run(name.trim(), normalizedName, ingredientId);

    if (
      input.keepOldNameAsAlias &&
      previousNormalizedName !== normalizedName
    ) {
      const existingAlias = database
        .prepare(
          `
            SELECT id
            FROM ingredient_aliases
            WHERE restaurant_id = ?
              AND normalized_alias = ?
              AND supplier_id IS NULL
            LIMIT 1
          `,
        )
        .get(restaurantId, previousNormalizedName) as
        | { id: number }
        | undefined;

      if (existingAlias) {
        database
          .prepare(
            `
              UPDATE ingredient_aliases
              SET ingredient_id = ?, alias = ?, source = 'user_confirmed'
              WHERE id = ?
            `,
          )
          .run(ingredientId, ingredient.name, existingAlias.id);
      } else {
        database
          .prepare(
            `
              INSERT INTO ingredient_aliases (
                restaurant_id, ingredient_id, supplier_id,
                alias, normalized_alias, source
              ) VALUES (?, ?, NULL, ?, ?, 'user_confirmed')
            `,
          )
          .run(
            restaurantId,
            ingredientId,
            ingredient.name,
            previousNormalizedName,
          );
      }
    }

    database
      .prepare(
        `
          INSERT INTO audit_events (
            restaurant_id, quote_id, analysis_run_id,
            entity_type, entity_id, event_type,
            actor_type, actor_label, payload_json
          ) VALUES (?, NULL, NULL, 'ingredient', ?, 'ingredient_renamed', 'user', '演示操作员', ?)
        `,
      )
      .run(
        restaurantId,
        ingredientId,
        JSON.stringify({
          beforeName: ingredient.name,
          afterName: name.trim(),
        }),
      );
  });

  return (
    listCatalogIngredients(database, name).find(
      (item) => item.id === ingredientId,
    ) ?? {
      id: ingredient.id,
      name: name.trim(),
      baseUnit: ingredient.base_unit,
      aliases: [],
      unitConversions: [],
    }
  );
}

function validateUnitInput(
  ingredient: IngredientRow,
  input: SaveUnitConversionInput,
): void {
  const fromUnit = input.fromUnit.trim();

  if (normalizeName(fromUnit) === normalizeName(ingredient.base_unit)) {
    throw new Error("包装单位不能与食材基础单位相同。");
  }

  if (!Number.isInteger(input.factor) || input.factor <= 0) {
    throw new Error("换算数量必须是正整数。");
  }
}

export function saveCatalogUnitConversion(
  database: DatabaseSync,
  ingredientId: number,
  input: SaveUnitConversionInput,
): CatalogUnitConversion {
  const restaurantId = getRestaurantId(database);
  const ingredient = getIngredient(database, restaurantId, ingredientId);
  validateUnitInput(ingredient, input);
  const fromUnit = input.fromUnit.trim();
  let conversionId = 0;

  withTransaction(database, () => {
    const existing = database
      .prepare(
        `
          SELECT id
          FROM unit_conversions
          WHERE restaurant_id = ?
            AND ingredient_id = ?
            AND from_unit = ?
            AND to_unit = ?
          LIMIT 1
        `,
      )
      .get(
        restaurantId,
        ingredientId,
        fromUnit,
        ingredient.base_unit,
      ) as { id: number } | undefined;

    if (existing) {
      conversionId = existing.id;
      database
        .prepare(
          `
            UPDATE unit_conversions
            SET factor = ?, source = 'user_confirmed'
            WHERE id = ?
          `,
        )
        .run(input.factor, existing.id);
    } else {
      const inserted = database
        .prepare(
          `
            INSERT INTO unit_conversions (
              restaurant_id, ingredient_id, from_unit,
              to_unit, factor, source
            ) VALUES (?, ?, ?, ?, ?, 'user_confirmed')
          `,
        )
        .run(
          restaurantId,
          ingredientId,
          fromUnit,
          ingredient.base_unit,
          input.factor,
        );
      conversionId = Number(inserted.lastInsertRowid);
    }

    database
      .prepare(
        `
          INSERT INTO audit_events (
            restaurant_id, quote_id, analysis_run_id,
            entity_type, entity_id, event_type,
            actor_type, actor_label, payload_json
          ) VALUES (?, NULL, NULL, 'unit_conversion', ?, 'unit_conversion_saved', 'user', '演示操作员', ?)
        `,
      )
      .run(
        restaurantId,
        conversionId,
        JSON.stringify({
          ingredientId,
          fromUnit,
          toUnit: ingredient.base_unit,
          factor: input.factor,
        }),
      );
  });

  return {
    id: conversionId,
    fromUnit,
    toUnit: ingredient.base_unit,
    factor: input.factor,
    source: "user_confirmed",
  };
}

export function updateCatalogUnitConversion(
  database: DatabaseSync,
  ingredientId: number,
  conversionId: number,
  input: SaveUnitConversionInput,
): CatalogUnitConversion {
  const restaurantId = getRestaurantId(database);
  const ingredient = getIngredient(database, restaurantId, ingredientId);
  validateUnitInput(ingredient, input);
  const fromUnit = input.fromUnit.trim();
  const existing = database
    .prepare(
      `
        SELECT id
        FROM unit_conversions
        WHERE id = ?
          AND ingredient_id = ?
          AND restaurant_id = ?
        LIMIT 1
      `,
    )
    .get(conversionId, ingredientId, restaurantId) as
    | { id: number }
    | undefined;

  if (!existing) {
    throw new Error("单位换算不存在。");
  }

  const conflict = database
    .prepare(
      `
        SELECT id
        FROM unit_conversions
        WHERE restaurant_id = ?
          AND ingredient_id = ?
          AND from_unit = ?
          AND to_unit = ?
          AND id <> ?
        LIMIT 1
      `,
    )
    .get(
      restaurantId,
      ingredientId,
      fromUnit,
      ingredient.base_unit,
      conversionId,
    ) as { id: number } | undefined;

  if (conflict) {
    throw new Error("这个包装单位已经存在。");
  }

  withTransaction(database, () => {
    database
      .prepare(
        `
          UPDATE unit_conversions
          SET from_unit = ?,
              to_unit = ?,
              factor = ?,
              source = 'user_confirmed'
          WHERE id = ?
        `,
      )
      .run(fromUnit, ingredient.base_unit, input.factor, conversionId);

    database
      .prepare(
        `
          INSERT INTO audit_events (
            restaurant_id, quote_id, analysis_run_id,
            entity_type, entity_id, event_type,
            actor_type, actor_label, payload_json
          ) VALUES (?, NULL, NULL, 'unit_conversion', ?, 'unit_conversion_updated', 'user', '演示操作员', ?)
        `,
      )
      .run(
        restaurantId,
        conversionId,
        JSON.stringify({
          ingredientId,
          fromUnit,
          toUnit: ingredient.base_unit,
          factor: input.factor,
        }),
      );
  });

  return {
    id: conversionId,
    fromUnit,
    toUnit: ingredient.base_unit,
    factor: input.factor,
    source: "user_confirmed",
  };
}

export function deleteCatalogUnitConversion(
  database: DatabaseSync,
  ingredientId: number,
  conversionId: number,
): void {
  const restaurantId = getRestaurantId(database);
  const conversion = database
    .prepare(
      `
        SELECT id, from_unit, to_unit, factor
        FROM unit_conversions
        WHERE id = ?
          AND ingredient_id = ?
          AND restaurant_id = ?
        LIMIT 1
      `,
    )
    .get(conversionId, ingredientId, restaurantId) as
    | {
        id: number;
        from_unit: string;
        to_unit: string;
        factor: number;
      }
    | undefined;

  if (!conversion) {
    throw new Error("单位换算不存在。");
  }

  withTransaction(database, () => {
    database
      .prepare("DELETE FROM unit_conversions WHERE id = ?")
      .run(conversionId);

    database
      .prepare(
        `
          INSERT INTO audit_events (
            restaurant_id, quote_id, analysis_run_id,
            entity_type, entity_id, event_type,
            actor_type, actor_label, payload_json
          ) VALUES (?, NULL, NULL, 'unit_conversion', ?, 'unit_conversion_deleted', 'user', '演示操作员', ?)
        `,
      )
      .run(
        restaurantId,
        conversionId,
        JSON.stringify({
          ingredientId,
          fromUnit: conversion.from_unit,
          toUnit: conversion.to_unit,
          factor: conversion.factor,
        }),
      );
  });
}
