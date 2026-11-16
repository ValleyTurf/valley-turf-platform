import { describe, expect, it } from "vitest";
import { DEFAULT_AUTOPAY_SCHEDULE, autopayChargeDate, isAutopayChargeDue, hasPrepayDay, prepayPeriod, daysBetween, addDays, formatPrepayPeriod, describeAutopaySchedule, type AutopaySchedule } from "./autopayTiming";

describe("autopayTiming", () => {
  // Each check reads as one test. The expected value is compared with
  // toEqual, so objects and arrays compare by content.
  function t(name: string, got: unknown, want: unknown) {
    it(name, () => {
      expect(got).toEqual(want);
    });
  }

  const dom = (d: number | null): AutopaySchedule => ({ timing: "day_of_month", dayOfMonth: d, delayDays: null });
  const after = (n: number | null): AutopaySchedule => ({ timing: "days_after_invoice", dayOfMonth: null, delayDays: n });
  // ordinary invoices: pay-ahead customers are charged right away
  t("on invoice", autopayChargeDate("2026-11-14", DEFAULT_AUTOPAY_SCHEDULE), "2026-11-14");
  t("pay-ahead extra charged right away", autopayChargeDate("2026-12-10", dom(1)), "2026-12-10");
  t("7 days after", autopayChargeDate("2026-11-28", after(7)), "2026-12-05");
  t("missing delay falls back", autopayChargeDate("2026-11-28", after(null)), "2026-11-28");
  t("due check", [isAutopayChargeDue("2026-11-28", after(7), "2026-12-04"), isAutopayChargeDue("2026-11-28", after(7), "2026-12-05")], [false, true]);
  // periods
  t("1st: Dec 1", prepayPeriod("2026-12-01", 1), { start: "2026-12-01", endExclusive: "2027-01-01" });
  t("1st: Dec 4", prepayPeriod("2026-12-04", 1), { start: "2026-12-01", endExclusive: "2027-01-01" });
  t("1st: Nov 30", prepayPeriod("2026-11-30", 1), { start: "2026-11-01", endExclusive: "2026-12-01" });
  t("15th: Dec 14", prepayPeriod("2026-12-14", 15), { start: "2026-11-15", endExclusive: "2026-12-15" });
  t("15th: Dec 15", prepayPeriod("2026-12-15", 15), { start: "2026-12-15", endExclusive: "2027-01-15" });
  t("15th: Jan 3 crosses year", prepayPeriod("2027-01-03", 15), { start: "2026-12-15", endExclusive: "2027-01-15" });
  t("28th in Feb", prepayPeriod("2027-02-28", 28), { start: "2027-02-28", endExclusive: "2027-03-28" });
  t("28th on Mar 1", prepayPeriod("2027-03-01", 28), { start: "2027-02-28", endExclusive: "2027-03-28" });
  t("period label 1st", formatPrepayPeriod(prepayPeriod("2026-12-01", 1)), "Dec 1 - Dec 31");
  t("period label 15th", formatPrepayPeriod(prepayPeriod("2026-12-15", 15)), "Dec 15 - Jan 14");
  t("period label Feb", formatPrepayPeriod(prepayPeriod("2027-02-01", 1)), "Feb 1 - Feb 28");
  t("daysBetween", daysBetween("2026-12-01", "2026-12-04"), 3);
  t("addDays", addDays("2026-12-31", 1), "2027-01-01");
  t("hasPrepayDay", [hasPrepayDay(dom(1)), hasPrepayDay(dom(null)), hasPrepayDay(dom(31)), hasPrepayDay(after(3))], [true, false, false, false]);
  t("describe", describeAutopaySchedule(dom(1)), "on the 1st of each month, for the month ahead");
});
