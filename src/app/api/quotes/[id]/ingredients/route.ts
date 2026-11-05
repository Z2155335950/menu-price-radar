import { createIngredientForQuoteItem } from "@/agent/create-quote-ingredient";
import { openDatabase } from "@/db/client";
import { createQuoteIngredientInputSchema } from "@/domain/catalog";

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

  const parsed = createQuoteIngredientInputSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        error: "食材信息不完整。",
        details: parsed.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const database = openDatabase();

  try {
    return Response.json(
      createIngredientForQuoteItem(database, quoteId, parsed.data),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "新增食材失败。",
      },
      { status: 422 },
    );
  } finally {
    database.close();
  }
}
