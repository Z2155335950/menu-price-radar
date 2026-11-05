import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * 服务端数据库入口。
 *
 * 这个文件只能被服务端代码、脚本或测试导入。
 * 不要从使用了 "use client" 的组件中导入它。
 */

export const DEFAULT_DATABASE_PATH = resolve(
  process.cwd(),
  "data",
  "app.db",
);

export function openDatabase(
  databasePath = process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH,
): DatabaseSync {
  const resolvedPath =
    databasePath === ":memory:" ? databasePath : resolve(databasePath);

  if (resolvedPath !== ":memory:") {
    mkdirSync(dirname(resolvedPath), { recursive: true });
  }

  const database = new DatabaseSync(resolvedPath);

  // 每个连接都必须显式开启外键约束。
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA busy_timeout = 5000;");

  if (resolvedPath !== ":memory:") {
    database.exec("PRAGMA journal_mode = WAL;");
    database.exec("PRAGMA synchronous = NORMAL;");
  }

  return database;
}
