import { DatabaseSync } from "node:sqlite";

import { APP_NAME, CURRENT_STAGE, CURRENT_STAGE_LABEL } from "./app-meta";

export type HealthStatus = "ok" | "error";
export type DatabaseStatus = "ok" | "error";

export type HealthResult = {
  status: HealthStatus;
  app: string;
  stage: number;
  stageLabel: string;
  database: DatabaseStatus;
  checkedAt: string;
  message?: string;
};

/**
 * 用一个内存数据库执行最小查询。
 * 这一步只验证 Node 的 SQLite 驱动在当前服务端环境可用，
 * 不创建业务表，也不读取真实数据。
 */
export function checkSqlite(): boolean {
  const database = new DatabaseSync(":memory:");

  try {
    const row = database.prepare("SELECT 1 AS ok").get() as
      | { ok: number }
      | undefined;

    return row?.ok === 1;
  } finally {
    database.close();
  }
}

export function getHealth(): HealthResult {
  const checkedAt = new Date().toISOString();

  try {
    const sqliteIsReady = checkSqlite();

    if (!sqliteIsReady) {
      throw new Error("SQLite smoke query returned an unexpected result.");
    }

    return {
      status: "ok",
      app: APP_NAME,
      stage: CURRENT_STAGE,
      stageLabel: CURRENT_STAGE_LABEL,
      database: "ok",
      checkedAt,
    };
  } catch (error) {
    return {
      status: "error",
      app: APP_NAME,
      stage: CURRENT_STAGE,
      stageLabel: CURRENT_STAGE_LABEL,
      database: "error",
      checkedAt,
      message: error instanceof Error ? error.message : "Unknown SQLite error",
    };
  }
}
