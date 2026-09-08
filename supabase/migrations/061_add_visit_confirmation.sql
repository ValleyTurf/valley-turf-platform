-- Visit confirmation -- Ryan wants customers to be able to confirm an
-- upcoming visit from the reminder text/email (see the rewritten
-- sendVisitReminderSms/Email in lib/notifications.ts), with a
-- checkmark showing up on Schedule/My Day once they have.
--
-- Both columns live directly on jobber_visits, same as job_status
-- (migration 051) -- one confirmation per visit, no reason for a
-- separate table.
--
-- confirmation_token is generated lazily (lib/visitConfirmation.ts's
-- getOrCreateConfirmationToken), the first time a reminder actually
-- goes out for a visit, and reused for both the 4-day and 2-day
-- reminder -- one link works either time it's clicked, and confirming
-- from either message marks the same visit.
--
-- confirmed_at is cleared (not the token) whenever a visit is
-- rescheduled to a new date/time (schedule/actions.ts's rescheduleVisit)
-- -- an old confirmation shouldn't silently carry over to a different
-- date. Known gap: a reschedule made directly in Jobber (not through
-- this app) round-trips through the bulk sync-visits route, which
-- doesn't currently compare old vs. new start_at, so it won't clear
-- confirmed_at. Revisit if that turns out to matter in practice.
alter table jobber_visits
  add column if not exists confirmation_token text,
  add column if not exists confirmed_at timestamptz;

create unique index if not exists jobber_visits_confirmation_token_idx
  on jobber_visits (confirmation_token)
  where confirmation_token is not null;
