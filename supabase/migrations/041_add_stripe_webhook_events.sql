-- Stripe webhook event queue (Tier 1, Stage 1 skeleton) -- mirrors the
-- jobber_webhook_events queue/processor pattern (receive -> verify
-- signature -> queue -> process asynchronously with retries). No
-- native invoices/payments tables exist yet (that's Tier 1 Stage 2/3),
-- so processStripeWebhookEvent() in lib/stripeWebhookProcessor.ts
-- currently just logs each recognized event type as a placeholder --
-- the real handlers land once native invoicing/payments are built.
create table if not exists stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  -- Stripe delivers webhooks at-least-once, so the same event can
  -- arrive more than once (retries, a manual resend from the
  -- Dashboard). This unique constraint is the real dedup guard -- the
  -- webhook route treats a unique-violation insert as "already queued"
  -- rather than an error.
  stripe_event_id text not null unique,
  type text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  payload jsonb not null,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists stripe_webhook_events_status_idx
  on stripe_webhook_events (status, created_at);
