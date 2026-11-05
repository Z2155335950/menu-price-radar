const YUAN_PATTERN = /^(\d{1,12})(?:\.(\d{1,6}))?$/;
const MICRO_YUAN_PER_YUAN = 1_000_000;

/**
 * 把“元”的十进制字符串转换为整数微元。
 *
 * 例：
 *   "220.00" -> 220_000_000
 *   "43.2"   -> 43_200_000
 *   "0.022"  -> 22_000
 *
 * 不经过浮点数，避免金额精度问题。
 */
export function yuanStringToMicroYuan(value: string): number {
  const normalized = value.trim();
  const match = YUAN_PATTERN.exec(normalized);

  if (!match) {
    throw new Error(`无法识别的金额字符串：${value}`);
  }

  const wholeYuan = Number(match[1]);
  const fractionDigits = (match[2] ?? "").padEnd(6, "0");
  const microYuan = wholeYuan * MICRO_YUAN_PER_YUAN + Number(fractionDigits);

  if (!Number.isSafeInteger(microYuan)) {
    throw new Error(`金额超出安全整数范围：${value}`);
  }

  return microYuan;
}
