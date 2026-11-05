import { ZodError } from "zod";

import { extractAndSaveUploadedQuote } from "@/agent/extract-quote-file";
import { openDatabase } from "@/db/client";
import { MAX_UPLOAD_BYTES } from "@/lib/quote-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "请求必须是 multipart/form-data。" },
      { status: 400 },
    );
  }

  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return Response.json(
      { error: "请选择一个非空的报价文件。" },
      { status: 400 },
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: "文件不能超过 10 MB。" },
      { status: 413 },
    );
  }

  const database = openDatabase();

  try {
    const result = await extractAndSaveUploadedQuote(database, file);
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: "识别结果缺少必要字段，已停止保存。",
          details: error.issues.map((issue) => issue.message),
        },
        { status: 422 },
      );
    }

    const message =
      error instanceof Error ? error.message : "处理报价文件时发生未知错误。";

    return Response.json({ error: message }, { status: 422 });
  } finally {
    database.close();
  }
}
