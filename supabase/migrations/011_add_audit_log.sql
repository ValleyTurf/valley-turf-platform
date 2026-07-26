-- Audit trail: who changed what, across the sensitive parts of the OS
-- (team pay/roles, campaign spend, overhead costs, materials/equipment/
-- labor rates, customer profiles). Run this once in the Supabase SQL
-- editor (Project vasskxstyvshfiwgpuxj -> SQL Editor).

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),

  -- Nullable + set-null-on-delete so a deleted user's history doesn't
  -- disappear or block the delete — actor_name/actor_email are captured
  -- at write time precisely so the log still reads fine after that.
  actor_id uuid references users(id) on delete set null,
  actor_name text,
  actor_email text,

  action text not null check (action in ('create', 'update', 'delete')),
  entity_type text not null,
  entity_id text,
  entity_label text,

  -- { field: { before, after } } for updates, or the full (redacted)
  -- record for creates/deletes. Sensitive fields (password_hash, etc.)
  -- are redacted before this ever reaches the database.
  changes jsonb,

  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx
  on audit_log (created_at desc);

create index if not exists audit_log_entity_type_idx
  on audit_log (entity_type);

create index if not exists audit_log_actor_id_idx
  on audit_log (actor_id);
