import { describe, expect, it } from "vitest";

import { CURRENT_STAGE } from "../src/lib/app-meta";
import { checkSqlite, getHealth } from "../src/lib/health";

describe("SQLite health check", () => {
  it("opens an in-memory database and runs SELECT 1", () => {
    expect(checkSqlite()).toBe(true);
  });

  it("returns a healthy result with the current stage", () => {
    const health = getHealth();

    expect(health.status).toBe("ok");
    expect(health.database).toBe("ok");
    expect(health.stage).toBe(CURRENT_STAGE);
    expect(health.app).toBe("菜价雷达");
    expect(health.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
