// One-time diagnostic (2026-09-20), follow-up to debug-digest-sample.
// That route re-ran countUnpaidInvoices()'s exact query twice (well, once
// then again a few minutes later) and got wildly different results --
// 15 native rows + presumably many Jobber rows on the first pass, then
// just 1 row total (and Durkin/Ludeman -- confirmed still genuinely
// unpaid -- missing entirely) on a second, identical pass. Nothing in the
// status/payment logic explains that; a flapping row COUNT from the exact
// same unfiltered query does. countUnpaidInvoices() (lib/dailyDigest.ts)
// never calls .order() or .range()/.limit() on its jobber_invoices
// select -- if that table has grown past Supabase/PostgREST's configured
// max-rows response cap, an unordered, uncapped-looking query like that
// silently gets truncated server-side, and *which* rows make it into that
// truncated response is effectively unstable across calls (depends on the
// query planner/physical scan order, not any guaranteed ordering) -- which
// would explain both symptoms at once: some mornings native invoices
// happen to be missing from the response entirely, not just from the
// display sample.
//
// This gets the real total row count in jobber_invoices (via Postgres
// count, not affected by any response cap) and compares it against how
// many rows an unordered, uncapped-looking select actually returns --
// if those numbers don't match, the row-limit theory is confirmed.
//
// Read-only, admin-gated, manual-trigger only.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { count: totalRowCount, error: countError } = await supabaseServer
    .from("jobber_invoices")
    .select("*", { count: "exact", head: true });

  if (countError) {
    return NextResponse.json(
      { success: false, error: `Couldn't count jobber_invoices: ${countError.message}` },
      { status: 500 }
    );
  }

  const { count: filteredCount, error: filteredCountError } = await supabaseServer
    .from("jobber_invoices")
    .select("*", { count: "exact", head: true })
    .not("jobber_client_id", "is", null);

  if (filteredCountError) {
    return NextResponse.json(
      { success: false, error: `Couldn't count filtered jobber_invoices: ${filteredCountError.message}` },
      { status: 500 }
    );
  }

  // The exact same unordered, no-explicit-limit select countUnpaidInvoices()
  // runs -- run it three times back to back to see if the row count it
  // actually gets back is stable or flaps.
  const passes: { rowsReturned: number; nativeRowsReturned: number }[] = [];

  for (let i = 0; i < 3; i++) {
    const { data, error } = await supabaseServer
      .from("jobber_invoices")
      .select("jobber_invoice_id")
      .not("jobber_client_id", "is", null);

    if (error) {
      return NextResponse.json(
        { success: false, error: `Pass ${i + 1} failed: ${error.message}` },
        { status: 500 }
      );
    }

    const rows = data ?? [];
    passes.push({
      rowsReturned: rows.length,
      nativeRowsReturned: rows.filter((r) => r.jobber_invoice_id.startsWith("native-")).length,
    });
  }

  const allPassesMatchTotal = passes.every((p) => p.rowsReturned === filteredCount);

  return NextResponse.json({
    success: true,
    totalRowsInTable: totalRowCount,
    rowsMatchingClientIdFilter: filteredCount,
    passes,
    rowLimitLikelyHit: !allPassesMatchTotal,
    note: allPassesMatchTotal
      ? "Every pass returned the full filtered row count -- no truncation detected on this call, though it may still be intermittent."
      : "At least one pass returned fewer rows than the true filtered count -- the query IS being silently truncated. This is almost certainly a Supabase/PostgREST max-rows cap.",
  });
}
