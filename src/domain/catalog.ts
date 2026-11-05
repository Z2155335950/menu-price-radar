import { z } from "zod";

export const baseUnitSchema = z.enum(["g", "ml", "个"]);
export type BaseUnit = z.infer<typeof baseUnitSchema>;

export type CatalogSupplier = {
  id: number;
  name: string;
};

export type SupplierResolutionResponse = {
  supplierNameRaw: string;
  supplier: CatalogSupplier | null;
  suppliers: CatalogSupplier[];
};

export const supplierResolutionInputSchema = z
  .object({
    supplierId: z.number().int().positive().nullable().optional(),
    newName: z.string().trim().min(1).max(200).nullable().optional(),
    rememberAlias: z.boolean().default(true),
  })
  .refine(
    (input) => Boolean(input.supplierId) !== Boolean(input.newName),
    "请选择已有供应商，或填写一个新供应商名称。",
  );

export type SupplierResolutionInput = z.infer<
  typeof supplierResolutionInputSchema
>;

export const createQuoteIngredientInputSchema = z.object({
  quoteItemId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  baseUnit: baseUnitSchema,
  rememberAlias: z.boolean().default(true),
  historicalPrice: z
    .object({
      priceValue: z
        .string()
        .trim()
        .regex(/^\d{1,12}(?:\.\d{1,6})?$/, "历史价格必须是数字"),
      effectiveDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "生效日期必须是 YYYY-MM-DD"),
    })
    .nullable()
    .optional(),
});

export type CreateQuoteIngredientInput = z.infer<
  typeof createQuoteIngredientInputSchema
>;

export type CatalogIngredientAlias = {
  id: number;
  alias: string;
  supplierId: number | null;
  supplierName: string | null;
};

export type CatalogUnitConversion = {
  id: number;
  fromUnit: string;
  toUnit: "g" | "ml" | "个";
  factor: number;
  source: "system" | "user_confirmed";
};

export type CatalogIngredient = {
  id: number;
  name: string;
  baseUnit: BaseUnit;
  aliases: CatalogIngredientAlias[];
  unitConversions: CatalogUnitConversion[];
};

export type CatalogIngredientListResponse = {
  ingredients: CatalogIngredient[];
};

export const renameIngredientInputSchema = z.object({
  name: z.string().trim().min(1, "食材名称不能为空").max(200),
  keepOldNameAsAlias: z.boolean().default(false),
});

export type RenameIngredientInput = z.infer<
  typeof renameIngredientInputSchema
>;

export const saveUnitConversionInputSchema = z.object({
  fromUnit: z.string().trim().min(1, "包装单位不能为空").max(50),
  factor: z.number().int().positive("换算数量必须是正整数").max(1_000_000_000),
});

export type SaveUnitConversionInput = z.infer<
  typeof saveUnitConversionInputSchema
>;

export const ingredientAliasInputSchema = z.object({
  alias: z.string().trim().min(1, "别名不能为空").max(200),
  supplierId: z.number().int().positive().nullable().optional(),
});

export type IngredientAliasInput = z.infer<
  typeof ingredientAliasInputSchema
>;
