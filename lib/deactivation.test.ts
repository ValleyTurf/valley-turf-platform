import { describe, expect, it } from "vitest";
import {
  CADENCE_INTERVAL_DAYS,
  cadenceCategoryFor,
  churnReasonLabel,
  deactivationThresholdDays,
  isChurnReason,
  isDeactivationCandidate,
} from "./deactivation";

describe("cadenceCategoryFor", () => {
  it("maps known category labels", () => {
    expect(cadenceCategoryFor("Monthly Maintenance")).toBe("monthly");
    expect(cadenceCategoryFor("Quarterly Cleaning")).toBe("quarterly");
    expect(cadenceCategoryFor("Bimonthly Cleaning")).toBe("bimonthly");
    expect(cadenceCategoryFor("Semi-Annual Cleaning")).toBe("semiannual");
  });

  it("falls back to other for unknown or null categories", () => {
    expect(cadenceCategoryFor("Something Else")).toBe("other");
    expect(cadenceCategoryFor(null)).toBe("other");
  });
});

describe("deactivationThresholdDays", () => {
  it("is 2x the expected interval per category", () => {
    expect(deactivationThresholdDays("monthly")).toBe(60);
    expect(deactivationThresholdDays("quarterly")).toBe(180);
    expect(deactivationThresholdDays("bimonthly")).toBe(120);
    expect(deactivationThresholdDays("semiannual")).toBe(360);
    expect(deactivationThresholdDays("other")).toBe(180);
  });

  it("matches CADENCE_INTERVAL_DAYS times two for every category", () => {
    for (const category of Object.keys(
      CADENCE_INTERVAL_DAYS
    ) as (keyof typeof CADENCE_INTERVAL_DAYS)[]) {
      expect(deactivationThresholdDays(category)).toBe(
        CADENCE_INTERVAL_DAYS[category] * 2
      );
    }
  });
});

describe("isDeactivationCandidate", () => {
  it("flags a monthly customer well past their expected cadence", () => {
    expect(
      isDeactivationCandidate({
        invoiceCount: 12,
        daysSinceLastInvoice: 70,
        isRecurring: true,
        cadenceCategory: "monthly",
        isLogged: false,
      })
    ).toBe(true);
  });

  it("does not flag a semi-annual customer who is simply mid-cycle", () => {
    expect(
      isDeactivationCandidate({
        invoiceCount: 4,
        daysSinceLastInvoice: 100,
        isRecurring: true,
        cadenceCategory: "semiannual",
        isLogged: false,
      })
    ).toBe(false);
  });

  it("flags a semi-annual customer well past their expected cadence", () => {
    expect(
      isDeactivationCandidate({
        invoiceCount: 4,
        daysSinceLastInvoice: 400,
        isRecurring: true,
        cadenceCategory: "semiannual",
        isLogged: false,
      })
    ).toBe(true);
  });

  it("ignores non-recurring customers", () => {
    expect(
      isDeactivationCandidate({
        invoiceCount: 12,
        daysSinceLastInvoice: 400,
        isRecurring: false,
        cadenceCategory: "monthly",
        isLogged: false,
      })
    ).toBe(false);
  });

  it("ignores customers already logged", () => {
    expect(
      isDeactivationCandidate({
        invoiceCount: 12,
        daysSinceLastInvoice: 400,
        isRecurring: true,
        cadenceCategory: "monthly",
        isLogged: true,
      })
    ).toBe(false);
  });

  it("ignores customers with no invoices", () => {
    expect(
      isDeactivationCandidate({
        invoiceCount: 0,
        daysSinceLastInvoice: null,
        isRecurring: true,
        cadenceCategory: "monthly",
        isLogged: false,
      })
    ).toBe(false);
  });

  it("ignores customers with a null days-since-last-invoice", () => {
    expect(
      isDeactivationCandidate({
        invoiceCount: 3,
        daysSinceLastInvoice: null,
        isRecurring: true,
        cadenceCategory: "monthly",
        isLogged: false,
      })
    ).toBe(false);
  });

  it("is exclusive at the exact threshold boundary", () => {
    expect(
      isDeactivationCandidate({
        invoiceCount: 5,
        daysSinceLastInvoice: 59,
        isRecurring: true,
        cadenceCategory: "monthly",
        isLogged: false,
      })
    ).toBe(false);

    expect(
      isDeactivationCandidate({
        invoiceCount: 5,
        daysSinceLastInvoice: 60,
        isRecurring: true,
        cadenceCategory: "monthly",
        isLogged: false,
      })
    ).toBe(true);
  });
});

describe("isChurnReason", () => {
  it("accepts every value in CHURN_REASONS", () => {
    expect(isChurnReason("moved")).toBe(true);
    expect(isChurnReason("price")).toBe(true);
    expect(isChurnReason("service_issues")).toBe(true);
    expect(isChurnReason("switched_providers")).toBe(true);
    expect(isChurnReason("seasonal")).toBe(true);
    expect(isChurnReason("unresponsive")).toBe(true);
    expect(isChurnReason("not_a_cancel")).toBe(true);
    expect(isChurnReason("other")).toBe(true);
  });

  it("rejects unknown values, including the retired canceled_permanently", () => {
    expect(isChurnReason("canceled_permanently")).toBe(false);
    expect(isChurnReason("not_a_real_reason")).toBe(false);
    expect(isChurnReason("")).toBe(false);
  });
});

describe("churnReasonLabel", () => {
  it("returns the human label for known reasons", () => {
    expect(churnReasonLabel("service_issues")).toBe("Service Issues");
    expect(churnReasonLabel("unresponsive")).toBe(
      "Unresponsive / No Reason Given"
    );
  });

  it("falls back to the raw value for unknown reasons", () => {
    expect(churnReasonLabel("mystery_reason")).toBe("mystery_reason");
  });
});
