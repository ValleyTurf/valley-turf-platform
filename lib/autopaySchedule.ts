// Scheduled autopay (ROADMAP "Top 10 (November 2026)" #4, migration
// 105). Three jobs, all built on lib/autopayTiming.ts's date rules:
//
//   1. chargeDueScheduledInvoices() -- the daily cron. For customers
//      whose autopay is set to a day of the month or N days after the
//      invoice, charges each open invoice once its charge date arrives.
//   2. chargeOpenInvoicesAfterEnrollment() -- called when a card is
//      saved (Stripe's setup_intent.succeeded). Heather Henderson
//      enrolled with an invoice already open and nothing charged it;
//      now anything already due under her schedule is charged right
//      then, and the enrollment page says so up front.
//   3. findInvoicesAwaitingScheduledCharge() -- lets the overdue
//      reminder cron leave alone an invoice whose customer is simply
//      waiting for their agreed charge day.
//
// One rule shared by all three: an invoice gets ONE automatic attempt
// on or after its charge date. If the card is declined it is not
// retried every morning -- the failure shows in the daily digest, the
// normal overdue reminders take over, and Charge Card on File is there
// for a manual retry.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { toPhoenixDateString } from "@/lib/phoenixDate";
import { getOpenInvoicesForClients } from "@/lib/invoices";
import { autopayReferenceDate } from "@/lib/autopay";
import { chargeInvoiceAndSendReceipt } from "@/lib/autopayCharge";
import { sendPush } from "@/lib/webPush";
import { getUnreadMessageCount } from "@/lib/contactHistory";
import {
  DEFAULT_AUTOPAY_SCHEDULE,
  autopayChargeDate,
  isAutopayTiming,
  type AutopaySchedule,
} from "@/lib/autopayTiming";

type EnrolledRow = {
  jobber_client_id: string;
  autopay_timing: string | null;
  autopay_day_of_month: number | null;
  autopay_delay_days: number | null;
};

function toSchedule(row: EnrolledRow): AutopaySchedule {
  return isAutopayTiming(row.autopay_timing)
    ? {
        timing: row.autopay_timing,
        dayOfMonth: row.autopay_day_of_month,
        delayDays: row.autopay_delay_days,
      }
    : DEFAULT_AUTOPAY_SCHEDULE;
}

// Everyone with autopay on and a card saved, keyed by client, with
// their schedule. An error (including "migration 105 not run yet")
// returns an empty map: with no schedules known, nothing is held and
// nothing is charged on a schedule, which is exactly the pre-105
// behavior.
async function loadEnrolledSchedules(
  onlyClientIds?: string[]
): Promise<Map<string, AutopaySchedule>> {
  let query = supabaseServer
    .from("customer_payment_methods")
    .select("jobber_client_id, autopay_timing, autopay_day_of_month, autopay_delay_days")
    .eq("autopay_enabled", true)
    .not("stripe_payment_method_id", "is", null)
    .not("stripe_customer_id", "is", null);

  if (onlyClientIds) {
    if (onlyClientIds.length === 0) return new Map();
    query = query.in("jobber_client_id", onlyClientIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Couldn't load autopay schedules:", error.message);
    return new Map();
  }

  return new Map(
    ((data ?? []) as EnrolledRow[]).map((row) => [row.jobber_client_id, toSchedule(row)])
  );
}

type AttemptHistory = {
  // invoice id -> the most recent date any charge was attempted for it.
  latest: Map<string, string>;
  // invoice ids with a charge that went through. Normally those are
  // already marked paid and never reach here; one that isn't yet (the
  // Stripe webhook is late) must not be charged again.
  succeeded: Set<string>;
};

async function loadAttemptHistory(invoiceIds: string[]): Promise<AttemptHistory> {
  const history: AttemptHistory = { latest: new Map(), succeeded: new Set() };

  if (invoiceIds.length === 0) return history;

  const { data, error } = await supabaseServer
    .from("autopay_charge_attempts")
    .select("invoice_id, attempted_on, succeeded")
    .in("invoice_id", invoiceIds);

  if (error) {
    console.error("Couldn't load autopay attempts:", error.message);
    return history;
  }

  for (const row of data ?? []) {
    const id = row.invoice_id as string;
    const day = row.attempted_on as string;
    const current = history.latest.get(id);

    if (!current || day > current) history.latest.set(id, day);
    if (row.succeeded === true) history.succeeded.add(id);
  }

  return history;
}

export type ScheduledChargeResult = {
  customersOnASchedule: number;
  invoicesConsidered: number;
  charged: number;
  failed: number;
  errors: string[];
};

export async function chargeDueScheduledInvoices(): Promise<ScheduledChargeResult> {
  const result: ScheduledChargeResult = {
    customersOnASchedule: 0,
    invoicesConsidered: 0,
    charged: 0,
    failed: 0,
    errors: [],
  };

  const today = toPhoenixDateString(new Date().toISOString());

  if (!today) {
    result.errors.push("Couldn't determine today's date in Phoenix time.");
    return result;
  }

  const schedules = await loadEnrolledSchedules();

  // Charge-on-invoice customers are handled at invoice creation; this
  // cron is only for the ones on a held schedule.
  const scheduledClientIds = Array.from(schedules.entries())
    .filter(([, schedule]) => schedule.timing !== "on_invoice")
    .map(([clientId]) => clientId);

  result.customersOnASchedule = scheduledClientIds.length;

  if (scheduledClientIds.length === 0) return result;

  const invoices = await getOpenInvoicesForClients(scheduledClientIds);
  const history = await loadAttemptHistory(invoices.map((invoice) => invoice.id));

  for (const invoice of invoices) {
    const schedule = schedules.get(invoice.jobberClientId as string);

    if (!schedule || history.succeeded.has(invoice.id)) continue;

    const chargeDate = autopayChargeDate(autopayReferenceDate(invoice), schedule);

    if (chargeDate > today) continue;

    result.invoicesConsidered += 1;

    const lastAttempt = history.latest.get(invoice.id);

    // Already attempted on or after its charge date -- one automatic
    // try per invoice (see the header comment).
    if (lastAttempt && lastAttempt >= chargeDate) continue;

    const charge = await chargeInvoiceAndSendReceipt(invoice, "scheduled");

    if (charge.charged) {
      result.charged += 1;
    } else {
      result.failed += 1;
      result.errors.push(
        `${invoice.customerName ?? "Customer"} -- invoice ${invoice.invoiceNumber}: ${charge.reason}`
      );

      // Not retried automatically (see the header comment), so say so
      // now rather than only in tomorrow's digest. Admins only;
      // sendPush never throws.
      await sendPush("autopay_failed", {
        title: `Autopay failed: ${invoice.customerName ?? "Customer"}`,
        body: `Invoice ${invoice.invoiceNumber} ($${invoice.total.toFixed(2)}): ${charge.reason}`.slice(0, 180),
        url: invoice.jobberClientId
          ? `/customers/${encodeURIComponent(invoice.jobberClientId)}`
          : "/invoices",
        // The badge always means "unread messages" -- pass the real
        // count so this push doesn't reset it.
        badgeCount: await getUnreadMessageCount().catch(() => 0),
      });
    }
  }

  return result;
}

// A card was just saved for this customer. Charge whatever is already
// due under their schedule (for a brand-new enrollment that's the
// default "as soon as invoiced", i.e. every open invoice). A card
// that was declined earlier today IS retried here -- a customer
// replacing a bad card is the main reason this runs for an existing
// enrollment -- while an invoice that already has a successful charge
// is never touched, and Stripe delivering the same webhook twice is
// absorbed by the idempotency key in lib/autopay.ts.
export async function chargeOpenInvoicesAfterEnrollment(
  jobberClientId: string
): Promise<{ charged: number; failed: number }> {
  const outcome = { charged: 0, failed: 0 };
  const today = toPhoenixDateString(new Date().toISOString());

  if (!today) return outcome;

  const schedules = await loadEnrolledSchedules([jobberClientId]);
  const schedule = schedules.get(jobberClientId);

  if (!schedule) return outcome;

  const invoices = await getOpenInvoicesForClients([jobberClientId]);
  const history = await loadAttemptHistory(invoices.map((invoice) => invoice.id));

  for (const invoice of invoices) {
    if (autopayChargeDate(autopayReferenceDate(invoice), schedule) > today) continue;
    if (history.succeeded.has(invoice.id)) continue;

    const charge = await chargeInvoiceAndSendReceipt(invoice, "enrollment");

    if (charge.charged) outcome.charged += 1;
    else outcome.failed += 1;
  }

  return outcome;
}

// Of these native invoice ids, which belong to a customer who is on a
// held autopay schedule and hasn't had a charge attempted yet? Those
// are "waiting for their charge day", not overdue-and-ignoring-us, so
// lib/invoiceReminders.ts skips them. As soon as an attempt exists
// (success or failure) the invoice stops being excused: a success marks
// it paid, a failure hands it back to the normal reminders.
export async function findInvoicesAwaitingScheduledCharge(
  invoices: { invoiceId: string; jobberClientId: string | null }[]
): Promise<Set<string>> {
  const awaiting = new Set<string>();
  const clientIds = Array.from(
    new Set(invoices.map((i) => i.jobberClientId).filter((id): id is string => Boolean(id)))
  );

  if (clientIds.length === 0) return awaiting;

  const schedules = await loadEnrolledSchedules(clientIds);
  const candidates = invoices.filter((invoice) => {
    const schedule = invoice.jobberClientId ? schedules.get(invoice.jobberClientId) : null;
    return schedule && schedule.timing !== "on_invoice";
  });

  if (candidates.length === 0) return awaiting;

  const history = await loadAttemptHistory(candidates.map((c) => c.invoiceId));

  for (const candidate of candidates) {
    if (!history.latest.has(candidate.invoiceId)) awaiting.add(candidate.invoiceId);
  }

  return awaiting;
}

// Autopay charges that failed since `sinceIso`, for the daily digest.
export async function listRecentFailedAutopayCharges(
  sinceIso: string
): Promise<{ invoiceNumber: string; customerName: string | null; error: string | null }[]> {
  const { data, error } = await supabaseServer
    .from("autopay_charge_attempts")
    .select("invoice_id, error, created_at")
    .eq("succeeded", false)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data || data.length === 0) return [];

  const ids = Array.from(new Set(data.map((row) => row.invoice_id as string)));

  const { data: invoiceRows } = await supabaseServer
    .from("invoices")
    .select("id, invoice_number, customer_name, status")
    .in("id", ids);

  const byId = new Map((invoiceRows ?? []).map((row) => [row.id as string, row]));
  const seen = new Set<string>();
  const failures: { invoiceNumber: string; customerName: string | null; error: string | null }[] = [];

  for (const row of data) {
    const id = row.invoice_id as string;
    const invoice = byId.get(id);

    // One line per invoice, and nothing for one that has since been paid.
    if (!invoice || seen.has(id) || invoice.status === "paid") continue;
    seen.add(id);

    failures.push({
      invoiceNumber: invoice.invoice_number as string,
      customerName: (invoice.customer_name as string | null) ?? null,
      error: (row.error as string | null) ?? null,
    });
  }

  return failures;
}

