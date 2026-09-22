// Manual-trigger only, one-time (but safely rerunnable) cleanup for the
// bug fixed alongside this route in app/(platform)/quotes/actions.ts's
// createQuote: a quote created for a lead never looked up that lead's
// already-linked jobber_client_id, so it sat with customer_id: null
// forever, invisible in Past Quotes on the customer's page even when
// the customer record existed the whole time (e.g. a Website Form lead,
// which gets a native customer created for it at intake -- see
// request-quote/actions.ts's createNativeCustomer call). createQuote is
// fixed going forward; this is only for quotes created before that fix
// shipped.
//
// GET (no query params): read-only. Lists what would change. Review this
// first.
// GET ?apply=true: sets customer_id on each affected quote.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type StuckQuote = {
  id: string;
  quoteNumber: number | string | null;
  recipientName: string | null;
  leadId: string;
  resolvedCustomerId: string;
};

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const apply = request.nextUrl.searchParams.get("apply") === "true";

  const { data: quoteRows, error: quotesError } = await supabaseServer
    .from("quotes")
    .select("id, quote_number, recipient_name, lead_id")
    .is("customer_id", null)
    .not("lead_id", "is", null);

  if (quotesError) {
    return NextResponse.json(
      { success: false, error: `Couldn't read quotes: ${quotesError.message}` },
      { status: 500 }
    );
  }

  const candidates = quoteRows ?? [];

  if (candidates.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No lead-based quotes with a missing customer_id found.",
      stuckCount: 0,
      stuck: [],
    });
  }

  const leadIds = Array.from(new Set(candidates.map((row) => row.lead_id as string)));

  const { data: leadRows, error: leadsError } = await supabaseServer
    .from("leads")
    .select("id, jobber_client_id")
    .in("id", leadIds)
    .not("jobber_client_id", "is", null);

  if (leadsError) {
    return NextResponse.json(
      { success: false, error: `Couldn't read leads: ${leadsError.message}` },
      { status: 500 }
    );
  }

  const clientIdByLeadId = new Map<string, string>();
  for (const row of leadRows ?? []) {
    clientIdByLeadId.set(row.id as string, row.jobber_client_id as string);
  }

  const stuck: StuckQuote[] = candidates
    .filter((row) => clientIdByLeadId.has(row.lead_id as string))
    .map((row) => ({
      id: row.id as string,
      quoteNumber: row.quote_number as number | string | null,
      recipientName: row.recipient_name as string | null,
      leadId: row.lead_id as string,
      resolvedCustomerId: clientIdByLeadId.get(row.lead_id as string) as string,
    }));

  if (stuck.length === 0) {
    return NextResponse.json({
      success: true,
      message:
        "Found lead-based quotes with no customer_id, but none of their leads are linked to a customer yet -- nothing to fix.",
      stuckCount: 0,
      stuck: [],
    });
  }

  if (!apply) {
    return NextResponse.json({
      success: true,
      message: `Found ${stuck.length} quote(s) whose lead already has a linked customer, but the quote's customer_id was never set. Re-run with ?apply=true to fix them.`,
      stuckCount: stuck.length,
      stuck,
    });
  }

  let fixed = 0;
  const errors: { id: string; message: string }[] = [];

  for (const quote of stuck) {
    const { error: updateError } = await supabaseServer
      .from("quotes")
      .update({ customer_id: quote.resolvedCustomerId })
      .eq("id", quote.id);

    if (updateError) {
      errors.push({ id: quote.id, message: updateError.message });
      continue;
    }

    fixed += 1;
  }

  return NextResponse.json({
    success: true,
    message: `Fixed ${fixed} of ${stuck.length} quote(s). They'll now show up in Past Quotes on their customer's page.`,
    stuckCount: stuck.length,
    fixed,
    errors,
  });
}
