import { describe, it, expect } from "vitest";
import { buildServiceMonths, servicePattern } from "./serviceMonths";

const done = (month: string) => ({ month, completed: true, upcoming: false });

describe("buildServiceMonths", () => {
  it("builds twelve months ending two ahead of the current month", () => {
    const months = buildServiceMonths([], "2026-11-19");
    expect(months.length).toBe(12);
    expect(months[0].key).toBe("2026-02");
    expect(months[11].key).toBe("2027-01");
    expect(months.find((m) => m.isCurrent)?.key).toBe("2026-11");
  });

  it("counts completed and upcoming visits per month", () => {
    const months = buildServiceMonths(
      [done("2026-11"), done("2026-11"), { month: "2026-12", completed: false, upcoming: true }],
      "2026-11-19"
    );
    expect(months.find((m) => m.key === "2026-11")?.done).toBe(2);
    expect(months.find((m) => m.key === "2026-12")?.scheduled).toBe(1);
  });
});

describe("servicePattern", () => {
  it("reads monthly, twice a month and quarterly", () => {
    const monthly = buildServiceMonths(
      ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"].map(done),
      "2026-11-19"
    );
    expect(servicePattern(monthly)).toBe("Monthly");

    const twice = buildServiceMonths(
      ["2026-08", "2026-08", "2026-09", "2026-09", "2026-10", "2026-10", "2026-11", "2026-11"].map(done),
      "2026-11-19"
    );
    expect(servicePattern(twice)).toBe("Twice a month");

    const quarterly = buildServiceMonths(["2026-02", "2026-05", "2026-08", "2026-11"].map(done), "2026-11-19");
    expect(servicePattern(quarterly)).toBe("Quarterly");
  });

  it("returns null without enough history", () => {
    expect(servicePattern(buildServiceMonths([done("2026-11")], "2026-11-19"))).toBeNull();
  });
});
