-- Reimagined Customer detail page, part 1: a standalone Notes section
-- (photos + text per visit, no longer buried in the Property Profile
-- textarea), captured either by crew from My Day while on-site or by
-- office staff from the customer page afterward.
--
-- One row per note; a visit can have more than one (e.g. a quick note
-- from the crew in the field, plus a follow-up from the office later
-- the same day) — the app groups/sorts these by visit, most recent
-- visit first, oldest-to-newest within a visit. photo_paths holds
-- storage object paths (not full URLs) into the visit-photos bucket
-- below; the app resolves each to a public URL when rendering.
create table if not exists visit_notes (
  id uuid primary key default gen_random_uuid(),
  jobber_visit_id text not null,
  jobber_client_id text not null,
  author_user_id uuid references users(id) on delete set null,
  note text,
  photo_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists visit_notes_client_idx
  on visit_notes (jobber_client_id, created_at);

create index if not exists visit_notes_visit_idx
  on visit_notes (jobber_visit_id);

-- Public-read bucket for turf photos: simplest way to render an <img src>
-- straight from the browser without routing every photo through our own
-- server. Nothing sensitive lives here (lawn photos, not customer PII),
-- and paths are random UUIDs, not enumerable. All writes go through
-- supabaseServer (the service-role client), which bypasses RLS entirely,
-- so the only policy actually needed is public SELECT.
insert into storage.buckets (id, name, public)
values ('visit-photos', 'visit-photos', true)
on conflict (id) do nothing;

drop policy if exists "Public read access to visit photos" on storage.objects;

create policy "Public read access to visit photos"
  on storage.objects for select
  using (bucket_id = 'visit-photos');

-- Reimagined Customer detail page, part 3: Property Profile's turf size
-- field now accepts either an exact number (existing turf_size_sqft) or
-- a preset range ("<300", "300-500", etc.) for properties where nobody's
-- measured exactly. Whichever the form is set to save clears the other,
-- so only one is ever populated at a time — see TurfSizeField.tsx and
-- updateCustomerProfile in app/(platform)/customers/[id]/actions.ts.
alter table customers
  add column if not exists turf_size_range text;
