// Tier 3 (Jobber Independence Roadmap, "customer-facing gaps") --
// pre-visit reminders. Sent by app/api/visits/send-reminders' daily
// cron, which just calls sendDueVisitReminders() below and reports the
// result. See migration 055_add_visit_reminders_and_review_requests.sql
// for the schema: visit_reminder_rules (which day-offsets are active --
// Ryan's default is 4 days and 2 days before a visit, both editable from
// Settings) and visit_reminders_sent (per-visit, per-rule dedup so a
// cron run that overlaps a prior one, or a rule matching the same visit
// twice, can't double-text a customer).
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { toPhoenixDateString } from "@/lib/phoenixDate";
import { sendVisitReminderSms, sendVisitReminderEmail } from "@/lib/notifications";
import { getNotificationRecipients } from "@/lib/customerContacts";
import { getOrCreateConfirmationToken } from "@/lib/visitConfirmation";
import { getBaseUrl } from "@/lib/baseUrl";

// Same fixed-offset assumption made throughout this app (lib/nativeJobs.ts's
// BUSINESS_UTC_OFFSET, lib/payPeriods.ts) -- Phoenix doesn't observe DST,
// so "-07:00" is always correct, not just usually.
const BUSINESS_UTC_OFFSET = "-07:00";

type ReminderRule = {
  id: string;
  days_before: number;
};

type ReminderVisit = {
  jobber_visit_id: string;
  jobber_client_id: string | null;
  customer_name: string | null;
  title: string | null;
  start_at: string | null;
};

type ReminderCustomer = {
  jobber_client_id: string;
  phone: string | null;
  email: string | null;
};

export type SendRemindersResult = {
  rulesProcessed: number;
  visitsConsidered: number;
  remindersSent: number;
  errors: string[];
};

function addDaysToPhoenixDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function formatVisitDateLabel(startAt: string | null): string {
  if (!startAt) return "your scheduled date";

  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return "your scheduled date";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export async function sendDueVisitReminders(): Promise<SendRemindersResult> {
  const result: SendRemindersResult = {
    rulesProcessed: 0,
    visitsConsidered: 0,
    remindersSent: 0,
    errors: [],
  };

  const { data: rulesData, error: rulesError } = await supabaseServer
    .from("visit_reminder_rules")
    .select("id, days_before")
    .eq("enabled", true);

  if (rulesError) {
    result.errors.push(`Couldn't load reminder rules: ${rulesError.message}`);
    return result;
  }

  const rules = (rulesData ?? []) as ReminderRule[];
  const todayPhoenix = toPhoenixDateString(new Date().toISOString());

  if (!todayPhoenix) {
    result.errors.push("Couldn't determine today's date in Phoenix time.");
    return result;
  }

  for (const rule of rules) {
    result.rulesProcessed += 1;

    const targetDate = addDaysToPhoenixDate(todayPhoenix, rule.days_before);
    const nextDate = addDaysToPhoenixDate(targetDate, 1);

    const { data: visitsData, error: visitsError } = await supabaseServer
      .from("jobber_visits")
      .select("jobber_visit_id, jobber_client_id, customer_name, title, start_at")
      .gte("start_at", `${targetDate}T00:00:00${BUSINESS_UTC_OFFSET}`)
      .lt("start_at", `${nextDate}T00:00:00${BUSINESS_UTC_OFFSET}`)
      // Same archived-job filter used by schedule/my-day/crew-status
      // (see 051_add_job_status_to_visits.sql) -- a visit belonging to a
      // closed-out job shouldn't get a reminder.
      .or("job_status.is.null,job_status.neq.archived")
      .not("jobber_client_id", "is", null)
      // Ryan asked (2026-09-11): once a customer confirms off whichever
      // reminder reaches them first (usually the 4-day), don't bother
      // them with the next one too (usually the 2-day) -- confirmed_at
      // is shared across every rule for this visit (see
      // getOrCreateConfirmationToken's comment in lib/visitConfirmation.ts),
      // so this one filter covers any rule ordering, not just 4-then-2.
      .is("confirmed_at", null);

    if (visitsError) {
      result.errors.push(
        `Couldn't load visits for the ${rule.days_before}-day rule: ${visitsError.message}`
      );
      continue;
    }

    const visits = (visitsData ?? []) as ReminderVisit[];
    result.visitsConsidered += visits.length;

    if (visits.length === 0) {
      continue;
    }

    // Dedup: which of these (visit, rule) pairs already went out. Batched
    // per rule rather than per visit -- one query instead of N.
    const visitIds = visits.map((v) => v.jobber_visit_id);
    const { data: alreadySentData, error: alreadySentError } =
      await supabaseServer
        .from("visit_reminders_sent")
        .select("jobber_visit_id")
        .eq("days_before", rule.days_before)
        .in("jobber_visit_id", visitIds);

    if (alreadySentError) {
      result.errors.push(
        `Couldn't check already-sent reminders for the ${rule.days_before}-day rule: ${alreadySentError.message}`
      );
      continue;
    }

    const alreadySent = new Set(
      (alreadySentData ?? []).map((row) => row.jobber_visit_id as string)
    );
    const pendingVisits = visits.filter(
      (v) => !alreadySent.has(v.jobber_visit_id)
    );

    if (pendingVisits.length === 0) {
      continue;
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
        `Couldn't load customer contact info for the ${rule.days_before}-day rule: ${customersError.message}`
      );
      continue;
    }

    const customersById = new Map(
      ((customersData ?? []) as ReminderCustomer[]).map((c) => [
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

      // Fans out to any additional customer_contacts flagged
      // receives_notifications (migration 060), alongside the primary
      // phone/email looked up above.
      const recipients = visit.jobber_client_id
        ? await getNotificationRecipients(visit.jobber_client_id, email, phone)
        : { emails: email ? [email] : [], phones: phone ? [phone] : [] };

      const dateLabel = formatVisitDateLabel(visit.start_at);

      // Reused across both the 4-day and 2-day reminder for this same
      // visit (migration 061) -- generated once, on whichever fires
      // first. null just means the confirm link is skipped; the rest of
      // the reminder still goes out rather than failing entirely.
      const confirmToken = await getOrCreateConfirmationToken(visit.jobber_visit_id);
      const baseUrl = await getBaseUrl();
      const confirmUrl = confirmToken ? `${baseUrl}/confirm/${confirmToken}` : `${baseUrl}/confirm`;

      let delivered = false;

      for (const toPhone of recipients.phones) {
        const sent = await sendVisitReminderSms(
          toPhone,
          visit.customer_name,
          dateLabel,
          confirmUrl,
          visit.jobber_client_id
        );
        delivered = delivered || sent;
      }

      for (const toEmail of recipients.emails) {
        const sent = await sendVisitReminderEmail(
          toEmail,
          visit.customer_name,
          dateLabel,
          confirmUrl,
          visit.jobber_client_id
        );
        delivered = delivered || sent;
      }

      if (!delivered) {
        result.errors.push(
          `Reminder delivery failed for visit ${visit.jobber_visit_id} (${rule.days_before}-day rule).`
        );
        continue;
      }

      // Recorded regardless of which channel(s) actually succeeded --
      // same "mark sent once delivery was attempted" reasoning as
      // /invoices' actions.ts, so a customer with no working phone but a
      // working email (or vice versa) doesn't get re-texted daily until
      // the failing channel is fixed.
      const { error: insertError } = await supabaseServer
        .from("visit_reminders_sent")
        .insert({
          jobber_visit_id: visit.jobber_visit_id,
          days_before: rule.days_before,
        });

      if (insertError) {
        result.errors.push(
          `Reminder sent but failed to record for visit ${visit.jobber_visit_id}: ${insertError.message}`
        );
      }

      result.remindersSent += 1;
    }
  }

  return result;
}

export type PendingRemindersPreview = {
  count: number;
  sample: string[];
};

// Read-only preview of what today's send-reminders cron (this same file's
// sendDueVisitReminders, running later the same morning -- see
// vercel.json, both anchored to Phoenix 7-8am) is about to actually send.
// Ryan asked for this in the daily digest so he can see who's getting a
// reminder before it goes out. Deliberately duplicates the rule ->
// target-date -> pending-visit query above rather than sharing it with
// sendDueVisitReminders, so a bug in this read-only preview path can
// never affect the real send.
export async function previewPendingVisitReminders(): Promise<PendingRemindersPreview> {
  const { data: rulesData, error: rulesError } = await supabaseServer
    .from("visit_reminder_rules")
    .select("id, days_before")
    .eq("enabled", true);

  if (rulesError) {
    return { count: 0, sample: [] };
  }

  const rules = (rulesData ?? []) as ReminderRule[];
  const todayPhoenix = toPhoenixDateString(new Date().toISOString());

  if (!todayPhoenix || rules.length === 0) {
    return { count: 0, sample: [] };
  }

  const lines: string[] = [];
  let count = 0;

  for (const rule of rules) {
    const targetDate = addDaysToPhoenixDate(todayPhoenix, rule.days_before);
    const nextDate = addDaysToPhoenixDate(targetDate, 1);

    const { data: visitsData } = await supabaseServer
      .from("jobber_visits")
      .select("jobber_visit_id, jobber_client_id, customer_name, title, start_at")
      .gte("start_at", `${targetDate}T00:00:00${BUSINESS_UTC_OFFSET}`)
      .lt("start_at", `${nextDate}T00:00:00${BUSINESS_UTC_OFFSET}`)
      .or("job_status.is.null,job_status.neq.archived")
      .not("jobber_client_id", "is", null)
      // Mirrors the real send's confirmed_at filter above, so the daily
      // digest preview doesn't list a reminder that won't actually go out.
      .is("confirmed_at", null);

    const visits = (visitsData ?? []) as ReminderVisit[];

    if (visits.length === 0) continue;

    const visitIds = visits.map((v) => v.jobber_visit_id);
    const { data: alreadySentData } = await supabaseServer
      .from("visit_reminders_sent")
      .select("jobber_visit_id")
      .eq("days_before", rule.days_before)
      .in("jobber_visit_id", visitIds);

    const alreadySent = new Set(
      (alreadySentData ?? []).map((row) => row.jobber_visit_id as string)
    );
    const pending = visits.filter((v) => !alreadySent.has(v.jobber_visit_id));

    count += pending.length;

    for (const visit of pending) {
      const who = visit.customer_name ?? "Unknown customer";
      const dateLabel = formatVisitDateLabel(visit.start_at);
      lines.push(`${who} -- ${rule.days_before}-day reminder (visit ${dateLabel})`);
    }
  }

  return { count, sample: lines.slice(0, 8) };
}
