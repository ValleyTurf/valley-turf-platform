-- Ryan (2026-10-13): "Also, should we keep the money movements and have
-- a pill that says paid to loan and another that says owner draw, or
-- something similar so we can keep those records for tax purposes?
-- Maybe move them to a journal entry or something?" -- raised right
-- after the Plaid tracked-accounts fix (migration 095), in the context
-- of what to do with bank-feed rows like the monthly credit card
-- payment or a mortgage/loan payment: those move money between his own
-- accounts (or out as an owner draw/contribution) rather than paying a
-- real business expense, but for S-corp basis/tax purposes he wants
-- them kept as auditable records, not just deleted.
--
-- This reuses the `expenses` table rather than a new one -- same
-- reasoning as job_costing_treatment (migration 093): it keeps every
-- bit of existing vendor/amount/date/notes/audit-trail/edit-UI
-- infrastructure, and a row simply switches from "a real expense" to
-- "a journal entry" by setting this one column. `ledger_type` null
-- (the default, same convention as job_costing_treatment) means "a real
-- expense, counts toward P&L/job costing/the vendor+category totals
-- page" -- every existing query to this table keeps working unchanged
-- for every row that was never touched here. A non-null value means
-- "a money movement, not an expense" and gets excluded from all of
-- those (app/(platform)/expenses/page.tsx, expenses/totals/page.tsx,
-- revenue/profit-loss/page.tsx and [month]/page.tsx all pick up an
-- `is("ledger_type", null)` filter in the same commit as this
-- migration), and instead shows up on its own new
-- app/(platform)/expenses/journal page, tagged with a pill badge.
--
-- Four types, exactly as Ryan confirmed: Owner Draw, Paid to Loan
-- (the loan/mortgage payment itself), Internal Transfer (money moved
-- between his own accounts, e.g. into savings), and Owner Contribution
-- (money he puts into the business). Deliberately NOT offered as a
-- fifth "credit card payment" type -- paying off the business credit
-- card isn't a real expense (the expense already landed on the credit
-- card statement feed itself) and isn't really any of the four either;
-- that one row-type stays "delete it, don't save it" per the earlier
-- guidance, to avoid inventing a fifth bucket Ryan didn't ask for.
alter table expenses
  add column if not exists ledger_type text;

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
      'owner_contribution'
    )
  );

-- A journal entry isn't a real job cost -- same restriction migration
-- 093 already enforces for cost_of_service/payroll, extended here so a
-- row can't carry both a ledger_type and a job_costing_treatment at
-- once. app/(platform)/expenses/actions.ts enforces this server-side
-- too (resolveJobCostingFields nulls both fields out whenever a
-- ledger_type is set); this is the backstop.
alter table expenses
  drop constraint if exists expenses_ledger_type_job_costing_check;

alter table expenses
  add constraint expenses_ledger_type_job_costing_check
  check (
    ledger_type is null
    or job_costing_treatment is null
  );

create index if not exists idx_expenses_ledger_type
  on expenses (ledger_type)
  where ledger_type is not null;
