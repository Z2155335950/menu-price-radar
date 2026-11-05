import { openDatabase } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { resetDemoData } from "../src/db/seed/seed-demo.ts";

function printCounts(counts) {
  console.log(`餐厅: ${counts.restaurants}`);
  console.log(`供应商: ${counts.suppliers}`);
  console.log(`标准食材: ${counts.ingredients}`);
  console.log(`食材别名: ${counts.aliases}`);
  console.log(`单位换算: ${counts.unitConversions}`);
  console.log(`菜品: ${counts.dishes}`);
  console.log(`菜谱用量行: ${counts.recipeLines}`);
  console.log(`报价: ${counts.quotes}`);
  console.log(`报价行: ${counts.quoteItems}`);
  console.log(`历史价格: ${counts.priceHistory}`);
}

const database = openDatabase();

try {
  runMigrations(database);
  const result = resetDemoData(database);

  console.log(result.deleted ? "旧演示数据已删除。" : "没有旧演示数据需要删除。");
  console.log("演示数据已重建。");
  printCounts(result.counts);
} finally {
  database.close();
}
