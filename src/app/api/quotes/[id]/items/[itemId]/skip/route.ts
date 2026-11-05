import { skipQuoteItem } from "@/agent/skip-quote-item";
import { openDatabase } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; itemId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id, itemId } = await context.params;
  const quoteId = Number(id);
  const quoteItemId = Number(itemId);

  if (
    !Number.isInteger(quoteId) ||
    quoteId <= 0 ||
    !Number.isInteger(quoteItemId) ||
    quoteItemId <= 0
  ) {
    return Response.json({ error: "报价或报价行 ID 不合法。" }, { status: 400 });
  }

  const database = openDatabase();

  try {
    return Response.json(
      skipQuoteItem(database, quoteId, quoteItemId),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "忽略报价行失败。",
      },
      { status: 422 },
    );
  } finally {
    database.close();
  }
}
