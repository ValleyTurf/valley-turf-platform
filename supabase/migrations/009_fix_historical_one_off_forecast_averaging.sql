-- Bug: historical_one_off_by_month grouped only by calendar month number
-- ('MM'), summing one-off invoice totals across every year of history
-- combined, with nothing dividing by how many years were observed. With
-- 2+ years of Jobber data, every month's one-off estimate in the 12-month
-- revenue forecast was inflated by roughly that many years' worth -
-- almost certainly a big part of why the forecast looked wrong.
--
-- Fix: divide each month's summed total by the number of distinct years
-- that actually had data in that month, so this becomes a genuine
-- per-year average instead of a multi-year sum.
create or replace view historical_one_off_by_month as
select
  to_char(issue_date::timestamp with time zone, 'MM') as month_num,
  round(
    sum(total) / greatest(
      count(distinct to_char(issue_date::timestamp with time zone, 'YYYY')),
      1
    ),
    2
  ) as one_off_revenue
from invoice_service_category
where service_category <> all (array[
  'Monthly Maintenance', 'Quarterly Cleaning', 'Bimonthly Cleaning',
  'Semi-Annual Cleaning', 'Weekly Maintenance', 'Spray Only'
])
group by to_char(issue_date::timestamp with time zone, 'MM');
