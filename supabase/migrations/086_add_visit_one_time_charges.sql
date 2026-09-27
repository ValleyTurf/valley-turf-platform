-- Ryan, 2026-09-27: needs to add a one-time extra charge to a single
-- occurrence of a recurring job (Ludeman: normal $125/month visit,
-- October needs a "One Time Urine Extraction" for another $125 on top
-- -- total $250 for October only) without it repeating on every future
-- visit, and without needing a code change each time he has one of
-- these.
--
-- Job-level line items (migration 077_add_native_job_line_items.sql,
-- "roadmap item 18") are the wrong tool for this -- those are
-- permanent, added to the job's total and repeated on every future
-- recurrence. This is the opposite: scoped to exactly one visit row,
-- additive on top of whatever that visit would otherwise charge
-- (jobber_jobs.total split across the month, or a price_override --
-- see 085_add_visit_price_override.sql -- if one's already set on the
-- same visit). Multiple rows per visit are allowed (more than one
-- extra charge on the same occurrence), each shown as its own line
-- item on the eventual invoice.
--
-- Read/write path: lib/visitCharges.ts. Consumed by
-- app/(platform)/dashboard/page.tsx's resolveVisitValue (so reported
-- revenue includes the extra) and
-- app/(platform)/invoices/create/page.tsx (so the extra shows up as
-- its own suggested line item when the visit is actually invoiced).
-- Added/removed from the Manage Job page (app/(platform)/jobs/[id]/edit)
-- -- no code change needed for the next customer who needs one of
-- these.
create table if not exists visit_one_time_charges (
  id uuid primary key default gen_random_uuid(),
  jobber_visit_id text not null,
  name text not null,
  unit_price numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists visit_one_time_charges_visit_idx
  on visit_one_time_charges (jobber_visit_id);
