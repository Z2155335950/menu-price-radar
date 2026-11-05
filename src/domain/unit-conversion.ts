import { decimalToScaledInteger } from "./quantity";

export type BaseUnit = "g" | "ml" | "个";

export type UnitConversionRecord = {
  ingredientId: number | null;
  fromUnit: string;
  toUnit: string;
  factor: number;
};

export type NormalizationInput = {
  ingredientId: number;
  baseUnit: BaseUnit;
  quantityValue: string | null;
  quantityUnit: string | null;
  packageQuantityValue: string | null;
  packageUnit: string | null;
  priceType: "total" | "unit" | null;
  priceValueMicroYuan: number | null;
  priceUnit: string | null;
  conversions: UnitConversionRecord[];
};

export type NormalizationIssueType =
  | "quantity_unknown"
  | "package_unknown"
  | "unit_unknown"
  | "price_basis_ambiguous";

export type NormalizationResult =
  | {
      ok: true;
      normalizedQuantityBase: number;
      baseUnit: BaseUnit;
      normalizedUnitPriceMicroYuan: number;
    }
  | {
      ok: false;
      type: NormalizationIssueType;
      message: string;
    };

const PACKAGE_UNITS = new Set(["箱", "袋", "包", "件"]);

const UNIT_ALIASES: Record<string, string> = {
  公斤: "kg",
  千克: "kg",
  克: "g",
  升: "l",
  公升: "l",
  毫升: "ml",
  只: "个",
  枚: "个",
};

export function normalizeUnit(value: string): string {
  const normalized = value.trim().toLowerCase();
  return UNIT_ALIASES[normalized] ?? normalized;
}

export function findConversionFactor(
  fromUnit: string,
  toUnit: string,
  ingredientId: number,
  conversions: UnitConversionRecord[],
): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);

  if (from === to) {
    return 1;
  }

  const matches = conversions.filter(
    (conversion) =>
      normalizeUnit(conversion.fromUnit) === from &&
      normalizeUnit(conversion.toUnit) === to &&
      (conversion.ingredientId === ingredientId ||
        conversion.ingredientId === null),
  );

  if (matches.length === 0) {
    return null;
  }

  const ingredientSpecific = matches.find(
    (conversion) => conversion.ingredientId === ingredientId,
  );

  return (ingredientSpecific ?? matches[0]).factor;
}

function divideRoundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

function parsePriceUnit(priceUnit: string | null): string | null {
  if (!priceUnit) {
    return null;
  }

  const match = /^元\s*\/\s*(.+)$/.exec(priceUnit.trim());
  return match?.[1]?.trim() ?? null;
}

/**
 * 把一条报价行归一化为“基础数量 + 每基础单位价格”。
 *
 * 缺少数量、包装或价格口径时返回问题，而不是猜测。
 */
export function normalizeQuoteItem(
  input: NormalizationInput,
): NormalizationResult {
  if (!input.quantityValue || !input.quantityUnit) {
    return {
      ok: false,
      type: "quantity_unknown",
      message: "缺少报价数量或数量单位，需要确认。",
    };
  }

  const quantityUnit = normalizeUnit(input.quantityUnit);
  let normalizedQuantityBase: number | null = null;
  let packageBaseQuantity: number | null = null;

  if (PACKAGE_UNITS.has(quantityUnit)) {
    if (input.packageQuantityValue && input.packageUnit) {
      const packageFactor = findConversionFactor(
        input.packageUnit,
        input.baseUnit,
        input.ingredientId,
        input.conversions,
      );

      if (packageFactor !== null) {
        packageBaseQuantity = decimalToScaledInteger(
          input.packageQuantityValue,
          packageFactor,
        );
        normalizedQuantityBase = decimalToScaledInteger(
          input.quantityValue,
          packageBaseQuantity,
        );
      }
    }

    if (normalizedQuantityBase === null) {
      const packageFactor = findConversionFactor(
        input.quantityUnit,
        input.baseUnit,
        input.ingredientId,
        input.conversions,
      );

      if (packageFactor !== null) {
        normalizedQuantityBase = decimalToScaledInteger(
          input.quantityValue,
          packageFactor,
        );
      }
    }

    if (normalizedQuantityBase === null) {
      return {
        ok: false,
        type: "package_unknown",
        message: `写了 ${input.quantityValue}${input.quantityUnit}，但没有每${input.quantityUnit}对应的基础数量，需要确认。`,
      };
    }
  } else {
    const factor = findConversionFactor(
      input.quantityUnit,
      input.baseUnit,
      input.ingredientId,
      input.conversions,
    );

    if (factor === null) {
      return {
        ok: false,
        type: "unit_unknown",
        message: `单位“${input.quantityUnit}”无法换算为“${input.baseUnit}”，需要确认。`,
      };
    }

    normalizedQuantityBase = decimalToScaledInteger(
      input.quantityValue,
      factor,
    );
  }

  if (normalizedQuantityBase === null || normalizedQuantityBase <= 0) {
    return {
      ok: false,
      type: "quantity_unknown",
      message: "换算后的基础数量必须大于 0。",
    };
  }

  if (input.priceValueMicroYuan === null || input.priceValueMicroYuan <= 0) {
    return {
      ok: false,
      type: "price_basis_ambiguous",
      message: "缺少有效报价金额，需要确认。",
    };
  }

  let normalizedUnitPriceMicroYuan: number | null = null;

  if (input.priceType === "total") {
    normalizedUnitPriceMicroYuan = divideRoundHalfUp(
      input.priceValueMicroYuan,
      normalizedQuantityBase,
    );
  } else if (input.priceType === "unit") {
    const priceUnit = parsePriceUnit(input.priceUnit);

    if (!priceUnit) {
      return {
        ok: false,
        type: "price_basis_ambiguous",
        message: "报价是单价，但没有明确是每公斤、每箱还是每基础单位，需要确认。",
      };
    }

    if (PACKAGE_UNITS.has(normalizeUnit(priceUnit))) {
      if (packageBaseQuantity === null) {
        return {
          ok: false,
          type: "package_unknown",
          message: "单价按包装计算，但包装对应的基础数量不明确，需要确认。",
        };
      }

      normalizedUnitPriceMicroYuan = divideRoundHalfUp(
        input.priceValueMicroYuan,
        packageBaseQuantity,
      );
    } else {
      const factor = findConversionFactor(
        priceUnit,
        input.baseUnit,
        input.ingredientId,
        input.conversions,
      );

      if (factor === null) {
        return {
          ok: false,
          type: "unit_unknown",
          message: `价格单位“${priceUnit}”无法换算为“${input.baseUnit}”，需要确认。`,
        };
      }

      normalizedUnitPriceMicroYuan = divideRoundHalfUp(
        input.priceValueMicroYuan,
        factor,
      );
    }
  } else {
    return {
      ok: false,
      type: "price_basis_ambiguous",
      message: "没有明确是总价还是单价，需要确认。",
    };
  }

  if (
    normalizedUnitPriceMicroYuan === null ||
    normalizedUnitPriceMicroYuan <= 0
  ) {
    return {
      ok: false,
      type: "price_basis_ambiguous",
      message: "归一化后的单价必须大于 0，需要确认。",
    };
  }

  return {
    ok: true,
    normalizedQuantityBase,
    baseUnit: input.baseUnit,
    normalizedUnitPriceMicroYuan,
  };
}
