// One-off diagnostic for Ryan's 2026-11-02 report: the P&L month-by-month
// table's "Logged Expenses" for Oct ($1,812) doesn't match what the Oct
// drill-down page shows ($3,237) for the exact same underlying data.
// lib/revenue/profit-loss/page.tsx's fetchExpenseRows() queries the
// `expenses` table for the WHOLE year in one unpaginated call -- unlike
// its sibling fetchInvoiceRevenue() a few lines above it, which loops in
// pages of 1000 specifically because Postgrest caps a single response at
// 1000 rows. This checks whether that's actually happening: the real
// row count for the year (count: exact) vs. what the one-shot .select()
// actually returns. Admin-gated, read-only, delete once this is sorted.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const year = new Date().getFullYear();
  const rangeStart = `${year}-01-01`;
  const rangeEnd = new Date().toISOString().slice(0, 10);

  const { count: exactCount, error: countError } = await supabaseServer
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .gte("expense_date", rangeStart)
    .lte("expense_date", rangeEnd)
    .is("ledger_type", null);

  const { data: oneShotRows, error: oneShotError } = await supabaseServer
    .from("expenses")
    .select("expense_date, amount")
    .gte("expense_date", rangeStart)
    .lte("expense_date", rangeEnd)
    .is("ledger_type", null);

  const octStart = `${year}-10-01`;
  const octEnd = `${year}-10-31`;

  const { count: octExactCount } = await supabaseServer
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .gte("expense_date", octStart)
    .lte("expense_date", octEnd)
    .is("ledger_type", null);

  const oneShotOctRows = (oneShotRows ?? []).filter(
    (r) => r.expense_date >= octStart && r.expense_date <= octEnd
  );
  const oneShotOctTotal = oneShotOctRows.reduce(
    (sum, r) => sum + Number(r.amount ?? 0),
    0
  );

  return NextResponse.json({
    rangeStart,
    rangeEnd,
    exactCountForYear: exactCount,
    oneShotRowsReturnedForYear: oneShotRows?.length ?? null,
    countError: countError?.message ?? null,
    oneShotError: oneShotError?.message ?? null,
    octExactCount,
    oneShotOctRowsFound: oneShotOctRows.length,
    oneShotOctTotal,
  });
}
