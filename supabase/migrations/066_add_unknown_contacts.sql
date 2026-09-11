-- ROADMAP.md "Next up" #1: surface unrecognized inbound texts/emails
-- instead of dropping them. Before this, a text or email from a phone
-- number/address that doesn't match any customer on file just got
-- console.error'd inside the Twilio/Resend webhook handlers and
-- discarded (see app/api/webhooks/twilio/route.ts and
-- app/api/webhooks/resend/route.ts) -- meaning a brand-new prospect who
-- got your number from a friend and texted in cold had no record
-- anywhere. This table catches those instead, so they show up on the
-- Messages page for a human to review and, if it's a real prospect, turn
-- into a real row in `leads` with one click.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj
-- -> SQL Editor).
create table if not exists unknown_contacts (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('sms', 'email')),
  -- Exactly one of these is normally set (sms -> phone, email -> email),
  -- but neither is required not-null -- an email that can't even be
  -- attributed to a sender still gets logged with just the summary,
  -- rather than silently dropped like before.
  phone text,
  email text,
  summary text,
  status text not null default 'new'
    check (status in ('new', 'added_as_lead', 'dismissed')),
  -- Set once someone clicks "Add as Lead" -- lets the Messages page link
  -- straight through to the resulting Leads row instead of just marking
  -- it handled.
  lead_id uuid references leads(id) on delete set null,
  resolved_at timestamptz,
  resolved_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists unknown_contacts_status_idx
  on unknown_contacts (status);
