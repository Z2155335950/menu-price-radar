import { ZodError } from "zod";

import { confirmQuoteItem } from "@/agent/confirm-quote";
import { openDatabase } from "@/db/client";
import { confirmationInputSchema } from "@/domain/standardization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const quoteId = Number(id);

  if (!Number.isInteger(quoteId) || quoteId <= 0) {
    return Response.json({ error: "报价 ID 不合法。" }, { status: 400 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON。" }, { status: 400 });
  }

  const parsed = confirmationInputSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        error: "确认内容不合法。",
        details: parsed.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const database = openDatabase();

  try {
    return Response.json(
      confirmQuoteItem(database, quoteId, parsed.data),
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: "确认数据格式不正确。" },
        { status: 400 },
      );
    }

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "保存确认时发生未知错误。",
      },
      { status: 422 },
    );
  } finally {
    database.close();
  }
}
