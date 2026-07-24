-- Duplicate lead detection + faster phone/email matching.
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj -> SQL Editor).

alter table leads
  add column if not exists normalized_phone text,
  add column if not exists normalized_email text,
  add column if not exists scan_count integer not null default 1,
  add column if not exists last_seen_at timestamptz;

-- Backfill normalized values for existing rows using the same rules as
-- lib/matching.ts (strip non-digits, drop a leading country code "1" on
-- 11-digit numbers, lowercase/trim email).
update leads
set normalized_phone = case
  when length(regexp_replace(phone, '\D', '', 'g')) = 11
       and left(regexp_replace(phone, '\D', '', 'g'), 1) = '1'
    then substring(regexp_replace(phone, '\D', '', 'g') from 2)
  when length(regexp_replace(phone, '\D', '', 'g')) = 10
    then regexp_replace(phone, '\D', '', 'g')
  else null
end
where phone is not null;

update leads
set normalized_email = lower(trim(email))
where email is not null;

update leads
set last_seen_at = created_at
where last_seen_at is null;

-- Partial indexes: only rows with a usable normalized value get indexed,
-- and lookups are point lookups (single phone/email) so this is a big win
-- over the current full-table scan pattern once the dedupe check goes live.
create index if not exists leads_normalized_phone_idx
  on leads(normalized_phone)
  where normalized_phone is not null;

create index if not exists leads_normalized_email_idx
  on leads(normalized_email)
  where normalized_email is not null;
