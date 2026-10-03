// Ryan (2026-10-03): "Can we delete invoice #INV-2026-0033, she paid on
// Jobber so I don't want to double count her."
//
// A hard delete would work but throws away the record entirely with no
// trail of why -- and this exact situation (a native invoice that's a
// duplicate of a Jobber-side invoice the customer actually paid) is
// precisely what the 'void' status on invoices (043_add_invoices.sql)
// exists for: isUnpaidInvoiceStatus (lib/dailyDigest.ts and the
// debug-unpaid-native route) already excludes anything with "VOID" in
// its status from outstanding/unpaid counting, same as a real Jobber
// invoice voided in Jobber itself. So voiding gets Ryan's actual goal
// (stop counting her twice) without destroying the row -- reversible if
// this was ever the wrong invoice, and still visible in the data if
// anyone goes looking later.
//
// Nothing in this codebase sets status to 'void' today (checked --
// every status === "void" check is a guard against acting on one, never
// a writer), so this is a new one-off action, not a reuse of something
// that already existed.
//
// GET with ?number=INV-2026-0033 -- dry run, shows the invoice, its
// payments row (if any), and the matching jobber_invoices rows for the
// same customer so the "she really did pay on Jobber" claim has
// evidence behind it before anything is touched.
// GET with the same ?number= and &apply=true -- sets status to 'void'.
// Refuses if the invoice already has a succeeded native `payments` row
// (a real Stripe/manual payment recorded here too) or is already paid/
// void, since either means voiding isn't the obviously-safe move and a
// human should look first.
//
// Read-only unless apply=true. Admin-gated, manual-trigger only.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAuditLog } from "@/lib/auditLog";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  let actor;

  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const invoiceNumber = request.nextUrl.searchParams.get("number");
  const apply = request.nextUrl.searchParams.get("apply") === "true";
  // Ryan (2026-10-03): "on the job cost analysis can we put the invoice
  // number as 1282 instead of the one we just deleted." Job Costing
  // Analytics (app/(platform)/job-costing-analytics/page.tsx) doesn't
  // filter by invoice status, so even voided, this job's row there would
  // still show the duplicate native invoice_number. Job Costing Analytics
  // reads invoice_number off the SAME jobber_invoices mirror row this
  // route already updates (jobber_invoice_id = "native-<id>") -- see
  // mirrorNativeInvoiceInJobberTables in lib/payments.ts -- so passing
  // the real Jobber invoice number here swaps that display over to the
  // invoice she actually paid, instead of leaving the now-void duplicate
  // number showing.
  const realInvoiceNumber = request.nextUrl.searchParams.get("realInvoiceNumber");

  if (!invoiceNumber) {
    return NextResponse.json(
      { error: "Pass ?number=INV-2026-0033" },
      { status: 400 }
    );
  }

  const { data: invoice, error: invoiceError } = await supabaseServer
    .from("invoices")
    .select(
      "id, invoice_number, customer_name, jobber_client_id, status, total, due_date, paid_at, created_at"
    )
    .eq("invoice_number", invoiceNumber)
    .maybeSingle();

  if (invoiceError) {
    return NextResponse.json(
      { error: invoiceError.message, step: "invoices" },
      { status: 500 }
    );
  }

  if (!invoice) {
    return NextResponse.json(
      { error: `No invoice found with number ${invoiceNumber}.` },
      { status: 404 }
    );
  }

  const { data: nativePayments, error: paymentsError } = await supabaseServer
    .from("payments")
    .select("id, stripe_payment_intent_id, amount, method, status, paid_at")
    .eq("invoice_id", invoice.id);

  if (paymentsError) {
    return NextResponse.json(
      { error: paymentsError.message, step: "payments" },
      { status: 500 }
    );
  }

  const { data: jobberInvoicesForCustomer, error: jobberInvoicesError } =
    invoice.jobber_client_id
      ? await supabaseServer
          .from("jobber_invoices")
          .select(
            "jobber_invoice_id, invoice_number, status, total, issue_date, updated_at, subject"
          )
          .eq("jobber_client_id", invoice.jobber_client_id)
          .not("jobber_invoice_id", "ilike", "native-%")
      : { data: [], error: null };

  if (jobberInvoicesError) {
    return NextResponse.json(
      { error: jobberInvoicesError.message, step: "jobber_invoices" },
      { status: 500 }
    );
  }

  const hasSucceededNativePayment = (nativePayments ?? []).some(
    (p) => p.status === "succeeded"
  );

  if (!apply) {
    return NextResponse.json({
      success: true,
      dryRun: true,
      invoice,
      nativePayments,
      jobberInvoicesForSameCustomer: jobberInvoicesForCustomer,
      wouldSetJobCostingInvoiceNumberTo: realInvoiceNumber ?? null,
      wouldVoid:
        invoice.status !== "paid" &&
        invoice.status !== "void" &&
        !hasSucceededNativePayment,
      blockedReason:
        invoice.status === "void"
          ? "Already void -- nothing to do."
          : invoice.status === "paid"
            ? "This native invoice is itself marked paid -- voiding would hide a payment that may be real. Check nativePayments before proceeding."
            : hasSucceededNativePayment
              ? "A succeeded payment exists against THIS invoice (not just the Jobber one) -- voiding would hide real money. Check nativePayments."
              : null,
    });
  }

  if (invoice.status === "void") {
    return NextResponse.json({
      success: true,
      applied: false,
      message: "Already void -- nothing to do.",
      invoice,
    });
  }

  if (invoice.status === "paid" || hasSucceededNativePayment) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Refusing to void: this invoice is marked paid natively and/or has a succeeded payments row. Resolve that first.",
        invoice,
        nativePayments,
      },
      { status: 409 }
    );
  }

  const { error: updateError } = await supabaseServer
    .from("invoices")
    .update({ status: "void", updated_at: new Date().toISOString() })
    .eq("id", invoice.id);

  if (updateError) {
    return NextResponse.json(
      { success: false, error: updateError.message, step: "update" },
      { status: 500 }
    );
  }

  // Mirror row (jobber_invoices.jobber_invoice_id = "native-<id>") feeds
  // the same outstanding/dashboard views the real Jobber-sourced rows
  // do -- voided without this, she'd still show up there even though
  // the native invoices table now says void.
  const mirrorInvoiceId = `native-${invoice.id}`;

  const { error: mirrorError } = await supabaseServer
    .from("jobber_invoices")
    .update({
      status: "void",
      updated_at: new Date().toISOString(),
      ...(realInvoiceNumber ? { invoice_number: realInvoiceNumber } : {}),
    })
    .eq("jobber_invoice_id", mirrorInvoiceId);

  if (mirrorError) {
    console.error(
      `Voided invoice ${invoice.id} but failed to update its jobber_invoices mirror:`,
      mirrorError.message
    );
  }

  if (actor) {
    await recordAuditLog({
      actor,
      action: "update",
      entityType: "invoice",
      entityId: invoice.id,
      entityLabel: `${invoice.customer_name ?? "Customer"} — Invoice ${invoice.invoice_number}`,
      before: { status: invoice.status },
      after: {
        status: "void",
        reason: "Duplicate of a Jobber invoice the customer already paid there.",
        ...(realInvoiceNumber
          ? { jobCostingInvoiceNumberSetTo: realInvoiceNumber }
          : {}),
      },
    });
  }

  return NextResponse.json({
    success: true,
    applied: true,
    invoice: { ...invoice, status: "void" },
    jobCostingInvoiceNumberSetTo: realInvoiceNumber ?? null,
    mirrorUpdateError: mirrorError?.message ?? null,
  });
}
