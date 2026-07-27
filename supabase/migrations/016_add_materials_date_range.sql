-- Lets a Material or Labor Rate be end-dated instead of edited in place.
-- When fuel/material pricing changes, or someone gets a raise, staff can
-- add the new price/rate as a new row and set an end_date on the old one
-- rather than overwriting it -- keeps a real history of what was in
-- effect when, and (see job-costs/page.tsx) the cost-logging form only
-- offers materials/labor rates that are still active (no end_date, or
-- end_date in the future), so old ended rates can't accidentally get
-- used on new job-cost entries.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj
-- -> SQL Editor).

alter table materials
  add column if not exists start_date date,
  add column if not exists end_date date;
