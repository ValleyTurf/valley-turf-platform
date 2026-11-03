import { describe, expect, it } from "vitest";
import { attributeTips } from "./tipAttribution";

const PERIOD_START = "2026-08-01";
const PERIOD_END = "2026-08-15";

describe("attributeTips", () => {
  it("gives the whole tip to a solo assignee", () => {
    const result = attributeTips(
      [{ jobber_invoice_id: "inv1", tip_amount: 25, payment_date: "2026-08-05" }],
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
      [{ jobber_invoice_id: "inv1", tip_amount: 25, payment_date: "2026-08-05" }],
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

  it("attributes the tip to the day it was PAID, not the day the job was worked", () => {
    // The job itself was worked back on 7/20 -- well before the pay
    // period -- but the customer didn't pay (and tip) until 8/5, inside
    // it. Ryan's call (2026-11-03, the Carole Cobb case): the tip rides
    // with whatever pay period the money actually lands in.
    const result = attributeTips(
      [{ jobber_invoice_id: "inv1", tip_amount: 25, payment_date: "2026-08-05" }],
      [
        {
          jobber_visit_id: "v1",
          jobber_invoice_id: "inv1",
          job_number: "J-100",
          start_at: "2026-07-20T14:00:00Z",
          completed_at: "2026-07-20T15:00:00Z",
        },
      ],
      [{ jobber_visit_id: "v1", assigned_user_id: "user-a" }],
      PERIOD_START,
      PERIOD_END
    );

    expect(result.get("user-a")?.get("2026-07-20")).toBeUndefined();
    expect(result.get("user-a")?.get("2026-08-05")).toEqual({
      amount: 25,
      jobs: [{ jobNumber: "J-100", amount: 25 }],
    });
  });

  it("labels a multi-visit job's tip with its most recent visit's job number", () => {
    const result = attributeTips(
      [{ jobber_invoice_id: "inv1", tip_amount: 30, payment_date: "2026-08-10" }],
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

    // Lands on the payment day (8/10), not either visit day.
    expect(result.get("user-a")?.get("2026-08-02")).toBeUndefined();
    expect(result.get("user-a")?.get("2026-08-09")).toBeUndefined();
    expect(result.get("user-a")?.get("2026-08-10")?.amount).toBe(30);
  });

  it("pools assignees across all of an invoice's visits before splitting", () => {
    const result = attributeTips(
      [{ jobber_invoice_id: "inv1", tip_amount: 30, payment_date: "2026-08-10" }],
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
    // evenly, landing on the payment day.
    expect(result.get("user-a")?.get("2026-08-10")?.amount).toBe(15);
    expect(result.get("user-b")?.get("2026-08-10")?.amount).toBe(15);
  });

  it("keeps two payments on the same invoice separate when they land on different days", () => {
    const result = attributeTips(
      [
        { jobber_invoice_id: "inv1", tip_amount: 10, payment_date: "2026-08-05" },
        { jobber_invoice_id: "inv1", tip_amount: 5, payment_date: "2026-08-12" },
      ],
      [
        {
          jobber_visit_id: "v1",
          jobber_invoice_id: "inv1",
          job_number: "J-100",
          start_at: "2026-08-01T14:00:00Z",
          completed_at: null,
        },
      ],
      [{ jobber_visit_id: "v1", assigned_user_id: "user-a" }],
      PERIOD_START,
      PERIOD_END
    );

    expect(result.get("user-a")?.get("2026-08-05")?.amount).toBe(10);
    expect(result.get("user-a")?.get("2026-08-12")?.amount).toBe(5);
  });

  it("combines multiple payment records against the same invoice on the same day", () => {
    const result = attributeTips(
      [
        { jobber_invoice_id: "inv1", tip_amount: 10, payment_date: "2026-08-05" },
        { jobber_invoice_id: "inv1", tip_amount: 5, payment_date: "2026-08-05" },
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
      [{ jobber_invoice_id: "inv1", tip_amount: 25, payment_date: "2026-08-05" }],
      [],
      [],
      PERIOD_START,
      PERIOD_END
    );

    expect(result.size).toBe(0);
  });

  it("skips a tip whose visits have nobody assigned", () => {
    const result = attributeTips(
      [{ jobber_invoice_id: "inv1", tip_amount: 25, payment_date: "2026-08-05" }],
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

  it("excludes a tip whose payment date falls outside the requested period", () => {
    const result = attributeTips(
      [{ jobber_invoice_id: "inv1", tip_amount: 25, payment_date: "2026-07-20" }],
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

  it("excludes a tip with no payment date at all", () => {
    const result = attributeTips(
      [{ jobber_invoice_id: "inv1", tip_amount: 25, payment_date: null }],
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

  it("ignores non-positive or missing tip amounts", () => {
    const result = attributeTips(
      [
        { jobber_invoice_id: "inv1", tip_amount: 0, payment_date: "2026-08-05" },
        { jobber_invoice_id: "inv2", tip_amount: -5, payment_date: "2026-08-05" },
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
