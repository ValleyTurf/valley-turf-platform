import { describe, it, expect } from "vitest";
import { buildCostSplit, paymentState, visitFlags, isCollectedPayment, nextReminder } from "./visitDetailLogic";

const costs = { labor: 40, materials: 10, equipment: 5, overhead: 12, cardFee: 4.4 };

describe("buildCostSplit", () => {
  it("computes profit and margin when tracked", () => {
    const r = buildCostSplit(175, costs, true);
    expect(Math.round(r.cost * 100)).toBe(7140);
    expect(Math.round((r.profit ?? 0) * 100)).toBe(10360);
    expect(r.margin).toBe(59);
    expect(r.segments[r.segments.length - 1].key).toBe("profit");
  });

  it("hides profit before tracking began", () => {
    const r = buildCostSplit(175, costs, false);
    expect(r.profit).toBeNull();
    expect(r.margin).toBeNull();
    expect(r.segments.some((s) => s.key === "profit")).toBe(false);
  });

  it("hides profit when there is no billed amount", () => {
    expect(buildCostSplit(null, costs, true).profit).toBeNull();
  });
});

describe("payments", () => {
  it("states", () => {
    expect(paymentState(175, 175, true)).toBe("paid");
    expect(paymentState(175, 50, true)).toBe("partial");
    expect(paymentState(175, 0, true)).toBe("unpaid");
    expect(paymentState(null, 0, false)).toBe("no-invoice");
  });

  it("ignores failed attempts", () => {
    expect(isCollectedPayment("SUCCEEDED")).toBe(true);
    expect(isCollectedPayment("failed")).toBe(false);
  });
});

describe("visitFlags", () => {
  it("flags problems on completed visits only", () => {
    const base = { photoCount: 0, margin: 40, marginTarget: 60, state: "unpaid" as const, hasInvoice: true };
    expect(visitFlags({ ...base, completed: true })).toEqual(["No photos", "Low margin", "Unpaid"]);
    expect(visitFlags({ ...base, completed: false })).toEqual([]);
  });
});

describe("nextReminder", () => {
  it("finds the next unsent reminder that is still ahead", () => {
    expect(nextReminder({ visitDay: "2026-11-20", today: "2026-11-16", ruleDays: [4, 2], sentDays: [] }))
      .toEqual({ state: "due", daysBefore: 4, dueDay: "2026-11-16" });
    expect(nextReminder({ visitDay: "2026-11-20", today: "2026-11-17", ruleDays: [4, 2], sentDays: [4] }))
      .toEqual({ state: "due", daysBefore: 2, dueDay: "2026-11-18" });
  });

  it("reports sent when nothing is left to send", () => {
    expect(nextReminder({ visitDay: "2026-11-20", today: "2026-11-19", ruleDays: [4, 2], sentDays: [4, 2] }).state).toBe("sent");
  });

  it("ignores passed unsent rules and reports none without rules", () => {
    expect(nextReminder({ visitDay: "2026-11-20", today: "2026-11-19", ruleDays: [4, 2], sentDays: [] }).state).toBe("none");
    expect(nextReminder({ visitDay: "2026-11-20", today: "2026-11-16", ruleDays: [], sentDays: [] }).state).toBe("none");
  });
});
