import {
  deleteCatalogIngredientAlias,
  updateCatalogIngredientAlias,
} from "@/agent/manage-catalog";
import { openDatabase } from "@/db/client";
import { ingredientAliasInputSchema } from "@/domain/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; aliasId: string }>;
};

async function parseIds(context: RouteContext): Promise<{
  ingredientId: number;
  aliasId: number;
} | null> {
  const { id, aliasId } = await context.params;
  const ingredientId = Number(id);
  const parsedAliasId = Number(aliasId);

  if (
    !Number.isInteger(ingredientId) ||
    ingredientId <= 0 ||
    !Number.isInteger(parsedAliasId) ||
    parsedAliasId <= 0
  ) {
    return null;
  }

  return { ingredientId, aliasId: parsedAliasId };
}

export async function PATCH(request: Request, context: RouteContext) {
  const ids = await parseIds(context);

  if (!ids) {
    return Response.json({ error: "食材或别名 ID 不合法。" }, { status: 400 });
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
      updateCatalogIngredientAlias(
        database,
        ids.ingredientId,
        ids.aliasId,
        parsed.data,
      ),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "修改别名失败。",
      },
      { status: 422 },
    );
  } finally {
    database.close();
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const ids = await parseIds(context);

  if (!ids) {
    return Response.json({ error: "食材或别名 ID 不合法。" }, { status: 400 });
  }

  const database = openDatabase();

  try {
    deleteCatalogIngredientAlias(database, ids.ingredientId, ids.aliasId);
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "删除别名失败。",
      },
      { status: 422 },
    );
  } finally {
    database.close();
  }
}
