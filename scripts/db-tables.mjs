import { openDatabase } from "../src/db/client.ts";
import { listTables } from "../src/db/inspect.ts";

const database = openDatabase();

try {
  const tables = listTables(database);

  console.log(`Tables (${tables.length}):`);
  for (const table of tables) {
    console.log(`- ${table}`);
  }
} finally {
  database.close();
}
