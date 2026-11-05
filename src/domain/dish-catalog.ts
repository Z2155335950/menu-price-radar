import { z } from "zod";

import { baseUnitSchema, type BaseUnit } from "./catalog";

export type DishRecipeIngredient = {
  ingredientId: number;
  ingredientName: string;
  baseUnit: BaseUnit;
  quantityBase: number;
};

export type CatalogDish = {
  id: number;
  name: string;
  sellingPriceMicroYuan: number;
  targetFoodCostRateBps: number;
  weeklySales: number | null;
  recipe: DishRecipeIngredient[];
};

export type DishListResponse = {
  dishes: CatalogDish[];
};

export const saveDishInputSchema = z.object({
  name: z.string().trim().min(1, "菜名不能为空").max(200),
  sellingPrice: z
    .string()
    .trim()
    .regex(/^\d{1,12}(?:\.\d{1,6})?$/, "售价必须是数字"),
  targetFoodCostRateBps: z
    .number()
    .int()
    .min(1, "目标成本率必须大于 0")
    .max(10_000, "目标成本率不能超过 100%"),
  weeklySales: z.number().int().min(0).nullable(),
  recipe: z
    .array(
      z.object({
        ingredientId: z.number().int().positive(),
        quantityBase: z.number().int().positive(),
      }),
    )
    .min(1, "至少添加一种食材"),
}).superRefine((input, context) => {
  const ids = new Set<number>();

  input.recipe.forEach((line, index) => {
    if (ids.has(line.ingredientId)) {
      context.addIssue({
        code: "custom",
        message: "同一种食材不能重复添加",
        path: ["recipe", index, "ingredientId"],
      });
    }

    ids.add(line.ingredientId);
  });
});

export type SaveDishInput = z.infer<typeof saveDishInputSchema>;
