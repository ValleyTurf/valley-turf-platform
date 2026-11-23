// Reads and writes customers' notification preferences (migration 119).
// Every read here fails open: if the columns are not there yet (migration
// not run) or a query errors, callers get the defaults, so a preference
// problem can never stop reminders, review requests or campaigns.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import {
  DEFAULT_PREFS,
  parseReminderChannel,
  type NotificationPrefs,
} from "@/lib/notificationPrefsLogic";

type PrefsRow = {
  jobber_client_id: string;
  reminder_channel: string | null;
  review_requests_enabled: boolean | null;
  promotions_enabled: boolean | null;
};

function toPrefs(row: PrefsRow | null | undefined): NotificationPrefs {
  if (!row) return DEFAULT_PREFS;
  return {
    reminderChannel: parseReminderChannel(row.reminder_channel),
    reviewRequestsEnabled: row.review_requests_enabled !== false,
    promotionsEnabled: row.promotions_enabled !== false,
  };
}

export async function loadNotificationPrefs(
  jobberClientIds: string[]
): Promise<Map<string, NotificationPrefs>> {
  const result = new Map<string, NotificationPrefs>();
  if (jobberClientIds.length === 0) return result;

  const { data, error } = await supabaseServer
    .from("customers")
    .select("jobber_client_id, reminder_channel, review_requests_enabled, promotions_enabled")
    .in("jobber_client_id", jobberClientIds);

  if (error) {
    console.error("Failed to load notification preferences (using defaults):", error.message);
    return result;
  }

  for (const row of (data ?? []) as PrefsRow[]) {
    result.set(row.jobber_client_id, toPrefs(row));
  }
  return result;
}

export function prefsFor(
  map: Map<string, NotificationPrefs>,
  jobberClientId: string | null
): NotificationPrefs {
  return (jobberClientId ? map.get(jobberClientId) : undefined) ?? DEFAULT_PREFS;
}

// Customers who turned promotions off, for excluding from campaigns.
export async function listPromotionsOptedOut(): Promise<Set<string>> {
  const { data, error } = await supabaseServer
    .from("customers")
    .select("jobber_client_id")
    .eq("promotions_enabled", false);

  if (error) {
    console.error("Failed to load promotions opt-outs (none excluded):", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((row) => row.jobber_client_id as string));
}

export async function savePortalPrefs(
  jobberClientId: string,
  prefs: NotificationPrefs
): Promise<boolean> {
  const { error } = await supabaseServer
    .from("customers")
    .update({
      reminder_channel: prefs.reminderChannel,
      review_requests_enabled: prefs.reviewRequestsEnabled,
      promotions_enabled: prefs.promotionsEnabled,
    })
    .eq("jobber_client_id", jobberClientId);

  if (error) {
    console.error("Failed to save notification preferences:", error.message);
    return false;
  }
  return true;
}
