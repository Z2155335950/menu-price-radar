import { normalizeName } from "./normalize";

const NON_FOOD_KEYWORDS = [
  "一次性筷子",
  "筷子",
  "餐巾纸",
  "纸巾",
  "抽纸",
  "厨房纸",
  "湿纸巾",
  "湿巾",
  "打包盒",
  "一次性餐盒",
  "外卖餐盒",
  "打包袋",
  "外卖袋",
  "购物袋",
  "保鲜膜",
  "保鲜袋",
  "锡纸",
  "铝箔纸",
  "牙签",
  "吸管",
  "一次性纸杯",
  "洗洁精",
  "清洁剂",
  "消毒液",
  "漂白水",
  "洗碗布",
  "抹布",
  "拖把",
  "扫帚",
  "垃圾袋",
  "一次性手套",
  "乳胶手套",
  "一次性围裙",
  "一次性口罩",
  "chopstick",
  "toothpick",
  "napkin",
  "tissue",
  "detergent",
  "cleaning",
  "clingfilm",
  "plasticwrap",
  "trashbag",
  "disposableglove",
  "facemask",
] as const;

/**
 * 只识别高置信的非食材耗材，避免把陌生食材当作错误数据删除。
 * 返回原因表示应跳过；返回 null 表示继续进入正常食材匹配。
 */
export function getNonFoodExclusionReason(name: string): string | null {
  const normalizedName = normalizeName(name);

  for (const keyword of NON_FOOD_KEYWORDS) {
    if (normalizedName.includes(keyword)) {
      return "非食材耗材（餐具、纸品、清洁或包装用品）";
    }
  }

  return null;
}
