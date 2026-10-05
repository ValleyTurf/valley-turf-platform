import "server-only";

import { supabaseServer } from "@/lib/supabase-server";
import { toNumber } from "@/lib/format";

// A checklist of known recurring costs (migration 089) -- deliberately
// separate from overhead_costs and never summed into any P&L total.
// Ryan, 2026-10-05: after ending the old recurring Overhead Cost
// estimates (Jobber, Advertising) on 12/31/2025 so they stop
// double-counting against the real imported/bank-fed transactions for
// the same cost, the P&L is built purely from actual logged expenses --
// which is more accurate, but means nothing flags it if a recurring
// charge simply doesn't show up some month (missed entry, bank feed
// hiccup). This exists purely to catch that before it skews margin.
export type RecurringChargeRow = {
  id: string;
  name: string;
  category: string;
  expected_amount: number | string;
  expected_day_of_month: number | null;
  active: boolean;
  notes: string | null;
};

export async function fetchRecurringCharges(): Promise<RecurringChargeRow[]> {
  const { data, error } = await supabaseServer
    .from("recurring_charges")
    .select(
      "id, name, category, expected_amount, expected_day_of_month, active, notes"
    )
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []) as RecurringChargeRow[];
}

export type RecurringChargeStatus = {
  id: string;
  name: string;
  category: string;
  expectedAmount: number;
  expectedDayOfMonth: number | null;
  matched: boolean;
  matchedAmount: number | null;
  matchedDate: string | null;
};

type ExpenseLike = {
  vendor: string | null;
  description: string | null;
  category: string;
  amount: number | string;
  expense_date: string;
};

// Matched by category plus a loose, case-insensitive substring match of
// the charge's name against the expense's vendor/description -- there's
// no hard key linking a checklist item to a specific expense row (manual
// entries and bank-feed description text are never going to be
// consistent enough for an exact join), so this deliberately errs toward
// "something plausible for this showed up" rather than a strict
// reconciliation. Good enough to catch "nothing at all showed up,"
// which is the actual failure mode this guards against.
export function checkRecurringCharges(
  charges: RecurringChargeRow[],
  expensesThisMonth: ExpenseLike[]
): RecurringChargeStatus[] {
  const statuses = charges
    .filter((charge) => charge.active)
    .map((charge) => {
      const needle = charge.name.trim().toLowerCase();

      const match = expensesThisMonth.find((expense) => {
        if (expense.category !== charge.category) return false;
        if (needle.length === 0) return false;

        const haystack = `${expense.vendor ?? ""} ${expense.description ?? ""}`
          .trim()
          .toLowerCase();

        return haystack.includes(needle);
      });

      return {
        id: charge.id,
        name: charge.name,
        category: charge.category,
        expectedAmount: toNumber(charge.expected_amount),
        expectedDayOfMonth: charge.expected_day_of_month,
        matched: !!match,
        matchedAmount: match ? toNumber(match.amount) : null,
        matchedDate: match ? match.expense_date : null,
      };
    });

  // Missing ones first -- that's the entire point of the checklist.
  return statuses.sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}
