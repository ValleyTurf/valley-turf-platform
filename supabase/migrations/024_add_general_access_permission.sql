-- Permission gate for everything that used to be open to every logged-in
-- role simply because nothing gated it: Dashboard, Schedule, Recurring
-- Services, Customer Map, Customers, Leads, Links & QR, and Log Job
-- Costs. See lib/permissionRules.ts's general_access entry for the full
-- reasoning. My Day and Timeclock are deliberately NOT covered by this
-- (or any) section — they stay open to every role.
--
-- Also folds in a fix that's been latent since 023_add_customer_portal.sql:
-- that migration added the 'customer_portal' PermissionSection in code
-- (lib/permissionRules.ts) and wired up Settings > Permissions to let an
-- admin toggle it, but never updated this table's CHECK constraint to
-- allow the value — so saving customer_portal for any role has been
-- silently failing (constraint violation) since that feature shipped.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj
-- -> SQL Editor).

alter table role_permissions drop constraint if exists role_permissions_section_check;
alter table role_permissions add constraint role_permissions_section_check
  check (
    section in (
      'job_costing',
      'financials',
      'marketing_analytics',
      'customer_intelligence',
      'settings_audit',
      'quotes',
      'jobs',
      'customer_portal',
      'general_access'
    )
  );

-- Default: managers keep exactly the access they already have today
-- (nothing changes for them). Staff starts locked out, matching "staff
-- should only see My Day and Timeclock." Both are editable afterward
-- from Settings > Permissions.
insert into role_permissions (role, section, allowed) values
  ('manager', 'general_access', true),
  ('staff', 'general_access', false)
on conflict (role, section) do nothing;
