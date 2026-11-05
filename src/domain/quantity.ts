const DECIMAL_PATTERN = /^(\d{1,12})(?:\.(\d{1,6}))?$/;

/**
 * 把十进制数量按整数倍缩放，并四舍五入到整数。
 *
 * 例：
 *   "2.5" × 1000 -> 2500
 *   "2"   × 5000 -> 10000
 *
 * 使用 BigInt，避免数量换算中的浮点误差。
 */
export function decimalToScaledInteger(
  value: string,
  multiplier: number,
): number {
  const normalized = value.trim();
  const match = DECIMAL_PATTERN.exec(normalized);

  if (!match) {
    throw new Error(`无法识别的数量字符串：${value}`);
  }

  if (!Number.isSafeInteger(multiplier) || multiplier <= 0) {
    throw new Error("数量换算倍数必须是正整数。");
  }

  const whole = BigInt(match[1]);
  const fraction = match[2] ?? "";
  const scale = BigInt(10) ** BigInt(fraction.length);
  const numerator = whole * scale + BigInt(fraction || "0");
  const scaled =
    (numerator * BigInt(multiplier) + scale / BigInt(2)) / scale;

  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`数量超出安全整数范围：${value}`);
  }

  return Number(scaled);
}
