import { describe, expect, it } from "vitest";
import { nextOccurrenceDate, occurrencesInWindow } from "./nativeRecurrence";

describe("nextOccurrenceDate", () => {
  it("adds 7 days for weekly", () => {
    expect(nextOccurrenceDate("2026-09-02", "weekly")).toBe("2026-09-09");
  });

  it("adds 2 months for bimonthly", () => {
    expect(nextOccurrenceDate("2026-09-02", "bimonthly")).toBe("2026-11-02");
  });

  it("adds 1 month for monthly", () => {
    expect(nextOccurrenceDate("2026-09-02", "monthly")).toBe("2026-10-02");
  });

  it("adds 3 months for quarterly", () => {
    expect(nextOccurrenceDate("2026-09-02", "quarterly")).toBe("2026-12-02");
  });

  it("adds 6 months for semiannual", () => {
    expect(nextOccurrenceDate("2026-09-02", "semiannual")).toBe("2027-03-02");
  });

  it("rolls over year boundaries correctly", () => {
    expect(nextOccurrenceDate("2026-12-20", "monthly")).toBe("2027-01-20");
  });

  it("clamps to the target month's last day instead of overflowing into the next month", () => {
    // Jan 31 + 1 month -> Feb 28 (2027 isn't a leap year), not "Mar 3."
    // Ryan, 2026-11-09, re Katie Ray: a day-29 anchor silently skipped
    // February 2027 entirely because the old unclamped math rolled "Feb
    // 29" forward into March instead of landing in February at all.
    expect(nextOccurrenceDate("2027-01-31", "monthly")).toBe("2027-02-28");
  });

  it("clamps into a leap-year February on its own 29th", () => {
    expect(nextOccurrenceDate("2028-01-29", "monthly")).toBe("2028-02-29");
  });
});

describe("occurrencesInWindow", () => {
  it("clamps a day-29 anchor through a non-leap February and recovers to the 29th afterward, with no permanent drift", () => {
    const result = occurrencesInWindow(
      "2026-10-29",
      "monthly",
      "2026-10-29",
      "2027-04-30"
    );

    expect(result).toEqual([
      "2026-11-29",
      "2026-12-29",
      "2027-01-29",
      "2027-02-28",
      "2027-03-29",
      "2027-04-29",
    ]);
  });

  it("generates weekly occurrences strictly after afterDate through windowEndDate", () => {
    const result = occurrencesInWindow(
      "2026-09-02",
      "weekly",
      "2026-09-02",
      "2026-09-30"
    );

    expect(result).toEqual([
      "2026-09-09",
      "2026-09-16",
      "2026-09-23",
      "2026-09-30",
    ]);
  });

  it("stays anchored to the original date even when afterDate is mid-cadence", () => {
    // Anchor stays Sept 2 — walking forward from the anchor rather than
    // from afterDate keeps every occurrence on the 2nd, not whatever day
    // afterDate happened to land on.
    const result = occurrencesInWindow(
      "2026-09-02",
      "monthly",
      "2026-10-15",
      "2026-12-31"
    );

    expect(result).toEqual(["2026-11-02", "2026-12-02"]);
  });

  it("returns an empty array when the window is entirely before the first occurrence", () => {
    const result = occurrencesInWindow(
      "2026-09-02",
      "monthly",
      "2026-09-02",
      "2026-09-10"
    );

    expect(result).toEqual([]);
  });

  it("returns an empty array when afterDate is already past windowEndDate", () => {
    const result = occurrencesInWindow(
      "2026-09-02",
      "weekly",
      "2026-12-01",
      "2026-09-30"
    );

    expect(result).toEqual([]);
  });

  it("does not include the anchor date itself when afterDate equals the anchor", () => {
    const result = occurrencesInWindow(
      "2026-09-02",
      "weekly",
      "2026-09-02",
      "2026-09-02"
    );

    expect(result).toEqual([]);
  });
});
