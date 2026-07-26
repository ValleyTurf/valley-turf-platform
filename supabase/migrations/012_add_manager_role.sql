-- Adds a third "manager" role tier between admin and staff, plus an
-- editable table controlling which of a handful of admin-gated feature
-- groups ("sections") each of manager/staff can see. Admin is
-- deliberately NOT represented in this table — admin always has full
-- access, hardcoded in application code, so nobody can lock every admin
-- out by fat-fingering a checkbox.
--
-- Two things stay permanently admin-only regardless of what's configured
-- here, because they're a different risk class than "view a reporting
-- page": Team (create/edit logins, reset passwords) and the full data
-- Backup export. Those are enforced directly in code (lib/permissions.ts,
-- team/actions.ts, api/backup/export), not via this table.
--
-- Run this once in the Supabase SQL editor.

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('admin', 'manager', 'staff'));

create table if not exists role_permissions (
  role text not null check (role in ('manager', 'staff')),
  section text not null check (
    section in (
      'job_costing',
      'financials',
      'marketing_analytics',
      'customer_intelligence',
      'settings_audit'
    )
  ),
  allowed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (role, section)
);

-- Seed defaults. Manager gets everything except Financials (Revenue,
-- Profitability Alerts); staff stays locked out of all of it, matching
-- today's behavior. All of this is editable afterward from
-- Settings > Permissions.
insert into role_permissions (role, section, allowed) values
  ('manager', 'job_costing', true),
  ('manager', 'financials', false),
  ('manager', 'marketing_analytics', true),
  ('manager', 'customer_intelligence', true),
  ('manager', 'settings_audit', true),
  ('staff', 'job_costing', false),
  ('staff', 'financials', false),
  ('staff', 'marketing_analytics', false),
  ('staff', 'customer_intelligence', false),
  ('staff', 'settings_audit', false)
on conflict (role, section) do nothing;
