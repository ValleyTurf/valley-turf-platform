// Overdue invoice payment reminders (Ryan's request) -- sent by
// app/api/invoices/send-overdue-reminders' daily cron, which just calls
// sendDueInvoiceReminders() below. Same "rules table + dedup-sent table"
// shape as lib/visitReminders.ts, just anchored on an invoice's due_date
// instead of a visit's start_at. See migration
// 063_add_invoice_reminders_and_quote_followups.sql for the schema
// (invoice_reminder_rules -- editable from Settings -- and
// invoice_reminders_sent for per-invoice, per-rule dedup).
//
// Ryan (2026-09-20): originally 3 and 10 days overdue, each firing once.
// Now two phases:
//   1. The fixed-day rules in invoice_reminder_rules (new default: 2, 5,
//      7 days overdue) -- each still fires on the ONE calendar day an
//      invoice's due_date lands that many days back, exactly as before.
//   2. A daily tail: once an invoice is more overdue than the largest
//      enabled fixed-day rule, it gets reminded again every single day
//      until it's paid (see sendDueInvoiceReminders' Phase 2 comment for
//      how that reuses the same dedup table with no schema change).
//
// Covers BOTH native and Jobber-synced invoices via the existing
// jobber_invoices mirror table (the same one Invoiced History/Revenue/
// Transactions/Job Costing Analytics already read) -- due_date, status,
// and total all live there regardless of which invoicing path created
// the invoice. The two paths only diverge when building the payment
// link: a native invoice (jobber_invoice_id = "native-<uuid>") gets this
// app's own /pay/[publicToken] page; a real Jobber invoice gets its
// jobber_web_uri (Jobber's own hosted invoice page) since we have no
// payment page of our own for those.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { toPhoenixDateString } from "@/lib/phoenixDate";
import { sendOverdueInvoiceSms, sendOverdueInvoiceEmail } from "@/lib/notifications";
import { getNotificationRecipients } from "@/lib/customerContacts";
import { getBaseUrl } from "@/lib/baseUrl";

const NATIVE_PREFIX = "native-";

// Matches Supabase/PostgREST's default response max-rows cap (confirmed
// 2026-09-20 against this same jobber_invoices table via a one-off
// diagnostic -- see lib/dailyDigest.ts's countUnpaidInvoices for the full
// story). The fixed-day rules below query by an exact due_date match, so
// they're never at risk of a result set anywhere near this size, but
// Phase 2's daily tail queries "every invoice overdue by more than N
// days" with no upper bound, so it gets the same paginate-in-chunks
// treatment to stay correct as that result set grows.
const JOBBER_INVOICES_PAGE_SIZE = 1000;

type ReminderRule = {
  id: string;
  days_after: number;
};

type ReminderInvoice = {
  jobber_invoice_id: string;
  jobber_client_id: string | null;
  customer_name: string | null;
  invoice_number: string | null;
  status: string | null;
  total: number | null;
  due_date: string | null;
  jobber_web_uri: string | null;
};

type ReminderCustomer = {
  jobber_client_id: string;
  phone: string | null;
  email: string | null;
};

export type SendInvoiceRemindersResult = {
  rulesProcessed: number;
  invoicesConsidered: number;
  remindersSent: number;
  errors: string[];
};

function addDaysToPhoenixDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

// How many whole days after `earlier` (YYYY-MM-DD) `later` falls -- used
// by Phase 2 to work out each overdue invoice's OWN days-overdue count
// today, since unlike the fixed-day rules that number is different for
// every invoice and changes every day.
function daysBetweenPhoenixDates(earlier: string, later: string): number {
  const [ey, em, ed] = earlier.split("-").map(Number);
  const [ly, lm, ld] = later.split("-").map(Number);
  const earlierMs = Date.UTC(ey, em - 1, ed);
  const laterMs = Date.UTC(ly, lm - 1, ld);
  return Math.round((laterMs - earlierMs) / 86400000);
}

function formatDueDateLabel(dueDate: string | null): string {
  if (!dueDate) return "your due date";

  const [year, month, day] = dueDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(date.getTime())) return "your due date";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

// A small, deliberately permissive allowlist rather than an exhaustive
// enum match -- native invoices use lowercase "draft"/"sent"/"paid"
// (lib/payments.ts's mirrorNativeInvoiceInJobberTables), Jobber-synced
// ones carry Jobber's own uppercase invoiceStatus verbatim (sync-invoices'
// route). Catches both casings of paid/void/draft; anything else (sent,
// awaiting payment, past due, etc.) is fair game for a reminder.
function isUnpaidAndSendable(status: string | null): boolean {
  if (!status) return false;
  const upper = status.toUpperCase();
  return !upper.includes("PAID") && !upper.includes("VOID") && upper !== "DRAFT";
}

type PendingReminder = {
  invoice: ReminderInvoice;
  daysAfter: number;
};

// Shared send pipeline for both phases below. Each pending reminder
// carries its own `daysAfter` (a constant per call for Phase 1's fixed
// rules, a different number per invoice for Phase 2's daily tail), so the
// already-sent check can't filter by one shared days_after value the way
// Phase 1 alone used to -- it pulls every invoice_reminders_sent row for
// these invoice ids instead and matches (invoice, daysAfter) pairs in
// memory, which works identically for both phases.
async function processReminderBatch(
  pending: PendingReminder[],
  baseUrl: string,
  result: SendInvoiceRemindersResult,
  describeRule: (daysAfter: number) => string
): Promise<void> {
  if (pending.length === 0) return;

  const invoiceIds = Array.from(new Set(pending.map((p) => p.invoice.jobber_invoice_id)));

  const { data: alreadySentData, error: alreadySentError } = await supabaseServer
    .from("invoice_reminders_sent")
    .select("jobber_invoice_id, days_after")
    .in("jobber_invoice_id", invoiceIds);

  if (alreadySentError) {
    result.errors.push(`Couldn't check already-sent reminders: ${alreadySentError.message}`);
    return;
  }

  const alreadySent = new Set(
    (alreadySentData ?? []).map((row) => `${row.jobber_invoice_id}:${row.days_after}`)
  );

  const pendingToSend = pending.filter(
    (p) => !alreadySent.has(`${p.invoice.jobber_invoice_id}:${p.daysAfter}`)
  );

  if (pendingToSend.length === 0) return;

  const clientIds = Array.from(
    new Set(pendingToSend.map((p) => p.invoice.jobber_client_id).filter(Boolean))
  ) as string[];

  const { data: customersData, error: customersError } = await supabaseServer
    .from("customers")
    .select("jobber_client_id, phone, email")
    .in("jobber_client_id", clientIds.length > 0 ? clientIds : ["__none__"]);

  if (customersError) {
    result.errors.push(`Couldn't load customer contact info: ${customersError.message}`);
    return;
  }

  const customersById = new Map(
    ((customersData ?? []) as ReminderCustomer[]).map((c) => [c.jobber_client_id, c])
  );

  for (const { invoice, daysAfter } of pendingToSend) {
    const customer = invoice.jobber_client_id
      ? customersById.get(invoice.jobber_client_id)
      : null;

    const phone = customer?.phone?.trim() || null;
    const email = customer?.email?.trim() || null;

    if (!phone && !email) continue;

    // Resolve the payment link -- this app's own /pay/[token] for a
    // native invoice, Jobber's hosted invoice page otherwise. A real
    // Jobber invoice with no jobber_web_uri on file (shouldn't happen
    // post-sync, but the column is nullable) has nowhere to send a
    // customer, so it's skipped rather than sending a dead-end message.
    let payUrl: string | null = null;

    if (invoice.jobber_invoice_id.startsWith(NATIVE_PREFIX)) {
      const invoiceId = invoice.jobber_invoice_id.slice(NATIVE_PREFIX.length);
      const { data: nativeInvoice } = await supabaseServer
        .from("invoices")
        .select("public_token")
        .eq("id", invoiceId)
        .maybeSingle();

      if (nativeInvoice?.public_token) {
        payUrl = `${baseUrl}/pay/${nativeInvoice.public_token}`;
      }
    } else {
      payUrl = invoice.jobber_web_uri;
    }

    if (!payUrl) {
      result.errors.push(
        `No payment link available for invoice ${invoice.invoice_number ?? invoice.jobber_invoice_id}; skipped.`
      );
      continue;
    }

    // getNotificationRecipients dedupes by normalized phone/email now
    // (Ryan, 2026-09-20 -- Patrick Durkin was getting the same reminder
    // text twice because his number was on file in two different
    // formats), so each customer gets one text/email per number here
    // even if it's saved more than once.
    const recipients = invoice.jobber_client_id
      ? await getNotificationRecipients(invoice.jobber_client_id, email, phone)
      : { emails: email ? [email] : [], phones: phone ? [phone] : [] };

    const dueDateLabel = formatDueDateLabel(invoice.due_date);
    const total = invoice.total ?? 0;
    const invoiceNumber = invoice.invoice_number ?? "—";

    let delivered = false;

    for (const toEmail of recipients.emails) {
      const sent = await sendOverdueInvoiceEmail({
        toEmail,
        customerName: invoice.customer_name,
        invoiceNumber,
        total,
        dueDateLabel,
        payUrl,
        jobberClientId: invoice.jobber_client_id,
      });
      delivered = delivered || sent;
    }

    for (const toPhone of recipients.phones) {
      const sent = await sendOverdueInvoiceSms(
        toPhone,
        invoice.customer_name,
        invoiceNumber,
        total,
        dueDateLabel,
        payUrl,
        invoice.jobber_client_id
      );
      delivered = delivered || sent;
    }

    if (!delivered) {
      result.errors.push(
        `Reminder delivery failed for invoice ${invoiceNumber} (${describeRule(daysAfter)}).`
      );
      continue;
    }

    const { error: insertError } = await supabaseServer.from("invoice_reminders_sent").insert({
      jobber_invoice_id: invoice.jobber_invoice_id,
      days_after: daysAfter,
    });

    if (insertError) {
      result.errors.push(
        `Reminder sent but failed to record for invoice ${invoiceNumber}: ${insertError.message}`
      );
    }

    result.remindersSent += 1;
  }
}

export async function sendDueInvoiceReminders(): Promise<SendInvoiceRemindersResult> {
  const result: SendInvoiceRemindersResult = {
    rulesProcessed: 0,
    invoicesConsidered: 0,
    remindersSent: 0,
    errors: [],
  };

  const { data: rulesData, error: rulesError } = await supabaseServer
    .from("invoice_reminder_rules")
    .select("id, days_after")
    .eq("enabled", true);

  if (rulesError) {
    result.errors.push(`Couldn't load invoice reminder rules: ${rulesError.message}`);
    return result;
  }

  const rules = (rulesData ?? []) as ReminderRule[];
  const todayPhoenix = toPhoenixDateString(new Date().toISOString());

  if (!todayPhoenix) {
    result.errors.push("Couldn't determine today's date in Phoenix time.");
    return result;
  }

  const baseUrl = await getBaseUrl();

  // Phase 1: the fixed-day rules (Settings > Notifications), each firing
  // on the one exact calendar day an invoice's due_date lands that many
  // days back.
  for (const rule of rules) {
    result.rulesProcessed += 1;

    const targetDueDate = addDaysToPhoenixDate(todayPhoenix, -rule.days_after);

    const { data: invoicesData, error: invoicesError } = await supabaseServer
      .from("jobber_invoices")
      .select(
        "jobber_invoice_id, jobber_client_id, customer_name, invoice_number, status, total, due_date, jobber_web_uri"
      )
      .eq("due_date", targetDueDate)
      .not("jobber_client_id", "is", null);

    if (invoicesError) {
      result.errors.push(
        `Couldn't load invoices for the ${rule.days_after}-day-overdue rule: ${invoicesError.message}`
      );
      continue;
    }

    const invoices = ((invoicesData ?? []) as ReminderInvoice[]).filter((invoice) =>
      isUnpaidAndSendable(invoice.status)
    );
    result.invoicesConsidered += invoices.length;

    await processReminderBatch(
      invoices.map((invoice) => ({ invoice, daysAfter: rule.days_after })),
      baseUrl,
      result,
      (daysAfter) => `${daysAfter}-day-overdue rule`
    );
  }

  // Phase 2 (Ryan, 2026-09-20): once an invoice is more overdue than the
  // largest enabled fixed-day rule above, keep reminding once a day until
  // it's paid instead of going quiet. Anchored to whichever enabled
  // rule's days_after is largest -- currently 7 -- rather than a
  // hardcoded number, so it keeps working correctly if Settings >
  // Notifications ever changes those values.
  //
  // Each invoice's dedup key here is its OWN actual days-overdue count
  // today (8, 9, 10, ... -- different per invoice, and different every
  // day for the same invoice), so the same (jobber_invoice_id,
  // days_after) row shape invoice_reminders_sent already used for the
  // fixed rules works unchanged for "once per calendar day" too -- no
  // schema change needed, since a new day always means a new days_after
  // value to dedup against.
  const maxFixedRuleDays =
    rules.length > 0 ? Math.max(...rules.map((rule) => rule.days_after)) : null;

  if (maxFixedRuleDays !== null) {
    const tailCutoffDueDate = addDaysToPhoenixDate(todayPhoenix, -(maxFixedRuleDays + 1));

    const tailInvoices: ReminderInvoice[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabaseServer
        .from("jobber_invoices")
        .select(
          "jobber_invoice_id, jobber_client_id, customer_name, invoice_number, status, total, due_date, jobber_web_uri"
        )
        .lte("due_date", tailCutoffDueDate)
        .not("jobber_client_id", "is", null)
        .order("jobber_invoice_id", { ascending: true })
        .range(from, from + JOBBER_INVOICES_PAGE_SIZE - 1);

      if (error) {
        result.errors.push(`Couldn't load invoices for the daily overdue tail: ${error.message}`);
        break;
      }

      const page = (data ?? []) as ReminderInvoice[];
      tailInvoices.push(...page);

      if (page.length < JOBBER_INVOICES_PAGE_SIZE) break;
      from += JOBBER_INVOICES_PAGE_SIZE;
    }

    // Manual per-invoice overrides (Ryan, 2026-09-20 -- Elise Ludeman:
    // wants daily reminders starting now even though her invoice's real
    // due_date (2026-09-29) hasn't arrived yet, since it's already been
    // about a week). invoice_reminder_overrides (migration 081) lists
    // invoice ids that always join the daily tail regardless of
    // due_date, on top of whatever naturally qualifies above. Everything
    // past this point treats them identically to a naturally-overdue
    // invoice -- still gated on isUnpaidAndSendable, still dedup'd per
    // calendar day the same way (daysBetweenPhoenixDates can come out
    // negative for an invoice not technically due yet, e.g. Ludeman's
    // -9 today climbing toward 0 -- still a fine dedup key, since dedup
    // is scoped per invoice id anyway). An override just skips the
    // due_date gate; nothing else about how the reminder is built or
    // sent changes.
    const { data: overrideRows, error: overrideError } = await supabaseServer
      .from("invoice_reminder_overrides")
      .select("jobber_invoice_id");

    if (overrideError) {
      result.errors.push(`Couldn't load invoice reminder overrides: ${overrideError.message}`);
    }

    const naturalIds = new Set(tailInvoices.map((invoice) => invoice.jobber_invoice_id));
    const missingOverrideIds = (overrideRows ?? [])
      .map((row) => row.jobber_invoice_id as string)
      .filter((id) => !naturalIds.has(id));

    if (missingOverrideIds.length > 0) {
      const { data: overrideInvoiceRows, error: overrideInvoiceError } = await supabaseServer
        .from("jobber_invoices")
        .select(
          "jobber_invoice_id, jobber_client_id, customer_name, invoice_number, status, total, due_date, jobber_web_uri"
        )
        .in("jobber_invoice_id", missingOverrideIds);

      if (overrideInvoiceError) {
        result.errors.push(
          `Couldn't load override invoices for the daily tail: ${overrideInvoiceError.message}`
        );
      } else {
        tailInvoices.push(...((overrideInvoiceRows ?? []) as ReminderInvoice[]));
      }
    }

    const pendingTail: PendingReminder[] = tailInvoices
      .filter((invoice) => invoice.due_date && isUnpaidAndSendable(invoice.status))
      .map((invoice) => ({
        invoice,
        daysAfter: daysBetweenPhoenixDates(invoice.due_date as string, todayPhoenix),
      }));

    result.invoicesConsidered += pendingTail.length;

    await processReminderBatch(
      pendingTail,
      baseUrl,
      result,
      (daysAfter) => `${daysAfter}-day daily overdue tail`
    );
  }

  return result;
}
