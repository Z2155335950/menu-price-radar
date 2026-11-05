import { readFileSync, unlinkSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { extractAndSaveUploadedQuote } from "../src/agent/extract-quote-file";
import { runMigrations } from "../src/db/migrate";
import { seedDemoData } from "../src/db/seed/seed-demo";
import { resolveUploadedFile } from "../src/lib/quote-files";

const databases: DatabaseSync[] = [];
const uploadedAbsolutePaths: string[] = [];
const originalAiMode = process.env.AI_MODE;

function createSeededDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  runMigrations(database);
  seedDemoData(database);
  return database;
}

function sampleFile(
  path: string,
  name: string,
  mimeType: string,
): File {
  const bytes = new Uint8Array(readFileSync(path));
  return new File([bytes], name, { type: mimeType });
}

function rememberSourceFile(database: DatabaseSync, quoteId: number): void {
  const row = database
    .prepare("SELECT source_file_path FROM quotes WHERE id = ?")
    .get(quoteId) as { source_file_path: string | null } | undefined;

  if (row?.source_file_path) {
    uploadedAbsolutePaths.push(
      resolveUploadedFile(row.source_file_path).absolutePath,
    );
  }
}

beforeEach(() => {
  process.env.AI_MODE = "mock";
});

afterEach(() => {
  if (originalAiMode === undefined) {
    delete process.env.AI_MODE;
  } else {
    process.env.AI_MODE = originalAiMode;
  }

  for (const path of uploadedAbsolutePaths.splice(0)) {
    try {
      unlinkSync(path);
    } catch {
      // The test may have intentionally removed the file already.
    }
  }

  for (const database of databases.splice(0)) {
    try {
      database.close();
    } catch {
      // Preserve the original test failure.
    }
  }
});

describe("image and PDF extraction", () => {
  it("extracts the built-in sample image in mock mode", async () => {
    const database = createSeededDatabase();
    const file = sampleFile(
      "public/samples/demo-quote.png",
      "demo-quote.png",
      "image/png",
    );

    const result = await extractAndSaveUploadedQuote(database, file);
    rememberSourceFile(database, result.quoteId);

    expect(result.sourceType).toBe("image");
    expect(result.provider).toBe("mock");
    expect(result.items).toHaveLength(12);
    expect(result.questions).toHaveLength(1);
    expect(result.sourceUrl).toBe(
      `/api/quotes/${result.quoteId}/source`,
    );

    const quote = database
      .prepare(
        "SELECT source_type, source_file_path, source_text FROM quotes WHERE id = ?",
      )
      .get(result.quoteId) as {
      source_type: string;
      source_file_path: string | null;
      source_text: string | null;
    };
    const firstItem = database
      .prepare(
        "SELECT evidence_page FROM quote_items WHERE quote_id = ? ORDER BY line_no LIMIT 1",
      )
      .get(result.quoteId) as { evidence_page: number | null };

    expect(quote.source_type).toBe("image");
    expect(quote.source_file_path).toContain("data/uploads/");
    expect(quote.source_text).toBeNull();
    expect(firstItem.evidence_page).toBe(1);
  });

  it("extracts text from the built-in electronic PDF", async () => {
    const database = createSeededDatabase();
    const file = sampleFile(
      "public/samples/demo-quote.pdf",
      "demo-quote.pdf",
      "application/pdf",
    );

    const result = await extractAndSaveUploadedQuote(database, file);
    rememberSourceFile(database, result.quoteId);

    expect(result.sourceType).toBe("pdf");
    expect(result.provider).toBe("mock");
    expect(result.items).toHaveLength(12);
    expect(result.questions).toHaveLength(1);

    const quote = database
      .prepare(
        "SELECT source_type, source_text FROM quotes WHERE id = ?",
      )
      .get(result.quoteId) as {
      source_type: string;
      source_text: string | null;
    };

    expect(quote.source_type).toBe("pdf");
    expect(quote.source_text).toContain("去骨鸡腿");
    expect(quote.source_text).toContain("土豆 1箱 96.00");
  });

  it("does not save arbitrary images while in mock mode", async () => {
    const database = createSeededDatabase();
    const file = new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
      "not-the-sample.png",
      { type: "image/png" },
    );

    await expect(
      extractAndSaveUploadedQuote(database, file),
    ).rejects.toThrow("样例图片");

    const count = database
      .prepare("SELECT COUNT(*) AS count FROM quotes")
      .get() as { count: number };

    expect(count.count).toBe(1);
  });

  it("rejects unsupported upload types and path traversal", async () => {
    const database = createSeededDatabase();
    const textFile = new File(["hello"], "quote.txt", {
      type: "text/plain",
    });

    await expect(
      extractAndSaveUploadedQuote(database, textFile),
    ).rejects.toThrow("只支持");

    expect(() => resolveUploadedFile("../package.json")).toThrow(
      "非法的原件路径",
    );
  });
});
