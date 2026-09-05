-- Lets inbound customer emails (contact_history.direction = 'inbound',
-- logged by the Resend webhook's email.received handler -- see
-- app/api/webhooks/resend/route.ts) be tracked as read/unread, the same
-- way portal_messages already tracks read_at for portal chat (migration
-- 023). Needed for the unified /messages inbox: a customer's reply
-- currently only ever showed up on their individual Customer page,
-- with nothing telling staff a new one arrived -- this column is what
-- lets the inbox (and a Sidebar badge) compute "N unread" the same way
-- it already does for portal chat.
--
-- Nullable, no default -- every existing row (and every future
-- automated outbound send) is simply never marked read/unread at all,
-- since only inbound rows are ever meant to carry a read_at value.
alter table contact_history add column if not exists read_at timestamptz;

-- Partial index: only inbound, unread rows are ever queried by this
-- column (both the inbox list and the unread-count badge filter on
-- exactly `direction = 'inbound' and read_at is null`) -- indexing the
-- other 90%+ of rows (outbound sends, already-read replies) would just
-- be dead weight.
create index if not exists contact_history_unread_inbound_idx
  on contact_history (jobber_client_id)
  where direction = 'inbound' and read_at is null;
