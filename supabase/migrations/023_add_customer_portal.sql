-- Customer self-service portal: view jobs/visits, view + pay invoices
-- (via Jobber's own hosted invoice page — we never touch card data),
-- submit a service request, and message the office.
--
-- jobberWebUri has actually been queried from Jobber by sync-invoices.ts
-- since it was first written, but formatInvoice() never mapped it into
-- the upsert, so it was silently discarded. Backfilling requires a
-- re-run of /api/jobber/sync-invoices after this migration + the code
-- change land.
alter table jobber_invoices
  add column if not exists jobber_web_uri text;

-- One-time magic-link sign-in tokens. Same unguessable-token trust model
-- as quotes.public_token, but single-use (used_at) and short-lived
-- (expires_at) since this grants a full portal session, not just a view
-- of one quote.
create table if not exists portal_login_tokens (
  token text primary key,
  jobber_client_id text not null,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists portal_login_tokens_client_idx
  on portal_login_tokens (jobber_client_id);

-- A customer asking for new/additional work through the portal. This is
-- deliberately NOT wired to auto-create a Jobber job — it's a request
-- for staff to review and follow up on, same spirit as a phone call.
create table if not exists portal_service_requests (
  id uuid primary key default gen_random_uuid(),
  jobber_client_id text not null,
  customer_name text,
  email text,
  phone text,
  message text not null,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_service_requests_client_idx
  on portal_service_requests (jobber_client_id);

create index if not exists portal_service_requests_status_idx
  on portal_service_requests (status);

-- A simple two-way message thread per customer (portal customer <->
-- office staff), not per-conversation/per-topic — small business volume
-- doesn't need anything more structured than "everything with this
-- customer, in order."
create table if not exists portal_messages (
  id uuid primary key default gen_random_uuid(),
  jobber_client_id text not null,
  sender text not null check (sender in ('customer', 'staff')),
  sender_name text,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists portal_messages_client_idx
  on portal_messages (jobber_client_id);
