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
    { ...base, visitId: "a", startAt: "2026-11-06T16:00:00Z", invoiceNumber: "1", hasInvoice: true, shared: false, billed: 175, collected: 175, invoiceTotal: 175, invoiceCollected: 175, invoiceDue: null, cost: 71.4 },
    { ...base, visitId: "b", startAt: "2026-10-09T16:00:00Z", invoiceNumber: "2", hasInvoice: true, shared: false, billed: 225, collected: 0, invoiceTotal: 225, invoiceCollected: 0, invoiceDue: null, cost: 128.3 },
    { ...base, visitId: "c", startAt: "2026-07-31T16:00:00Z", invoiceNumber: "3", hasInvoice: true, shared: false, billed: 175, collected: 175, invoiceTotal: 175, invoiceCollected: 175, invoiceDue: null, cost: 0 },
    { ...base, visitId: "d", startAt: "2026-09-11T16:00:00Z", invoiceNumber: null, hasInvoice: false, shared: false, billed: null, collected: 0, invoiceTotal: null, invoiceCollected: 0, invoiceDue: null, cost: 60, photoCount: 0 },
    { ...base, visitId: "e", startAt: "2026-09-25T16:00:00Z", invoiceNumber: "5", hasInvoice: true, shared: false, billed: 175, collected: 175, invoiceTotal: 175, invoiceCollected: 175, invoiceDue: null, cost: 0 },
  ];
  const { rows, totals } = buildVisitRows(inputs, 60, "2026-11-19");
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

  it("splits a prepaid monthly invoice and judges payment on the whole invoice", () => {
    const shared = {
      ...base,
      startAt: "2026-11-06T16:00:00Z",
      invoiceNumber: "9",
      hasInvoice: true,
      shared: true,
      invoiceTotal: 350,
      invoiceCollected: 350,
      invoiceDue: null,
      cost: 70,
    };
    const out = buildVisitRows(
      [
        { ...shared, visitId: "x", billed: 175, collected: 175 },
        { ...shared, visitId: "y", billed: 175, collected: 175 },
      ],
      60,
      "2026-11-19"
    );
    expect(out.rows[0].state).toBe("paid");
    expect(out.totals.billedAll).toBe(350);
    expect(out.rows[0].margin).toBe(60);
  });

  it("does not flag a prepaid invoice that is not due yet", () => {
    const out = buildVisitRows(
      [
        {
          ...base,
          visitId: "n",
          startAt: "2026-11-06T16:00:00Z",
          invoiceNumber: "7",
          hasInvoice: true,
          shared: false,
          billed: 175,
          collected: 0,
          invoiceTotal: 175,
          invoiceCollected: 0,
          invoiceDue: "2026-11-25",
          cost: 70,
        },
      ],
      60,
      "2026-11-19"
    );
    expect(out.rows[0].overdue).toBe(false);
    expect(out.rows[0].flags.includes("Unpaid")).toBe(false);
    expect(out.totals.unpaidCount).toBe(0);
  });

  it("filters", () => {
    expect(filterRows(rows, "unpaid").map((r) => r.visitId)).toEqual(["b"]);
    expect(filterRows(rows, "low-margin").map((r) => r.visitId)).toEqual(["a", "b"]);
    expect(filterRows(rows, "all").length).toBe(5);
  });
});
