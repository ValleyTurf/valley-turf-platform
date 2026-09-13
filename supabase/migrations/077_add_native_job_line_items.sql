-- Roadmap item 18 -- native multi-line-item jobs (add-ons). Ryan's ask:
-- crews need to see when a job has an add-on layered on top of the
-- regular cleaning (e.g. an infill refresh), instead of it being
-- invisible inside one flat price -- and clicking into a job should show
-- what it actually includes when that differs from the norm.
--
-- Hybrid design, not universal: a job only gets rows here once it
-- genuinely has more than one line item. A plain single-price job (the
-- vast majority) keeps reading/writing jobber_jobs.total directly, with
-- zero rows in this table -- no reason to backfill ~700+ simple jobs for
-- no visible change. jobber_jobs.total stays authoritative for every
-- existing report/dashboard that already reads it (MRR, job costing,
-- the jobs list, invoicing) -- lib/nativeJobs.ts's
-- setNativeJobLineItems keeps it in sync as sum(unit_price * quantity)
-- whenever a job's line items are saved, so nothing downstream needs to
-- change.
--
-- No FK to jobber_jobs(jobber_job_id) -- that column isn't confirmed
-- unique/primary-keyed anywhere in these tracked migrations (this app's
-- base schema predates them), so a hard reference risks failing this
-- migration for a reason unrelated to this feature. A plain indexed
-- column is safe either way.
create table if not exists native_job_line_items (
  id uuid primary key default gen_random_uuid(),
  jobber_job_id text not null,
  name text not null,
  unit_price numeric(10,2) not null default 0,
  quantity numeric(10,2) not null default 1,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists native_job_line_items_job_idx
  on native_job_line_items (jobber_job_id, sort_order);

-- One-time backfill: migration 068's jobber_line_items_snapshot already
-- captured each multi-item Jobber job's real name/unitPrice/quantity
-- breakdown before the cutover (2026-09), specifically as seed data for
-- this feature -- see that migration's header comment. Only jobs already
-- flipped to source='native' (the actual cutover, migration 067) get
-- backfilled; a job still genuinely Jobber-sourced keeps using the live
-- Jobber line-items path unchanged.
insert into native_job_line_items (jobber_job_id, name, unit_price, quantity, sort_order)
select
  j.jobber_job_id,
  coalesce(item->>'name', 'Service') as name,
  coalesce((item->>'unitPrice')::numeric, 0) as unit_price,
  coalesce((item->>'quantity')::numeric, 1) as quantity,
  item_index - 1 as sort_order
from jobber_jobs j
cross join lateral jsonb_array_elements(j.jobber_line_items_snapshot) with ordinality as t(item, item_index)
where j.source = 'native'
  and jsonb_typeof(j.jobber_line_items_snapshot) = 'array'
  and jsonb_array_length(j.jobber_line_items_snapshot) > 1;
