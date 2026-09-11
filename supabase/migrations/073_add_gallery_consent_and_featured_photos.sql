-- ROADMAP.md Fresh Ideas #6 -- photo-based before/after gallery, sourced
-- from real visit photos (visit_notes.photo_paths) instead of hand-picked
-- stock-style images. Two pieces:
--
-- 1. Consent, staff-recorded (Ryan's call, 2026-09-11) -- same
--    boolean-plus-timestamp shape as migration 053's leads.sms_consent /
--    sms_consent_at, just on customers instead. No customer-facing flow:
--    staff ask, staff check a box on the Property Profile.
-- 2. Which specific photos are curated for the website. photo_path stays
--    the join key back into visit_notes.photo_paths -- no photo bytes are
--    duplicated, this table only marks which existing paths are featured.
--    unique(photo_path) stops the same photo being featured twice.
alter table customers
  add column if not exists gallery_consent boolean not null default false,
  add column if not exists gallery_consent_at timestamptz;

create table if not exists featured_gallery_photos (
  id uuid primary key default gen_random_uuid(),
  jobber_client_id text not null,
  jobber_visit_id text not null,
  photo_path text not null unique,
  featured_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
