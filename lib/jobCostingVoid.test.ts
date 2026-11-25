import { describe, it, expect } from "vitest";
import { dropVoidInvoices } from "./voidInvoiceFilter";

describe("dropVoidInvoices", () => {
  it("removes voided invoices and keeps the rest", () => {
    const rows = [{ jobber_invoice_id: "a" }, { jobber_invoice_id: "b" }, { jobber_invoice_id: null }];
    const out = dropVoidInvoices(rows, new Set(["b"]));
    expect(out.length).toBe(2);
    expect(out.some((r) => r.jobber_invoice_id === "b")).toBe(false);
  });

  it("returns rows unchanged when nothing is void", () => {
    const rows = [{ jobber_invoice_id: "a" }];
    expect(dropVoidInvoices(rows, new Set()).length).toBe(1);
  });
});
