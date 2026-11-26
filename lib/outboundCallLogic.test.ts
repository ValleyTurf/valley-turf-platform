import { describe, it, expect } from "vitest";
import { bridgeTwiml, describeOutboundOutcome, escapeXml, isE164, toE164 } from "./outboundCallLogic";

describe("toE164", () => {
  it("formats US numbers", () => {
    expect(toE164("(503) 999-5502")).toBe("+15039995502");
    expect(toE164("1-503-999-5502")).toBe("+15039995502");
    expect(toE164("+15039995502")).toBe("+15039995502");
  });
  it("rejects junk", () => {
    expect(toE164("12345")).toBe(null);
    expect(toE164("")).toBe(null);
    expect(toE164(null)).toBe(null);
  });
});

describe("isE164", () => {
  it("accepts and rejects", () => {
    expect(isE164("+15039995502")).toBe(true);
    expect(isE164("5039995502")).toBe(false);
    expect(isE164("+1503<x>")).toBe(false);
  });
});

describe("bridgeTwiml", () => {
  it("escapes the action url and dials with the business caller id", () => {
    const xml = bridgeTwiml({ callerId: "+14805550100", to: "+15039995502", actionUrl: "https://x.com/a?to=1&client=2" });
    expect(xml.includes('callerId="+14805550100"')).toBe(true);
    expect(xml.includes("to=1&amp;client=2")).toBe(true);
    expect(xml.includes(">+15039995502</Dial>")).toBe(true);
  });
  it("escapeXml handles specials", () => {
    expect(escapeXml('a&b<"')).toBe("a&amp;b&lt;&quot;");
  });
});

describe("describeOutboundOutcome", () => {
  it("describes outcomes", () => {
    expect(describeOutboundOutcome("completed", "125")).toBe("Connected -- 2m 5s");
    expect(describeOutboundOutcome("no-answer", undefined)).toBe("Customer did not answer");
    expect(describeOutboundOutcome("weird", undefined)).toBe("Call ended");
  });
});
