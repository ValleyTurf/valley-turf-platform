import { describe, expect, it } from "vitest";
import {
  toNumber,
  formatCurrency,
  formatCurrencyPrecise,
  formatNumber,
  formatPercent,
} from "./format";

describe("toNumber", () => {
  it("parses numbers and numeric strings", () => {
    expect(toNumber(5)).toBe(5);
    expect(toNumber("5")).toBe(5);
    expect(toNumber("5.25")).toBe(5.25);
  });

  it("falls back to 0 for null, undefined, and non-numeric input", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber("not a number")).toBe(0);
    expect(toNumber(NaN)).toBe(0);
    expect(toNumber(Infinity)).toBe(0);
  });
});

describe("formatCurrency", () => {
  it("formats whole dollars with no decimals", () => {
    expect(formatCurrency(1234)).toBe("$1,234");
    expect(formatCurrency(1234.99)).toBe("$1,235");
  });

  it("treats missing values as $0", () => {
    expect(formatCurrency(null)).toBe("$0");
    expect(formatCurrency(undefined)).toBe("$0");
  });
});

describe("formatCurrencyPrecise", () => {
  it("always shows exactly two decimals", () => {
    expect(formatCurrencyPrecise(19.5)).toBe("$19.50");
    expect(formatCurrencyPrecise(19)).toBe("$19.00");
    expect(formatCurrencyPrecise(19.999)).toBe("$20.00");
  });
});

describe("formatNumber", () => {
  it("adds thousands separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });
});

describe("formatPercent", () => {
  it("formats a fraction as a percent with the default 1 decimal", () => {
    expect(formatPercent(0.256)).toBe("25.6%");
  });

  it("respects a custom decimals option", () => {
    expect(formatPercent(0.256, { decimals: 0 })).toBe("26%");
  });
});
