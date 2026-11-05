import { describe, expect, it } from "vitest";

import {
  matchIngredient,
  type AliasRecord,
  type IngredientRecord,
} from "../src/domain/ingredient-matching";

const ingredients: IngredientRecord[] = [
  { id: 1, name: "土豆", normalizedName: "土豆", baseUnit: "g" },
  { id: 2, name: "去骨鸡腿", normalizedName: "去骨鸡腿", baseUnit: "g" },
  { id: 3, name: "番茄", normalizedName: "番茄", baseUnit: "g" },
];

const aliases: AliasRecord[] = [
  { ingredientId: 1, supplierId: null, normalizedAlias: "洋芋" },
  { ingredientId: 2, supplierId: 10, normalizedAlias: "鸡腿" },
  { ingredientId: 3, supplierId: null, normalizedAlias: "鸡腿" },
];

describe("ingredient matching", () => {
  it("matches a supplier alias exactly", () => {
    const result = matchIngredient("洋芋", 10, ingredients, aliases);

    expect(result).toMatchObject({
      status: "matched",
      ingredient: { id: 1 },
      method: "exact_alias",
    });
  });

  it("matches a standard name exactly", () => {
    const result = matchIngredient("去骨鸡腿", 10, ingredients, aliases);

    expect(result).toMatchObject({
      status: "matched",
      ingredient: { id: 2 },
      method: "exact_name",
    });
  });

  it("returns all distinct candidates when aliases disagree", () => {
    const result = matchIngredient("鸡腿", 10, ingredients, aliases);

    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidates.map((item) => item.id).sort()).toEqual([2, 3]);
    }
  });

  it("returns searchable candidates when no name matches", () => {
    const result = matchIngredient("番茄块", 10, ingredients, aliases);

    expect(result.status).toBe("not_found");
    if (result.status === "not_found") {
      expect(result.candidates.map((item) => item.id)).toContain(3);
    }
  });
});
