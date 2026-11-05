import { standardizeQuote } from "@/agent/standardize-quote";
import { openDatabase } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const quoteId = Number(id);

  if (!Number.isInteger(quoteId) || quoteId <= 0) {
    return Response.json({ error: "报价 ID 不合法。" }, { status: 400 });
  }

  const database = openDatabase();

  try {
    return Response.json(standardizeQuote(database, quoteId));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "标准化报价时发生未知错误。",
      },
      { status: 422 },
    );
  } finally {
    database.close();
  }
}
