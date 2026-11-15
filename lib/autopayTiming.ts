// When should an autopay customer's card be charged for an invoice?
// (ROADMAP "Top 10 (November 2026)" #4, migration 105.) Pure date
// logic with no database or Stripe in it, so it can be checked on its
// own and shared by everything that needs the same answer: invoice
// creation (charge now or hold?), the daily scheduled-charge cron, the
// overdue-reminder cron (don't nag someone whose card is set to be
// charged on the 1st), and the "will be charged on ..." line in the
// invoice email/text.
//
// All dates are plain YYYY-MM-DD calendar dates in the business's own
// timezone -- callers convert with lib/phoenixDate.ts first.

export type AutopayTiming = "on_invoice" | "day_of_month" | "days_after_invoice";

export type AutopaySchedule = {
  timing: AutopayTiming;
  // 1-28 so the day exists in every month. Only read for day_of_month.
  dayOfMonth: number | null;
  // Only read for days_after_invoice.
  delayDays: number | null;
};

export const DEFAULT_AUTOPAY_SCHEDULE: AutopaySchedule = {
  timing: "on_invoice",
  dayOfMonth: null,
  delayDays: null,
};

export function isAutopayTiming(value: unknown): value is AutopayTiming {
  return value === "on_invoice" || value === "day_of_month" || value === "days_after_invoice";
}

function parse(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// The calendar date the card should be charged for an invoice sent on
// `invoiceDate`. A schedule that's missing the number it needs (a
// day_of_month row with no day saved) falls back to charging on the
// invoice date -- the safe reading of a half-filled setting is the
// behavior everyone had before this option existed.
export function autopayChargeDate(invoiceDate: string, schedule: AutopaySchedule): string {
  if (
    schedule.timing === "day_of_month" &&
    schedule.dayOfMonth !== null &&
    schedule.dayOfMonth >= 1 &&
    schedule.dayOfMonth <= 28
  ) {
    const start = parse(invoiceDate);
    const thisMonth = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), schedule.dayOfMonth)
    );

    // An invoice sent ON the charge day is charged that same day.
    if (thisMonth.getTime() >= start.getTime()) {
      return format(thisMonth);
    }

    return format(
      new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, schedule.dayOfMonth))
    );
  }

  if (
    schedule.timing === "days_after_invoice" &&
    schedule.delayDays !== null &&
    schedule.delayDays >= 1
  ) {
    const date = parse(invoiceDate);
    date.setUTCDate(date.getUTCDate() + schedule.delayDays);
    return format(date);
  }

  return invoiceDate;
}

export function isAutopayChargeDue(
  invoiceDate: string,
  schedule: AutopaySchedule,
  today: string
): boolean {
  return autopayChargeDate(invoiceDate, schedule) <= today;
}

function ordinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  const mod10 = day % 10;
  if (mod10 === 1) return `${day}st`;
  if (mod10 === 2) return `${day}nd`;
  if (mod10 === 3) return `${day}rd`;
  return `${day}th`;
}

// Staff-facing description of a schedule ("on the 1st of each month").
export function describeAutopaySchedule(schedule: AutopaySchedule): string {
  if (schedule.timing === "day_of_month" && schedule.dayOfMonth) {
    return `on the ${ordinal(schedule.dayOfMonth)} of each month`;
  }

  if (schedule.timing === "days_after_invoice" && schedule.delayDays) {
    return `${schedule.delayDays} day${schedule.delayDays === 1 ? "" : "s"} after each invoice`;
  }

  return "as soon as each invoice is sent";
}

// Customer-facing date label ("Dec 1").
export function formatChargeDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(parse(date));
}
