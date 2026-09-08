// Visit confirmation -- see migration 061_add_visit_confirmation.sql's
// header comment for the full schema reasoning. Two jobs:
//
//   1. getOrCreateConfirmationToken() -- called from lib/visitReminders.ts
//      right before sending a reminder, so the link in that message
//      always has somewhere to go.
//   2. confirmVisitByToken() -- called from the public /confirm/[token]
//      page's Server Action when the customer clicks Confirm.
import "server-only";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabase-server";

export type ConfirmableVisit = {
  jobber_visit_id: string;
  customer_name: string | null;
  title: string | null;
  start_at: string | null;
  confirmed_at: string | null;
};

// Reused across both the 4-day and 2-day reminder for the same visit --
// generated once, on whichever reminder fires first, rather than a fresh
// token per send. A customer who confirms off the 4-day text shouldn't
// need to do it again when the 2-day one arrives (the link just lands on
// an "already confirmed" page at that point).
export async function getOrCreateConfirmationToken(
  jobberVisitId: string
): Promise<string | null> {
  const { data: existing, error: lookupError } = await supabaseServer
    .from("jobber_visits")
    .select("confirmation_token")
    .eq("jobber_visit_id", jobberVisitId)
    .maybeSingle();

  if (lookupError) {
    console.error(
      `getOrCreateConfirmationToken: lookup failed for ${jobberVisitId}:`,
      lookupError.message
    );
    return null;
  }

  if (existing?.confirmation_token) {
    return existing.confirmation_token as string;
  }

  const token = randomUUID();

  const { error: updateError } = await supabaseServer
    .from("jobber_visits")
    .update({ confirmation_token: token })
    .eq("jobber_visit_id", jobberVisitId);

  if (updateError) {
    console.error(
      `getOrCreateConfirmationToken: failed to save token for ${jobberVisitId}:`,
      updateError.message
    );
    return null;
  }

  return token;
}

export async function getVisitByConfirmationToken(
  token: string
): Promise<ConfirmableVisit | null> {
  const { data, error } = await supabaseServer
    .from("jobber_visits")
    .select("jobber_visit_id, customer_name, title, start_at, confirmed_at")
    .eq("confirmation_token", token)
    .maybeSingle();

  if (error) {
    console.error(`getVisitByConfirmationToken failed for ${token}:`, error.message);
    return null;
  }

  return (data as ConfirmableVisit | null) ?? null;
}

export async function confirmVisitByToken(
  token: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabaseServer
    .from("jobber_visits")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("confirmation_token", token)
    .select("jobber_visit_id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!data) {
    return { ok: false, error: "This confirmation link doesn't match a visit we have on file." };
  }

  return { ok: true };
}
