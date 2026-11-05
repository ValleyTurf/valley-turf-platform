// Pure join/split logic for attributing Jobber tip payments to
// employees by day — split out of lib/tips.ts specifically so it's
// importable from a unit test. lib/tips.ts as a whole is guarded by
// `import "server-only"` (it also does the Supabase I/O), which made
// every test in lib/tips.test.ts fail in CI with "This module cannot
// be imported from a Client Component module" — vitest resolves
// server-only's package export condition the same way a browser
// bundle would, so the guard fires even though tests run in Node, not
// a browser. No such import here, so this file is safe to import from
// anywhere (a test, a server module, hypothetically even a client
// component) — see lib/tips.ts for the DB-backed wrapper
// (getTipsByUserAndDay) that real app code should actually use.
//
// Tips arrive tied to an INVOICE (jobber_payments.tip_amount) — Jobber
// has no first-class link from a tip to a job or a crew member.
// jobber_visits stores both jobber_invoice_id and jobber_job_id
// (populated by app/api/jobber/sync-visits/route.ts), and
// visit_assignments stores who worked which visit, so the join here is
// entirely local: a tipped payment's invoice -> that invoice's visits
// -> everyone assigned to any of those visits -> split the tip evenly
// across that set. One invoice can span multiple visits (Jobber's
// InvoiceCreateInput takes a list of visitIds), which in the common
// case is just one job's visits all invoiced together — "everyone
// assigned to any of the invoice's visits" is this app's stand-in for
// "everyone assigned to that job."
//
// The day of record is the PAYMENT's own date (payment.payment_date),
// not the visit day -- this used to be keyed off the most recent visit
// day instead, on the theory that a tip "belongs to" the day the job
// was worked. Ryan caught the real-world failure mode (2026-11-03):
// Carole Cobb's job was worked last pay period but she paid (and
// tipped) today, in this period -- keying off the visit day meant the
// tip fell in a period that had already closed out, and the old
// lookback window in lib/tips.ts only looked BACKWARD from a period's
// start for a late-arriving payment, not forward past a period's own
// end for a payment that posts after that period closes, so the tip
// was invisible on both periods' timecards. His call: "If it gets paid
// in this pay period and leaves a tip, then the tip needs to go to the
// correct employees for this pay period" -- tips get paid out with
// whatever period the money actually lands in, same as the wages they
// sit next to on this page, not the period the job happened to be
// worked in. Who the tip gets split between is unchanged (everyone
// assigned to any of the invoice's visits); only which day/period it
// lands on changed. The most recent visit is still used for the job
// number shown next to each tip, since that's just a label, not an
// attribution decision.
export type TippedPayment = {
  jobber_invoice_id: string;
  tip_amount: number;
  payment_date: string | null;
};

export type TippedVisit = {
  jobber_visit_id: string;
  jobber_invoice_id: string | null;
  job_number: string | null;
  start_at: string | null;
  completed_at: string | null;
};

export type VisitAssignment = {
  jobber_visit_id: string;
  assigned_user_id: string;
};

export type TipJobBreakdown = {
  jobNumber: string | null;
  amount: number;
};

export type UserDailyTip = {
  amount: number;
  jobs: TipJobBreakdown[];
};

// Map<userId, Map<"YYYY-MM-DD", UserDailyTip>>
export type TipsByUserAndDay = Map<string, Map<string, UserDailyTip>>;

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function attributeTips(
  payments: TippedPayment[],
  visits: TippedVisit[],
  assignments: VisitAssignment[],
  periodStartDate: string,
  periodEndDate: string
): TipsByUserAndDay {
  const visitsByInvoice = new Map<string, TippedVisit[]>();
  for (const visit of visits) {
    if (!visit.jobber_invoice_id) continue;
    const list = visitsByInvoice.get(visit.jobber_invoice_id) ?? [];
    list.push(visit);
    visitsByInvoice.set(visit.jobber_invoice_id, list);
  }

  const assignedUsersByVisit = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    const set = assignedUsersByVisit.get(assignment.jobber_visit_id) ?? new Set<string>();
    set.add(assignment.assigned_user_id);
    assignedUsersByVisit.set(assignment.jobber_visit_id, set);
  }

  const result: TipsByUserAndDay = new Map();

  // Processed per PAYMENT, not pre-combined per invoice -- an invoice
  // can have more than one payment record (e.g. a partial payment + a
  // tip added later), and each one carries its own date as well as its
  // own slice of the tip, so two payments on the same invoice can
  // legitimately land on two different days/pay periods.
  for (const payment of payments) {
    if (!payment.jobber_invoice_id || payment.tip_amount <= 0) continue;

    // payment.payment_date is already a Phoenix calendar date string
    // ("YYYY-MM-DD") by the time it gets here -- every writer of
    // jobber_payments.payment_date (app/api/jobber/sync-payments's
    // cleanDate = toPhoenixDateString, and the native-payment paths in
    // lib/payments.ts / lib/stripeWebhookProcessor.ts, which slice an
    // ISO timestamp down to its first 10 characters) already produces
    // one. Running it through toPhoenixDateString a second time here
    // used to re-parse that bare date as UTC midnight and convert THAT
    // to Phoenix time (UTC-7), silently shifting every tip back one
    // calendar day -- e.g. a payment correctly dated "2026-08-05"
    // became dayKey "2026-08-04". Caught via the dedicated test suite
    // in lib/tipAttribution.test.ts, where every date-specific
    // assertion (payment_date "2026-08-05" expected to land on
    // "2026-08-05", not "2026-08-04") was failing in CI.
    const dayKey = payment.payment_date;
    if (!dayKey || dayKey < periodStartDate || dayKey > periodEndDate) continue;

    const invoiceVisits = visitsByInvoice.get(payment.jobber_invoice_id) ?? [];
    if (invoiceVisits.length === 0) continue; // no synced visit for this invoice yet

    const assignedUserIds = new Set<string>();
    for (const visit of invoiceVisits) {
      for (const userId of assignedUsersByVisit.get(visit.jobber_visit_id) ?? []) {
        assignedUserIds.add(userId);
      }
    }
    if (assignedUserIds.size === 0) continue; // nobody assigned; nothing to attribute

    // Most recent visit on the invoice -- used only for the job-number
    // label shown next to this tip, not for which day it's attributed
    // to (that's dayKey, above, from the payment itself).
    let latestVisit: TippedVisit | null = null;
    let latestTime = -Infinity;
    for (const visit of invoiceVisits) {
      const raw = visit.completed_at ?? visit.start_at;
      const time = raw ? new Date(raw).getTime() : NaN;
      if (Number.isFinite(time) && time > latestTime) {
        latestTime = time;
        latestVisit = visit;
      }
    }

    const perPersonAmount = roundCents(payment.tip_amount / assignedUserIds.size);
    const jobNumber = latestVisit?.job_number ?? null;

    for (const userId of assignedUserIds) {
      const userMap = result.get(userId) ?? new Map<string, UserDailyTip>();
      const existing = userMap.get(dayKey) ?? { amount: 0, jobs: [] };
      existing.amount = roundCents(existing.amount + perPersonAmount);
      existing.jobs.push({ jobNumber, amount: perPersonAmount });
      userMap.set(dayKey, existing);
      result.set(userId, userMap);
    }
  }

  return result;
}
