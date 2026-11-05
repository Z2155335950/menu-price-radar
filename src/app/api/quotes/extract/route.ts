import { ZodError } from "zod";

import { extractAndSaveQuote } from "@/agent/extract-quote";
import { openDatabase } from "@/db/client";
import { quoteTextInputSchema } from "@/domain/quote-extraction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { error: "请求体必须是 JSON。" },
      { status: 400 },
    );
  }

  const parsedInput = quoteTextInputSchema.safeParse(payload);

  if (!parsedInput.success) {
    return Response.json(
      {
        error: "报价文本不合法。",
        details: parsedInput.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const database = openDatabase();

  try {
    const result = await extractAndSaveQuote(
      database,
      parsedInput.data.text,
    );
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: "提取结果缺少必要字段，已停止保存。",
          details: error.issues.map((issue) => issue.message),
        },
        { status: 422 },
      );
    }

    const message =
      error instanceof Error ? error.message : "提取报价时发生未知错误。";

    return Response.json({ error: message }, { status: 502 });
  } finally {
    database.close();
  }
}
