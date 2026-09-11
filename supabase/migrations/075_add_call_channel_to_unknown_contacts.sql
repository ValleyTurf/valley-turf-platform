-- Extends unknown_contacts (migration 066) to also catch inbound calls
-- from a number that doesn't match any customer -- same "don't drop it"
-- reasoning ROADMAP.md "Next up" #1 already applied to texts and
-- emails, now covering the new CRM-integrated call forwarding
-- (app/api/webhooks/twilio-voice/route.ts) too. A cold prospect calling
-- in now shows up in the same "Unknown senders" review queue a cold
-- text/email already does, instead of vanishing the moment nobody
-- picks up.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj
-- -> SQL Editor).
alter table unknown_contacts
  drop constraint if exists unknown_contacts_channel_check;

alter table unknown_contacts
  add constraint unknown_contacts_channel_check
  check (channel in ('sms', 'email', 'call'));
