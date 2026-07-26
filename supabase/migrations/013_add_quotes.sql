-- Native in-app quotes — the first piece of "build it here instead of
-- Jobber": a flat-price quote that can be created for either an existing
-- customer or a lead (a prospect who isn't a customer yet), shared with
-- them as a public link (/q/[token]), and accepted or declined by them
-- without needing an account. Deliberately flat-price for v1, not
-- itemized against materials/labor/equipment — see the app for the
-- fuller reasoning. Status changes (sent/accepted/declined) are manual;
-- accepting a quote does not automatically create any job-costing
-- records yet.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj
-- -> SQL Editor).

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  -- Human-friendly sequential number for display ("Quote #14"),
  -- separate from the public share token below.
  quote_number bigserial not null,

  -- Loosely linked (no hard FK to customers — same reasoning as the
  -- rest of this schema's jobber_client_id references: customer rows
  -- are synced/merged from Jobber, not something this table should be
  -- able to block or cascade against) to customers.jobber_client_id
  -- when quoting an existing customer.
  customer_id text,
  -- Real FK: leads is a table this app owns outright, so referential
  -- integrity is safe here. Set null (not cascade-deleted) so a quote
  -- survives the lead being deleted/converted.
  lead_id uuid references leads(id) on delete set null,

  -- Snapshot of who the quote is for, captured at creation time so the
  -- quote still reads correctly even if the linked customer/lead record
  -- later changes or is removed — a quote is a point-in-time document.
  recipient_name text not null,
  recipient_email text,
  recipient_phone text,
  recipient_address text,

  service_category text,
  description text not null,
  price_total numeric(10, 2) not null check (price_total >= 0),

  status text not null default 'draft' check (
    status in ('draft', 'sent', 'accepted', 'declined', 'expired')
  ),
  expires_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  response_note text,

  -- Unguessable token for the public /q/[token] share link. Not the
  -- same as id/quote_number specifically so the sequential number never
  -- has to appear in a URL.
  public_token text not null,

  created_by uuid references users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists quotes_public_token_idx
  on quotes (public_token);

create index if not exists quotes_customer_id_idx on quotes (customer_id);
create index if not exists quotes_lead_id_idx on quotes (lead_id);
create index if not exists quotes_status_idx on quotes (status);
create index if not exists quotes_created_at_idx on quotes (created_at desc);

-- Extend the existing Settings > Permissions section list (see
-- 012_add_manager_role.sql) with a 'quotes' section so admins can grant
-- or withhold Quotes access per role, same as every other feature area.
alter table role_permissions drop constraint if exists role_permissions_section_check;
alter table role_permissions add constraint role_permissions_section_check
  check (
    section in (
      'job_costing',
      'financials',
      'marketing_analytics',
      'customer_intelligence',
      'settings_audit',
      'quotes'
    )
  );

-- Default: managers get it (it's an operational sales tool, same
-- treatment as job_costing/marketing_analytics/customer_intelligence),
-- staff starts locked out like everything else. Both are editable
-- afterward from Settings > Permissions.
insert into role_permissions (role, section, allowed) values
  ('manager', 'quotes', true),
  ('staff', 'quotes', false)
on conflict (role, section) do nothing;
