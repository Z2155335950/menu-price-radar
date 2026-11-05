import { MockQuoteExtractionProvider } from "./mock-quote-provider";
import { OpenAiQuoteExtractionProvider } from "./openai-quote-provider";
import { OpenAiQuoteVisionProvider } from "./openai-vision-provider";
import type { QuoteExtractionProvider } from "./quote-extraction-provider";
import type { QuoteVisionProvider } from "./quote-vision-provider";

export type { QuoteExtractionProvider } from "./quote-extraction-provider";
export type { QuoteVisionProvider } from "./quote-vision-provider";

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

/**
 * 图片识别只支持真实视觉模型。
 * mock 模式下的样例图片由文件编排层直接使用固定 fixture。
 */
export function getQuoteVisionProvider(): QuoteVisionProvider {
  const mode = (process.env.AI_MODE ?? "mock").trim().toLowerCase();

  if (
    mode === "openai" ||
    mode === "openai-compatible" ||
    mode === "real"
  ) {
    return new OpenAiQuoteVisionProvider();
  }

  throw new Error(
    `当前 AI_MODE=${mode}，图片识别需要 openai-compatible 模式和视觉模型。`,
  );
}
