// One-time diagnostic (2026-09-20), follow-up to debug-reminder-status.
// That route confirmed Patrick Durkin's 3-day-overdue reminder for
// INV-2026-0024 WAS actually sent (invoice_reminders_sent has a row,
// sent 2026-09-19) -- his contact info was on file and delivery
// succeeded, since the reminder pipeline only inserts into
// invoice_reminders_sent after `delivered` comes back true. Both
// sendOverdueInvoiceEmail and sendOverdueInvoiceSms (lib/notifications.ts)
// call logContactHistory() right after a successful send, so a
// contact_history row should exist for this -- but Ryan says he doesn't
// see it on Durkin's Customer page.
//
// Two different things could explain that gap, and they need different
// fixes: (1) logContactHistory's insert actually failed (it's
// best-effort/non-throwing, so a DB error there is only ever logged to
// the server console, never surfaced anywhere Ryan would see it) -- in
// which case the row genuinely doesn't exist; or (2) the row exists fine,
// but something about how the Customer page reads/displays contact
// history is excluding it. This queries contact_history directly for
// Durkin's jobber_client_id to tell those two apart, rather than guessing.
//
// Read-only, admin-gated, manual-trigger only.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_CLIENT_ID = "Z2lkOi8vSm9iYmVyL0NsaWVudC8xMjA0MTc2MTU="; // Patrick Durkin

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const jobberClientId = request.nextUrl.searchParams.get("jobberClientId") ?? DEFAULT_CLIENT_ID;

  const { data: allHistoryRows, error: allHistoryError } = await supabaseServer
    .from("contact_history")
    .select(
      "id, channel, direction, subject, summary, related_type, related_id, resend_email_id, created_at"
    )
    .eq("jobber_client_id", jobberClientId)
    .order("created_at", { ascending: false });

  if (allHistoryError) {
    return NextResponse.json(
      { success: false, error: `Couldn't read contact_history: ${allHistoryError.message}` },
      { status: 500 }
    );
  }

  const { data: customerRow, error: customerError } = await supabaseServer
    .from("customers")
    .select("id, jobber_client_id, first_name, last_name, phone, email")
    .eq("jobber_client_id", jobberClientId)
    .maybeSingle();

  if (customerError) {
    return NextResponse.json(
      { success: false, error: `Couldn't read customers: ${customerError.message}` },
      { status: 500 }
    );
  }

  const rows = allHistoryRows ?? [];
  const invoiceReminderRows = rows.filter((r) => r.related_type === "invoice");

  return NextResponse.json({
    success: true,
    jobberClientIdQueried: jobberClientId,
    customerFound: !!customerRow,
    customerRecord: customerRow,
    totalContactHistoryRows: rows.length,
    invoiceRelatedRows: invoiceReminderRows.length,
    allRows: rows,
  });
}
