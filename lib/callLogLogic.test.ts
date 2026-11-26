import { describe, it, expect } from "vitest";
import { classifyCall, countNeedingCallback, needsCallback } from "./callLogLogic";

describe("classifyCall", () => {
  it("classifies each kind", () => {
    expect(classifyCall({ direction: "inbound", relatedType: "voicemail", summary: "Voicemail -- 0:23" })).toBe("voicemail");
    expect(classifyCall({ direction: "inbound", relatedType: null, summary: "Missed -- no answer" })).toBe("missed");
    expect(classifyCall({ direction: "inbound", relatedType: null, summary: "Answered -- 2m 5s" })).toBe("answered");
    expect(classifyCall({ direction: "outbound", relatedType: null, summary: "Connected -- 1m" })).toBe("outgoing");
  });
  it("only voicemails and missed calls need a callback", () => {
    expect(needsCallback("voicemail")).toBe(true);
    expect(needsCallback("missed")).toBe(true);
    expect(needsCallback("answered")).toBe(false);
    expect(needsCallback("outgoing")).toBe(false);
  });
  it("counts recent callbacks only", () => {
    const now = new Date("2026-11-27T12:00:00Z");
    const entries = [
      { kind: "missed" as const, createdAt: "2026-11-26T12:00:00Z" },
      { kind: "voicemail" as const, createdAt: "2026-11-01T12:00:00Z" },
      { kind: "answered" as const, createdAt: "2026-11-26T12:00:00Z" },
    ];
    expect(countNeedingCallback(entries, now)).toBe(1);
  });
});
