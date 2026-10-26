-- Per-device Web Push subscriptions, so the installed home-screen app
-- can show a red badge (and a notification) for new customer messages
-- even when the app isn't open. Ryan + Brittanie, 2026-10-25: "would
-- like our mobile app show on my home screen with a red dot like you
-- see when there are other apps with new messages."
--
-- One row per (user, device/browser) -- a user can have the app
-- installed on more than one device, and each gets its own push
-- subscription object from the browser, so there's no natural
-- one-row-per-user constraint. endpoint is assigned by the browser's
-- push service and is globally unique per subscription, which is also
-- what app/api/push/subscribe/route.ts's upsert conflicts on -- the
-- same physical device re-subscribing just updates its row in place
-- rather than creating a duplicate.
--
-- Not scoped to admin/manager -- any logged-in user can turn this on
-- for their own device from Account (see
-- app/(platform)/account/NotificationsSection.tsx). The Messages inbox
-- itself isn't per-user, so every subscriber currently gets the same
-- shared "team inbox" badge count; that's fine for now (Ryan + Brittanie
-- both want it), and nothing here would need to change if per-user
-- scoping is wanted later -- just filter by user_id in lib/webPush.ts.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj
-- -> SQL Editor).
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on push_subscriptions (user_id);
