import { z } from "zod";

export type StandardizationQuestionType =
  | "mapping_not_found"
  | "mapping_ambiguous"
  | "package_unknown"
  | "unit_unknown"
  | "price_basis_ambiguous"
  | "abnormal_price"
  | "backdated_quote"
  | "new_ingredient_without_baseline";

export type IngredientOption = {
  id: number;
  name: string;
  baseUnit: "g" | "ml" | "个";
};

export type StandardizationQuestion = {
  id: string;
  type: StandardizationQuestionType;
  quoteItemId: number;
  lineNo: number;
  itemNameRaw: string;
  message: string;
  evidenceText: string | null;
  blocking: boolean;
  rememberable: boolean;
  baseUnit: "g" | "ml" | "个" | null;
  quantityUnit: string | null;
  options: IngredientOption[];
};

export type StandardizedItem = {
  id: number;
  lineNo: number;
  itemNameRaw: string;
  ingredientId: number | null;
  ingredientName: string | null;
  baseUnit: "g" | "ml" | "个" | null;
  matchMethod: string | null;
  matchConfidence: number | null;
  matchEvidence: string | null;
  quantityValue: string | null;
  quantityUnit: string | null;
  packageQuantityValue: string | null;
  packageUnit: string | null;
  normalizedQuantityBase: number | null;
  normalizedUnitPriceMicroYuan: number | null;
  previousPriceMicroYuan: number | null;
  priceChangeRatio: number | null;
  status: "needs_confirmation" | "ready";
  evidenceText: string | null;
};

export type StandardizationResult = {
  quoteId: number;
  status: "needs_confirmation" | "ready";
  items: StandardizedItem[];
  questions: StandardizationQuestion[];
  summary: {
    totalItems: number;
    matchedItems: number;
    readyItems: number;
    blockingQuestions: number;
  };
};

export const confirmationInputSchema = z.object({
  type: z.enum([
    "mapping_not_found",
    "mapping_ambiguous",
    "package_unknown",
    "unit_unknown",
    "price_basis_ambiguous",
    "abnormal_price",
    "backdated_quote",
    "new_ingredient_without_baseline",
  ]),
  quoteItemId: z.number().int().positive().nullable(),
  remember: z.boolean().default(false),
  ingredientId: z.number().int().positive().nullable().optional(),
  packageQuantityValue: z
    .string()
    .regex(/^\d{1,12}(?:\.\d{1,6})?$/)
    .nullable()
    .optional(),
  packageUnit: z.string().trim().min(1).nullable().optional(),
  acknowledged: z.boolean().optional(),
});

export type ConfirmationInput = z.infer<typeof confirmationInputSchema>;
