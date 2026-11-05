import type { DatabaseSync } from "node:sqlite";

type NameRow = {
  name: string;
};

export function listTables(database: DatabaseSync): string[] {
  const rows = database
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `)
    .all() as NameRow[];

  return rows.map((row) => row.name);
}

export function listAppliedMigrations(database: DatabaseSync): string[] {
  const rows = database
    .prepare(
      "SELECT version FROM schema_migrations ORDER BY version",
    )
    .all() as Array<{ version: string }>;

  return rows.map((row) => row.version);
}

export function getSchemaVersion(database: DatabaseSync): string | null {
  const row = database
    .prepare(
      "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
    )
    .get() as { version: string } | undefined;

  return row?.version ?? null;
}
