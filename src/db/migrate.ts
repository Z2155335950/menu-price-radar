import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(
  new URL("./migrations/", import.meta.url),
);

export type MigrationResult = {
  applied: string[];
  alreadyApplied: number;
  currentVersion: string | null;
};

type MigrationRow = {
  version: string;
};

/**
 * 按文件名顺序执行尚未应用的迁移。
 *
 * 迁移 SQL 和“记录迁移版本”在同一个事务里完成。
 * 迁移文件一旦应用就不要修改，只能新增下一个版本。
 */
export function runMigrations(
  database: DatabaseSync,
  migrationsDir = DEFAULT_MIGRATIONS_DIR,
): MigrationResult {
  database.exec("PRAGMA foreign_keys = ON;");

  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ) STRICT;
  `);

  const appliedVersionRows = database
    .prepare("SELECT version FROM schema_migrations ORDER BY version")
    .all() as MigrationRow[];
  const appliedVersions = new Set(
    appliedVersionRows.map((row) => row.version),
  );

  const migrationFiles = readdirSync(migrationsDir)
    .filter((fileName) => /^\d{3}_.+\.sql$/.test(fileName))
    .sort();

  const appliedNow: string[] = [];

  for (const fileName of migrationFiles) {
    const match = /^(\d{3})_.+\.sql$/.exec(fileName);

    if (!match) {
      continue;
    }

    const version = match[1];

    if (appliedVersions.has(version)) {
      continue;
    }

    const sql = readFileSync(join(migrationsDir, fileName), "utf8");

    database.exec("BEGIN IMMEDIATE;");

    try {
      database.exec(sql);
      database
        .prepare(
          "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
        )
        .run(version, fileName);
      database.exec("COMMIT;");
      appliedNow.push(fileName);
      appliedVersions.add(version);
    } catch (error) {
      try {
        database.exec("ROLLBACK;");
      } catch {
        // 保留原始迁移错误。
      }

      const message =
        error instanceof Error ? error.message : "Unknown migration error";
      throw new Error(`Migration ${fileName} failed: ${message}`, {
        cause: error,
      });
    }
  }

  const currentVersionRow = database
    .prepare(
      "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
    )
    .get() as MigrationRow | undefined;

  return {
    applied: appliedNow,
    alreadyApplied: appliedVersions.size - appliedNow.length,
    currentVersion: currentVersionRow?.version ?? null,
  };
}
