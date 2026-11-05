import type { DatabaseSync } from "node:sqlite";

import {
  extractedQuoteSchema,
  type ExtractedQuote,
  type ExtractionResponse,
} from "../domain/quote-extraction";
import { DEMO_QUOTE_IMAGE_SHA256 } from "../lib/demo-files";
import { DEMO_QUOTE_TEXT } from "../lib/demo-quote-text";
import { extractTextFromPdf } from "../lib/pdf";
import {
  deleteUploadedFile,
  saveUploadedFile,
} from "../lib/quote-files";
import {
  getQuoteExtractionProvider,
  getQuoteVisionProvider,
} from "../providers";
import { MockQuoteExtractionProvider } from "../providers/mock-quote-provider";
import { saveExtractedQuote } from "./save-quote-draft";

function currentAiMode(): string {
  return (process.env.AI_MODE ?? "mock").trim().toLowerCase();
}

async function extractFromPdf(bytes: Uint8Array): Promise<{
  quote: ExtractedQuote;
  providerId: string;
  sourceText: string | null;
  evidencePage: number | null;
}> {
  const pdf = await extractTextFromPdf(bytes);

  if (pdf.totalPages > 5) {
    throw new Error("PDF 最多支持 5 页，请拆分后再上传。");
  }

  if (!pdf.text || pdf.text.length < 10) {
    throw new Error(
      "PDF 中没有可提取的文字，可能是扫描件。请改用图片，或直接粘贴报价文本。",
    );
  }

  const provider = getQuoteExtractionProvider();
  const quote = extractedQuoteSchema.parse(await provider.extract(pdf.text));

  return {
    quote,
    providerId: provider.id,
    sourceText: pdf.text,
    evidencePage: pdf.totalPages === 1 ? 1 : null,
  };
}

async function extractFromImage(
  bytes: Uint8Array,
  mimeType: string,
  fileName: string,
  sha256: string,
): Promise<{
  quote: ExtractedQuote;
  providerId: string;
  sourceText: string | null;
  evidencePage: number | null;
}> {
  if (currentAiMode() === "mock") {
    if (sha256 !== DEMO_QUOTE_IMAGE_SHA256) {
      throw new Error(
        "mock 模式只能识别内置样例图片。请使用页面上的“使用样例图片”，或配置视觉模型后重试。",
      );
    }

    const provider = new MockQuoteExtractionProvider();
    const quote = extractedQuoteSchema.parse(
      await provider.extract(DEMO_QUOTE_TEXT),
    );

    return {
      quote,
      providerId: "mock",
      sourceText: null,
      evidencePage: 1,
    };
  }

  const provider = getQuoteVisionProvider();
  const quote = extractedQuoteSchema.parse(
    await provider.extractImage({ bytes, mimeType, fileName }),
  );

  return {
    quote,
    providerId: provider.id,
    sourceText: null,
    evidencePage: 1,
  };
}

/**
 * 保存并提取图片或电子 PDF，生成报价草稿。
 *
 * 任何失败都会删除刚刚写入的临时原件，避免留下没有数据库记录的孤儿文件。
 */
export async function extractAndSaveUploadedQuote(
  database: DatabaseSync,
  file: File,
): Promise<ExtractionResponse> {
  const upload = await saveUploadedFile(file);

  try {
    const isPdf = upload.mimeType === "application/pdf";
    const extracted = isPdf
      ? await extractFromPdf(upload.bytes)
      : await extractFromImage(
          upload.bytes,
          upload.mimeType,
          upload.originalName,
          upload.sha256,
        );

    return saveExtractedQuote(database, extracted.quote, {
      providerId: extracted.providerId,
      source: {
        type: isPdf ? "pdf" : "image",
        sourceText: extracted.sourceText,
        sourceFilePath: upload.relativePath,
        evidencePage: extracted.evidencePage,
      },
    });
  } catch (error) {
    deleteUploadedFile(upload.absolutePath);
    throw error;
  }
}
