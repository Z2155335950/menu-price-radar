import type { ExtractedQuote } from "../domain/quote-extraction";

export interface QuoteExtractionProvider {
  readonly id: string;
  extract(text: string): Promise<ExtractedQuote>;
}
