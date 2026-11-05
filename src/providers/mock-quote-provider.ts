import type {
  ExtractedQuote,
  ExtractedQuoteItem,
} from "../domain/quote-extraction";
import type { QuoteExtractionProvider } from "./quote-extraction-provider";

const PRICE_AT_END = /(\d{1,12}(?:\.\d{1,6})?)\s*元?\s*$/;
const DATE_PATTERN =
  /(?:报价日期|日期)[：:]\s*(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})/;
const GENERIC_DATE_PATTERN = /(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})/;
const PACKAGE_UNITS = new Set(["箱", "袋", "包", "件"]);
const QUANTITY_PATTERN =
  /^(\d+(?:\.\d+)?)\s*([^\s×xX*]+)?(?:\s*[×xX*]\s*(\d+(?:\.\d+)?)\s*([^\s]+))?/;

function parseQuoteDate(text: string): string | null {
  const match = DATE_PATTERN.exec(text) ?? GENERIC_DATE_PATTERN.exec(text);

  if (!match) {
    return null;
  }

  const year = match[1];
  const month = match[2].padStart(2, "0");
  const day = match[3].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export class MockQuoteExtractionProvider implements QuoteExtractionProvider {
  readonly id = "mock";

  async extract(text: string): Promise<ExtractedQuote> {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const supplierLine = lines.find(
      (line) =>
        !DATE_PATTERN.test(line) &&
        !/合计/.test(line) &&
        !PRICE_AT_END.test(line),
    );

    const supplierNameRaw = supplierLine
      ?.replace(/^供应商[：:]\s*/, "")
      .trim();

    if (!supplierNameRaw) {
      throw new Error("没有从文本中识别出供应商。");
    }

    const quoteDate = parseQuoteDate(text);

    if (!quoteDate) {
      throw new Error("没有从文本中识别出报价日期。");
    }

    const items: ExtractedQuoteItem[] = [];
    const warnings: string[] = [];

    for (const line of lines) {
      if (
        DATE_PATTERN.test(line) ||
        GENERIC_DATE_PATTERN.test(line) ||
        /报价单|合计/.test(line)
      ) {
        continue;
      }

      const priceMatch = PRICE_AT_END.exec(line);

      if (!priceMatch) {
        continue;
      }

      const body = line.slice(0, priceMatch.index).trim();
      const nameParts = body.split(/\s+/);
      const itemNameRaw = nameParts[0];

      if (!itemNameRaw) {
        continue;
      }

      const quantitySpec = body.slice(itemNameRaw.length).trim();
      const quantityMatch = QUANTITY_PATTERN.exec(quantitySpec);

      const quantityValue = quantityMatch?.[1] ?? null;
      const quantityUnit = quantityMatch?.[2] ?? null;
      const packageQuantityValue = quantityMatch?.[3] ?? null;
      const packageUnit = quantityMatch?.[4] ?? null;

      const packageUnknown =
        quantityUnit !== null &&
        PACKAGE_UNITS.has(quantityUnit) &&
        packageQuantityValue === null;

      const packageConfidence = packageUnknown
        ? 0.18
        : quantityValue === null
          ? 0.35
          : 0.95;

      const confidence = packageUnknown
        ? 0.64
        : quantityValue === null
          ? 0.55
          : 0.95;

      const packageSpecRaw =
        packageQuantityValue && packageUnit
          ? `${packageQuantityValue}${packageUnit}/${quantityUnit ?? ""}`
          : null;

      const notes = packageUnknown
        ? `未注明每${quantityUnit}重量`
        : null;

      if (packageUnknown) {
        warnings.push(`第 ${items.length + 1} 行包装规格不完整：${line}`);
      }

      items.push({
        lineNo: items.length + 1,
        itemNameRaw,
        quantityValue,
        quantityUnit,
        packageSpecRaw,
        packageQuantityValue,
        packageUnit,
        priceType: "total",
        priceValue: priceMatch[1],
        priceUnit: "元",
        lineTotal: priceMatch[1],
        evidenceText: line,
        confidence,
        fieldConfidence: {
          itemNameRaw: 0.96,
          quantity: quantityValue === null ? 0.4 : 0.95,
          package: packageConfidence,
          price: 0.97,
          priceUnit: 0.95,
        },
        notes,
      });
    }

    if (items.length === 0) {
      throw new Error(
        "没有识别出报价行。mock 模式目前支持“食材 数量 价格”的简单文本。",
      );
    }

    return {
      supplierNameRaw,
      quoteDate,
      currency: "CNY",
      items,
      warnings,
    };
  }
}
