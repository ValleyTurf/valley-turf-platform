import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { toPhoenixDateString } from "@/lib/phoenixDate";
import { ACTIVE_JOB_VISIT_FILTER } from "@/lib/customerVisitData";
import {
  matchVisitsToInvoices,
  type VisitInvoiceMatch,
} from "@/lib/visitInvoiceMatch";
import { isCollectedPayment } from "@/lib/visitDetailLogic";

export type VisitRow = {
  jobber_visit_id: string;
  jobber_client_id: string | null;
  jobber_job_id: string | null;
  jobber_invoice_id: string | null;
  customer_name: string | null;
  job_number: string | null;
  title: string | null;
  visit_status: string | null;
  start_at: string | null;
  end_at: string | null;
  completed_at: string | null;
  duration_minutes: number | null;
};

export async function getVisitRow(visitId: string): Promise<VisitRow | null> {
  const { data, error } = await supabaseServer
    .from("jobber_visits")
    .select(
      "jobber_visit_id, jobber_client_id, jobber_job_id, jobber_invoice_id, customer_name, job_number, title, visit_status, start_at, end_at, completed_at, duration_minutes"
    )
    .eq("jobber_visit_id", visitId)
    .maybeSingle();

  if (error) {
    console.error("Visit row query failed:", error.message);
    return null;
  }
  return (data as VisitRow | null) ?? null;
}

export type ClientVisitLink = {
  jobber_visit_id: string;
  start_at: string | null;
  visit_status: string | null;
  jobber_invoice_id: string | null;
};

// Every non-archived visit for the customer (past and upcoming), oldest
// to newest by caller's choice, with just what is needed to link visits
// to invoices and to step between visits.
export async function getClientVisitLinks(
  jobberClientId: string
): Promise<ClientVisitLink[]> {
  const { data, error } = await supabaseServer
    .from("jobber_visits")
    .select("jobber_visit_id, start_at, visit_status, jobber_invoice_id")
    .eq("jobber_client_id", jobberClientId)
    .not("start_at", "is", null)
    .or(ACTIVE_JOB_VISIT_FILTER)
    .order("start_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Client visit links query failed:", error.message);
    return [];
  }
  return (data ?? []) as ClientVisitLink[];
}

export type InvoiceRow = {
  jobber_invoice_id: string;
  invoice_number: string | null;
  subject: string | null;
  status: string | null;
  issue_date: string | null;
  due_date: string | null;
  total: number | string | null;
};

export async function getClientInvoiceRows(
  jobberClientId: string
): Promise<InvoiceRow[]> {
  const { data, error } = await supabaseServer
    .from("jobber_invoices")
    .select("jobber_invoice_id, invoice_number, subject, status, issue_date, due_date, total")
    .eq("jobber_client_id", jobberClientId)
    .limit(1000);

  if (error) {
    console.error("Client invoices query failed:", error.message);
    return [];
  }
  return (data ?? []) as InvoiceRow[];
}

export function visitMonth(startAt: string | null): string | null {
  return toPhoenixDateString(startAt)?.slice(0, 7) ?? null;
}

// Links every visit to an invoice (see lib/visitInvoiceMatch.ts for the
// rules). Returned map is keyed by visit id.
export function linkVisitsToInvoices(
  visits: ClientVisitLink[],
  invoices: InvoiceRow[]
): Map<string, VisitInvoiceMatch> {
  return matchVisitsToInvoices(
    visits.map((visit) => ({
      visitId: visit.jobber_visit_id,
      startAt: visit.start_at,
      invoiceId: visit.jobber_invoice_id,
      month: visitMonth(visit.start_at),
    })),
    invoices.map((invoice) => ({
      invoiceId: invoice.jobber_invoice_id,
      date: toPhoenixDateString(invoice.issue_date ?? invoice.due_date),
    }))
  );
}

export type VisitPayment = {
  id: string;
  amount: number;
  tip: number;
  date: string | null;
  method: string | null;
  status: string | null;
  collected: boolean;
};

export async function getPaymentsForInvoices(
  invoiceIds: string[]
): Promise<Map<string, VisitPayment[]>> {
  const map = new Map<string, VisitPayment[]>();
  if (invoiceIds.length === 0) return map;

  const { data, error } = await supabaseServer
    .from("jobber_payments")
    .select(
      "jobber_payment_id, jobber_invoice_id, amount, tip_amount, payment_date, payment_method, transaction_status"
    )
    .in("jobber_invoice_id", invoiceIds)
    .order("payment_date", { ascending: true });

  if (error) {
    console.error("Invoice payments query failed:", error.message);
    return map;
  }

  for (const row of data ?? []) {
    const invoiceId = row.jobber_invoice_id as string;
    const list = map.get(invoiceId) ?? [];
    list.push({
      id: row.jobber_payment_id as string,
      amount: Number(row.amount ?? 0),
      tip: Number(row.tip_amount ?? 0),
      date: (row.payment_date as string | null) ?? null,
      method: (row.payment_method as string | null) ?? null,
      status: (row.transaction_status as string | null) ?? null,
      collected: isCollectedPayment(row.transaction_status as string | null),
    });
    map.set(invoiceId, list);
  }
  return map;
}

export type InvoiceLine = {
  description: string;
  quantity: number;
  lineTotal: number;
};

// Line items and the 1-5 star rating only exist for invoices made in
// this app (their mirror id is "native-<uuid>").
export async function getNativeInvoiceExtras(mirrorInvoiceId: string): Promise<{
  lines: InvoiceLine[];
  rating: number | null;
}> {
  if (!mirrorInvoiceId.startsWith("native-")) return { lines: [], rating: null };
  const invoiceUuid = mirrorInvoiceId.slice("native-".length);

  const [{ data: lineRows }, { data: ratingRow }] = await Promise.all([
    supabaseServer
      .from("invoice_line_items")
      .select("description, quantity, line_total")
      .eq("invoice_id", invoiceUuid),
    supabaseServer
      .from("invoice_ratings")
      .select("score")
      .eq("invoice_id", invoiceUuid)
      .maybeSingle(),
  ]);

  return {
    lines: (lineRows ?? []).map((row) => ({
      description: String(row.description ?? ""),
      quantity: Number(row.quantity ?? 1),
      lineTotal: Number(row.line_total ?? 0),
    })),
    rating: ratingRow ? Number((ratingRow as { score: number }).score) : null,
  };
}

export type VisitTimeLog = {
  userName: string;
  startedAt: string;
  stoppedAt: string | null;
};

export async function getVisitTimeLogs(visitId: string): Promise<VisitTimeLog[]> {
  const [{ data: logs }, { data: users }] = await Promise.all([
    supabaseServer
      .from("visit_time_logs")
      .select("user_id, started_at, stopped_at")
      .eq("jobber_visit_id", visitId)
      .order("started_at", { ascending: true }),
    supabaseServer.from("users").select("id, name"),
  ]);

  const nameById = new Map<string, string>(
    ((users ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name])
  );

  return (logs ?? []).map((row) => ({
    userName: nameById.get(row.user_id as string) ?? "Crew member",
    startedAt: row.started_at as string,
    stoppedAt: (row.stopped_at as string | null) ?? null,
  }));
}

export type VisitAutomationEvent = {
  label: string;
  at: string;
};

// Reminders and the post-visit review ask are tracked per visit.
export async function getVisitAutomationEvents(
  visitId: string
): Promise<VisitAutomationEvent[]> {
  const [{ data: reminders }, { data: review }] = await Promise.all([
    supabaseServer
      .from("visit_reminders_sent")
      .select("days_before, sent_at")
      .eq("jobber_visit_id", visitId),
    supabaseServer
      .from("review_requests_sent")
      .select("sent_at")
      .eq("jobber_visit_id", visitId)
      .maybeSingle(),
  ]);

  const events: VisitAutomationEvent[] = (reminders ?? []).map((row) => ({
    label: `Reminder sent (${row.days_before} days before)`,
    at: row.sent_at as string,
  }));

  if (review) {
    events.push({
      label: "Review request sent",
      at: (review as { sent_at: string }).sent_at,
    });
  }
  return events;
}
