import { openDatabase, DEFAULT_DATABASE_PATH } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";

const database = openDatabase();

try {
  const result = runMigrations(database);

  console.log(`Database: ${process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH}`);
  console.log(
    result.applied.length > 0
      ? `Applied: ${result.applied.join(", ")}`
      : "No pending migrations.",
  );
  console.log(`Current schema: ${result.currentVersion ?? "none"}`);
} finally {
  database.close();
}
