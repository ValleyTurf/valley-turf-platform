-- Unified customer contact history: every outbound email/SMS this app
-- sends to a customer, plus manually-logged phone calls. Portal chat
-- (portal_messages, migration 023) is NOT duplicated in here -- it
-- already has its own table with everything needed (sender, body,
-- created_at), so the Customer page's contact history view reads both
-- tables and merges them into one timeline in application code instead
-- of copying rows around.
--
-- Deliberately does NOT log the internal staff alerts in
-- lib/notifications.ts (sendNewLeadAlerts) -- those go to Ryan/the
-- office, not to a customer, so they don't belong in a customer's
-- contact history.
create table if not exists contact_history (
  id uuid primary key default gen_random_uuid(),
  -- Nullable + ON DELETE SET NULL, same convention as every other table
  -- that references a customer by jobber_client_id (invoices,
  -- jobber_jobs, etc.) -- customer rows are never hard-deleted in this
  -- app, but this stays defensive rather than assuming that never
  -- changes.
  jobber_client_id text references customers(jobber_client_id) on delete set null,
  channel text not null check (channel in ('email', 'sms', 'call')),
  direction text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  -- Short label for the timeline row, e.g. "Visit Reminder", "On My Way",
  -- "Invoice Sent", "Phone Call". Not a foreign key to anything -- this
  -- is a display string, not a structured type.
  subject text,
  -- The actual message body (SMS text, email summary) or, for a manual
  -- call log, the notes staff typed up after the call.
  summary text,
  -- Optional loose link back to what this message was about (e.g.
  -- related_type='invoice', related_id=invoices.id) -- not a real FK
  -- since related_type varies, just enough for a future "view related
  -- record" link if ever needed. Unused by the initial UI.
  related_type text,
  related_id text,
  -- Resend's own message id (returned in the send API's response body),
  -- used to correlate later webhook events (delivered/opened/bounced)
  -- back to this row. Unique but nullable -- only ever set for
  -- channel='email' rows; sms/call rows never have one.
  resend_email_id text unique,
  delivered_at timestamptz,
  opened_at timestamptz,
  -- Only set for manually-logged calls -- every automated email/sms row
  -- is "sent by the system," not a specific staff member.
  created_by_user_id uuid references users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists contact_history_client_idx
  on contact_history (jobber_client_id);

create index if not exists contact_history_resend_email_id_idx
  on contact_history (resend_email_id);
