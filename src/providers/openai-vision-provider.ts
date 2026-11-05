import type { ExtractedQuote } from "../domain/quote-extraction";
import { QUOTE_EXTRACTION_SYSTEM_PROMPT } from "./openai-quote-provider";
import type {
  QuoteImageInput,
  QuoteVisionProvider,
} from "./quote-vision-provider";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export class OpenAiQuoteVisionProvider implements QuoteVisionProvider {
  readonly id = "openai-compatible-vision";

  async extractImage(input: QuoteImageInput): Promise<ExtractedQuote> {
    const baseUrl = process.env.AI_BASE_URL?.trim();
    const apiKey = process.env.AI_API_KEY?.trim();
    const model =
      process.env.AI_VISION_MODEL?.trim() ??
      process.env.AI_MODEL?.trim();

    if (!baseUrl || !apiKey || !model) {
      throw new Error(
        "图片识别需要 AI_BASE_URL、AI_API_KEY 和 AI_VISION_MODEL（或 AI_MODEL）。",
      );
    }

    const dataUrl = `data:${input.mimeType};base64,${Buffer.from(
      input.bytes,
    ).toString("base64")}`;

    const response = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: QUOTE_EXTRACTION_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `请从这张报价单图片中提取结构化数据。文件名：${input.fileName}`,
                },
                {
                  type: "image_url",
                  image_url: { url: dataUrl },
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`视觉模型接口返回 ${response.status}：${detail}`);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;

    if (typeof content !== "string" || !content.trim()) {
      throw new Error("视觉模型没有返回可解析的 JSON 内容。");
    }

    try {
      return JSON.parse(content) as ExtractedQuote;
    } catch {
      throw new Error("视觉模型返回的内容不是合法 JSON。");
    }
  }
}
