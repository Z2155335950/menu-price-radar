/**
 * 统一名称的轻量标准化：
 * - Unicode NFKC，处理全角/半角差异；
 * - 去掉首尾空格；
 * - 转小写；
 * - 去掉中间空白。
 *
 * 这是一个确定性函数，不调用模型。
 */
export function normalizeName(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "");
}
