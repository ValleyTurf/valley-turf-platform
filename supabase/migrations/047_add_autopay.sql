-- Native autopay (Tier 1, prerequisite before Stage 7's real /invoices
-- cutover -- see the "Build native autopay + SMS delivery first"
-- decision). One row per Jobber client that has ever started an autopay
-- enrollment, tracking their saved Stripe card and whether autopay is
-- currently on.
--
-- stripe_customer_id/stripe_payment_method_id are nullable: a row can
-- exist before either is populated -- e.g. a staff-generated enrollment
-- link (app/autopay/[token]) creates the row (for its token) before the
-- customer has actually completed the Stripe setup Checkout Session and
-- saved a card. autopay_enabled only ever flips true once a payment
-- method is actually attached (see lib/autopay.ts).
create table if not exists customer_payment_methods (
  id uuid primary key default gen_random_uuid(),
  jobber_client_id text not null unique,
  stripe_customer_id text,
  stripe_payment_method_id text,
  card_brand text,
  card_last4 text,
  autopay_enabled boolean not null default false,
  -- Unguessable token for the staff-shared public enrollment link
  -- (app/autopay/[token]) -- same trust model as invoices.public_token
  -- and quotes.public_token. Nullable: a row created purely from the
  -- customer portal flow (which identifies the client via their portal
  -- session, not a token) never needs one.
  enrollment_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_payment_methods_client_idx
  on customer_payment_methods (jobber_client_id);
