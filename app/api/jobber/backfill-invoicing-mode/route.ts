// One-time (but safely rerunnable) bucketing pass for Stage 7 (the real
// /invoices cutover from Jobber to native). Walks every local customer
// that hasn't been evaluated yet, checks Jobber for a card on file
// (lib/invoicingMode.ts -- confirmed accurate against 6 real customers),
// and sets native_invoicing_enabled + invoicing_mode_source so the
// /invoices/routing review page has something to show Ryan.
//
// Deliberately does NOT touch how invoices actually get created yet --
// this only populates the list for review. Wiring native_invoicing_enabled
// into the real invoice-creation flow is a separate, later step.
//
// Rate-limit-aware but not fancy about it: processes customers
// sequentially (not in parallel) since this hits Jobber's API once per
// customer, and a throttled request just gets skipped and reported so a
// re-run picks it up (rows only get written on success, so a skipped
// row's invoicing_mode_source stays null and getCustomersNeedingInvoicingModeBackfill
// finds it again next time).
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import {
  checkClientHasCardOnFile,
  getCustomersNeedingInvoicingModeBackfill,
  setInvoicingMode,
} from "@/lib/invoicingMode";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const includeStaleAuto = request.nextUrl.searchParams.get("refresh") === "true";

  const customers = await getCustomersNeedingInvoicingModeBackfill(includeStaleAuto);

  if (customers.length === 0) {
    return NextResponse.json({
      success: true,
      message: "Every customer already has an invoicing mode set -- nothing to do. Pass ?refresh=true to re-check previously auto-set (not manual) rows.",
      customersChecked: 0,
      setToNative: 0,
      setToJobber: 0,
      noUpcomingJob: 0,
      skippedErrors: [],
    });
  }

  let setToNative = 0;
  let setToJobber = 0;
  let noUpcomingJob = 0;
  const skippedErrors: { jobberClientId: string; message: string }[] = [];

  for (const customer of customers) {
    const { hasCardOnFile, error } = await checkClientHasCardOnFile(customer.jobber_client_id);

    if (error) {
      skippedErrors.push({ jobberClientId: customer.jobber_client_id, message: error });
      continue;
    }

    // No upcoming job at all -- treat the same as "no card on file" per
    // Ryan's rule (nothing to auto-charge against), but count separately
    // so the review page can flag these as lower-confidence.
    const nativeEnabled = hasCardOnFile !== true;
    const source = hasCardOnFile === true ? "auto_has_card" : "auto_no_card";

    const { error: writeError } = await setInvoicingMode(
      customer.jobber_client_id,
      nativeEnabled,
      source
    );

    if (writeError) {
      skippedErrors.push({ jobberClientId: customer.jobber_client_id, message: writeError });
      continue;
    }

    if (hasCardOnFile === null) noUpcomingJob += 1;
    if (nativeEnabled) setToNative += 1;
    else setToJobber += 1;
  }

  return NextResponse.json({
    success: true,
    message: `Checked ${customers.length} customers -- ${setToNative} bucketed to native invoicing, ${setToJobber} staying on Jobber invoicing. Review at /invoices/routing before this drives anything live.`,
    customersChecked: customers.length,
    setToNative,
    setToJobber,
    noUpcomingJob,
    skippedErrors,
  });
}
