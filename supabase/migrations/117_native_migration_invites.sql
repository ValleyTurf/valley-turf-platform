-- Moving customers from paying through Jobber to paying natively
-- (/invoices/migration). One row per "save your card" invite sent, so the
-- Migration page can show who was invited and when, avoid re-texting someone
-- too soon, and mark the moment a customer's card was saved and they were
-- switched to native invoicing (switched_at).
create table if not exists native_migration_invites (
  id uuid primary key default gen_random_uuid(),
  jobber_client_id text not null,
  channel text not null check (channel in ('sms', 'email')),
  sent_by_name text,
  sent_at timestamptz not null default now(),
  -- Set when the customer saved a card and was switched to native.
  switched_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists native_migration_invites_client_idx
  on native_migration_invites (jobber_client_id, sent_at desc);
