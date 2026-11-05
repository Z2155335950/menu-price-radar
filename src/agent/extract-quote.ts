import type { DatabaseSync } from "node:sqlite";

import {
  extractedQuoteSchema,
  type ExtractionResponse,
} from "../domain/quote-extraction";
import {
  getQuoteExtractionProvider,
  type QuoteExtractionProvider,
} from "../providers";
import { saveExtractedQuote } from "./save-quote-draft";

export type ExtractQuoteOptions = {
  provider?: QuoteExtractionProvider;
};

/**
 * 提取纯文本并保存为报价草稿。
 *
 * 只写 quotes / quote_items / audit_events，
 * 不写 price_history，也不修改正式食材价格。
 */
export async function extractAndSaveQuote(
  database: DatabaseSync,
  text: string,
  options: ExtractQuoteOptions = {},
): Promise<ExtractionResponse> {
  const provider = options.provider ?? getQuoteExtractionProvider();
  const rawExtraction = await provider.extract(text);
  const quote = extractedQuoteSchema.parse(rawExtraction);

  return saveExtractedQuote(database, quote, {
    providerId: provider.id,
    source: {
      type: "text",
      sourceText: text,
      sourceFilePath: null,
      evidencePage: null,
    },
  });
}
