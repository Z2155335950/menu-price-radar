import { saveCatalogIngredientAlias } from "@/agent/manage-catalog";
import { openDatabase } from "@/db/client";
import { ingredientAliasInputSchema } from "@/domain/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const ingredientId = Number(id);

  if (!Number.isInteger(ingredientId) || ingredientId <= 0) {
    return Response.json({ error: "食材 ID 不合法。" }, { status: 400 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON。" }, { status: 400 });
  }

  const parsed = ingredientAliasInputSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        error: "别名不合法。",
        details: parsed.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const database = openDatabase();

  try {
    return Response.json(
      saveCatalogIngredientAlias(database, ingredientId, parsed.data),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "保存别名失败。",
      },
      { status: 422 },
    );
  } finally {
    database.close();
  }
}
