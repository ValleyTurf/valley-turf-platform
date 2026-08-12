-- Tracks whether the "we're on our way" text has already gone out to the
-- customer for a given visit (app/(platform)/my-day/actions.ts's
-- sendOnMyWay). One column on jobber_visits rather than a separate table
-- since this is a single yes/no-plus-timestamp fact about one visit, same
-- shape as the existing completed_at column.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj
-- -> SQL Editor).

alter table jobber_visits
  add column if not exists on_way_sent_at timestamptz;
