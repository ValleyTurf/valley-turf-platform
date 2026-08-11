-- Links "Labor - <name>" rows in materials to the actual users row they
-- represent, instead of relying only on name-text matching (already
-- caused one bug: em-dash vs hyphen mismatch, see
-- lib/laborMaterialName.ts). Team's Hourly Rate field is becoming the
-- single place staff edit an employee's pay rate; saving it there now
-- auto-maintains the point-in-time Labor Rate history here
-- (lib/laborRates.ts's syncLaborRateForUser), and this column is what
-- lets that sync reliably find "the current open labor-rate row for
-- this specific person" without depending on name text staying exactly
-- in sync.
--
-- Nullable and only meaningful for materials rows that represent a
-- labor rate (unit_label = 'hour', name starting with "Labor -"/"Labor
-- —"/etc.) -- ordinary material rows (fertilizer, fuel, mulch, ...)
-- never get a user_id. Existing non-labor rows are unaffected.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj
-- -> SQL Editor).

alter table materials
  add column if not exists user_id uuid references users(id) on delete set null;

create index if not exists materials_user_id_idx on materials(user_id);

-- One-time backfill: link existing labor-rate rows to their user by
-- matching the name after the "Labor - " / "Labor — " prefix (any dash
-- variant) against users.name, case-insensitively. Only touches rows
-- that don't already have a user_id and only when the name matches
-- exactly one active or inactive user (ambiguous/no matches are left
-- null and can be linked by hand later if needed -- future syncs from
-- Team will simply start a fresh row for anyone left unlinked).
update materials m
set user_id = u.id
from users u
where m.user_id is null
  and m.unit_label = 'hour'
  and lower(trim(regexp_replace(m.name, '^Labor\s*[-‐‑‒–—−]\s*', ''))) = lower(trim(u.name))
  and (
    select count(*) from users u2
    where lower(trim(u2.name)) = lower(trim(u.name))
  ) = 1;
