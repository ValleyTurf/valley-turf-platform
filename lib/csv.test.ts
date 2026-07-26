import { describe, expect, it } from "vitest";
import { rowsToCsv } from "./csv";

describe("rowsToCsv", () => {
  it("returns an empty string for no rows", () => {
    expect(rowsToCsv([])).toBe("");
  });

  it("writes a header row followed by each data row", () => {
    const csv = rowsToCsv([
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
    ]);

    expect(csv).toBe("name,age\r\nAlice,30\r\nBob,25");
  });

  it("quotes values containing commas, quotes, or newlines", () => {
    const csv = rowsToCsv([
      { notes: 'Says "hi", then leaves\nnext line' },
    ]);

    expect(csv).toBe('notes\r\n"Says ""hi"", then leaves\nnext line"');
  });

  it("renders null and undefined as empty cells", () => {
    const csv = rowsToCsv([{ a: null, b: undefined, c: 0 }]);

    expect(csv).toBe("a,b,c\r\n,,0");
  });

  it("unions column keys across rows that don't all share the same shape", () => {
    const csv = rowsToCsv([{ a: 1 }, { a: 2, b: 3 }]);

    expect(csv).toBe("a,b\r\n1,\r\n2,3");
  });

  it("JSON-stringifies object/array values", () => {
    const csv = rowsToCsv([{ tags: ["x", "y"] }]);

    expect(csv).toBe('tags\r\n"[""x"",""y""]"');
  });
});
