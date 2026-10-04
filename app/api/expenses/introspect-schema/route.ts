// Ryan (2026-10-04): "I think I want to get rid of Quickbooks ... connect
// to bank account and do it all natively" -- starting a real expense
// ledger + P&L build. Before designing the new `expenses` table, this
// looks at what's already live and feeding Job Costing Analytics/Revenue
// today: `overhead_costs` (the admin-entered recurring/amortized cost
// list) and the three views built on top of it (`overhead_by_month`,
// `monthly_financials`, `invoice_cost_breakdown`). All four were created
// directly in Supabase, outside any tracked migration (confirmed via
// migration 033's own header comment) -- so there is no local source of
// truth for their exact columns. Guessing wrong here risks either
// breaking those live reports or designing the new expenses table to not
// line up with them.
//
// supabaseServer.from(name).select("*") doesn't expose information_schema
// (Supabase's PostgREST layer only serves tables/views actually in the
// query, not catalog metadata), so this just pulls a few real rows from
// each and reports the keys it sees -- enough to see every column that
// has ever been populated, same technique as any other read-only debug
// route this session.
//
// Read-only, admin-gated, manual-trigger only. No writes, no apply mode.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function sample(table: string, limit = 5) {
  const { data, error } = await supabaseServer.from(table).select("*").limit(limit);

  if (error) {
    return { table, error: error.message };
  }

  const columns = Array.from(
    new Set((data ?? []).flatMap((row) => Object.keys(row as Record<string, unknown>)))
  );

  return { table, rowCount: data?.length ?? 0, columns, sampleRows: data };
}

export async function GET(_request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const results = await Promise.all([
    sample("overhead_costs"),
    sample("overhead_by_month"),
    sample("monthly_financials"),
    sample("invoice_cost_breakdown"),
  ]);

  return NextResponse.json({
    success: true,
    note:
      "These four were created directly in Supabase (no tracked migration) -- this is a read of their current live shape via sample rows, not a schema catalog query.",
    results,
  });
}
