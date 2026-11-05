import { z } from "zod";

export const CONFIDENCE_THRESHOLD = 0.85;

export const quoteTextInputSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "请粘贴报价文本")
    .max(20_000, "报价文本不能超过 20,000 字符"),
});

const nullableText = z.string().trim().min(1).nullable();
const decimalString = z
  .string()
  .trim()
  .regex(/^\d{1,12}(?:\.\d{1,6})?$/, "金额必须是数字字符串");

export const extractedQuoteItemSchema = z.object({
  lineNo: z.number().int().positive(),
  itemNameRaw: z.string().trim().min(1),
  quantityValue: nullableText,
  quantityUnit: nullableText,
  packageSpecRaw: nullableText,
  packageQuantityValue: nullableText,
  packageUnit: nullableText,
  priceType: z.enum(["total", "unit"]).nullable(),
  priceValue: decimalString,
  priceUnit: nullableText,
  lineTotal: decimalString.nullable(),
  evidenceText: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
  fieldConfidence: z.record(z.string(), z.number().min(0).max(1)),
  notes: z.string().nullable().optional().default(null),
});

export const extractedQuoteSchema = z.object({
  supplierNameRaw: z.string().trim().min(1),
  quoteDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "报价日期必须是 YYYY-MM-DD"),
  currency: z.literal("CNY"),
  items: z.array(extractedQuoteItemSchema).min(1),
  warnings: z.array(z.string()).optional().default([]),
});

export type ExtractedQuote = z.infer<typeof extractedQuoteSchema>;
export type ExtractedQuoteItem = z.infer<typeof extractedQuoteItemSchema>;

export type ExtractionQuestion = {
  type: "low_confidence" | "package_unknown" | "supplier_unmatched";
  lineNo: number | null;
  field: string | null;
  message: string;
  evidenceText: string | null;
};

export type ExtractionResponseItem = ExtractedQuoteItem & {
  status: "draft" | "needs_confirmation";
};

export type ExtractionResponse = {
  quoteId: number;
  provider: string;
  status: "extracted" | "needs_confirmation";
  supplierNameRaw: string;
  quoteDate: string;
  currency: "CNY";
  sourceType: "text" | "image" | "pdf";
  sourceUrl: string | null;
  items: ExtractionResponseItem[];
  questions: ExtractionQuestion[];
  warnings: string[];
};
