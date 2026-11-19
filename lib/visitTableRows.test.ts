import { describe, it, expect } from "vitest";
import { buildVisitRows, filterRows } from "./visitTableRows";

const base = {
  title: "Turf cleaning",
  completed: true,
  crew: ["Alex"],
  minutes: 65,
  photoCount: 2,
};

describe("buildVisitRows", () => {
  const inputs = [
    { ...base, visitId: "a", startAt: "2026-11-06T16:00:00Z", invoiceId: "i1", invoiceNumber: "1", billed: 175, collected: 175, cost: 71.4 },
    { ...base, visitId: "b", startAt: "2026-10-09T16:00:00Z", invoiceId: "i2", invoiceNumber: "2", billed: 225, collected: 0, cost: 128.3 },
    { ...base, visitId: "c", startAt: "2026-07-31T16:00:00Z", invoiceId: "i3", invoiceNumber: "3", billed: 175, collected: 175, cost: 0 },
    { ...base, visitId: "d", startAt: "2026-09-11T16:00:00Z", invoiceId: null, invoiceNumber: null, billed: null, collected: 0, cost: 60, photoCount: 0 },
    { ...base, visitId: "e", startAt: "2026-09-25T16:00:00Z", invoiceId: "i5", invoiceNumber: "5", billed: 175, collected: 175, cost: 0 },
  ];
  const { rows, totals } = buildVisitRows(inputs, 60);
  const byId = Object.fromEntries(rows.map((r) => [r.visitId, r]));

  it("shows profit only for tracked visits with an invoice and costs", () => {
    expect(byId.a.margin).toBe(59);
    expect(Math.round((byId.a.profit ?? 0) * 100)).toBe(10360);
    expect(byId.c.profit).toBeNull();
    expect(byId.c.cost).toBeNull();
    expect(byId.d.profit).toBeNull();
  });

  it("flags problems", () => {
    expect(byId.a.flags).toEqual(["Low margin"]);
    expect(byId.b.flags).toEqual(["Low margin", "Unpaid"]);
    expect(byId.d.flags).toEqual(["No photos", "No invoice linked"]);
    expect(byId.e.flags).toEqual(["No costs logged"]);
  });

  it("totals only count trackable visits toward margin", () => {
    expect(totals.billedAll).toBe(175 + 225 + 175 + 175);
    expect(totals.trackedCount).toBe(2);
    expect(totals.trackedBilled).toBe(400);
    expect(totals.unpaidCount).toBe(1);
    expect(totals.unpaidAmount).toBe(225);
  });

  it("filters", () => {
    expect(filterRows(rows, "unpaid").map((r) => r.visitId)).toEqual(["b"]);
    expect(filterRows(rows, "low-margin").map((r) => r.visitId)).toEqual(["a", "b"]);
    expect(filterRows(rows, "all").length).toBe(5);
  });
});
