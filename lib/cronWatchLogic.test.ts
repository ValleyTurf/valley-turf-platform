import { describe, it, expect } from "vitest";
import {
  allowedGapHours,
  evaluateJob,
  isAlertHour,
  maxGapHours,
  planWatchActions,
  type JobStatusRow,
} from "./cronWatchLogic";

const NOW = new Date("2026-11-24T20:00:00Z"); // 1pm Phoenix

function row(over: Partial<JobStatusRow>): JobStatusRow {
  return { status: "healthy", lastStartedAt: null, lastSuccessAt: null, lastFailedAt: null, lastError: null, ...over };
}

describe("maxGapHours", () => {
  it("daily is 24", () => {
    expect(maxGapHours(["0 14 * * *"])).toBe(24);
  });
  it("twice a day is 12", () => {
    expect(maxGapHours(["0 13 * * *", "0 1 * * *"])).toBe(12);
  });
  it("four a day is 6", () => {
    expect(maxGapHours(["35 1 * * *", "35 7 * * *", "35 13 * * *", "35 19 * * *"])).toBe(6);
  });
  it("weekly is 168", () => {
    expect(maxGapHours(["20 10 * * 0"])).toBe(168);
  });
  it("hourly is 1", () => {
    expect(maxGapHours(["25 * * * *"])).toBe(1);
  });
  it("returns null for forms it does not understand", () => {
    expect(maxGapHours(["*/5 * * * *"]) === null).toBe(true);
    expect(maxGapHours(["0 9 1 * *"]) === null).toBe(true);
  });
});

describe("allowedGapHours", () => {
  it("adds grace", () => {
    expect(allowedGapHours(24)).toBe(30);
    expect(allowedGapHours(1)).toBe(4);
    expect(allowedGapHours(168)).toBe(210);
  });
});

describe("evaluateJob", () => {
  it("never run", () => {
    expect(evaluateJob(null, 24, NOW).state).toBe("never");
  });
  it("healthy daily job", () => {
    const r = row({ lastSuccessAt: "2026-11-24T00:00:00Z" });
    expect(evaluateJob(r, 24, NOW).state).toBe("ok");
  });
  it("daily job missed a whole day", () => {
    const r = row({ lastSuccessAt: "2026-11-22T14:00:00Z" });
    expect(evaluateJob(r, 24, NOW).state).toBe("late");
  });
  it("recent failure is not alerted yet, old one is", () => {
    const fresh = row({ status: "failed", lastFailedAt: "2026-11-24T19:40:00Z", lastSuccessAt: "2026-11-24T00:00:00Z" });
    expect(evaluateJob(fresh, 24, NOW).state).toBe("ok");
    const old = row({ status: "failed", lastFailedAt: "2026-11-24T15:00:00Z", lastSuccessAt: "2026-11-24T00:00:00Z", lastError: "boom" });
    const result = evaluateJob(old, 24, NOW);
    expect(result.state).toBe("failed");
    expect(result.detail.includes("boom")).toBe(true);
  });
  it("stuck running", () => {
    const r = row({ status: "running", lastStartedAt: "2026-11-24T19:30:00Z", lastSuccessAt: "2026-11-24T00:00:00Z" });
    expect(evaluateJob(r, 24, NOW).state).toBe("stuck");
    const justStarted = row({ status: "running", lastStartedAt: "2026-11-24T19:55:00Z", lastSuccessAt: "2026-11-24T00:00:00Z" });
    expect(evaluateJob(justStarted, 24, NOW).state).toBe("ok");
  });
});

describe("alert hours", () => {
  it("only 7am to 9pm Phoenix", () => {
    expect(isAlertHour(new Date("2026-11-24T13:59:00Z"))).toBe(false); // 6:59am
    expect(isAlertHour(new Date("2026-11-24T14:00:00Z"))).toBe(true); // 7am
    expect(isAlertHour(new Date("2026-11-25T03:59:00Z"))).toBe(true); // 8:59pm
    expect(isAlertHour(new Date("2026-11-25T04:00:00Z"))).toBe(false); // 9pm
  });
});

describe("planWatchActions", () => {
  const late = { state: "late" as const, detail: "late" };
  const ok = { state: "ok" as const, detail: "fine" };

  it("opens and notifies a new problem in the daytime", () => {
    const actions = planWatchActions([{ syncType: "a", evaluation: late }], [], NOW);
    expect(actions.length).toBe(1);
    expect(actions[0].kind).toBe("open");
    if (actions[0].kind === "open") expect(actions[0].notifyNow).toBe(true);
  });
  it("opens quietly at night then notifies after 7am", () => {
    const night = new Date("2026-11-25T08:00:00Z"); // 1am Phoenix
    const a = planWatchActions([{ syncType: "a", evaluation: late }], [], night);
    if (a[0].kind === "open") expect(a[0].notifyNow).toBe(false);
    const open = [{ id: "1", syncType: "a", problem: "late" as const, lastNotifiedAt: null }];
    expect(planWatchActions([{ syncType: "a", evaluation: late }], open, night).length).toBe(0);
    const morning = new Date("2026-11-25T14:30:00Z");
    const b = planWatchActions([{ syncType: "a", evaluation: late }], open, morning);
    expect(b[0].kind).toBe("notify");
  });
  it("does not repeat within a day, reminds after a day", () => {
    const recent = [{ id: "1", syncType: "a", problem: "late" as const, lastNotifiedAt: "2026-11-24T10:00:00Z" }];
    expect(planWatchActions([{ syncType: "a", evaluation: late }], recent, NOW).length).toBe(0);
    const old = [{ id: "1", syncType: "a", problem: "late" as const, lastNotifiedAt: "2026-11-23T10:00:00Z" }];
    const r = planWatchActions([{ syncType: "a", evaluation: late }], old, NOW);
    expect(r[0].kind).toBe("notify");
    if (r[0].kind === "notify") expect(r[0].reminder).toBe(true);
  });
  it("resolves when the job is healthy again, but not when it has never run", () => {
    const open = [{ id: "1", syncType: "a", problem: "late" as const, lastNotifiedAt: "2026-11-24T10:00:00Z" }];
    expect(planWatchActions([{ syncType: "a", evaluation: ok }], open, NOW)[0].kind).toBe("resolve");
    expect(planWatchActions([{ syncType: "a", evaluation: { state: "never", detail: "" } }], open, NOW).length).toBe(0);
  });
});
