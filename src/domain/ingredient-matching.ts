import { normalizeName } from "./normalize";

export type IngredientRecord = {
  id: number;
  name: string;
  normalizedName: string;
  baseUnit: "g" | "ml" | "个";
};

export type AliasRecord = {
  ingredientId: number;
  supplierId: number | null;
  normalizedAlias: string;
};

export type IngredientMatchResult =
  | {
      status: "matched";
      ingredient: IngredientRecord;
      method: "exact_alias" | "exact_name" | "normalized_name";
      confidence: number;
      evidence: string;
    }
  | {
      status: "ambiguous";
      candidates: IngredientRecord[];
      evidence: string;
    }
  | {
      status: "not_found";
      candidates: IngredientRecord[];
    };

function uniqueById(ingredients: IngredientRecord[]): IngredientRecord[] {
  const byId = new Map<number, IngredientRecord>();

  for (const ingredient of ingredients) {
    byId.set(ingredient.id, ingredient);
  }

  return [...byId.values()];
}

/**
 * 规则优先的食材匹配。
 *
 * - 供应商别名、全局别名、标准名称都作为候选；
 * - 候选指向同一食材才自动匹配；
 * - 多个候选指向不同食材时返回 ambiguous；
 * - 没有候选时返回 not_found，并把可选食材交给用户。
 */
export function matchIngredient(
  rawName: string,
  supplierId: number | null,
  ingredients: IngredientRecord[],
  aliases: AliasRecord[],
): IngredientMatchResult {
  const normalizedName = normalizeName(rawName);
  const byId = new Map(ingredients.map((item) => [item.id, item]));

  const aliasMatches = aliases.filter(
    (alias) =>
      alias.normalizedAlias === normalizedName &&
      (alias.supplierId === null || alias.supplierId === supplierId),
  );

  const aliasCandidates = uniqueById(
    aliasMatches
      .map((alias) => byId.get(alias.ingredientId))
      .filter((item): item is IngredientRecord => Boolean(item)),
  );

  const exactNameCandidates = ingredients.filter(
    (ingredient) => ingredient.normalizedName === normalizedName,
  );

  const candidates = uniqueById([
    ...aliasCandidates,
    ...exactNameCandidates,
  ]);

  if (candidates.length === 1) {
    const ingredient = candidates[0];
    const supplierAlias = aliasMatches.find(
      (alias) =>
        alias.ingredientId === ingredient.id &&
        alias.supplierId !== null,
    );
    const anyAlias = aliasMatches.find(
      (alias) => alias.ingredientId === ingredient.id,
    );
    const exactName = exactNameCandidates.find(
      (item) => item.id === ingredient.id,
    );

    if (supplierAlias) {
      return {
        status: "matched",
        ingredient,
        method: "exact_alias",
        confidence: 1,
        evidence: "供应商专属别名精确匹配",
      };
    }

    if (anyAlias) {
      return {
        status: "matched",
        ingredient,
        method: "exact_alias",
        confidence: 1,
        evidence: "全局别名精确匹配",
      };
    }

    if (exactName) {
      return {
        status: "matched",
        ingredient,
        method:
          ingredient.name.trim() === rawName.trim()
            ? "exact_name"
            : "normalized_name",
        confidence: 1,
        evidence: "标准食材名称精确匹配",
      };
    }
  }

  if (candidates.length > 1) {
    return {
      status: "ambiguous",
      candidates,
      evidence: "名称对应多个标准食材，需要用户确认",
    };
  }

  const suggestions = ingredients.filter(
    (ingredient) =>
      ingredient.normalizedName.includes(normalizedName) ||
      normalizedName.includes(ingredient.normalizedName),
  );

  return {
    status: "not_found",
    candidates:
      suggestions.length > 0 ? uniqueById(suggestions) : ingredients,
  };
}
