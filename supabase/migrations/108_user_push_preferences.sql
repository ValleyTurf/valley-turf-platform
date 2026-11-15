-- Per-person push notification settings (ROADMAP "Top 10 (November
-- 2026)" #9). Push used to be one switch per device for one kind of
-- event (a customer message). With more kinds being added (unknown
-- senders, missed calls, payments received, low ratings), each person
-- needs to be able to turn individual kinds off.
--
-- Stored as the list of kinds a user has turned OFF rather than a
-- column per kind: no row (or an empty list) means "everything on",
-- which is the right default for someone who just enabled
-- notifications, and adding a new kind later needs no migration.
--
-- Run this once in the Supabase SQL editor (Project
-- vasskxstyvshfiwgpuxj -> SQL Editor). Safe to re-run.
create table if not exists user_push_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  disabled_kinds text[] not null default '{}',
  updated_at timestamptz not null default now()
);
