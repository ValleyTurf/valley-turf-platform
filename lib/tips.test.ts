import { describe, expect, it } from "vitest";
import { attributeTips } from "./tips";

const PERIOD_START = "2026-08-01";
const PERIOD_END = "2026-08-15";

describe("attributeTips", () => {
  it("gives the whole tip to a solo assignee", () => {
    const result = attributeTips(
      [{ jobber_invoice_id: "inv1", tip_amount: 25 }],
      [
        {
          jobber_visit_id: "v1",
          jobber_invoice_id: "inv1",
          job_number: "J-100",
          start_at: "2026-08-05T14:00:00Z",
          completed_at: "2026-08-05T15:00:00Z",
        },
      ],
      [{ jobber_visit_id: "v1", assigned_user_id: "user-a" }],
      PERIOD_START,
      PERIOD_END
    );

    expect(result.get("user-a")?.get("2026-08-05")).toEqual({
      amount: 25,
      jobs: [{ jobNumber: "J-100", amount: 25 }],
    });
  });

  it("splits evenly between two people assigned to the same job", () => {
    const result = attributeTips(
      [{ jobber_invoice_id: "inv1", tip_amount: 25 }],
      [
        {
          jobber_visit_id: "v1",
          jobber_invoice_id: "inv1",
          job_number: "J-100",
          start_at: "2026-08-05T14:00:00Z",
          completed_at: "2026-08-05T15:00:00Z",
        },
      ],
      [
        { jobber_visit_id: "v1", assigned_user_id: "user-a" },
        { jobber_visit_id: "v1", assigned_user_id: "user-b" },
      ],
      PERIOD_START,
      PERIOD_END
    );

    expect(result.get("user-a")?.get("2026-08-05")?.amount).toBe(12.5);
    expect(result.get("user-b")?.get("2026-08-05")?.amount).toBe(12.5);
  });

  it("attributes a multi-visit job's tip to the most recent visit day", () => {
    const result = attributeTips(
      [{ jobber_invoice_id: "inv1", tip_amount: 30 }],
      [
        {
          jobber_visit_id: "v1",
          jobber_invoice_id: "inv1",
          job_number: "J-200",
          start_at: "2026-08-02T14:00:00Z",
          completed_at: "2026-08-02T15:00:00Z",
        },
        {
          jobber_visit_id: "v2",
          jobber_invoice_id: "inv1",
          job_number: "J-200",
          start_at: "2026-08-09T14:00:00Z",
          completed_at: "2026-08-09T15:00:00Z",
        },
      ],
      [
        { jobber_visit_id: "v1", assigned_user_id: "user-a" },
        { jobber_visit_id: "v2", assigned_user_id: "user-a" },
      ],
      PERIOD_START,
      PERIOD_END
    );

    // Only the later of the two visit days gets the tip, not both.
    expect(result.get("user-a")?.get("2026-08-02")).toBeUndefined();
    expect(result.get("user-a")?.get("2026-08-09")?.amount).toBe(30);
  });

  it("pools assignees across all of an invoice's visits before splitting", () => {
    const result = attributeTips(
      [{ jobber_invoice_id: "inv1", tip_amount: 30 }],
      [
        {
          jobber_visit_id: "v1",
          jobber_invoice_id: "inv1",
          job_number: "J-200",
          start_at: "2026-08-02T14:00:00Z",
          completed_at: "2026-08-02T15:00:00Z",
        },
        {
          jobber_visit_id: "v2",
          jobber_invoice_id: "inv1",
          job_number: "J-200",
          start_at: "2026-08-09T14:00:00Z",
          completed_at: "2026-08-09T15:00:00Z",
        },
      ],
      [
        { jobber_visit_id: "v1", assigned_user_id: "user-a" },
        { jobber_visit_id: "v2", assigned_user_id: "user-b" },
      ],
      PERIOD_START,
      PERIOD_END
    );

    // Both user-a (only on v1) and user-b (only on v2) share the tip
    // evenly, landing on v2's day since it's the later visit.
    expect(result.get("user-a")?.get("2026-08-09")?.amount).toBe(15);
    expect(result.get("user-b")?.get("2026-08-09")?.amount).toBe(15);
  });

  it("combines multiple payment records against the same invoice", () => {
    const result = attributeTips(
      [
        { jobber_invoice_id: "inv1", tip_amount: 10 },
        { jobber_invoice_id: "inv1", tip_amount: 5 },
      ],
      [
        {
          jobber_visit_id: "v1",
          jobber_invoice_id: "inv1",
          job_number: "J-100",
          start_at: "2026-08-05T14:00:00Z",
          completed_at: null,
        },
      ],
      [{ jobber_visit_id: "v1", assigned_user_id: "user-a" }],
      PERIOD_START,
      PERIOD_END
    );

    expect(result.get("user-a")?.get("2026-08-05")?.amount).toBe(15);
  });

  it("skips a tip whose invoice has no synced visits", () => {
    const result = attributeTips(
      [{ jobber_invoice_id: "inv1", tip_amount: 25 }],
      [],
      [],
      PERIOD_START,
      PERIOD_END
    );

    expect(result.size).toBe(0);
  });

  it("skips a tip whose visits have nobody assigned", () => {
    const result = attributeTips(
      [{ jobber_invoice_id: "inv1", tip_amount: 25 }],
      [
        {
          jobber_visit_id: "v1",
          jobber_invoice_id: "inv1",
          job_number: "J-100",
          start_at: "2026-08-05T14:00:00Z",
          completed_at: null,
        },
      ],
      [],
      PERIOD_START,
      PERIOD_END
    );

    expect(result.size).toBe(0);
  });

  it("excludes a tip whose attributed day falls outside the requested period", () => {
    const result = attributeTips(
      [{ jobber_invoice_id: "inv1", tip_amount: 25 }],
      [
        {
          jobber_visit_id: "v1",
          jobber_invoice_id: "inv1",
          job_number: "J-100",
          start_at: "2026-07-20T14:00:00Z",
          completed_at: null,
        },
      ],
      [{ jobber_visit_id: "v1", assigned_user_id: "user-a" }],
      PERIOD_START,
      PERIOD_END
    );

    expect(result.size).toBe(0);
  });

  it("ignores non-positive or missing tip amounts", () => {
    const result = attributeTips(
      [
        { jobber_invoice_id: "inv1", tip_amount: 0 },
        { jobber_invoice_id: "inv2", tip_amount: -5 },
      ],
      [
        {
          jobber_visit_id: "v1",
          jobber_invoice_id: "inv1",
          job_number: "J-100",
          start_at: "2026-08-05T14:00:00Z",
          completed_at: null,
        },
      ],
      [{ jobber_visit_id: "v1", assigned_user_id: "user-a" }],
      PERIOD_START,
      PERIOD_END
    );

    expect(result.size).toBe(0);
  });
});
