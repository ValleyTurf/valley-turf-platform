-- Marks a lead as already sent the instant "we got your request" text and
-- email, so a retried request can never send it twice. See
-- lib/leadAck.ts.
alter table leads
  add column if not exists ack_sent_at timestamptz;
