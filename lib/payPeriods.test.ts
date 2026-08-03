import { describe, expect, it } from "vitest";
import {
  getPayPeriodForDate,
  getPreviousPayPeriod,
  getNextPayPeriod,
  getPreviousPayPeriods,
  parsePayPeriodParam,
  isSamePayPeriod,
  formatPayPeriodLabel,
  payPeriodQueryRange,
  payPeriodExclusiveEndDate,
} from "./payPeriods";

describe("getPayPeriodForDate", () => {
  it("maps the 1st-15th to the first-half period", () => {
    expect(getPayPeriodForDate("2026-08-01")).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-15",
    });
    expect(getPayPeriodForDate("2026-08-15")).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-15",
    });
  });

  it("maps the 16th-end of month to the second-half period", () => {
    expect(getPayPeriodForDate("2026-08-16")).toEqual({
      startDate: "2026-08-16",
      endDate: "2026-08-31",
    });
    expect(getPayPeriodForDate("2026-08-31")).toEqual({
      startDate: "2026-08-16",
      endDate: "2026-08-31",
    });
  });

  it("handles a 28-day February", () => {
    expect(getPayPeriodForDate("2026-02-20")).toEqual({
      startDate: "2026-02-16",
      endDate: "2026-02-28",
    });
  });

  it("handles a leap-year February", () => {
    expect(getPayPeriodForDate("2028-02-20")).toEqual({
      startDate: "2028-02-16",
      endDate: "2028-02-29",
    });
  });
});

describe("getPreviousPayPeriod / getNextPayPeriod", () => {
  it("steps from second-half to first-half within the same month", () => {
    expect(getPreviousPayPeriod({ startDate: "2026-08-16", endDate: "2026-08-31" })).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-15",
    });
  });

  it("steps from first-half back into the prior month's second half", () => {
    expect(getPreviousPayPeriod({ startDate: "2026-08-01", endDate: "2026-08-15" })).toEqual({
      startDate: "2026-07-16",
      endDate: "2026-07-31",
    });
  });

  it("steps back across a year boundary", () => {
    expect(getPreviousPayPeriod({ startDate: "2026-01-01", endDate: "2026-01-15" })).toEqual({
      startDate: "2025-12-16",
      endDate: "2025-12-31",
    });
  });

  it("is the inverse of getNextPayPeriod", () => {
    const period = { startDate: "2026-08-01", endDate: "2026-08-15" };
    expect(getPreviousPayPeriod(getNextPayPeriod(period))).toEqual(period);
    expect(getNextPayPeriod(getPreviousPayPeriod(period))).toEqual(period);
  });

  it("steps forward across a year boundary", () => {
    expect(getNextPayPeriod({ startDate: "2025-12-16", endDate: "2025-12-31" })).toEqual({
      startDate: "2026-01-01",
      endDate: "2026-01-15",
    });
  });
});

describe("getPreviousPayPeriods", () => {
  it("returns the requested count, most recent first", () => {
    const current = { startDate: "2026-08-16", endDate: "2026-08-31" };
    expect(getPreviousPayPeriods(current, 3)).toEqual([
      { startDate: "2026-08-01", endDate: "2026-08-15" },
      { startDate: "2026-07-16", endDate: "2026-07-31" },
      { startDate: "2026-07-01", endDate: "2026-07-15" },
    ]);
  });
});

describe("parsePayPeriodParam", () => {
  it("accepts a valid period-start date", () => {
    expect(parsePayPeriodParam("2026-08-16")).toEqual({
      startDate: "2026-08-16",
      endDate: "2026-08-31",
    });
  });

  it("falls back to the current period for a mid-period date", () => {
    // 2026-08-10 is not a valid period-start (1st or 16th only).
    const result = parsePayPeriodParam("2026-08-10");
    expect(result.startDate === "2026-08-10").toBe(false);
  });

  it("falls back to the current period for garbage input", () => {
    const result = parsePayPeriodParam("not-a-date");
    expect(result).toBeTruthy();
  });
});

describe("isSamePayPeriod", () => {
  it("compares by start date", () => {
    expect(
      isSamePayPeriod(
        { startDate: "2026-08-01", endDate: "2026-08-15" },
        { startDate: "2026-08-01", endDate: "2026-08-15" }
      )
    ).toBe(true);
    expect(
      isSamePayPeriod(
        { startDate: "2026-08-01", endDate: "2026-08-15" },
        { startDate: "2026-08-16", endDate: "2026-08-31" }
      )
    ).toBe(false);
  });
});

describe("formatPayPeriodLabel", () => {
  it("formats a first-half period", () => {
    expect(formatPayPeriodLabel({ startDate: "2026-08-01", endDate: "2026-08-15" })).toBe(
      "Aug 1–15, 2026"
    );
  });

  it("formats a second-half period", () => {
    expect(formatPayPeriodLabel({ startDate: "2026-08-16", endDate: "2026-08-31" })).toBe(
      "Aug 16–31, 2026"
    );
  });
});

describe("payPeriodExclusiveEndDate", () => {
  it("returns the day after a mid-month period end", () => {
    expect(payPeriodExclusiveEndDate({ startDate: "2026-08-01", endDate: "2026-08-15" })).toBe(
      "2026-08-16"
    );
  });

  it("rolls into the next month at month-end", () => {
    expect(payPeriodExclusiveEndDate({ startDate: "2026-08-16", endDate: "2026-08-31" })).toBe(
      "2026-09-01"
    );
  });
});

describe("payPeriodQueryRange", () => {
  it("produces an exclusive end one day past the period end", () => {
    expect(payPeriodQueryRange({ startDate: "2026-08-01", endDate: "2026-08-15" })).toEqual({
      queryStart: "2026-08-01T00:00:00-07:00",
      queryEnd: "2026-08-16T00:00:00-07:00",
    });
  });

  it("rolls the exclusive end into the next month at month-end", () => {
    expect(payPeriodQueryRange({ startDate: "2026-08-16", endDate: "2026-08-31" })).toEqual({
      queryStart: "2026-08-16T00:00:00-07:00",
      queryEnd: "2026-09-01T00:00:00-07:00",
    });
  });
});
