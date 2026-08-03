// Attributes Jobber tip payments to individual employees, by day, for
// payroll display on /timeclock and /timecards.
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
// Per the owner's own call on how to handle a recurring job whose
// visits span several days: the tip is attributed to the single most
// recent visit day among the invoice's visits, not split further or
// repeated across days.
//
// getTipsByUserAndDay does the Supabase I/O; attributeTips is the pure
// join/split logic, kept separate so it's unit-testable without a
// database (same split as lib/seasonalTrends.ts).
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { toPhoenixDateString } from "@/lib/phoenixDate";

export type TippedPayment = {
  jobber_invoice_id: string;
  tip_amount: number;
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
  // Combine tip amounts per invoice first — an invoice can have more
  // than one payment record (e.g. a partial payment + a tip added
  // later), and each one only carries its own slice of the tip.
  const tipByInvoice = new Map<string, number>();
  for (const payment of payments) {
    if (!payment.jobber_invoice_id || payment.tip_amount <= 0) continue;
    tipByInvoice.set(
      payment.jobber_invoice_id,
      (tipByInvoice.get(payment.jobber_invoice_id) ?? 0) + payment.tip_amount
    );
  }

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

  for (const [invoiceId, tipAmount] of tipByInvoice) {
    const invoiceVisits = visitsByInvoice.get(invoiceId) ?? [];
    if (invoiceVisits.length === 0) continue; // no synced visit for this invoice yet

    const assignedUserIds = new Set<string>();
    for (const visit of invoiceVisits) {
      for (const userId of assignedUsersByVisit.get(visit.jobber_visit_id) ?? []) {
        assignedUserIds.add(userId);
      }
    }
    if (assignedUserIds.size === 0) continue; // nobody assigned; nothing to attribute

    // Day of record: the most recent visit on this invoice.
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
    if (!latestVisit) continue;

    const dayKey = toPhoenixDateString(latestVisit.completed_at ?? latestVisit.start_at);
    if (!dayKey || dayKey < periodStartDate || dayKey > periodEndDate) continue;

    const perPersonAmount = roundCents(tipAmount / assignedUserIds.size);
    const jobNumber = latestVisit.job_number;

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

// Payments can post well after the visits they're for were worked —
// tip attribution below is keyed off the visit day, not the payment
// day, so this looks back further than the pay period itself when
// pulling candidate payments. Generous enough to cover realistic
// invoice-to-payment lag without scanning the whole payments table.
const PAYMENT_LOOKBACK_DAYS = 120;

function shiftDateKey(dateKeyStr: string, days: number): string {
  const [year, month, day] = dateKeyStr.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(
    shifted.getUTCDate()
  ).padStart(2, "0")}`;
}

export async function getTipsByUserAndDay(
  periodStartDate: string,
  periodEndDate: string
): Promise<TipsByUserAndDay> {
  const lookbackStart = shiftDateKey(periodStartDate, -PAYMENT_LOOKBACK_DAYS);

  const { data: paymentsData } = await supabaseServer
    .from("jobber_payments")
    .select("jobber_invoice_id, tip_amount")
    .gt("tip_amount", 0)
    .gte("payment_date", lookbackStart)
    .lte("payment_date", periodEndDate);

  const payments = (paymentsData ?? []) as TippedPayment[];
  if (payments.length === 0) return new Map();

  const invoiceIds = Array.from(new Set(payments.map((p) => p.jobber_invoice_id)));

  const { data: visitsData } = await supabaseServer
    .from("jobber_visits")
    .select("jobber_visit_id, jobber_invoice_id, job_number, start_at, completed_at")
    .in("jobber_invoice_id", invoiceIds);

  const visits = (visitsData ?? []) as TippedVisit[];
  const visitIds = visits.map((v) => v.jobber_visit_id);

  const { data: assignmentsData } =
    visitIds.length > 0
      ? await supabaseServer
          .from("visit_assignments")
          .select("jobber_visit_id, assigned_user_id")
          .in("jobber_visit_id", visitIds)
      : { data: [] as VisitAssignment[] };

  const assignments = (assignmentsData ?? []) as VisitAssignment[];

  return attributeTips(payments, visits, assignments, periodStartDate, periodEndDate);
}
