import { describe, expect, it } from "vitest";

import { yuanStringToMicroYuan } from "../src/domain/money";

describe("yuanStringToMicroYuan", () => {
  it("converts whole and decimal yuan without floating point arithmetic", () => {
    expect(yuanStringToMicroYuan("220.00")).toBe(220_000_000);
    expect(yuanStringToMicroYuan("43.2")).toBe(43_200_000);
    expect(yuanStringToMicroYuan("0.022")).toBe(22_000);
    expect(yuanStringToMicroYuan("1274")).toBe(1_274_000_000);
  });

  it("rejects malformed and unsafe amounts", () => {
    expect(() => yuanStringToMicroYuan("1,000")).toThrow();
    expect(() => yuanStringToMicroYuan("-1")).toThrow();
    expect(() => yuanStringToMicroYuan("12.1234567")).toThrow();
    expect(() => yuanStringToMicroYuan("999999999999.99")).toThrow();
  });
});
