import { describe, expect, it } from "vitest";
import {
  humanizeVisitField,
  sortVisitRows,
  filterVisitRows,
  summarizeVisitsByJobType,
  getVisitDateRange,
  formatPhoenixTime,
  type VisitRow,
} from "./visitReportFormatting";

function row(overrides: Partial<VisitRow>): VisitRow {
  return {
    id: "v1",
    jobId: "j1",
    jobNumber: "100",
    jobberWebUri: null,
    date: "2026-08-01",
    startAt: "2026-08-01T17:15:00Z",
    endAt: "2026-08-01T19:00:00Z",
    title: "Monthly Maintenance",
    clientId: "c1",
    clientName: "Alice",
    clientEmail: "alice@example.com",
    clientPhone: "555-1111",
    status: "Active",
    jobType: "One Off",
    jobTotal: 100,
    ...overrides,
  };
}

describe("humanizeVisitField", () => {
  it("returns 'Unknown' for blank/null values", () => {
    expect(humanizeVisitField(null)).toBe("Unknown");
    expect(humanizeVisitField("")).toBe("Unknown");
    expect(humanizeVisitField("   ")).toBe("Unknown");
  });

  it("humanizes SCREAMING_SNAKE_CASE values", () => {
    expect(humanizeVisitField("ONE_OFF")).toBe("One Off");
    expect(humanizeVisitField("RECURRING")).toBe("Recurring");
    expect(humanizeVisitField("ACTIVE")).toBe("Active");
  });
});

describe("sortVisitRows", () => {
  const rows = [
    row({ id: "a", clientName: "Charlie", jobNumber: "300", date: "2026-08-03", jobType: "Recurring", status: "Late" }),
    row({ id: "b", clientName: "Alice", jobNumber: "50", date: "2026-08-01", jobType: "Active", status: "Active" }),
    row({ id: "c", clientName: "Bob", jobNumber: "100", date: "2026-08-02", jobType: "One Off", status: "Complete" }),
  ];

  it("sorts by date ascending/descending, using start time as a tiebreaker", () => {
    expect(sortVisitRows(rows, "date", "asc").map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(sortVisitRows(rows, "date", "desc").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("sorts by client name", () => {
    expect(sortVisitRows(rows, "client", "asc").map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by job number numerically, not lexically", () => {
    expect(sortVisitRows(rows, "jobNumber", "asc").map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the original array", () => {
    const original = [...rows];
    sortVisitRows(rows, "client", "asc");
    expect(rows).toEqual(original);
  });
});

describe("filterVisitRows", () => {
  const rows = [
    row({ id: "a", clientName: "Alice Smith", jobType: "One Off", status: "Active" }),
    row({ id: "b", clientName: "Bob Jones", jobType: "Recurring", status: "Late" }),
    row({ id: "c", clientName: "Alicia Keys", jobType: "One Off", status: "Late" }),
  ];

  it("returns all rows when filters are 'all' or blank", () => {
    expect(filterVisitRows(rows, { jobType: "all", status: "all", search: "" })).toHaveLength(3);
  });

  it("filters by exact job type", () => {
    expect(filterVisitRows(rows, { jobType: "Recurring" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("filters by exact status", () => {
    expect(filterVisitRows(rows, { status: "Late" }).map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("filters by case-insensitive client name substring", () => {
    expect(filterVisitRows(rows, { search: "alic" }).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("combines filters", () => {
    expect(
      filterVisitRows(rows, { jobType: "One Off", status: "Late" }).map((r) => r.id)
    ).toEqual(["c"]);
  });
});

describe("summarizeVisitsByJobType", () => {
  it("counts each job's total exactly once, even with several visits in range (e.g. a $500/mo job serviced weekly)", () => {
    const rows = [
      row({ id: "v1", jobId: "j1", jobType: "Recurring", jobTotal: 500 }),
      row({ id: "v2", jobId: "j1", jobType: "Recurring", jobTotal: 500 }), // same job, 2nd visit
      row({ id: "v3", jobId: "j1", jobType: "Recurring", jobTotal: 500 }), // same job, 3rd visit
      row({ id: "v4", jobId: "j2", jobType: "One Off", jobTotal: 200 }),
    ];

    const summary = summarizeVisitsByJobType(rows);
    expect(summary).toEqual([
      { jobType: "Recurring", total: 500, jobCount: 1, visitCount: 3 },
      { jobType: "One Off", total: 200, jobCount: 1, visitCount: 1 },
    ]);
  });

  it("still sums multiple distinct jobs of the same type, not just deduping within one job", () => {
    const rows = [
      row({ id: "v1", jobId: "j1", jobType: "Recurring", jobTotal: 500 }),
      row({ id: "v2", jobId: "j1", jobType: "Recurring", jobTotal: 500 }),
      row({ id: "v3", jobId: "j3", jobType: "Recurring", jobTotal: 150 }),
    ];

    expect(summarizeVisitsByJobType(rows)).toEqual([
      { jobType: "Recurring", total: 650, jobCount: 2, visitCount: 3 },
    ]);
  });

  it("falls back to visit id when a visit has no job", () => {
    const rows = [row({ id: "v1", jobId: null, jobType: "One Off", jobTotal: 75 })];
    expect(summarizeVisitsByJobType(rows)).toEqual([
      { jobType: "One Off", total: 75, jobCount: 1, visitCount: 1 },
    ]);
  });

  it("returns an empty list for no rows", () => {
    expect(summarizeVisitsByJobType([])).toEqual([]);
  });
});

describe("getVisitDateRange", () => {
  const today = new Date(Date.UTC(2026, 7, 15)); // Aug 15, 2026

  it("computes today as a single day", () => {
    const { startDate, endDate } = getVisitDateRange("today", today);
    expect(startDate).toBe("2026-08-15");
    expect(endDate).toBe("2026-08-15");
  });

  it("computes next-7-days inclusive of today", () => {
    const { startDate, endDate } = getVisitDateRange("next-7-days", today);
    expect(startDate).toBe("2026-08-15");
    expect(endDate).toBe("2026-08-21");
  });

  it("computes this-month as the full calendar month", () => {
    const { startDate, endDate } = getVisitDateRange("this-month", today);
    expect(startDate).toBe("2026-08-01");
    expect(endDate).toBe("2026-08-31");
  });

  it("computes last-month as the full previous calendar month", () => {
    const { startDate, endDate } = getVisitDateRange("last-month", today);
    expect(startDate).toBe("2026-07-01");
    expect(endDate).toBe("2026-07-31");
  });

  it("swaps custom start/end given in the wrong order", () => {
    const { startDate, endDate } = getVisitDateRange("custom", today, "2026-08-20", "2026-08-10");
    expect(startDate).toBe("2026-08-10");
    expect(endDate).toBe("2026-08-20");
  });
});

describe("formatPhoenixTime", () => {
  it("formats an ISO timestamp as compact Phoenix local time", () => {
    // 2026-08-01T17:15:00Z is 10:15AM in Phoenix (UTC-7, no DST)
    expect(formatPhoenixTime("2026-08-01T17:15:00Z")).toBe("10:15AM");
  });

  it("returns null for missing or invalid input", () => {
    expect(formatPhoenixTime(null)).toBeNull();
    expect(formatPhoenixTime(undefined)).toBeNull();
    expect(formatPhoenixTime("not-a-date")).toBeNull();
  });
});
