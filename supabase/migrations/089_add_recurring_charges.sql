-- Recurring Charges checklist (Ryan, 2026-10-05).
--
-- Context: the P&L was double-counting -- a recurring "Overhead Cost"
-- estimate (e.g. Jobber, Advertising) and the real transaction for that
-- same cost, now that the QuickBooks import/bank feed logs it as an
-- actual expense too. The fix for that is ending those overhead_costs
-- rows on 12/31/2025 so only the real, actual numbers count from 2026
-- forward.
--
-- That fix opens a different gap, though: once the P&L is built purely
-- from actual logged/bank-fed transactions, nothing flags it if a known
-- recurring charge (Jobber, an insurance payment, a software renewal)
-- simply doesn't show up some month -- a missed manual entry, a bank
-- feed hiccup, whatever. Margin would look artificially better than it
-- really is until someone happens to notice.
--
-- This table is deliberately NOT summed into any P&L total -- it's a
-- pure checklist, matched against the `expenses` table by category and
-- a loose name match (see lib/recurringCharges.ts), so the Expenses page
-- can flag "this recurring charge hasn't shown up yet this month"
-- before it quietly skews profit margin.
create table if not exists recurring_charges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  expected_amount numeric(10,2) not null default 0,
  expected_day_of_month int,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_charges_day_range check (
    expected_day_of_month is null
    or (expected_day_of_month between 1 and 31)
  )
);

create index if not exists recurring_charges_active_idx on recurring_charges (active);
