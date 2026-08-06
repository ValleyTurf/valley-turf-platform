-- Quote pricing calculator: a flat price-per-service-per-turf-size-range
-- lookup table, managed by staff on /quotes/pricing (not hardcoded) so
-- prices can change anytime without a code deploy. Ranges use the exact
-- same preset strings as customers.turf_size_range (see
-- TurfSizeField.tsx's RANGE_OPTIONS and sync-turf-size's
-- KNOWN_RANGE_OPTIONS) so a customer's known turf size can be looked up
-- directly against this table with no conversion.
--
-- One row per (service, range) combination — service_name is free text
-- (staff can add whatever services they price this way, not a fixed
-- list). Plain unique constraint on the exact stored text, not a
-- case-insensitive expression index: Supabase's upsert(onConflict)
-- needs a literal column list it can hand straight to Postgres's
-- ON CONFLICT clause, and matching that against an expression index is
-- an unnecessary risk for something app code can handle just as well —
-- app/(platform)/quotes/pricing/actions.ts looks up any existing
-- service by a case-insensitive match BEFORE writing, and reuses
-- whatever casing is already on file, so "Aeration" and "aeration"
-- still can't end up as two separate services in practice.
create table if not exists service_pricing (
  id uuid primary key default gen_random_uuid(),
  service_name text not null,
  turf_size_range text not null,
  price numeric not null,
  updated_at timestamptz not null default now(),
  unique (service_name, turf_size_range)
);
