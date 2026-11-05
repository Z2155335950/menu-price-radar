import { openDatabase } from "@/db/client";
import { readUploadedFile } from "@/lib/quote-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const quoteId = Number(id);

  if (!Number.isInteger(quoteId) || quoteId <= 0) {
    return Response.json({ error: "报价 ID 不合法。" }, { status: 400 });
  }

  const database = openDatabase();

  try {
    const quote = database
      .prepare(
        "SELECT source_file_path FROM quotes WHERE id = ? LIMIT 1",
      )
      .get(quoteId) as { source_file_path: string | null } | undefined;

    if (!quote?.source_file_path) {
      return Response.json(
        { error: "这份报价没有可预览的原件。" },
        { status: 404 },
      );
    }

    const file = readUploadedFile(quote.source_file_path);
    const body = file.bytes.buffer.slice(
      file.bytes.byteOffset,
      file.bytes.byteOffset + file.bytes.byteLength,
    ) as ArrayBuffer;

    return new Response(body, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": "inline; filename=\"quote-source\"",
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch {
    return Response.json({ error: "找不到报价原件。" }, { status: 404 });
  } finally {
    database.close();
  }
}
