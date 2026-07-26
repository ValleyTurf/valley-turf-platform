-- Recurring-services page was estimating each customer's upcoming visit
-- amount from a category-wide historical average, which produced the same
-- number for every customer in a category regardless of their actual rate.
-- Jobber's Job type exposes real per-job pricing via lineItems (unitCost x
-- quantity per line, summed to totalCost) - this column lets sync-jobs and
-- the job-update webhook handler persist that job's actual total so pages
-- can show each customer's real scheduled amount instead of an average.
alter table jobber_jobs
  add column if not exists total numeric;
