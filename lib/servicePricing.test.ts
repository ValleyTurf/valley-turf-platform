import { describe, expect, it } from "vitest";
import { findPrice, groupByService, distinctServiceNames, type ServicePriceRow } from "./servicePricing";

const SAMPLE: ServicePriceRow[] = [
  { serviceName: "Aeration", turfSizeRange: "<300", price: 60 },
  { serviceName: "Aeration", turfSizeRange: "300-500", price: 75 },
  { serviceName: "Turf Installation", turfSizeRange: "<300", price: 900 },
];

describe("findPrice", () => {
  it("finds an exact match", () => {
    expect(findPrice(SAMPLE, "Aeration", "<300")).toBe(60);
  });

  it("matches case-insensitively", () => {
    expect(findPrice(SAMPLE, "aeration", "300-500")).toBe(75);
    expect(findPrice(SAMPLE, "AERATION", "300-500")).toBe(75);
  });

  it("returns null when the service isn't priced", () => {
    expect(findPrice(SAMPLE, "Overseeding", "<300")).toBeNull();
  });

  it("returns null when the range isn't priced for that service", () => {
    expect(findPrice(SAMPLE, "Aeration", ">3000")).toBeNull();
  });

  it("returns null for blank inputs", () => {
    expect(findPrice(SAMPLE, "", "<300")).toBeNull();
    expect(findPrice(SAMPLE, "Aeration", "")).toBeNull();
  });
});

describe("groupByService", () => {
  it("groups rows by service, preserving casing", () => {
    const grouped = groupByService(SAMPLE);
    expect(Array.from(grouped.keys())).toEqual(["Aeration", "Turf Installation"]);
    expect(grouped.get("Aeration")?.get("<300")).toBe(60);
    expect(grouped.get("Aeration")?.get("300-500")).toBe(75);
    expect(grouped.get("Turf Installation")?.get("<300")).toBe(900);
  });

  it("merges rows that differ only by case into one service", () => {
    const mixedCase: ServicePriceRow[] = [
      { serviceName: "Aeration", turfSizeRange: "<300", price: 60 },
      { serviceName: "aeration", turfSizeRange: "300-500", price: 75 },
    ];
    const grouped = groupByService(mixedCase);
    expect(grouped.size).toBe(1);
    expect(grouped.get("Aeration")?.size).toBe(2);
  });
});

describe("distinctServiceNames", () => {
  it("returns sorted, deduped service names", () => {
    expect(distinctServiceNames(SAMPLE)).toEqual(["Aeration", "Turf Installation"]);
  });

  it("returns an empty list for no prices", () => {
    expect(distinctServiceNames([])).toEqual([]);
  });
});
