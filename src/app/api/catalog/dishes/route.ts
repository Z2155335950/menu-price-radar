import {
  createCatalogDish,
  listCatalogDishes,
} from "@/agent/manage-dishes";
import { openDatabase } from "@/db/client";
import { saveDishInputSchema } from "@/domain/dish-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const database = openDatabase();

  try {
    return Response.json({
      dishes: listCatalogDishes(database, query),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "读取菜品失败。",
      },
      { status: 422 },
    );
  } finally {
    database.close();
  }
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON。" }, { status: 400 });
  }

  const parsed = saveDishInputSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        error: "菜品资料不完整。",
        details: parsed.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const database = openDatabase();

  try {
    return Response.json(createCatalogDish(database, parsed.data));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "新增菜品失败。",
      },
      { status: 422 },
    );
  } finally {
    database.close();
  }
}
