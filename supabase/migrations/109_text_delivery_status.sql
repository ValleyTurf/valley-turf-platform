-- Text delivery tracking. Until now the app only knew a text was handed
-- to Twilio ("sent"), not whether the customer's carrier delivered it --
-- an invoice text to a customer was blocked by the carrier (error 30007)
-- and nobody found out. Twilio now reports back to
-- /api/webhooks/twilio-status for every customer text, and the result
-- lands on the contact_history row for that message.
alter table contact_history
  add column if not exists twilio_sid text,
  add column if not exists delivery_status text,
  add column if not exists delivery_error_code text,
  add column if not exists delivery_updated_at timestamptz,
  -- Set once an email copy has been sent because the text failed, so a
  -- repeat status callback never emails the customer twice.
  add column if not exists delivery_fallback_at timestamptz;

create unique index if not exists contact_history_twilio_sid_idx
  on contact_history (twilio_sid)
  where twilio_sid is not null;

create index if not exists contact_history_failed_texts_idx
  on contact_history (created_at desc)
  where delivery_status in ('failed', 'undelivered');
