-- Part B of the job-costing reconciliation started in migration 093.
--
-- overhead_by_month (migration 033) only ever summed overhead_costs, and
-- Ryan end-dated the manual overhead_costs rows (Jobber, Advertising) on
-- 12/31/2025 once the P&L moved to real logged/bank-fed expenses -- so
-- this view, and therefore invoice_cost_breakdown.overhead_allocated and
-- every per-job profit number in Job Costing Analytics, went stale (see
-- migration 093's header for the full history).
--
-- This adds the expenses-based pool Ryan approved: any /expenses row he
-- tags with job_costing_treatment, via the Job Costing dropdown on
-- /expenses (migration 093). 'one_time' counts the full amount in its
-- own expense_date month, same as a real cost hitting that month once.
-- 'amortized' spreads the amount evenly across every month from
-- expense_date through amortization_end_date, mirroring the existing
-- amortized_costs CTE below (including its current-month day-of-month
-- proration, so a month still in progress isn't charged a full month's
-- share before it's over).
--
-- invoice_cost_breakdown divides this view's total_overhead evenly
-- across the month's invoice count and needs no change itself -- once
-- total_overhead includes the expenses pool, every per-invoice
-- overhead_allocated and estimated_profit picks it up automatically.
-- monthly_financials doesn't touch overhead at all and is unaffected.
-- lib/overhead.ts and the P&L pages (app/(platform)/revenue/*) are a
-- separate implementation that reads overhead_costs directly and stay
-- exactly as they are -- Ryan: P&L runs off real expenses, Job Costing
-- runs off materials and costs.
--
-- Postgres requires a replaced view to keep its existing columns'
-- names, order AND TYPES as an exact prefix, so months/recurring_costs/
-- amortized_costs and the first four output columns below are copied
-- verbatim from the live view (confirmed via pg_get_viewdef) rather than
-- rewritten, and the two new breakdown columns are appended at the end.
create or replace view overhead_by_month as
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
        when m.month_start = date_trunc('month', current_date::timestamptz)::date
          then extract(day from current_date) / extract(day from m.month_start + interval '1 month' - interval '1 day')
        else 1::numeric
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
      oc.amount::double precision / greatest(
        1::double precision,
        (date_part('year', oc.end_date) - date_part('year', oc.start_date)) * 12::double precision
          + (date_part('month', oc.end_date) - date_part('month', oc.start_date)) + 1::double precision
      ) *
      (case
        when m.month_start = date_trunc('month', current_date::timestamptz)::date
          then extract(day from current_date) / extract(day from m.month_start + interval '1 month' - interval '1 day')
        else 1::numeric
      end)::double precision
    ) as amortized_total
  from months m
  join overhead_costs oc
    on oc.cost_type = 'amortized'
    and oc.start_date <= (m.month_start + interval '1 month' - interval '1 day')
    and oc.end_date >= m.month_start
  group by m.month_start
),
expense_one_time_costs as (
  select
    date_trunc('month', e.expense_date)::date as month_start,
    sum(e.amount) as one_time_total
  from expenses e
  where e.job_costing_treatment = 'one_time'
  group by date_trunc('month', e.expense_date)::date
),
expense_amortized_costs as (
  select
    m.month_start,
    sum(
      e.amount::double precision / greatest(
        1::double precision,
        (date_part('year', e.amortization_end_date) - date_part('year', e.expense_date)) * 12::double precision
          + (date_part('month', e.amortization_end_date) - date_part('month', e.expense_date)) + 1::double precision
      ) *
      (case
        when m.month_start = date_trunc('month', current_date::timestamptz)::date
          then extract(day from current_date) / extract(day from m.month_start + interval '1 month' - interval '1 day')
        else 1::numeric
      end)::double precision
    ) as amortized_total
  from months m
  join expenses e
    on e.job_costing_treatment = 'amortized'
    and e.expense_date <= (m.month_start + interval '1 month' - interval '1 day')
    and e.amortization_end_date >= m.month_start
  group by m.month_start
)
select
  to_char(m.month_start::timestamptz, 'YYYY-MM') as month,
  coalesce(rc.recurring_total, 0::numeric) as recurring_overhead,
  coalesce(ac.amortized_total, 0::double precision) as amortized_overhead,
  coalesce(rc.recurring_total, 0::numeric)::double precision
    + coalesce(ac.amortized_total, 0::double precision)
    + coalesce(eot.one_time_total, 0::numeric)::double precision
    + coalesce(eac.amortized_total, 0::double precision) as total_overhead,
  coalesce(eot.one_time_total, 0::numeric) as expense_one_time_overhead,
  coalesce(eac.amortized_total, 0::double precision) as expense_amortized_overhead
from months m
left join recurring_costs rc on rc.month_start = m.month_start
left join amortized_costs ac on ac.month_start = m.month_start
left join expense_one_time_costs eot on eot.month_start = m.month_start
left join expense_amortized_costs eac on eac.month_start = m.month_start
order by m.month_start;
