import { describe, it, expect } from "vitest";
import { forwardTwiml, pickForwardNumbers } from "./callForwardingLogic";

describe("pickForwardNumbers", () => {
  it("uses saved cells, formatted and de-duplicated", () => {
    expect(pickForwardNumbers(["(503) 999-5502", "+15039995502", null, "bad"], "+14803314596")).toEqual(["+15039995502"]);
  });
  it("rings every saved cell", () => {
    expect(pickForwardNumbers(["5039995502", "4805550100"], null)).toEqual(["+15039995502", "+14805550100"]);
  });
  it("falls back to the alert phone only when nothing is saved", () => {
    expect(pickForwardNumbers([null, ""], "+14803314596")).toEqual(["+14803314596"]);
    expect(pickForwardNumbers([], null)).toEqual([]);
  });
});

describe("forwardTwiml", () => {
  it("dials all numbers with an escaped action url", () => {
    const xml = forwardTwiml({ numbers: ["+15039995502", "+14805550100"], timeout: 20, actionUrl: "https://x.com/a?b=1&c=2" });
    expect(xml.includes("<Number>+15039995502</Number><Number>+14805550100</Number>")).toBe(true);
    expect(xml.includes("b=1&amp;c=2")).toBe(true);
    expect(xml.includes('timeout="20"')).toBe(true);
  });
});
