-- Turns "how did you hear about us?" from a hardcoded list
-- (lib/referralSource.ts's REFERRAL_SOURCE_OPTIONS, locked in by migration
-- 070's check constraint) into a real table Ryan can manage himself from
-- a new Settings page, instead of asking for a code change + migration
-- every time he wants to add one.
--
-- Ryan (2026-10-23): wants referral sources for people who heard about
-- Valley Turf Revival from someone in the same neighborhood as an
-- existing QR-code campaign (Sky Crossing, DC Ranch) but who didn't
-- actually scan the code -- distinct from the existing 'qr_code' option,
-- which always asks which specific QR code/campaign it was (see
-- app/components/ReferralSourceField.tsx). This is the first of
-- presumably many community names, hence the self-serve table rather
-- than one more one-off migration.
--
-- 'value' is the stable slug stored on customers.referral_source and
-- compared against literal strings in a few places that are NOT going
-- away with this migration -- ReferralSourceField.tsx's "referral" (shows
-- the referred-by picker) and "qr_code" (shows the campaign picker) sub-
-- fields key off the exact value string, not a flag on this table. Don't
-- rename or deactivate those two without also checking that component
-- and the two server actions that read lib/referralSource.ts.
--
-- sort_order controls display/dropdown order. The six original options
-- keep their original relative order (10-60); 'other' is pinned at 9999
-- so it stays last no matter how many community sources get added above
-- it -- see lib/referralSource.ts's nextSortOrder() for how new rows
-- added from the Settings page pick a value that keeps that true.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj
-- -> SQL Editor).
create table if not exists referral_sources (
  value text primary key,
  label text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into referral_sources (value, label, sort_order) values
  ('referral', 'Referral', 10),
  ('google', 'Google', 20),
  ('instagram', 'Instagram', 30),
  ('facebook', 'Facebook', 40),
  ('word_of_mouth', 'Word of Mouth', 50),
  ('qr_code', 'QR Code', 60),
  ('other', 'Other', 9999)
on conflict (value) do nothing;

-- Ryan's two new community sources (2026-10-23) -- people who got the
-- number from someone in that neighborhood without scanning a QR code.
insert into referral_sources (value, label, sort_order) values
  ('sky_crossing', 'Sky Crossing', 70),
  ('dc_ranch', 'DC Ranch', 80)
on conflict (value) do nothing;

-- Replaces migration 070's fixed-list check constraint with a foreign
-- key into the new table -- same enforcement goal (can't save a value
-- that isn't a real option), but the valid-value list is now whatever
-- rows exist here instead of frozen at deploy time. A customer's
-- existing referral_source stays valid even if that source is later
-- deactivated (the FK doesn't care about the `active` flag, only that
-- the row still exists) -- the Settings page only offers deactivating,
-- never deleting, a source that's already in use, so this never breaks.
alter table customers
  drop constraint if exists customers_referral_source_check;

alter table customers
  add constraint customers_referral_source_fkey
  foreign key (referral_source) references referral_sources(value)
  on delete set null;
