import { describe, it, expect } from "vitest";
import { NAMED_COLORS, NAMED_COLOR_KEYS } from "./scheduleServiceColorPalette";

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

describe("schedule color palette", () => {
  it("keeps the original ten first, in order", () => {
    expect(NAMED_COLOR_KEYS.slice(0, 10)).toEqual([
      "green", "blue", "orange", "sky", "purple", "lime", "yellow", "pink", "rose", "emerald",
    ]);
  });
  it("has valid unique hex values and a chip for every color", () => {
    const hexes = NAMED_COLOR_KEYS.map((k) => NAMED_COLORS[k].hex);
    expect(new Set(hexes).size).toBe(hexes.length);
    for (const key of NAMED_COLOR_KEYS) {
      expect(/^#[0-9a-f]{6}$/.test(NAMED_COLORS[key].hex)).toBe(true);
      expect(NAMED_COLORS[key].chip.includes("bg-")).toBe(true);
    }
  });
  it("added colors are not near-duplicates of any other color", () => {
    // Euclidean RGB distance; the closest original pair (rose and pink) is about 40.
    const added = NAMED_COLOR_KEYS.slice(10);
    for (const key of added) {
      for (const other of NAMED_COLOR_KEYS) {
        if (other === key) continue;
        const a = rgb(NAMED_COLORS[key].hex);
        const b = rgb(NAMED_COLORS[other].hex);
        const dist = Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
        expect(dist > 45).toBe(true);
      }
    }
  });
});
