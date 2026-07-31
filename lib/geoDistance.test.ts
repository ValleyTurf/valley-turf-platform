import { describe, expect, it } from "vitest";
import { haversineMiles } from "./geoDistance";

describe("haversineMiles", () => {
  it("returns 0 for identical points", () => {
    expect(haversineMiles(33.4484, -112.074, 33.4484, -112.074)).toBe(0);
  });

  it("matches the well-known Phoenix-to-Tucson distance (~110-120 miles straight-line)", () => {
    const miles = haversineMiles(33.4484, -112.074, 32.2226, -110.9747);
    expect(miles).toBeGreaterThan(100);
    expect(miles).toBeLessThan(125);
  });

  it("is symmetric", () => {
    const a = haversineMiles(33.4, -112.0, 33.5, -112.2);
    const b = haversineMiles(33.5, -112.2, 33.4, -112.0);
    expect(a).toBeCloseTo(b, 10);
  });
});
