-- Ryan (2026-10-12): "I think I want individual jobs to be based off of
-- materials and costs, and then the overall p&l based on the expenses
-- coming from the bank account... Not sure if we have an expense from
-- the bank account if I pick an amortization or a one time cost and
-- that feeds into materials and costs maybe?"
--
-- Context: migration 087 deliberately left `expenses` and `overhead_costs`
-- unreconciled ("a phase-3 decision, not resolved by this migration").
-- The P&L (app/(platform)/revenue/profit-loss) already unions both. Job
-- Costing Analytics' per-job overhead allocation never picked up
-- `expenses` at all, and in the meantime Ryan end-dated the old manual
-- `overhead_costs` rows (Jobber, Advertising) on 12/31/2025 once the P&L
-- moved to real logged/bank-fed expenses -- so Job Costing's overhead
-- pool quietly went stale.
--
-- Rather than reviving old `overhead_costs` rows, this lets Ryan tag an
-- individual `/expenses` row, while categorizing/reviewing it, with how
-- it should feed Job Costing: counted once in its own expense-date month
-- ('one_time'), or spread evenly across a date range he picks
-- ('amortized', using `amortization_end_date` as the range end --
-- `expense_date` is the start). Null means "not part of job costing" --
-- the default, and the only valid state for `cost_of_service` (meant to
-- tie to a specific job directly once that linking UI exists) and
-- `payroll` (already reflected per-visit via Materials & Costs labor,
-- so folding it in again here would double-count it).
--
-- This migration only adds the columns; app/(platform)/expenses/actions.ts
-- enforces the cost_of_service/payroll restriction, and wiring this pool
-- into invoice_cost_breakdown / overhead_by_month is a separate follow-up
-- once Ryan supplies those views' current definitions.
alter table expenses
  add column if not exists job_costing_treatment text,
  add column if not exists amortization_end_date date;

alter table expenses
  drop constraint if exists expenses_job_costing_treatment_check;

alter table expenses
  add constraint expenses_job_costing_treatment_check
  check (
    job_costing_treatment is null
    or job_costing_treatment in ('one_time', 'amortized')
  );

-- Amortized rows need an end date to spread across; one-time/null rows
-- shouldn't carry a stray one.
alter table expenses
  drop constraint if exists expenses_amortization_end_date_check;

alter table expenses
  add constraint expenses_amortization_end_date_check
  check (
    (job_costing_treatment = 'amortized' and amortization_end_date is not null)
    or (job_costing_treatment is distinct from 'amortized' and amortization_end_date is null)
  );

create index if not exists idx_expenses_job_costing_treatment
  on expenses (job_costing_treatment)
  where job_costing_treatment is not null;
