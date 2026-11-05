import type { ExtractedQuote } from "../domain/quote-extraction";

export type QuoteImageInput = {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
};

export interface QuoteVisionProvider {
  readonly id: string;
  extractImage(input: QuoteImageInput): Promise<ExtractedQuote>;
}
