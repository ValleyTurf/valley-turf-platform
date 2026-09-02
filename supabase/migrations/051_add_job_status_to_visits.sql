-- Fixes a real bug: canceling a job directly in Jobber's own UI (not
-- through this app) only fires a JOB_UPDATE webhook -- it does NOT touch
-- or destroy the job's individual visits, so their jobber_visits rows
-- (and visit_status) are left completely untouched, forever "upcoming."
-- Confirmed live: three customers' canceled jobs (job_status flipped to
-- 'archived' in jobber_jobs, synced correctly) still had every future
-- visit sitting in jobber_visits with visit_status = 'upcoming' and an
-- updated_at from weeks earlier, so they kept showing up on
-- /schedule, /my-day, and /crew-status as if nothing had changed.
--
-- Fix: denormalize the parent job's job_status onto jobber_visits itself,
-- kept fresh by every sync path (see app/api/jobber/sync-visits/route.ts,
-- lib/jobberWebhookProcessor.ts's syncSingleVisit AND syncSingleJob, and
-- app/api/jobber/sync-jobs/route.ts) so the "what's actually coming up"
-- pages can filter out archived-job visits without needing a live join.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj
-- -> SQL Editor).
alter table jobber_visits
  add column if not exists job_status text;

-- One-time backfill: without this, the fix above only prevents the
-- problem going forward -- these specific rows (and any other already-
-- stale ones) would sit wrong until their next full visit sync. This
-- copies the current job_status straight from jobber_jobs for every
-- visit that already has one on file.
update jobber_visits v
set job_status = j.job_status
from jobber_jobs j
where v.jobber_job_id = j.jobber_job_id
  and v.job_status is distinct from j.job_status;
