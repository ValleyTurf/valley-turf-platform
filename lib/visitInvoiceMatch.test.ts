import { describe, it, expect } from "vitest";
import { matchVisitsToInvoices } from "./visitInvoiceMatch";
import { isProfitTracked, marginPercent } from "./profitTracking";

const v = (visitId: string, month: string | null, invoiceId: string | null = null) => ({
  visitId,
  startAt: month ? `${month}-10T16:00:00Z` : null,
  invoiceId,
  month,
});

describe("matchVisitsToInvoices", () => {
  it("trusts a direct link", () => {
    const m = matchVisitsToInvoices([v("a", "2026-09", "inv1")], [
      { invoiceId: "inv1", date: "2026-09-12" },
    ]);
    expect(m.get("a")).toEqual({ invoiceId: "inv1", method: "direct" });
  });

  it("matches the lone same-month invoice", () => {
    const m = matchVisitsToInvoices([v("a", "2026-09")], [
      { invoiceId: "inv1", date: "2026-09-28" },
    ]);
    expect(m.get("a")).toEqual({ invoiceId: "inv1", method: "month" });
  });

  it("does not guess with two visits in one month", () => {
    const m = matchVisitsToInvoices([v("a", "2026-09"), v("b", "2026-09")], [
      { invoiceId: "inv1", date: "2026-09-28" },
    ]);
    expect(m.get("a")?.method).toBe("none");
    expect(m.get("b")?.method).toBe("none");
  });

  it("does not reuse an invoice already claimed directly", () => {
    const m = matchVisitsToInvoices([v("a", "2026-09", "inv1"), v("b", "2026-09")], [
      { invoiceId: "inv1", date: "2026-09-12" },
    ]);
    expect(m.get("a")?.method).toBe("direct");
    expect(m.get("b")?.method).toBe("none");
  });

  it("leaves visits without a date unlinked", () => {
    const m = matchVisitsToInvoices([v("a", null)], [
      { invoiceId: "inv1", date: "2026-09-12" },
    ]);
    expect(m.get("a")?.method).toBe("none");
  });
});

describe("profit tracking helpers", () => {
  it("applies the Aug 2026 cutoff in Phoenix time", () => {
    expect(isProfitTracked("2026-08-01T10:00:00Z")).toBe(true);
    // 6:26pm Phoenix on Jul 31 is still July
    expect(isProfitTracked("2026-08-01T01:26:22Z")).toBe(false);
    expect(isProfitTracked("2026-07-31T16:00:00Z")).toBe(false);
    expect(isProfitTracked(null)).toBe(false);
  });

  it("computes margin", () => {
    expect(marginPercent(175, 103.6)).toBe(59);
    expect(marginPercent(0, 10)).toBeNull();
  });
});
