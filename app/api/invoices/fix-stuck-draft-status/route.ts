// Manual-trigger only, one-time (but safely rerunnable) cleanup for a bug
// in resendInvoice (app/(platform)/invoices/actions.ts) fixed 2026-09-20:
// that action delivered a native invoice's email/SMS but never flipped its
// status off "draft" -- so any invoice originally saved as a draft and
// only ever delivered via the Resend button (Ryan's Debbie Edwards case,
// see markInvoicePaidManually's comment, is exactly this pattern) stayed
// "draft" forever in both the invoices table and the jobber_invoices
// mirror. A still-"draft" invoice is deliberately excluded from "unpaid"
// everywhere that reads status directly (lib/dailyDigest.ts's
// isUnpaidInvoiceStatus, chiefly) -- so these invoices were actually sent
// and actually unpaid, but invisible to the daily digest and anywhere
// else that trusts status. resendInvoice itself is already fixed going
// forward; this is only for invoices that got stuck before that fix
// shipped.
//
// There's no column recording "this invoice was resent" -- the only
// record of it is an audit_log row (entity_type "invoice", action
// "update") written each time resendInvoice completed. So: pull every
// such audit row, keep the invoice ids, and check which of those
// invoices are STILL sitting at status "draft" today -- those are the
// confirmed stuck ones (a genuinely-never-sent draft never got a resend
// audit row in the first place, so it's correctly left alone).
//
// recordAuditLog (lib/auditLog.ts) ran this through diffRecords(before,
// after) with before omitted -- diffRecords (lib/auditDiff.ts) always
// emits { before, after } pairs per changed field, never a bare value,
// so a resend row's changes column is { resent: { before: null, after:
// true } }, not { resent: true }. Checked against .after below, not the
// field itself.
//
// GET (no query params): read-only. Lists what would change. Review this
// first.
// GET ?apply=true: flips each stuck invoice's status to "sent" (with
// sent_at backfilled to when it was actually resent) in both the
// invoices table and its jobber_invoices mirror row.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AuditRow = {
  entity_id: string | null;
  created_at: string;
  changes: { resent?: { before: unknown; after: unknown } } | null;
};

type StuckInvoice = {
  id: string;
  invoiceNumber: string | null;
  customerName: string | null;
  resentAt: string;
};

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const apply = request.nextUrl.searchParams.get("apply") === "true";

  const { data: auditRows, error: auditError } = await supabaseServer
    .from("audit_log")
    .select("entity_id, created_at, changes")
    .eq("entity_type", "invoice")
    .eq("action", "update")
    .order("created_at", { ascending: true });

  if (auditError) {
    return NextResponse.json(
      { success: false, error: `Couldn't read audit_log: ${auditError.message}` },
      { status: 500 }
    );
  }

  // Earliest resend per invoice id -- if it was resent more than once
  // while stuck, the first resend is the actual date it was delivered.
  const firstResendAtByInvoiceId = new Map<string, string>();

  for (const row of (auditRows ?? []) as AuditRow[]) {
    if (!row.entity_id) continue;
    if (row.changes?.resent?.after !== true) continue;
    if (!firstResendAtByInvoiceId.has(row.entity_id)) {
      firstResendAtByInvoiceId.set(row.entity_id, row.created_at);
    }
  }

  const resentInvoiceIds = Array.from(firstResendAtByInvoiceId.keys());

  if (resentInvoiceIds.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No resend history found -- nothing to check.",
      stuckCount: 0,
      stuck: [],
    });
  }

  const { data: invoiceRows, error: invoiceError } = await supabaseServer
    .from("invoices")
    .select("id, invoice_number, customer_name, status")
    .in("id", resentInvoiceIds)
    .eq("status", "draft");

  if (invoiceError) {
    return NextResponse.json(
      { success: false, error: `Couldn't read invoices: ${invoiceError.message}` },
      { status: 500 }
    );
  }

  const stuck: StuckInvoice[] = (invoiceRows ?? []).map((row) => ({
    id: row.id as string,
    invoiceNumber: row.invoice_number as string | null,
    customerName: row.customer_name as string | null,
    resentAt: firstResendAtByInvoiceId.get(row.id as string) as string,
  }));

  if (stuck.length === 0) {
    return NextResponse.json({
      success: true,
      message: "Nothing stuck -- every resent invoice already shows the right status.",
      stuckCount: 0,
      stuck: [],
    });
  }

  if (!apply) {
    return NextResponse.json({
      success: true,
      message: `Found ${stuck.length} invoice(s) delivered via Resend but still showing "draft" -- these have been invisible to the unpaid-invoices digest. Re-run with ?apply=true to fix them.`,
      stuckCount: stuck.length,
      stuck,
    });
  }

  let fixed = 0;
  const errors: { id: string; message: string }[] = [];

  for (const invoice of stuck) {
    const { error: invoiceUpdateError } = await supabaseServer
      .from("invoices")
      .update({ status: "sent", sent_at: invoice.resentAt })
      .eq("id", invoice.id);

    if (invoiceUpdateError) {
      errors.push({ id: invoice.id, message: invoiceUpdateError.message });
      continue;
    }

    const { error: mirrorUpdateError } = await supabaseServer
      .from("jobber_invoices")
      .update({ status: "sent", updated_at: new Date().toISOString() })
      .eq("jobber_invoice_id", `native-${invoice.id}`);

    if (mirrorUpdateError) {
      errors.push({ id: invoice.id, message: mirrorUpdateError.message });
      continue;
    }

    fixed += 1;
  }

  return NextResponse.json({
    success: true,
    message: `Fixed ${fixed} of ${stuck.length} stuck invoice(s). They'll show up as unpaid in tomorrow's digest (or the next manual run) if they still are.`,
    stuckCount: stuck.length,
    fixed,
    errors,
  });
}
