import type { DatabaseSync } from "node:sqlite";

/**
 * 在一个立即事务中执行同步工作。
 *
 * 业务写入只允许通过这个函数完成，避免出现“价格已更新，
 * 但价格历史没有写入”的半完成状态。MVP 不支持嵌套事务。
 */
export function withTransaction<T>(
  database: DatabaseSync,
  work: () => T,
): T {
  database.exec("BEGIN IMMEDIATE;");

  try {
    const result = work();
    database.exec("COMMIT;");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK;");
    } catch {
      // 如果 SQLite 已经自动回滚，保留原始错误更有价值。
    }

    throw error;
  }
}
