-- Twilio rejected the A2P 10DLC campaign (error 30925): the
-- /request-quote form showed SMS disclosure as plain text under the
-- phone field, but had no distinct, unchecked-by-default checkbox
-- requiring the visitor to actively opt in. This adds columns to record
-- that a real checkbox was checked, and when -- both to satisfy the
-- "clear affirmative consent" requirement and to keep evidence on file
-- in case Twilio (or a carrier) ever asks for it again.
alter table leads
  add column if not exists sms_consent boolean not null default false,
  add column if not exists sms_consent_at timestamptz;
