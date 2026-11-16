// When should an autopay customer's card be charged? (ROADMAP "Top 10
// (November 2026)" #4, migration 105.) Pure date logic with no database
// or Stripe in it, so it can be checked on its own and shared by
// everything that needs the same answer.
//
// The three timings:
//   on_invoice          -- charge each invoice as soon as it's sent.
//   day_of_month        -- PAY AHEAD. Ryan, 2026-11-15: "Those that have
//                          a date they pay on will be paying for example
//                          December 1st for the month of December. It
//                          will always be paid for the month ahead, not
//                          behind." On that day each month one invoice
//                          is built for the visits scheduled in the
//                          coming period and charged
//                          (lib/autopayPrepay.ts). Anything invoiced
//                          separately -- an added visit, an add-on -- is
//                          charged right away, exactly like on_invoice.
//   days_after_invoice  -- hold each invoice's charge until N days after
//                          it was sent.
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

// The calendar date the card should be charged for an ordinary invoice
// (one a person created) sent on `invoiceDate`. Only days_after_invoice
// ever holds one: a pay-ahead (day_of_month) customer's separately
// invoiced extras are charged right away, and their month-ahead invoice
// is built and charged by lib/autopayPrepay.ts, not through here. A
// days_after_invoice row missing its number falls back to the invoice
// date -- the safe reading of a half-filled setting is the behavior
// everyone had before this option existed.
export function autopayChargeDate(invoiceDate: string, schedule: AutopaySchedule): string {
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

export function hasPrepayDay(schedule: AutopaySchedule): schedule is AutopaySchedule & {
  dayOfMonth: number;
} {
  return (
    schedule.timing === "day_of_month" &&
    schedule.dayOfMonth !== null &&
    Number.isInteger(schedule.dayOfMonth) &&
    schedule.dayOfMonth >= 1 &&
    schedule.dayOfMonth <= 28
  );
}

export type PrepayPeriod = {
  // The pay date: the most recent occurrence of the customer's day on
  // or before the date asked about.
  start: string;
  // The next pay date. Visits from `start` up to but NOT including this
  // day are what the payment on `start` covers.
  endExclusive: string;
};

// The pay-ahead period that `date` falls in, for a customer who pays on
// `dayOfMonth`. Paying on the 1st: Dec 1 covers Dec 1 - Dec 31. Paying
// on the 15th: Dec 15 covers Dec 15 - Jan 14.
export function prepayPeriod(date: string, dayOfMonth: number): PrepayPeriod {
  const current = parse(date);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  const startMonth = current.getUTCDate() >= dayOfMonth ? month : month - 1;

  return {
    start: format(new Date(Date.UTC(year, startMonth, dayOfMonth))),
    endExclusive: format(new Date(Date.UTC(year, startMonth + 1, dayOfMonth))),
  };
}

export function daysBetween(earlier: string, later: string): number {
  return Math.round((parse(later).getTime() - parse(earlier).getTime()) / 86400000);
}

export function addDays(date: string, days: number): string {
  const result = parse(date);
  result.setUTCDate(result.getUTCDate() + days);
  return format(result);
}

// "Dec 1 - Dec 31" -- what a period covers, for the invoice and digest.
export function formatPrepayPeriod(period: PrepayPeriod): string {
  return `${formatChargeDate(period.start)} - ${formatChargeDate(addDays(period.endExclusive, -1))}`;
}

// Staff-facing description of a schedule ("on the 1st of each month").
export function describeAutopaySchedule(schedule: AutopaySchedule): string {
  if (schedule.timing === "day_of_month" && schedule.dayOfMonth) {
    return `on the ${ordinal(schedule.dayOfMonth)} of each month, for the month ahead`;
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
