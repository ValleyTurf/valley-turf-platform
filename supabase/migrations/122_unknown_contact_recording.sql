-- Voicemail from a caller who is not a saved customer: keep the Twilio
-- recording id so the Unknown senders list can play it.
alter table unknown_contacts add column if not exists recording_sid text;
