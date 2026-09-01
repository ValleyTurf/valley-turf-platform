-- Tier 1 Stage 8: push-only QuickBooks Online integration for NATIVE
-- invoices only. Jobber already has its own QuickBooks sync for
-- Jobber-created invoices (confirmed with Ryan) -- this only needs to
-- cover the gap Jobber's sync can't see: invoices created natively in
-- this app (lib/invoices.ts, Stage 3/7).
--
-- Mirrors lib/jobber.ts's token-storage pattern exactly: one row per
-- OAuth connection, newest row wins, a fresh row is inserted (not
-- updated in place) each time the token is refreshed so there's always
-- a history of what was issued when.
create table if not exists quickbooks_tokens (
  id uuid primary key default gen_random_uuid(),
  access_token text not null,
  refresh_token text not null,
  -- QuickBooks' company identifier -- every API call is scoped to
  -- /v3/company/{realm_id}/..., so this has to travel with the tokens,
  -- unlike Jobber (which has no equivalent "which company" concept for
  -- this app's single-tenant use).
  realm_id text not null,
  -- 'sandbox' | 'production' -- determines which API base URL to call
  -- (sandbox-quickbooks.api.intuit.com vs quickbooks.api.intuit.com).
  -- Testing against the sandbox company first per Ryan's explicit
  -- choice, switching this to 'production' (by reconnecting) once
  -- verified.
  environment text not null default 'sandbox'
    check (environment in ('sandbox', 'production')),
  created_at timestamptz not null default now()
);

-- Local mirror of the one QuickBooks "Service Item" every native
-- invoice line item maps to, per Ryan's choice to start with one
-- generic income account rather than per-service-category mapping.
-- Stored (not hardcoded) since its QuickBooks Id is only known after
-- lib/quickbooks.ts creates or finds it via the API on first use, and
-- differs between the sandbox and production companies.
create table if not exists quickbooks_settings (
  id uuid primary key default gen_random_uuid(),
  environment text not null unique
    check (environment in ('sandbox', 'production')),
  default_item_id text,
  default_item_name text,
  updated_at timestamptz not null default now()
);

-- Links a local customer to the matching QuickBooks Customer object,
-- created (or matched by name) the first time that customer gets a
-- native invoice pushed. Scoped per environment since a sandbox
-- company's customer Ids mean nothing in production.
alter table customers
  add column if not exists quickbooks_customer_id text,
  add column if not exists quickbooks_environment text;

-- Links a native invoice to the QuickBooks Invoice/Payment objects
-- created for it. Nullable throughout -- an invoice can exist here
-- before ever being pushed (push is best-effort/async relative to
-- invoice creation, same as the jobber_invoices mirror added in Stage 7),
-- and quickbooks_payment_id only gets set once the invoice is actually
-- paid.
alter table invoices
  add column if not exists quickbooks_invoice_id text,
  add column if not exists quickbooks_payment_id text,
  add column if not exists quickbooks_push_error text;
