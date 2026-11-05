import { listCatalogIngredients } from "@/agent/manage-catalog";
import { openDatabase } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const database = openDatabase();

  try {
    return Response.json({
      ingredients: listCatalogIngredients(database, query),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "读取食材失败。",
      },
      { status: 422 },
    );
  } finally {
    database.close();
  }
}
