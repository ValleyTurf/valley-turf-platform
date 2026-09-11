-- Referral / lead-source tracking on the customer record.
--
-- Ryan's asked "how did you hear about us?" verbally for every new
-- customer for a long time, with nowhere structured to put the answer.
-- This gives it a real home on the customer record. Deliberately NOT a
-- full referral-rewards program -- no credit ledger, no auto-applied
-- discount, no trigger logic. Ryan applies any reward by hand, the
-- normal way, so he can change the deal whenever he wants without
-- touching code (his call, 2026-09-11).
--
-- referred_by_customer_id is only meaningful when referral_source =
-- 'referral'; referral_campaign_id only when referral_source = 'qr_code'
-- (referencing the existing campaigns table -- see migration
-- 002_campaign_channel.sql and app/(platform)/codes/page.tsx -- so the QR
-- option always reflects Ryan's real, named QR codes/links instead of a
-- second, disconnected list). Both stay null otherwise; enforced in the
-- UI/action layer (lib/referralSource.ts), same as this app's other
-- conditional-field forms (e.g. TurfSizeField's range-vs-exact mode).
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj
-- -> SQL Editor).
alter table customers
  add column if not exists referral_source text,
  add column if not exists referred_by_customer_id text references customers(jobber_client_id) on delete set null,
  add column if not exists referral_campaign_id uuid references campaigns(id) on delete set null;

alter table customers
  drop constraint if exists customers_referral_source_check;

alter table customers
  add constraint customers_referral_source_check
  check (referral_source is null or referral_source in
    ('referral', 'google', 'instagram', 'facebook', 'word_of_mouth', 'qr_code', 'other'));

create index if not exists customers_referral_source_idx on customers (referral_source);
create index if not exists customers_referred_by_customer_id_idx on customers (referred_by_customer_id);
