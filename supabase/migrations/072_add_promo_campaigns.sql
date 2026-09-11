-- ROADMAP.md Fresh Ideas #5 -- Seasonal promo automation. Manual,
-- one-click campaigns (Ryan's call, 2026-09-11): a campaign row is a
-- historical record of a send that already happened, not a draft/queued
-- state -- there's no scheduler here, only "I built an audience, wrote a
-- message, and hit Send." promo_campaign_sends is the per-recipient audit
-- trail (who got it, on which channel, whether it succeeded); this is
-- separate from Contact History, which already gets an entry per send for
-- free via lib/notifications.ts's sendManualEmail/sendManualSms (see
-- lib/promoCampaigns.ts).
create table if not exists promo_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channels text[] not null,
  -- Null when the campaign is text-only -- subject only applies to email.
  subject text,
  body text not null,
  -- Human-readable snapshot of the filters used (e.g. "Active recurring,
  -- Gilbert") -- kept as plain text rather than re-queryable structured
  -- columns since re-running/duplicating a past campaign isn't in scope;
  -- this is just so the "Recent Campaigns" list is self-explanatory.
  audience_description text not null,
  created_by_user_id uuid references users(id) on delete set null,
  created_by_name text,
  recipient_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists promo_campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references promo_campaigns(id) on delete cascade,
  jobber_client_id text not null,
  channel text not null check (channel in ('email', 'sms')),
  status text not null check (status in ('sent', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists promo_campaign_sends_campaign_idx
  on promo_campaign_sends (campaign_id);
