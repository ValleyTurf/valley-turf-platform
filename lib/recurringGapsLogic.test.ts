import { describe, expect, it } from "vitest";
import { describeGap, detectGaps, type GapJob } from "./recurringGapsLogic";

describe("recurringGapsLogic", () => {
  // Each check reads as one test. The expected value is compared with
  // toEqual, so objects and arrays compare by content.
  function t(name: string, got: unknown, want: unknown) {
    it(name, () => {
      expect(got).toEqual(want);
    });
  }


  const job = (frequency: string): GapJob => ({
    jobId: "J",
    jobNumber: "1223",
    clientId: "C",
    customerName: "Katie Ray",
    title: "t",
    frequency,
  });

  // Katie Ray: Feb missing
  let g = detectGaps(job("monthly"), ["2026-10-30","2026-11-28","2026-12-29","2027-01-29","2027-03-29","2027-04-29"], "2026-11-15");
  t("katie gap count", g.length, 1);
  t("katie gap", [g[0]?.from, g[0]?.to, g[0]?.days, g[0]?.kind], ["2027-01-29","2027-03-29",59,"gap"]);
  // with Feb restored
  t("katie fixed", detectGaps(job("monthly"), ["2026-11-28","2026-12-29","2027-01-29","2027-02-28","2027-03-29"], "2026-11-15").length, 0);
  // reschedule by two weeks, no flag (29 -> 12th of next month = 44 days)
  t("reschedule ok", detectGaps(job("monthly"), ["2026-11-29","2027-01-12","2027-01-29"], "2026-11-15").length, 0);
  // gap wholly in the past is ignored
  t("past gap ignored", detectGaps(job("monthly"), ["2026-06-01","2026-09-01","2026-10-25","2026-11-20","2026-12-20"], "2026-11-15").length, 0);
  // gap spanning today is flagged
  t("spanning today", detectGaps(job("monthly"), ["2026-09-01","2026-12-01"], "2026-11-15").map(x=>x.days), [91]);
  // none upcoming
  g = detectGaps(job("quarterly"), ["2026-08-01"], "2026-11-15");
  t("none upcoming", [g.length, g[0]?.kind, g[0]?.from], [1,"none_upcoming","2026-08-01"]);
  t("never", detectGaps(job("weekly"), [], "2026-11-15")[0]?.key, "J|none|never");
  // quarterly normal + one missing
  t("quarterly ok", detectGaps(job("quarterly"), ["2026-11-20","2027-02-20","2027-05-20"], "2026-11-15").length, 0);
  t("quarterly missing", detectGaps(job("quarterly"), ["2026-11-20","2027-05-20"], "2026-11-15").length, 1);
  // weekly one missing (14 days > 11)
  t("weekly missing", detectGaps(job("weekly"), ["2026-11-16","2026-11-23","2026-12-07"], "2026-11-15").length, 1);
  // unknown frequency
  t("unknown freq", detectGaps(job("yearly"), [], "2026-11-15").length, 0);
  // duplicate dates
  t("dupes", detectGaps(job("monthly"), ["2026-11-28","2026-11-28","2026-12-29"], "2026-11-15").length, 0);
});

describe("describeGap", () => {
  it("names the customer, job and the missing stretch", () => {
    const gaps = detectGaps(
      {
        jobId: "J",
        jobNumber: "1223",
        clientId: "C",
        customerName: "Test Customer",
        title: "t",
        frequency: "monthly",
      },
      ["2026-10-30", "2026-11-28", "2026-12-29", "2027-01-29", "2027-03-29"],
      "2026-11-15"
    );

    expect(gaps).toHaveLength(1);
    expect(describeGap(gaps[0])).toContain("Test Customer (Job #1223, monthly)");
  });
});
