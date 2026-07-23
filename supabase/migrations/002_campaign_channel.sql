-- #4/#5: split QR codes vs. trackable social/bio links, and prep for branded QR logos.
-- Run this once in the Supabase SQL editor.

alter table campaigns
  add column if not exists channel text not null default 'qr';

alter table campaigns
  drop constraint if exists campaigns_channel_check;

alter table campaigns
  add constraint campaigns_channel_check check (channel in ('qr', 'social'));
