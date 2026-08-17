import { describe, expect, it } from "vitest";
import { isPointInPolygon, type LatLngTuple } from "./pointInPolygon";

// A simple square: lat 0-10, lng 0-10.
const SQUARE: LatLngTuple[] = [
  [0, 0],
  [0, 10],
  [10, 10],
  [10, 0],
];

describe("isPointInPolygon", () => {
  it("returns true for a point clearly inside the shape", () => {
    expect(isPointInPolygon([5, 5], SQUARE)).toBe(true);
  });

  it("returns false for a point clearly outside the shape", () => {
    expect(isPointInPolygon([15, 15], SQUARE)).toBe(false);
    expect(isPointInPolygon([-5, 5], SQUARE)).toBe(false);
  });

  it("returns false when fewer than 3 vertices are given", () => {
    expect(isPointInPolygon([5, 5], [])).toBe(false);
    expect(isPointInPolygon([5, 5], [[0, 0]])).toBe(false);
    expect(
      isPointInPolygon(
        [5, 5],
        [
          [0, 0],
          [10, 10],
        ]
      )
    ).toBe(false);
  });

  it("handles a non-square (triangle) shape correctly", () => {
    const triangle: LatLngTuple[] = [
      [0, 0],
      [0, 10],
      [10, 0],
    ];

    // Inside the triangle (below the hypotenuse).
    expect(isPointInPolygon([2, 2], triangle)).toBe(true);
    // Outside the triangle (above the hypotenuse, but inside the square
    // that would bound it).
    expect(isPointInPolygon([8, 8], triangle)).toBe(false);
  });
});
