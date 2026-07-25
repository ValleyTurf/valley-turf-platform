import { supabaseServer } from "@/lib/supabase-server";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

type LoginAttemptRow = {
  email: string;
  failed_count: number;
  locked_until: string | null;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Returns how many minutes remain before this email may try to log in
 * again, or null if it isn't currently locked out.
 */
export async function getLockoutMinutesRemaining(
  email: string
): Promise<number | null> {
  const normalized = normalizeEmail(email);

  const { data } = await supabaseServer
    .from("login_attempts")
    .select("email, failed_count, locked_until")
    .eq("email", normalized)
    .maybeSingle();

  const row = data as LoginAttemptRow | null;

  if (!row || !row.locked_until) {
    return null;
  }

  const lockedUntil = new Date(row.locked_until).getTime();
  const remainingMs = lockedUntil - Date.now();

  if (remainingMs <= 0) {
    return null;
  }

  return Math.ceil(remainingMs / (60 * 1000));
}

/**
 * Call after a failed password check. Increments the failure count for
 * this email and locks it out once it crosses the threshold.
 */
export async function recordFailedLoginAttempt(
  email: string
): Promise<void> {
  const normalized = normalizeEmail(email);

  const { data } = await supabaseServer
    .from("login_attempts")
    .select("failed_count")
    .eq("email", normalized)
    .maybeSingle();

  const currentCount = (data as { failed_count: number } | null)
    ?.failed_count ?? 0;
  const nextCount = currentCount + 1;

  const lockedUntil =
    nextCount >= MAX_FAILED_ATTEMPTS
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
      : null;

  await supabaseServer.from("login_attempts").upsert({
    email: normalized,
    failed_count: lockedUntil ? 0 : nextCount,
    locked_until: lockedUntil,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Call after a successful login to clear any accumulated failures.
 */
export async function clearLoginAttempts(email: string): Promise<void> {
  const normalized = normalizeEmail(email);

  await supabaseServer
    .from("login_attempts")
    .delete()
    .eq("email", normalized);
}
