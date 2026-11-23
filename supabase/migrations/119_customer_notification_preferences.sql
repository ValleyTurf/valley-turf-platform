-- Customer-chosen notification preferences, set from the portal
-- (/portal/notifications). notifications_opted_out (staff-set, blocks every
-- automated message) is unchanged and still wins over all of these.
-- Invoices, receipts and payment notices are always sent and have no setting.
alter table customers
  add column if not exists reminder_channel text not null default 'both'
    check (reminder_channel in ('both', 'text', 'email')),
  add column if not exists review_requests_enabled boolean not null default true,
  add column if not exists promotions_enabled boolean not null default true;
