// Supabase I/O for tip attribution — the pure join/split logic
// (attributeTips) now lives in lib/tipAttribution.ts, split out so it
// can be unit-tested without tripping the server-only guard below. See
// that file's header comment for the full "why a separate file"
// explanation and for the attribution rules themselves.
//
// Re-exports attributeTips and its types so existing imports of
// "@/lib/tips" (app/(platform)/timeclock/page.tsx,
// app/(platform)/timecards/page.tsx) don't need to change.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import {
  attributeTips,
  type TippedPayment,
  type TippedVisit,
  type VisitAssignment,
  type TipsByUserAndDay,
} from "@/lib/tipAttribution";

export {
  attributeTips,
  type TippedPayment,
  type TippedVisit,
  type VisitAssignment,
  type TipJobBreakdown,
  type UserDailyTip,
  type TipsByUserAndDay,
} from "@/lib/tipAttribution";

// Attribution is keyed off the payment's own date (see
// lib/tipAttribution.ts's header comment for why), so the payments
// query only needs the period's own bounds -- no lookback window
// needed: a job worked long before this period but paid (and tipped)
// within it is found by jobber_visits having no date filter at all
// below, not by widening this query.
export async function getTipsByUserAndDay(
  periodStartDate: string,
  periodEndDate: string
): Promise<TipsByUserAndDay> {
  const { data: paymentsData } = await supabaseServer
    .from("jobber_payments")
    .select("jobber_invoice_id, tip_amount, payment_date")
    .gt("tip_amount", 0)
    .gte("payment_date", periodStartDate)
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
