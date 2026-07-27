-- Permission gate for the new native "Create Job" feature
-- (app/(platform)/jobs/new): lets staff create a job in Jobber directly
-- from this app for an existing customer, using the same jobCreate
-- mutation the accepted-quote conversion flow already proved out (see
-- 014_add_quote_job_conversion.sql, lib/jobberJob.ts).
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
      'jobs'
    )
  );

-- Default: same treatment as quotes — managers get it, staff starts
-- locked out. Both are editable afterward from Settings > Permissions.
insert into role_permissions (role, section, allowed) values
  ('manager', 'jobs', true),
  ('staff', 'jobs', false)
on conflict (role, section) do nothing;
