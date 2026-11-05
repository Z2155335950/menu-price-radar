import { extractText } from "unpdf";

export type PdfExtraction = {
  text: string;
  totalPages: number;
};

/**
 * 只提取电子 PDF 中已有的文字。
 * 扫描 PDF 没有文字层时返回空字符串，由上层要求用户改用图片或粘贴文本。
 */
export async function extractTextFromPdf(
  bytes: Uint8Array,
): Promise<PdfExtraction> {
  const result = await extractText(bytes, { mergePages: true });

  return {
    text: result.text.trim(),
    totalPages: result.totalPages,
  };
}
