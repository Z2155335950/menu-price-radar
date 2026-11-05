import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
} as const;

export type AllowedMimeType = keyof typeof ALLOWED_MIME_TO_EXT;

export type SavedUpload = {
  absolutePath: string;
  relativePath: string;
  bytes: Uint8Array;
  sha256: string;
  mimeType: AllowedMimeType;
  originalName: string;
  size: number;
};

function isAllowedMimeType(value: string): value is AllowedMimeType {
  return value in ALLOWED_MIME_TO_EXT;
}

export async function saveUploadedFile(file: File): Promise<SavedUpload> {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("请选择一个非空的报价文件。");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("文件不能超过 10 MB。");
  }

  if (!isAllowedMimeType(file.type)) {
    throw new Error("只支持 JPEG、PNG、WebP 图片或 PDF 文件。");
  }

  const extension = ALLOWED_MIME_TO_EXT[file.type];
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const uploadDirectory = resolve(process.cwd(), "data", "uploads");
  mkdirSync(uploadDirectory, { recursive: true });

  const fileName = `${randomUUID()}.${extension}`;
  const absolutePath = resolve(uploadDirectory, fileName);
  writeFileSync(/* turbopackIgnore: true */ absolutePath, bytes);

  return {
    absolutePath,
    relativePath: `data/uploads/${fileName}`,
    bytes,
    sha256,
    mimeType: file.type,
    originalName: file.name,
    size: file.size,
  };
}

export function deleteUploadedFile(absolutePath: string): void {
  try {
    unlinkSync(absolutePath);
  } catch {
    // 清理失败不应覆盖真正的提取错误。
  }
}

export function getMimeTypeForPath(filePath: string): string {
  const extension = extname(filePath).toLowerCase();

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  if (extension === ".pdf") {
    return "application/pdf";
  }

  return "application/octet-stream";
}

export function resolveUploadedFile(relativePath: string): {
  absolutePath: string;
  mimeType: string;
} {
  const normalizedPath = relativePath.replace(/\\/g, "/");
  const uploadsRoot = resolve(process.cwd(), "data", "uploads");

  if (!normalizedPath.startsWith("data/uploads/")) {
    throw new Error("非法的原件路径。");
  }

  const absolutePath = resolve(
    /* turbopackIgnore: true */ process.cwd(),
    normalizedPath,
  );
  const relativeToUploads = relative(uploadsRoot, absolutePath);

  if (
    relativeToUploads.startsWith("..") ||
    isAbsolute(relativeToUploads)
  ) {
    throw new Error("非法的原件路径。");
  }

  return {
    absolutePath,
    mimeType: getMimeTypeForPath(absolutePath),
  };
}

export function readUploadedFile(relativePath: string): {
  bytes: Uint8Array;
  mimeType: string;
} {
  const { absolutePath, mimeType } = resolveUploadedFile(relativePath);
  return {
    bytes: new Uint8Array(
      readFileSync(/* turbopackIgnore: true */ absolutePath),
    ),
    mimeType,
  };
}
