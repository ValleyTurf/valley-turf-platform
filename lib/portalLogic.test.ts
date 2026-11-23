import { describe, it, expect } from "vitest";
import {
  describeVisit,
  escapeLikePattern,
  invoiceBalanceLabel,
  isCustomerVisibleInvoiceStatus,
  loginLinkRateLimited,
  phoenixDaysUntil,
} from "./portalLogic";

// Phoenix is UTC-7: 9:00am Phoenix = 16:00 UTC.
const NOW = new Date("2026-11-23T20:00:00Z"); // Mon Nov 23, 1pm Phoenix

describe("describeVisit", () => {
  it("shows only the month when the visit is more than 4 days out", () => {
    const v = describeVisit("2026-12-03T16:00:00Z", NOW);
    expect(v?.lockedIn).toBe(false);
    expect(v?.label).toBe("December 2026");
  });
  it("shows the day and time once within 4 days, in Phoenix time", () => {
    const v = describeVisit("2026-11-27T16:00:00Z", NOW); // Fri Nov 27 9:00am Phoenix
    expect(v?.lockedIn).toBe(true);
    expect(v?.label.includes("Friday")).toBe(true);
    expect(v?.label.includes("9:00")).toBe(true);
    expect(v?.label.includes("AM")).toBe(true);
  });
  it("treats exactly 4 days out as locked in and 5 days as not", () => {
    expect(describeVisit("2026-11-27T16:00:00Z", NOW)?.lockedIn).toBe(true);
    expect(describeVisit("2026-11-28T16:00:00Z", NOW)?.lockedIn).toBe(false);
  });
  it("uses the Phoenix calendar day for late-evening UTC times", () => {
    // 11pm Phoenix Nov 22 = 06:00 UTC Nov 23: still "today" minus one day
    expect(phoenixDaysUntil(new Date("2026-11-23T06:00:00Z"), NOW)).toBe(-1);
  });
  it("handles missing or bad dates", () => {
    expect(describeVisit(null, NOW) === null).toBe(true);
    expect(describeVisit("nonsense", NOW) === null).toBe(true);
  });
});

describe("invoices", () => {
  it("hides drafts and voids only", () => {
    expect(isCustomerVisibleInvoiceStatus("draft")).toBe(false);
    expect(isCustomerVisibleInvoiceStatus("DRAFT")).toBe(false);
    expect(isCustomerVisibleInvoiceStatus("void")).toBe(false);
    expect(isCustomerVisibleInvoiceStatus("sent")).toBe(true);
    expect(isCustomerVisibleInvoiceStatus("paid")).toBe(true);
    expect(isCustomerVisibleInvoiceStatus("AWAITING_PAYMENT")).toBe(true);
  });
  it("labels balances", () => {
    expect(invoiceBalanceLabel("sent", 50)).toBe("due");
    expect(invoiceBalanceLabel("PAID", 0)).toBe("paid");
    expect(invoiceBalanceLabel("sent", 0)).toBe("none");
  });
});

describe("sign-in protections", () => {
  it("escapes ILIKE wildcards", () => {
    expect(escapeLikePattern("%")).toBe("\\%");
    expect(escapeLikePattern("a_b@x.com")).toBe("a\\_b@x.com");
  });
  it("limits links per window", () => {
    expect(loginLinkRateLimited(2)).toBe(false);
    expect(loginLinkRateLimited(3)).toBe(true);
  });
});
