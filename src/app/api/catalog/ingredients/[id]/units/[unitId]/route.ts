import {
  deleteCatalogUnitConversion,
  updateCatalogUnitConversion,
} from "@/agent/manage-catalog";
import { openDatabase } from "@/db/client";
import { saveUnitConversionInputSchema } from "@/domain/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; unitId: string }>;
};

async function parseIds(context: RouteContext): Promise<{
  ingredientId: number;
  unitId: number;
} | null> {
  const { id, unitId } = await context.params;
  const ingredientId = Number(id);
  const conversionId = Number(unitId);

  if (
    !Number.isInteger(ingredientId) ||
    ingredientId <= 0 ||
    !Number.isInteger(conversionId) ||
    conversionId <= 0
  ) {
    return null;
  }

  return { ingredientId, unitId: conversionId };
}

export async function PATCH(request: Request, context: RouteContext) {
  const ids = await parseIds(context);

  if (!ids) {
    return Response.json({ error: "食材或单位 ID 不合法。" }, { status: 400 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON。" }, { status: 400 });
  }

  const parsed = saveUnitConversionInputSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        error: "单位换算不合法。",
        details: parsed.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const database = openDatabase();

  try {
    return Response.json(
      updateCatalogUnitConversion(
        database,
        ids.ingredientId,
        ids.unitId,
        parsed.data,
      ),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "修改单位换算失败。",
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
    return Response.json({ error: "食材或单位 ID 不合法。" }, { status: 400 });
  }

  const database = openDatabase();

  try {
    deleteCatalogUnitConversion(database, ids.ingredientId, ids.unitId);
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "删除单位换算失败。",
      },
      { status: 422 },
    );
  } finally {
    database.close();
  }
}
