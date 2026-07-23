-- Phase 1 attribution: scan -> lead identity capture
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj -> SQL Editor).

-- Per-campaign toggle: does this QR/link show an identity capture step before redirecting?
alter table campaigns
  add column if not exists capture_leads boolean not null default false;

-- Link leads back to the scan/campaign that generated them.
alter table leads
  add column if not exists scan_id uuid references scans(id) on delete set null,
  add column if not exists campaign_id uuid references campaigns(id) on delete set null;

create index if not exists leads_scan_id_idx on leads(scan_id);
create index if not exists leads_campaign_id_idx on leads(campaign_id);
