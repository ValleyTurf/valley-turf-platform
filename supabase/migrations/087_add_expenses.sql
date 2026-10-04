-- Ryan (2026-10-04): starting a native expense ledger so the CRM can
-- eventually run its own P&L and replace QuickBooks. This is phase 1 --
-- a plain transaction-level expense table, no bank feed yet (that's a
-- separate later phase once a provider is actually connected).
--
-- Deliberately separate from the existing `overhead_costs` table
-- (created directly in Supabase, no tracked migration -- see
-- 033_fix_overhead_by_month_current_month_proration.sql's header) rather
-- than folding into it. overhead_costs models a different kind of thing
-- -- a recurring/amortized cost RULE that gets prorated across months --
-- and it's already live, feeding overhead_by_month and from there Job
-- Costing Analytics/Revenue. This table models the other half: real,
-- dated, one-off transactions. The two get reconciled into a single P&L
-- view in a later phase; this migration only adds the new table, it
-- does not touch overhead_costs or anything built on it.
--
-- Category list agreed with Ryan 2026-10-04:
--   cost_of_service  -- chemicals/supplies, contract labor, equipment
--                        repair tied to a specific job. The only
--                        category meant to carry a job/customer link
--                        (not wired up yet -- see note on job linking
--                        below).
--   fuel             -- its own category, NOT job-tied. Ryan: there's no
--                        reliable way to attribute one tank of gas to a
--                        specific visit, so this tracks actual total
--                        fuel spend company-wide instead of forcing a
--                        per-job allocation. How this factors into Job
--                        Costing Analytics (closer to how overhead is
--                        already divided across jobs than to a direct
--                        per-job cost) is a phase-3 decision, not
--                        resolved by this migration.
--   payroll          -- gross wages + employer payroll taxes. Actual
--                        payroll processing/disbursement lives in Gusto
--                        (Ryan is still setting that up) and timeclocks
--                        stay in this app unchanged -- this category
--                        exists purely so the P&L doesn't omit the
--                        single biggest cost line. Entered as one lump
--                        sum per pay period for now; pulling totals from
--                        Gusto's API automatically (same pattern as the
--                        existing QuickBooks/Jobber push integrations)
--                        is a reasonable later phase once Gusto is live.
--   marketing, software, insurance, vehicle, office, professional,
--   bank_fees, rent_utilities, taxes_licenses, other -- standard
--   operating expense buckets, grouped loosely to line up with how a
--   1120-S return reports expenses without forcing accountant-speak
--   terminology into the day-to-day entry form.
--
-- Job linking: jobber_client_id/jobber_job_id columns exist now so
-- cost_of_service rows CAN be tied to a specific customer/job once that
-- UI is built, but the phase 1 entry form (app/(platform)/expenses)
-- deliberately doesn't expose a picker yet -- reusing CustomerTypeahead
-- as-is doesn't fit a multi-field form that submits everything together
-- (it's built to either navigate or auto-submit its own surrounding
-- form), and building a proper one is better scoped alongside the
-- Job Costing Analytics wiring in a later phase than rushed here.
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  vendor text,
  description text,
  category text not null
    check (category in (
      'cost_of_service',
      'fuel',
      'payroll',
      'marketing',
      'software',
      'insurance',
      'vehicle',
      'office',
      'professional',
      'bank_fees',
      'rent_utilities',
      'taxes_licenses',
      'other'
    )),
  amount numeric(10, 2) not null,
  expense_date date not null default current_date,
  -- Not referenced anywhere yet (see job-linking note above) -- ON
  -- DELETE SET NULL to match every other jobber_client_id column in this
  -- app (customers are never hard-deleted, but this stays defensive).
  jobber_client_id text references customers(jobber_client_id) on delete set null,
  jobber_job_id text,
  -- 'manual' for everything entered through the phase 1 form. 'bank_feed'
  -- is reserved for the later bank-connection phase -- imported
  -- transactions land with status 'needs_review' until a human confirms
  -- the category, same dry-run-by-default caution as everything else
  -- touching real financial data in this app.
  source text not null default 'manual'
    check (source in ('manual', 'bank_feed')),
  status text not null default 'categorized'
    check (status in ('needs_review', 'categorized')),
  notes text,
  created_by_user_id uuid references users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_expense_date_idx on expenses (expense_date);
create index if not exists expenses_category_idx on expenses (category);
create index if not exists expenses_status_idx on expenses (status);
create index if not exists expenses_jobber_client_id_idx on expenses (jobber_client_id);
