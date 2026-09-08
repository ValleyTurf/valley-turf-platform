-- Daily ops digest (Ryan's request) -- a single settings row, same
-- singleton-with-id=1 pattern as review_request_settings
-- (055_add_visit_reminders_and_review_requests.sql), holding who gets
-- the email and whether it's on at all. recipient_emails is a plain
-- text[] rather than a separate table since this is just a short admin
-- distribution list, not something with its own lifecycle worth
-- normalizing out.
create table if not exists daily_digest_settings (
  id integer primary key default 1,
  enabled boolean not null default true,
  recipient_emails text[] not null default '{}'::text[],
  updated_at timestamptz not null default now(),
  constraint daily_digest_settings_singleton check (id = 1)
);

insert into daily_digest_settings (id, enabled, recipient_emails)
values (1, true, array['ryanbrittgordon@gmail.com'])
on conflict (id) do nothing;
