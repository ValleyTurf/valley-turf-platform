-- Tracks failed login attempts per email so /api/login can lock out
-- brute-force attempts. Keyed by email (not user id) so lookups behave
-- identically whether or not the email belongs to a real account.
create table if not exists login_attempts (
  email text primary key,
  failed_count integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
