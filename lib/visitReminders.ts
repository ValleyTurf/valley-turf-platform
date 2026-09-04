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

// Every visit's title already follows the "{Customer} - {Service}"
// convention (see lib/nativeJobs.ts, lib/quoteJobConversion.ts) -- strip
// the customer name back off so the reminder reads naturally ("your Turf
// Cleaning visit"), falling back to the raw title or a generic label if
// it doesn't match that shape.
function visitLabel(title: string | null, customerName: string | null): string {
  if (!title) return "upcoming";

  if (customerName) {
    const prefix = `${customerName} - `;
    if (title.startsWith(prefix)) {
      return title.slice(prefix.length);
    }
  }

  return title;
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
      .not("jobber_client_id", "is", null);

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

      const label = visitLabel(visit.title, visit.customer_name);
      const dateLabel = formatVisitDateLabel(visit.start_at);

      let delivered = false;

      if (phone) {
        const sent = await sendVisitReminderSms(
          phone,
          visit.customer_name,
          label,
          dateLabel,
          visit.jobber_client_id
        );
        delivered = delivered || sent;
      }

      if (email) {
        const sent = await sendVisitReminderEmail(
          email,
          visit.customer_name,
          label,
          dateLabel,
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
