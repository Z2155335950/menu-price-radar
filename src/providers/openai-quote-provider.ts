import type { ExtractedQuote } from "../domain/quote-extraction";
import type { QuoteExtractionProvider } from "./quote-extraction-provider";

const SYSTEM_PROMPT = `
你是供应商报价单提取器。只输出一个 JSON 对象，不要输出 Markdown 或解释。

必须输出这些字段：
{
  "supplierNameRaw": "供应商名称",
  "quoteDate": "YYYY-MM-DD",
  "currency": "CNY",
  "items": [
    {
      "lineNo": 1,
      "itemNameRaw": "原始食材名",
      "quantityValue": "2",
      "quantityUnit": "袋",
      "packageSpecRaw": "5kg/袋",
      "packageQuantityValue": "5",
      "packageUnit": "kg",
      "priceType": "total",
      "priceValue": "220.00",
      "priceUnit": "元",
      "lineTotal": "220.00",
      "evidenceText": "原文中的这一行",
      "confidence": 0.96,
      "fieldConfidence": {
        "itemNameRaw": 0.98,
        "quantity": 0.95,
        "package": 0.96,
        "price": 0.97
      },
      "notes": null
    }
  ],
  "warnings": []
}

规则：
- 金额使用字符串，不要用浮点数；
- 日期缺失时不要猜今天，可以省略该字段并让程序报错；
- 包装、单位、数量不确定时，降低对应置信度，不要编造；
- evidenceText 必须来自用户提供的原文；
- priceType 只能是 "total" 或 "unit"；
- 不要计算成本，不要改价，不要输出任何解释。
`.trim();

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export class OpenAiQuoteExtractionProvider
  implements QuoteExtractionProvider
{
  readonly id = "openai-compatible";

  async extract(text: string): Promise<ExtractedQuote> {
    const baseUrl = process.env.AI_BASE_URL?.trim();
    const apiKey = process.env.AI_API_KEY?.trim();
    const model = process.env.AI_MODEL?.trim();

    if (!baseUrl || !apiKey || !model) {
      throw new Error(
        "AI_MODE 不是 mock，但 AI_BASE_URL、AI_API_KEY 或 AI_MODEL 没有配置。",
      );
    }

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
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: text },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`模型接口返回 ${response.status}：${detail}`);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;

    if (typeof content !== "string" || !content.trim()) {
      throw new Error("模型没有返回可解析的 JSON 内容。");
    }

    try {
      return JSON.parse(content) as ExtractedQuote;
    } catch {
      throw new Error("模型返回的内容不是合法 JSON。");
    }
  }
}
