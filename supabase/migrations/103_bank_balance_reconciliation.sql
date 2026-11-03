-- Full bank balance reconciliation (Ryan, 2026-11-03): "Quickbooks has
-- bank account information that is up to date and accurate and I have
-- transactions I have to review for the journaling. Can we do that as
-- well so I can see balances and make sure everything is in the right
-- spots and the books are balanced?" -- followed by a screenshot of
-- QuickBooks' own Bank Accounts panel (live bank balance vs. "In
-- QuickBooks" balance per account, plus a per-account "N to review"
-- count). Asked how deep to go (live balance + review queue only, vs.
-- also computing our own running in-app balance to compare against the
-- live one); Ryan chose the full version.
--
-- Two things this needs that don't exist yet:
--
-- 1. A starting point to run a balance forward from. The bank feed
--    only ever had the EXPENSE side of the ledger (money out, plus
--    refunds back in) -- true deposits were discarded entirely (see
--    isTrueDeposit in app/api/plaid/sync/route.ts, changed in the same
--    commit as this migration to stop discarding them). So "the running
--    balance since we started tracking" can't be computed from day
--    one; instead each account gets a `starting_balance` anchored at
--    `starting_balance_date` (defaulting to 10/1/2026, the bank feed's
--    existing BANK_FEED_START_DATE cutover from the QuickBooks import),
--    which Ryan enters once per account from his own bank statement.
--    The in-app balance from then forward is
--    starting_balance - SUM(expenses.amount) for that account from
--    starting_balance_date forward (amount's sign convention is
--    positive = money out, negative = money in -- see migration 096 /
--    commit 7e5c92e -- so subtracting the signed sum both pays down the
--    balance for a real expense and adds it back for a deposit).
--
-- 2. Somewhere to put a live balance snapshot to compare against. Not
--    fetched live on every page load (that's a Plaid API call Ryan
--    would be waiting on just to view a settings page) -- cached here
--    and refreshed each time a sync runs instead, same "snapshot as of
--    last sync" posture QuickBooks itself shows ("Bank balance" with no
--    claim it's live-live).
alter table bank_accounts
  add column if not exists starting_balance numeric,
  add column if not exists starting_balance_date date not null default '2026-10-01',
  add column if not exists live_balance numeric,
  add column if not exists live_balance_as_of timestamptz;

-- New ledger_type value: a deposit that's genuine business revenue
-- already recorded elsewhere (a Jobber/Stripe payout landing in the
-- bank account). The existing four values (owner_draw, loan_payment,
-- internal_transfer, owner_contribution) don't cover this -- it's not
-- a money movement in the "not income, not an expense" sense those
-- are; it's real revenue, just already counted on the P&L through
-- Jobber invoices/Stripe payments (lib/transactions.ts) rather than
-- through this bank-feed row. Tagging it its own value (rather than
-- folding it into internal_transfer) keeps it visible and distinct on
-- /expenses/journal, and keeps it out of the P&L/job-costing double
-- count the same way the other four are kept out -- while still
-- counting toward the balance math above, which is the whole point of
-- importing it at all.
alter table expenses
  drop constraint if exists expenses_ledger_type_check;

alter table expenses
  add constraint expenses_ledger_type_check
  check (
    ledger_type is null
    or ledger_type in (
      'owner_draw',
      'loan_payment',
      'internal_transfer',
      'owner_contribution',
      'revenue_deposit'
    )
  );
