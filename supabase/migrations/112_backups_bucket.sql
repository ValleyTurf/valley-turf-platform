-- Private storage bucket for the weekly data backup (migration 112).
-- Not public: files are only reachable through short-lived signed links
-- that the weekly backup job creates with the service role key.
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;
