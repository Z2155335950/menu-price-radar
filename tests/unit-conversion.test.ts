import { describe, expect, it } from "vitest";

import { decimalToScaledInteger } from "../src/domain/quantity";
import {
  findConversionFactor,
  normalizeQuoteItem,
  type UnitConversionRecord,
} from "../src/domain/unit-conversion";

const conversions: UnitConversionRecord[] = [
  { ingredientId: null, fromUnit: "kg", toUnit: "g", factor: 1000 },
  { ingredientId: null, fromUnit: "斤", toUnit: "g", factor: 500 },
  { ingredientId: null, fromUnit: "L", toUnit: "ml", factor: 1000 },
  { ingredientId: 1, fromUnit: "袋", toUnit: "g", factor: 5000 },
];

const baseInput = {
  ingredientId: 1,
  baseUnit: "g" as const,
  quantityValue: "2",
  quantityUnit: "袋",
  packageQuantityValue: "5",
  packageUnit: "kg",
  priceType: "total" as const,
  priceValueMicroYuan: 220_000_000,
  priceUnit: "元",
  conversions,
};

describe("quantity scaling", () => {
  it("scales decimal quantities without floating point drift", () => {
    expect(decimalToScaledInteger("2", 5000)).toBe(10_000);
    expect(decimalToScaledInteger("2.5", 1000)).toBe(2500);
    expect(decimalToScaledInteger("0.125", 1000)).toBe(125);
    expect(() => decimalToScaledInteger("abc", 1000)).toThrow();
  });
});

describe("unit conversion", () => {
  it("prefers ingredient-specific conversions", () => {
    expect(findConversionFactor("kg", "g", 1, conversions)).toBe(1000);
    expect(findConversionFactor("袋", "g", 1, conversions)).toBe(5000);
    expect(findConversionFactor("袋", "g", 2, conversions)).toBeNull();
  });

  it("normalizes a package total price", () => {
    expect(normalizeQuoteItem(baseInput)).toEqual({
      ok: true,
      normalizedQuantityBase: 10_000,
      baseUnit: "g",
      normalizedUnitPriceMicroYuan: 22_000,
    });
  });

  it("normalizes a kg total price", () => {
    expect(
      normalizeQuoteItem({
        ...baseInput,
        quantityValue: "10",
        quantityUnit: "kg",
        packageQuantityValue: null,
        packageUnit: null,
        priceValueMicroYuan: 352_000_000,
      }),
    ).toEqual({
      ok: true,
      normalizedQuantityBase: 10_000,
      baseUnit: "g",
      normalizedUnitPriceMicroYuan: 35_200,
    });
  });

  it("normalizes a liter total price to ml", () => {
    expect(
      normalizeQuoteItem({
        ...baseInput,
        ingredientId: 2,
        baseUnit: "ml",
        quantityValue: "10",
        quantityUnit: "L",
        packageQuantityValue: null,
        packageUnit: null,
        priceValueMicroYuan: 120_000_000,
      }),
    ).toEqual({
      ok: true,
      normalizedQuantityBase: 10_000,
      baseUnit: "ml",
      normalizedUnitPriceMicroYuan: 12_000,
    });
  });

  it("blocks a package without a package quantity", () => {
    expect(
      normalizeQuoteItem({
        ...baseInput,
        ingredientId: 3,
        quantityValue: "1",
        quantityUnit: "箱",
        packageQuantityValue: null,
        packageUnit: null,
        priceValueMicroYuan: 96_000_000,
      }),
    ).toMatchObject({
      ok: false,
      type: "package_unknown",
    });
  });

  it("uses a confirmed package quantity", () => {
    expect(
      normalizeQuoteItem({
        ...baseInput,
        quantityValue: "1",
        quantityUnit: "箱",
        packageQuantityValue: "20",
        packageUnit: "kg",
        priceValueMicroYuan: 96_000_000,
      }),
    ).toEqual({
      ok: true,
      normalizedQuantityBase: 20_000,
      baseUnit: "g",
      normalizedUnitPriceMicroYuan: 4_800,
    });
  });

  it("blocks a unit that cannot be converted to the base unit", () => {
    expect(
      normalizeQuoteItem({
        ...baseInput,
        quantityUnit: "个",
        packageQuantityValue: null,
        packageUnit: null,
      }),
    ).toMatchObject({
      ok: false,
      type: "unit_unknown",
    });
  });

  it("normalizes a per-kg unit price", () => {
    expect(
      normalizeQuoteItem({
        ...baseInput,
        quantityValue: "1",
        quantityUnit: "kg",
        packageQuantityValue: null,
        packageUnit: null,
        priceType: "unit",
        priceUnit: "元/kg",
        priceValueMicroYuan: 22_000_000,
      }),
    ).toEqual({
      ok: true,
      normalizedQuantityBase: 1000,
      baseUnit: "g",
      normalizedUnitPriceMicroYuan: 22_000,
    });
  });
});
