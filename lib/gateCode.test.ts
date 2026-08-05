import { describe, expect, it } from "vitest";
import { extractGateCode } from "./gateCode";

describe("extractGateCode", () => {
  it("matches 'gate code: 1234'", () => {
    expect(extractGateCode("Gate code: 4521")).toBe("4521");
  });

  it("matches 'gate code is X'", () => {
    expect(extractGateCode("Please note the gate code is 7788 for entry.")).toBe("7788");
  });

  it("matches 'keypad code'", () => {
    expect(extractGateCode("Keypad code 2244, use side gate.")).toBe("2244");
  });

  it("matches 'gate combo'", () => {
    expect(extractGateCode("The gate combo is 9876.")).toBe("9876");
  });

  it("matches 'gate combination'", () => {
    expect(extractGateCode("gate combination: 3141")).toBe("3141");
  });

  it("matches 'code to the gate'", () => {
    expect(extractGateCode("Code to the gate: 5510#")).toBe("5510#");
  });

  it("matches 'code to get into the gate'", () => {
    expect(extractGateCode("The code to get into the gate is 6602")).toBe("6602");
  });

  it("strips trailing punctuation", () => {
    expect(extractGateCode("gate code is 1122, dog is friendly.")).toBe("1122");
  });

  it("matches codes with letters", () => {
    expect(extractGateCode("gate code: A1B2")).toBe("A1B2");
  });

  it("is case-insensitive", () => {
    expect(extractGateCode("GATE CODE IS 9999")).toBe("9999");
  });

  it("returns null when no gate code is mentioned", () => {
    expect(extractGateCode("Mowed the lawn, trimmed the hedges.")).toBeNull();
  });

  it("returns null for unrelated numbers", () => {
    expect(extractGateCode("Invoice total was 1234 dollars.")).toBeNull();
  });

  it("returns null for empty/null/undefined input", () => {
    expect(extractGateCode("")).toBeNull();
    expect(extractGateCode(null)).toBeNull();
    expect(extractGateCode(undefined)).toBeNull();
  });

  it("finds the first matching pattern in a longer note", () => {
    expect(
      extractGateCode(
        "Arrived at 9am, mowed front and back. Gate code is 4477. Customer wasn't home."
      )
    ).toBe("4477");
  });
});
