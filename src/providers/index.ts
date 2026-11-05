import { MockQuoteExtractionProvider } from "./mock-quote-provider";
import { OpenAiQuoteExtractionProvider } from "./openai-quote-provider";
import type { QuoteExtractionProvider } from "./quote-extraction-provider";

export type { QuoteExtractionProvider } from "./quote-extraction-provider";

/**
 * 默认使用 mock，保证没有 AI Key 也能完整演示。
 * 真实模式使用 OpenAI-compatible /chat/completions 接口。
 */
export function getQuoteExtractionProvider(): QuoteExtractionProvider {
  const mode = (process.env.AI_MODE ?? "mock").trim().toLowerCase();

  if (mode === "mock") {
    return new MockQuoteExtractionProvider();
  }

  if (
    mode === "openai" ||
    mode === "openai-compatible" ||
    mode === "real"
  ) {
    return new OpenAiQuoteExtractionProvider();
  }

  throw new Error(`不支持的 AI_MODE：${mode}`);
}
