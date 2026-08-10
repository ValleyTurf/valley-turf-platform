-- Fixes overhead_by_month so the CURRENT (still in-progress) calendar
-- month's total_overhead is prorated to elapsed days, instead of always
-- being the full month's expected total.
--
-- Bug: invoice_cost_breakdown's overhead_allocated = overhead_by_month
-- .total_overhead / monthly_financials.invoice_count for that month.
-- monthly_financials.invoice_count only counts invoices actually issued
-- so far this month (real data, naturally partial mid-month), but
-- overhead_by_month.total_overhead was always the FULL month's expected
-- overhead regardless of what day it is. Dividing a full month's overhead
-- by a partial month's invoice count inflates overhead-per-job on the Job
-- Costing Analytics page for any invoice issued before the month closes
-- out — confirmed live on 2026-08-10: $1,387.11 (all of August) / 28
-- invoices (first 10 days of August) = $49.54/job shown there, vs. the
-- Revenue page's $15/job, which prorates the same $1,387.11 down to
-- ~10/31 of the month before dividing by the same 28 invoices.
--
-- Fix: for the current calendar month only, scale each cost's
-- contribution by (day-of-month today / days in this month) — the same
-- "amount is a monthly figure, prorate it" idea the Revenue page's
-- calculateOverheadForRange already uses, applied here so both pages
-- agree throughout the month instead of only once it's over. Past and
-- future months in this view's ±1 year window are untouched (the CASE
-- below is a no-op for any month that isn't the current one), so
-- historical figures already reported on elsewhere don't shift.
--
-- overhead_by_month wasn't defined in any earlier migration — it (and
-- monthly_financials, invoice_cost_breakdown) were created directly in
-- Supabase outside version control. This is the first of the three to be
-- brought under a tracked migration; the other two are unchanged by this
-- fix and can follow later if they ever need to.

create or replace view public.overhead_by_month as
with months as (
  select generate_series(
    date_trunc('month', current_date - interval '1 year'),
    date_trunc('month', current_date + interval '1 year'),
    interval '1 month'
  )::date as month_start
),
recurring_costs as (
  select
    m.month_start,
    sum(
      oc.amount *
      case
        when m.month_start = date_trunc('month', current_date)::date
          then extract(day from current_date)
             / extract(day from (m.month_start + interval '1 month' - interval '1 day'))
        else 1
      end
    ) as recurring_total
  from months m
  join overhead_costs oc
    on oc.cost_type = 'recurring'
    and oc.start_date <= (m.month_start + interval '1 month' - interval '1 day')
    and (oc.end_date is null or oc.end_date >= m.month_start)
  group by m.month_start
),
amortized_costs as (
  select
    m.month_start,
    sum(
      oc.amount::double precision
      / greatest(
          1::double precision,
          (date_part('year', oc.end_date) - date_part('year', oc.start_date)) * 12::double precision
            + (date_part('month', oc.end_date) - date_part('month', oc.start_date)) + 1::double precision
        )
      * case
          when m.month_start = date_trunc('month', current_date)::date
            then extract(day from current_date)
               / extract(day from (m.month_start + interval '1 month' - interval '1 day'))
          else 1
        end
    ) as amortized_total
  from months m
  join overhead_costs oc
    on oc.cost_type = 'amortized'
    and oc.start_date <= (m.month_start + interval '1 month' - interval '1 day')
    and oc.end_date >= m.month_start
  group by m.month_start
)
select
  to_char(m.month_start::timestamp with time zone, 'YYYY-MM'::text) as month,
  coalesce(rc.recurring_total, 0::numeric) as recurring_overhead,
  coalesce(ac.amortized_total, 0::double precision) as amortized_overhead,
  coalesce(rc.recurring_total, 0::numeric)::double precision + coalesce(ac.amortized_total, 0::double precision) as total_overhead
from months m
left join recurring_costs rc on rc.month_start = m.month_start
left join amortized_costs ac on ac.month_start = m.month_start
order by m.month_start;
