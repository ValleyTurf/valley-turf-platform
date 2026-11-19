import { describe, it, expect } from "vitest";
import { matchVisitsToInvoices, allocateInvoices } from "./visitInvoiceMatch";
import { isProfitTracked, marginPercent } from "./profitTracking";
import { toDateOnly } from "./phoenixDate";

const v = (visitId: string, month: string | null, invoiceId: string | null = null) => ({
  visitId,
  invoiceId,
  month,
});

describe("matchVisitsToInvoices", () => {
  it("trusts a direct link", () => {
    const m = matchVisitsToInvoices([v("a", "2026-09", "inv1")], [
      { invoiceId: "inv1", date: "2026-09-12" },
    ]);
    expect(m.get("a")).toEqual({ invoiceIds: ["inv1"], visitCounts: [1], method: "direct" });
  });

  it("matches the same-month invoice", () => {
    const m = matchVisitsToInvoices([v("a", "2026-11")], [
      { invoiceId: "inv1", date: "2026-11-01" },
    ]);
    expect(m.get("a")?.invoiceIds).toEqual(["inv1"]);
    expect(m.get("a")?.method).toBe("month");
  });

  it("shares one monthly invoice across both visits that month", () => {
    const m = matchVisitsToInvoices([v("a", "2026-11"), v("b", "2026-11")], [
      { invoiceId: "inv1", date: "2026-11-01" },
    ]);
    expect(m.get("a")?.visitCounts).toEqual([2]);
    expect(m.get("b")?.visitCounts).toEqual([2]);
  });

  it("does not pull in another month's invoice", () => {
    const m = matchVisitsToInvoices([v("a", "2026-11")], [
      { invoiceId: "oct", date: "2026-10-31" },
    ]);
    expect(m.get("a")?.method).toBe("none");
  });

  it("ignores a missed visit when splitting an invoice", () => {
    const m = matchVisitsToInvoices(
      [
        { visitId: "a", invoiceId: null, month: "2026-11" },
        { visitId: "missed", invoiceId: null, month: "2026-11", counts: false },
      ],
      [{ invoiceId: "inv1", date: "2026-11-01" }]
    );
    expect(m.get("a")?.visitCounts).toEqual([1]);
    expect(m.get("missed")?.invoiceIds).toEqual(["inv1"]);
  });

  it("leaves visits without a date unlinked", () => {
    const m = matchVisitsToInvoices([v("a", null)], [{ invoiceId: "inv1", date: "2026-09-12" }]);
    expect(m.get("a")?.method).toBe("none");
  });
});

describe("allocateInvoices", () => {
  it("splits a monthly invoice and keeps payment status at invoice level", () => {
    const m = matchVisitsToInvoices([v("a", "2026-11"), v("b", "2026-11")], [
      { invoiceId: "inv1", date: "2026-11-01" },
    ]);
    const a = allocateInvoices(m.get("a"), new Map([["inv1", 350]]), new Map([["inv1", 350]]));
    expect(a.billed).toBe(175);
    expect(a.collected).toBe(175);
    expect(a.invoiceTotal).toBe(350);
    expect(a.invoiceCollected).toBe(350);
    expect(a.shared).toBe(true);
  });

  it("returns an empty allocation without a match", () => {
    expect(allocateInvoices(undefined, new Map(), new Map()).hasInvoice).toBe(false);
  });
});

describe("date helpers", () => {
  it("leaves a plain date alone instead of shifting it back a day", () => {
    expect(toDateOnly("2026-11-01")).toBe("2026-11-01");
    expect(toDateOnly("2026-11-01T07:00:00Z")).toBe("2026-11-01");
    expect(toDateOnly("2026-11-01T01:26:22Z")).toBe("2026-10-31");
    expect(toDateOnly(null)).toBeNull();
  });
});

describe("profit tracking helpers", () => {
  it("applies the Aug 2026 cutoff in Phoenix time", () => {
    expect(isProfitTracked("2026-08-01T10:00:00Z")).toBe(true);
    expect(isProfitTracked("2026-08-01T01:26:22Z")).toBe(false);
    expect(isProfitTracked("2026-07-31T16:00:00Z")).toBe(false);
    expect(isProfitTracked(null)).toBe(false);
  });

  it("computes margin", () => {
    expect(marginPercent(175, 103.6)).toBe(59);
    expect(marginPercent(0, 10)).toBeNull();
  });
});
