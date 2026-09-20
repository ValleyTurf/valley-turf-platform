// One-time diagnostic (2026-09-20) for Ryan's question: why don't Patrick
// Durkin's (INV-2026-0024, native-d4306165-...) or Elise Ludeman's
// (INV-2026-0021, native-bdb86ce4-...) accounts show any invoice reminders
// in their contact history?
//
// sendDueInvoiceReminders() (lib/invoiceReminders.ts) only fires a rule on
// the ONE calendar day where due_date + rule.days_after lands exactly on
// today -- not "any day the invoice is at least N days overdue and hasn't
// been reminded yet". So there are three completely different reasons an
// invoice could have zero reminders logged, and they need different
// responses:
//   1. The invoice isn't overdue enough yet for either rule's window to
//      have happened (e.g. Ludeman's due_date is still in the future) --
//      nothing wrong, just not due yet.
//   2. The rule's exact-day window came and went, but the customer has no
//      phone AND no email on file -- sendDueInvoiceReminders silently
//      `continue`s in that case with no error logged anywhere, so a
//      customer missing contact info looks identical to "nothing tried".
//   3. Something else failed on the exact day (delivery failure, a cron
//      outage that day, etc.) -- would show up as an errors entry if the
//      cron ran and hit a delivery problem, or as no evidence at all if
//      the cron didn't run.
//
// This checks all of it directly for a given jobber_invoice_id: the
// invoice's own due_date/status, the enabled reminder rules and which
// calendar date each rule's window fell/falls on for this invoice, the
// customer's phone/email on file, and any invoice_reminders_sent rows
// already recorded for it.
//
// Read-only, admin-gated, manual-trigger only.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function addDaysToPhoenixDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

// Default check covers the two invoices Ryan asked about; ?id= can target
// any other jobber_invoice_id (native-<uuid> or a real Jobber id).
const DEFAULT_INVOICE_IDS = [
  "native-d4306165-2c4c-4e13-9112-3067e19af16c", // Patrick Durkin, INV-2026-0024
  "native-bdb86ce4-f78f-4ad9-9592-99cfa3c964ae", // Elise Ludeman, INV-2026-0021
];

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const idParam = request.nextUrl.searchParams.get("id");
  const invoiceIds = idParam ? [idParam] : DEFAULT_INVOICE_IDS;

  const todayPhoenix = new Date().toISOString().slice(0, 10);

  const { data: rulesData, error: rulesError } = await supabaseServer
    .from("invoice_reminder_rules")
    .select("id, days_after, enabled");

  if (rulesError) {
    return NextResponse.json(
      { success: false, error: `Couldn't load invoice_reminder_rules: ${rulesError.message}` },
      { status: 500 }
    );
  }

  const { data: invoiceRows, error: invoiceError } = await supabaseServer
    .from("jobber_invoices")
    .select("jobber_invoice_id, jobber_client_id, customer_name, invoice_number, status, due_date")
    .in("jobber_invoice_id", invoiceIds);

  if (invoiceError) {
    return NextResponse.json(
      { success: false, error: `Couldn't load jobber_invoices: ${invoiceError.message}` },
      { status: 500 }
    );
  }

  const { data: sentRows, error: sentError } = await supabaseServer
    .from("invoice_reminders_sent")
    .select("jobber_invoice_id, days_after, sent_at")
    .in("jobber_invoice_id", invoiceIds);

  if (sentError) {
    return NextResponse.json(
      { success: false, error: `Couldn't load invoice_reminders_sent: ${sentError.message}` },
      { status: 500 }
    );
  }

  const clientIds = Array.from(
    new Set((invoiceRows ?? []).map((r) => r.jobber_client_id).filter(Boolean))
  ) as string[];

  const { data: customerRows, error: customerError } = await supabaseServer
    .from("customers")
    .select("jobber_client_id, phone, email")
    .in("jobber_client_id", clientIds.length > 0 ? clientIds : ["__none__"]);

  if (customerError) {
    return NextResponse.json(
      { success: false, error: `Couldn't load customers: ${customerError.message}` },
      { status: 500 }
    );
  }

  const customersById = new Map((customerRows ?? []).map((c) => [c.jobber_client_id, c]));
  const sentByInvoiceId = new Map<string, { days_after: number; sent_at: string }[]>();
  for (const row of sentRows ?? []) {
    const list = sentByInvoiceId.get(row.jobber_invoice_id as string) ?? [];
    list.push({ days_after: row.days_after as number, sent_at: row.sent_at as string });
    sentByInvoiceId.set(row.jobber_invoice_id as string, list);
  }

  const report = (invoiceRows ?? []).map((invoice) => {
    const customer = invoice.jobber_client_id ? customersById.get(invoice.jobber_client_id) : null;
    const hasPhone = !!customer?.phone?.trim();
    const hasEmail = !!customer?.email?.trim();

    const ruleWindows = (rulesData ?? []).map((rule) => {
      const windowDate = invoice.due_date
        ? addDaysToPhoenixDate(invoice.due_date as string, rule.days_after as number)
        : null;
      return {
        daysAfter: rule.days_after,
        enabled: rule.enabled,
        windowDate,
        windowAlreadyPassed: windowDate ? windowDate <= todayPhoenix : false,
        windowIsToday: windowDate === todayPhoenix,
        alreadySent: (sentByInvoiceId.get(invoice.jobber_invoice_id) ?? []).some(
          (s) => s.days_after === rule.days_after
        ),
      };
    });

    return {
      jobberInvoiceId: invoice.jobber_invoice_id,
      customerName: invoice.customer_name,
      invoiceNumber: invoice.invoice_number,
      status: invoice.status,
      dueDate: invoice.due_date,
      hasPhoneOnFile: hasPhone,
      hasEmailOnFile: hasEmail,
      wouldBeSilentlySkippedForNoContactInfo: !hasPhone && !hasEmail,
      ruleWindows,
      remindersActuallySent: sentByInvoiceId.get(invoice.jobber_invoice_id) ?? [],
    };
  });

  return NextResponse.json({ success: true, todayPhoenix, invoices: report });
}
