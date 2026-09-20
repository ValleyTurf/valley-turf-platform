// One-time diagnostic (2026-09-20) for native unpaid invoices missing from
// the daily digest's "Unpaid invoices" section (lib/dailyDigest.ts's
// countUnpaidInvoices/isUnpaidInvoiceStatus). Read-only, admin-gated,
// manual-trigger only -- not wired into any cron path.
//
// Two backfill attempts (resendInvoice's status fix, and
// fix-stuck-draft-status) haven't resolved Ryan's real-world symptom, and
// the stuck-draft-via-resend theory came back empty against real data (no
// matching audit_log rows at all, even after fixing the diff-shape bug in
// that route) -- so rather than guess at a third theory from code alone,
// this pulls every native-mirrored jobber_invoices row directly and
// reports, for each one, exactly why countUnpaidInvoices() would or
// wouldn't count it as unpaid.
//
// countUnpaidInvoices() actually runs two checks before counting a row:
//   1. .not("jobber_client_id", "is", null) -- excluded entirely if null
//   2. isUnpaidInvoiceStatus(status) -- excluded if status contains "PAID"
//      or "VOID", or is exactly "DRAFT" (case-insensitive)
// This route re-runs exactly that logic against every native-mirrored row
// (jobber_invoice_id starting with "native-") and reports which check (if
// any) is excluding it, so the real cause shows up in the data instead of
// being guessed at again.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isUnpaidInvoiceStatus(status: string | null): boolean {
  if (!status) return false;
  const upper = status.toUpperCase();
  return !upper.includes("PAID") && !upper.includes("VOID") && upper !== "DRAFT";
}

type Row = {
  jobber_invoice_id: string;
  jobber_client_id: string | null;
  customer_name: string | null;
  invoice_number: string | null;
  status: string | null;
  total: number | null;
  due_date: string | null;
  updated_at: string | null;
};

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { data, error } = await supabaseServer
    .from("jobber_invoices")
    .select(
      "jobber_invoice_id, jobber_client_id, customer_name, invoice_number, status, total, due_date, updated_at"
    )
    .like("jobber_invoice_id", "native-%")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { success: false, error: `Couldn't read jobber_invoices: ${error.message}` },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as Row[];

  const report = rows.map((row) => {
    const hasClientId = row.jobber_client_id !== null && row.jobber_client_id !== undefined;
    const statusUnpaid = isUnpaidInvoiceStatus(row.status);

    let excludedBecause: string | null = null;
    if (!hasClientId) excludedBecause = "jobber_client_id is null";
    else if (!statusUnpaid) excludedBecause = `status "${row.status}" doesn't count as unpaid`;

    return {
      jobberInvoiceId: row.jobber_invoice_id,
      customerName: row.customer_name,
      invoiceNumber: row.invoice_number,
      status: row.status,
      jobberClientId: row.jobber_client_id,
      total: row.total,
      dueDate: row.due_date,
      updatedAt: row.updated_at,
      countedAsUnpaidByDigest: hasClientId && statusUnpaid,
      excludedBecause,
    };
  });

  const counted = report.filter((r) => r.countedAsUnpaidByDigest);
  const excludedForNullClientId = report.filter(
    (r) => r.excludedBecause === "jobber_client_id is null"
  );
  const excludedForStatus = report.filter((r) => r.excludedBecause?.startsWith("status "));

  return NextResponse.json({
    success: true,
    totalNativeInvoices: report.length,
    countedAsUnpaidByDigest: counted.length,
    excludedForNullClientId: excludedForNullClientId.length,
    excludedForStatus: excludedForStatus.length,
    rows: report,
  });
}
