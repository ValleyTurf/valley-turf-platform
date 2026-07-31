import { describe, expect, it } from "vitest";
import {
  segmentMinutes,
  totalMinutes,
  formatHoursMinutes,
  minutesToDecimalHours,
} from "./shiftHours";

describe("segmentMinutes", () => {
  it("computes minutes between clock in and clock out", () => {
    expect(
      segmentMinutes({
        clockedInAt: "2026-07-30T14:00:00Z",
        clockedOutAt: "2026-07-30T14:30:00Z",
      })
    ).toBe(30);
  });

  it("counts an open segment up to `now`", () => {
    const now = new Date("2026-07-30T15:00:00Z");
    expect(
      segmentMinutes(
        { clockedInAt: "2026-07-30T14:00:00Z", clockedOutAt: null },
        now
      )
    ).toBe(60);
  });

  it("returns 0 for a clock-out before the clock-in (bad data)", () => {
    expect(
      segmentMinutes({
        clockedInAt: "2026-07-30T14:00:00Z",
        clockedOutAt: "2026-07-30T13:00:00Z",
      })
    ).toBe(0);
  });

  it("returns 0 for unparseable timestamps", () => {
    expect(
      segmentMinutes({ clockedInAt: "not-a-date", clockedOutAt: null })
    ).toBe(0);
  });
});

describe("totalMinutes", () => {
  const segments = [
    { clockedInAt: "2026-07-30T14:00:00Z", clockedOutAt: "2026-07-30T14:30:00Z" }, // 30
    { clockedInAt: "2026-07-30T16:00:00Z", clockedOutAt: "2026-07-30T17:15:00Z" }, // 75
    { clockedInAt: "2026-07-30T18:00:00Z", clockedOutAt: null }, // still open
  ];

  it("excludes open segments by default (payroll totals)", () => {
    expect(totalMinutes(segments)).toBe(105);
  });

  it("includes an open segment up to now when includeActive is set", () => {
    const now = new Date("2026-07-30T18:20:00Z");
    expect(totalMinutes(segments, { includeActive: true, now })).toBe(125);
  });
});

describe("formatHoursMinutes", () => {
  it("formats whole hours and minutes", () => {
    expect(formatHoursMinutes(125)).toBe("2h 5m");
  });

  it("floors negative/NaN input to 0h 0m", () => {
    expect(formatHoursMinutes(-10)).toBe("0h 0m");
    expect(formatHoursMinutes(NaN)).toBe("0h 0m");
  });
});

describe("minutesToDecimalHours", () => {
  it("converts to two-decimal hours", () => {
    expect(minutesToDecimalHours(90)).toBe(1.5);
    expect(minutesToDecimalHours(100)).toBe(1.67);
  });

  it("clamps non-positive input to 0", () => {
    expect(minutesToDecimalHours(0)).toBe(0);
    expect(minutesToDecimalHours(-5)).toBe(0);
  });
});
