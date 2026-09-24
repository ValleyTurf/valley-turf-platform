-- Per-visit price override. Ryan, 2026-09-24: Patrick Durkin and Raquel
-- Mariscal both need different pricing on their Full-Monthly visits than
-- their Maintenance-Monthly ones (Durkin: $300 Full / $150 Maintenance
-- -- "we do both sides of the yard"; Mariscal: $260 Full / $150
-- Maintenance), but both customers run off a SINGLE recurring native job
-- (jobber_jobs, source='native', recurrence_frequency='monthly') that
-- generates every one of their future visits with one flat price
-- (jobber_jobs.total) -- there's nowhere today for a recurring job to
-- charge two different amounts depending on which occurrence it is.
--
-- Rather than restructure the job model, this adds an optional
-- per-visit override that the "Create Invoices" queue
-- (app/(platform)/invoices/create/page.tsx) checks first: when set, it
-- becomes the visit's single suggested line item (using the visit's own
-- title as the description) instead of pulling from the job's line
-- items. null for the vast majority of visits, which keep suggesting
-- from the job exactly as before.
alter table jobber_visits
  add column if not exists price_override numeric(10,2);
