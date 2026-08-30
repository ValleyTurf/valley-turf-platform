-- Native payments (Tier 1, Stage 5) -- records what the Stripe webhook
-- processor (lib/stripeWebhookProcessor.ts) observes for each
-- PaymentIntent tied to a native invoice (migration 043). One row per
-- PaymentIntent, upserted on stripe_payment_intent_id so retried webhook
-- deliveries (Stripe sends at-least-once) update the same row instead of
-- creating duplicates.
--
-- No native payouts/fee table yet -- that's Stage 6. The Stripe
-- processing fee this app actually pays isn't captured here (it lives on
-- the Charge's balance_transaction, which needs an extra expanded fetch)
-- -- Stage 6 is where that gets pulled in alongside payout reconciliation,
-- same shape as the existing jobber_payment_fees table.
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  -- Nullable + ON DELETE SET NULL, matching invoices.jobber_client_id's
  -- reasoning -- a payment row should survive even if something odd
  -- happens to the invoice it was for.
  invoice_id uuid references invoices(id) on delete set null,
  stripe_payment_intent_id text not null unique,
  stripe_checkout_session_id text,
  stripe_charge_id text,
  amount numeric(10, 2) not null default 0,
  -- "card" / "us_bank_account" -- from PaymentIntent.payment_method_types,
  -- not a controlled vocabulary beyond what Stripe sends.
  method text,
  status text not null default 'processing'
    check (status in ('processing', 'succeeded', 'failed', 'refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_invoice_id_idx on payments (invoice_id);
create index if not exists payments_status_idx on payments (status);
