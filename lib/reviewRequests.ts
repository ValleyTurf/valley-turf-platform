// Tier 3 (Jobber Independence Roadmap) -- review requests. Built and
// wired per Ryan's request, but deliberately shipped OFF: this only ever
// sends anything once review_request_settings.enabled is flipped to
// true from Settings (defaults false, migration
// 055_add_visit_reminders_and_review_requests.sql). Two independent
// guards keep this quiet until Ryan is ready: the `enabled` flag itself,
// and a missing google_review_url (nothing to send customers to yet,
// even if enabled got flipped on by mistake before Ryan filled that in).
//
// Same overall shape as lib/visitReminders.ts -- a settings row, a dedup
// table, a day-offset computed in Phoenix local time -- just anchored on
// a visit's completion (end_at) counting forward instead of counting
// down to a future start_at.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { toPhoenixDateString } from "@/lib/phoenixDate";
import {
  sendReviewRequestSms,
  sendReviewRequestEmail,
} from "@/lib/notifications";

const BUSINESS_UTC_OFFSET = "-07:00";

type ReviewRequestSettings = {
  enabled: boolean;
  days_after_visit: number;
  google_review_url: string | null;
};

type CompletedVisit = {
  jobber_visit_id: string;
  jobber_client_id: string | null;
  customer_name: string | null;
  end_at: string | null;
};

type ReviewCustomer = {
  jobber_client_id: string;
  phone: string | null;
  email: string | null;
};

export type SendReviewRequestsResult = {
  enabled: boolean;
  visitsConsidered: number;
  requestsSent: number;
  errors: string[];
};

function addDaysToPhoenixDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export async function sendDueReviewRequests(): Promise<SendReviewRequestsResult> {
  const result: SendReviewRequestsResult = {
    enabled: false,
    visitsConsidered: 0,
    requestsSent: 0,
    errors: [],
  };

  const { data: settingsData, error: settingsError } = await supabaseServer
    .from("review_request_settings")
    .select("enabled, days_after_visit, google_review_url")
    .eq("id", 1)
    .maybeSingle();

  if (settingsError) {
    result.errors.push(`Couldn't load review request settings: ${settingsError.message}`);
    return result;
  }

  const settings = settingsData as ReviewRequestSettings | null;

  // The two guards described in the header comment. Neither is an
  // error -- this is the expected steady state until Ryan turns it on.
  if (!settings?.enabled || !settings.google_review_url) {
    return result;
  }

  result.enabled = true;
  const reviewUrl = settings.google_review_url;

  const todayPhoenix = toPhoenixDateString(new Date().toISOString());

  if (!todayPhoenix) {
    result.errors.push("Couldn't determine today's date in Phoenix time.");
    return result;
  }

  // A visit whose end_at falls on target date -- i.e. it happened
  // exactly days_after_visit days ago -- is due for a review request
  // today.
  const targetDate = addDaysToPhoenixDate(
    todayPhoenix,
    -settings.days_after_visit
  );
  const nextDate = addDaysToPhoenixDate(targetDate, 1);

  const { data: visitsData, error: visitsError } = await supabaseServer
    .from("jobber_visits")
    .select("jobber_visit_id, jobber_client_id, customer_name, end_at")
    .gte("end_at", `${targetDate}T00:00:00${BUSINESS_UTC_OFFSET}`)
    .lt("end_at", `${nextDate}T00:00:00${BUSINESS_UTC_OFFSET}`)
    .eq("visit_status", "COMPLETED")
    .not("jobber_client_id", "is", null);

  if (visitsError) {
    result.errors.push(`Couldn't load completed visits: ${visitsError.message}`);
    return result;
  }

  const visits = (visitsData ?? []) as CompletedVisit[];
  result.visitsConsidered = visits.length;

  if (visits.length === 0) {
    return result;
  }

  const visitIds = visits.map((v) => v.jobber_visit_id);
  const { data: alreadySentData, error: alreadySentError } =
    await supabaseServer
      .from("review_requests_sent")
      .select("jobber_visit_id")
      .in("jobber_visit_id", visitIds);

  if (alreadySentError) {
    result.errors.push(
      `Couldn't check already-sent review requests: ${alreadySentError.message}`
    );
    return result;
  }

  const alreadySent = new Set(
    (alreadySentData ?? []).map((row) => row.jobber_visit_id as string)
  );
  const pendingVisits = visits.filter((v) => !alreadySent.has(v.jobber_visit_id));

  if (pendingVisits.length === 0) {
    return result;
  }

  const clientIds = Array.from(
    new Set(pendingVisits.map((v) => v.jobber_client_id).filter(Boolean))
  ) as string[];

  const { data: customersData, error: customersError } = await supabaseServer
    .from("customers")
    .select("jobber_client_id, phone, email")
    .in("jobber_client_id", clientIds);

  if (customersError) {
    result.errors.push(
      `Couldn't load customer contact info: ${customersError.message}`
    );
    return result;
  }

  const customersById = new Map(
    ((customersData ?? []) as ReviewCustomer[]).map((c) => [
      c.jobber_client_id,
      c,
    ])
  );

  for (const visit of pendingVisits) {
    const customer = visit.jobber_client_id
      ? customersById.get(visit.jobber_client_id)
      : null;

    const phone = customer?.phone?.trim() || null;
    const email = customer?.email?.trim() || null;

    if (!phone && !email) {
      continue;
    }

    let delivered = false;

    if (phone) {
      const sent = await sendReviewRequestSms(
        phone,
        visit.customer_name,
        reviewUrl,
        visit.jobber_client_id
      );
      delivered = delivered || sent;
    }

    if (email) {
      const sent = await sendReviewRequestEmail(
        email,
        visit.customer_name,
        reviewUrl,
        visit.jobber_client_id
      );
      delivered = delivered || sent;
    }

    if (!delivered) {
      result.errors.push(
        `Review request delivery failed for visit ${visit.jobber_visit_id}.`
      );
      continue;
    }

    const { error: insertError } = await supabaseServer
      .from("review_requests_sent")
      .insert({ jobber_visit_id: visit.jobber_visit_id });

    if (insertError) {
      result.errors.push(
        `Review request sent but failed to record for visit ${visit.jobber_visit_id}: ${insertError.message}`
      );
    }

    result.requestsSent += 1;
  }

  return result;
}
