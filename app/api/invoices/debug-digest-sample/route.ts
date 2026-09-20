// One-time diagnostic (2026-09-20), follow-up to debug-unpaid-native and
// debug-paid-verification. Those two confirmed the status logic itself is
// completely correct -- both of Ryan's 2 genuinely-unpaid native invoices
// (Patrick Durkin, Elise Ludeman) are being counted as unpaid by
// countUnpaidInvoices() in lib/dailyDigest.ts. So the "count"/"totalAmount"
// the digest emails have been sending were already right.
//
// What's left to check: lib/dailyDigest.ts's SAMPLE_LIMIT is 8, and the
// unpaid-invoices section sorts oldest due_date first before slicing to
// that sample for display -- only the sample lines actually get printed in
// the email body (with a "+N more" line for the rest). If Ryan has 8 or
// more real-Jobber unpaid invoices with due dates earlier than a native
// invoice's, that native invoice is correctly counted in the total but
// never actually appears as a line in the email -- which would look
// identical to "not showing up" even though nothing is broken.
//
// This exactly reproduces countUnpaidInvoices()'s query/filter/sort and
// reports, per invoice, whether it landed in the visible 8-line sample or
// got folded into "+N more" -- so we can see directly whether that's what
// happened to Ryan's native invoices, instead of guessing further.
//
// Read-only, admin-gated, manual-trigger only.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SAMPLE_LIMIT = 8;

function isUnpaidInvoiceStatus(status: string | null): boolean {
  if (!status) return false;
  const upper = status.toUpperCase();
  return !upper.includes("PAID") && !upper.includes("VOID") && upper !== "DRAFT";
}

type Row = {
  jobber_invoice_id: string;
  customer_name: string | null;
  invoice_number: string | null;
  status: string | null;
  total: number | string | null;
  due_date: string | null;
};

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { data, error } = await supabaseServer
    .from("jobber_invoices")
    .select("jobber_invoice_id, customer_name, invoice_number, status, total, due_date")
    .not("jobber_client_id", "is", null);

  if (error) {
    return NextResponse.json(
      { success: false, error: `Couldn't read jobber_invoices: ${error.message}` },
      { status: 500 }
    );
  }

  const invoices = ((data ?? []) as Row[]).filter((invoice) =>
    isUnpaidInvoiceStatus(invoice.status)
  );

  invoices.sort((a, b) => {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  });

  const report = invoices.map((invoice, index) => ({
    position: index + 1,
    inEmailSample: index < SAMPLE_LIMIT,
    isNative: invoice.jobber_invoice_id.startsWith("native-"),
    customerName: invoice.customer_name,
    invoiceNumber: invoice.invoice_number,
    status: invoice.status,
    total: invoice.total,
    dueDate: invoice.due_date,
  }));

  const nativeRows = report.filter((r) => r.isNative);

  return NextResponse.json({
    success: true,
    totalUnpaidCount: report.length,
    sampleLimit: SAMPLE_LIMIT,
    nativeUnpaidTotal: nativeRows.length,
    nativeUnpaidShownInEmailSample: nativeRows.filter((r) => r.inEmailSample).length,
    nativeUnpaidHiddenInPlusMore: nativeRows.filter((r) => !r.inEmailSample).length,
    nativeRows,
    fullSortedList: report,
  });
}
