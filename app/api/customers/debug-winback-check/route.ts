// One-time diagnostic (2026-09-20). Ryan: Debbie Edwards shows "Cleaning
// Scheduled" on /reactivation with a real invoice dated Sep 19, 2026 (0
// days since last service) and 1 contact attempt recorded, but the
// page's "Win-Back, Confirmed" stat still reads 0%. hasWonBackSince
// (lib/reactivation.ts) is supposed to count her: it checks whether any
// of her invoice_financials rows have issue_date strictly after her
// customers.reactivation_last_contacted_at.
//
// Two different things could explain 0% and they need different fixes:
// (1) reactivation_last_contacted_at is actually null despite 1 attempt
// showing -- contactAttempts and lastContactedAt are supposed to move
// together (nextReactivationState in lib/reactivation.ts bumps both in
// the same call), but if hers came from a source that predates that
// pairing, the count could be right while the timestamp is missing,
// which hasWonBackSince treats as "never contacted" and returns false
// unconditionally; or (2) the timestamp IS set, but issue_date (a plain
// DATE column, parsed as UTC midnight) and reactivation_last_contacted_at
// (a full timestamp) land on the same calendar day in a way that makes
// the invoice appear to be BEFORE the contact once time-of-day is
// factored in, even though they're the same day in Phoenix time. This
// pulls Debbie's actual rows and evaluates hasWonBackSince against them
// directly to tell those two apart, rather than guessing.
//
// Read-only, admin-gated, manual-trigger only.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { hasWonBackSince } from "@/lib/reactivation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const nameQuery = request.nextUrl.searchParams.get("name") ?? "Edwards";

  const { data: customers, error: customerError } = await supabaseServer
    .from("customers")
    .select(
      "id, jobber_client_id, first_name, last_name, reactivation_status, reactivation_last_contacted_at, reactivation_contact_attempts, reactivation_next_follow_up_at"
    )
    .ilike("last_name", `%${nameQuery}%`);

  if (customerError) {
    return NextResponse.json(
      { success: false, error: `Couldn't read customers: ${customerError.message}` },
      { status: 500 }
    );
  }

  const results = [];

  for (const customer of customers ?? []) {
    const { data: invoiceRows, error: invoiceError } = await supabaseServer
      .from("invoice_financials")
      .select("jobber_invoice_id, issue_date, invoice_total, status")
      .eq("jobber_client_id", customer.jobber_client_id)
      .order("issue_date", { ascending: true });

    if (invoiceError) {
      results.push({
        name: `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim(),
        error: invoiceError.message,
      });
      continue;
    }

    const invoiceDates = (invoiceRows ?? []).map((r) => r.issue_date as string | null);
    const wonBack = hasWonBackSince(customer.reactivation_last_contacted_at, invoiceDates);

    results.push({
      name: `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim(),
      jobberClientId: customer.jobber_client_id,
      reactivationStatus: customer.reactivation_status,
      reactivationLastContactedAt: customer.reactivation_last_contacted_at,
      reactivationContactAttempts: customer.reactivation_contact_attempts,
      reactivationNextFollowUpAt: customer.reactivation_next_follow_up_at,
      invoices: invoiceRows,
      computedWonBack: wonBack,
    });
  }

  return NextResponse.json({ success: true, nameQueried: nameQuery, results });
}
