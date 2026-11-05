import { ZodError } from "zod";

import {
  getQuoteSupplierResolution,
  resolveQuoteSupplier,
} from "@/agent/resolve-quote-supplier";
import { openDatabase } from "@/db/client";
import { supplierResolutionInputSchema } from "@/domain/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function parseQuoteId(context: RouteContext): Promise<number | null> {
  const { id } = await context.params;
  const quoteId = Number(id);
  return Number.isInteger(quoteId) && quoteId > 0 ? quoteId : null;
}

export async function GET(_request: Request, context: RouteContext) {
  const quoteId = await parseQuoteId(context);

  if (quoteId === null) {
    return Response.json({ error: "报价 ID 不合法。" }, { status: 400 });
  }

  const database = openDatabase();

  try {
    return Response.json(getQuoteSupplierResolution(database, quoteId));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "读取供应商信息失败。",
      },
      { status: 422 },
    );
  } finally {
    database.close();
  }
}

export async function POST(request: Request, context: RouteContext) {
  const quoteId = await parseQuoteId(context);

  if (quoteId === null) {
    return Response.json({ error: "报价 ID 不合法。" }, { status: 400 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON。" }, { status: 400 });
  }

  const parsed = supplierResolutionInputSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        error: "供应商信息不完整。",
        details: parsed.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const database = openDatabase();

  try {
    return Response.json(
      resolveQuoteSupplier(database, quoteId, parsed.data),
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: "供应商数据格式不正确。" },
        { status: 400 },
      );
    }

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "保存供应商失败。",
      },
      { status: 422 },
    );
  } finally {
    database.close();
  }
}
