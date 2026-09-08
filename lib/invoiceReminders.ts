// Overdue invoice payment reminders (Ryan's request) -- sent by
// app/api/invoices/send-overdue-reminders' daily cron, which just calls
// sendDueInvoiceReminders() below. Same "rules table + dedup-sent table"
// shape as lib/visitReminders.ts, just anchored on an invoice's due_date
// instead of a visit's start_at. See migration
// 063_add_invoice_reminders_and_quote_followups.sql for the schema
// (invoice_reminder_rules -- Ryan's default: 3 and 10 days overdue, both
// editable from Settings -- and invoice_reminders_sent for per-invoice,
// per-rule dedup).
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

  for (const rule of rules) {
    result.rulesProcessed += 1;

    // The due_date that, exactly `days_after` days later, lands on today.
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

    if (invoices.length === 0) continue;

    const invoiceIds = invoices.map((invoice) => invoice.jobber_invoice_id);
    const { data: alreadySentData, error: alreadySentError } = await supabaseServer
      .from("invoice_reminders_sent")
      .select("jobber_invoice_id")
      .eq("days_after", rule.days_after)
      .in("jobber_invoice_id", invoiceIds);

    if (alreadySentError) {
      result.errors.push(
        `Couldn't check already-sent reminders for the ${rule.days_after}-day-overdue rule: ${alreadySentError.message}`
      );
      continue;
    }

    const alreadySent = new Set(
      (alreadySentData ?? []).map((row) => row.jobber_invoice_id as string)
    );
    const pendingInvoices = invoices.filter(
      (invoice) => !alreadySent.has(invoice.jobber_invoice_id)
    );

    if (pendingInvoices.length === 0) continue;

    const clientIds = Array.from(
      new Set(pendingInvoices.map((invoice) => invoice.jobber_client_id).filter(Boolean))
    ) as string[];

    const { data: customersData, error: customersError } = await supabaseServer
      .from("customers")
      .select("jobber_client_id, phone, email")
      .in("jobber_client_id", clientIds);

    if (customersError) {
      result.errors.push(
        `Couldn't load customer contact info for the ${rule.days_after}-day-overdue rule: ${customersError.message}`
      );
      continue;
    }

    const customersById = new Map(
      ((customersData ?? []) as ReminderCustomer[]).map((c) => [c.jobber_client_id, c])
    );

    for (const invoice of pendingInvoices) {
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
          `Reminder delivery failed for invoice ${invoiceNumber} (${rule.days_after}-day-overdue rule).`
        );
        continue;
      }

      const { error: insertError } = await supabaseServer
        .from("invoice_reminders_sent")
        .insert({
          jobber_invoice_id: invoice.jobber_invoice_id,
          days_after: rule.days_after,
        });

      if (insertError) {
        result.errors.push(
          `Reminder sent but failed to record for invoice ${invoiceNumber}: ${insertError.message}`
        );
      }

      result.remindersSent += 1;
    }
  }

  return result;
}
