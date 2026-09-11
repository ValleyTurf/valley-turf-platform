// ROADMAP.md Fresh Ideas #5 -- Seasonal promo automation. Manual,
// one-click campaigns (Ryan's call, 2026-09-11): app/(platform)/campaigns
// builds an audience filter + message, then this file resolves who
// matches and sends to them. See migration 072_add_promo_campaigns.sql
// for the schema.
//
// Deliberately reuses lib/notifications.ts's sendManualEmail/
// sendManualSms rather than talking to Resend/Twilio directly -- same
// functions the single-customer Compose Email/Text tools already use, so
// a campaign send also logs to that customer's Contact History for free
// (see logContactHistory inside those functions) and behaves identically
// to any other manual send (same paragraph-splitting, same reply-to
// handling).
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { sendManualEmail, sendManualSms } from "@/lib/notifications";

export type RecurringStatusFilter =
  | "all"
  | "active_recurring"
  | "non_recurring"
  | "cancelled_recurring";

export const RECURRING_STATUS_OPTIONS: {
  key: RecurringStatusFilter;
  label: string;
}[] = [
  { key: "all", label: "All Customers" },
  { key: "active_recurring", label: "Active Recurring" },
  { key: "non_recurring", label: "Never Recurring" },
  { key: "cancelled_recurring", label: "Cancelled Recurring" },
];

export function isRecurringStatusFilter(
  value: string
): value is RecurringStatusFilter {
  return RECURRING_STATUS_OPTIONS.some((o) => o.key === value);
}

// Same category set app/(platform)/customers/page.tsx already filters by
// (CATEGORY_FILTER_OPTIONS there) -- kept in sync manually since it's a
// hardcoded list of Ryan's actual service categories, not derived from
// data. Only meaningful when recurringStatus is "active_recurring".
export const CAMPAIGN_CATEGORY_OPTIONS = [
  "Monthly Maintenance",
  "Quarterly Cleaning",
  "Bimonthly Cleaning",
  "Semi-Annual Cleaning",
  "Weekly Maintenance",
  "Spray Only",
];

export type CampaignChannel = "email" | "sms";

export function isCampaignChannel(value: string): value is CampaignChannel {
  return value === "email" || value === "sms";
}

export type CampaignFilters = {
  recurringStatus: RecurringStatusFilter;
  category: string | null;
  city: string | null;
};

export type CampaignRecipient = {
  jobberClientId: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export async function getDistinctCustomerCities(): Promise<string[]> {
  const { data, error } = await supabaseServer
    .from("customers")
    .select("city")
    .not("city", "is", null);

  if (error || !data) return [];

  const cities = new Set<string>();
  for (const row of data as { city: string | null }[]) {
    const trimmed = row.city?.trim();
    if (trimmed) cities.add(trimmed);
  }

  return Array.from(cities).sort((a, b) => a.localeCompare(b));
}

type RecurringCustomerRow = {
  jobber_client_id: string;
  recurring_categories: string[] | null;
};
type CancelledJobRow = { jobber_client_id: string };

async function getActiveAndCancelledIds(): Promise<{
  activeIds: Set<string>;
  activeCategoriesById: Map<string, string[]>;
  cancelledIds: Set<string>;
}> {
  const [{ data: recurringData }, { data: cancelledData }] = await Promise.all(
    [
      supabaseServer
        .from("recurring_customers")
        .select("jobber_client_id, recurring_categories"),
      supabaseServer
        .from("jobber_jobs")
        .select("jobber_client_id")
        .not("recurrence_frequency", "is", null)
        .not("recurrence_cancelled_at", "is", null),
    ]
  );

  const recurringRows = (recurringData ?? []) as RecurringCustomerRow[];
  const activeIds = new Set(recurringRows.map((r) => r.jobber_client_id));
  const activeCategoriesById = new Map<string, string[]>(
    recurringRows.map((r) => [r.jobber_client_id, r.recurring_categories ?? []])
  );

  const cancelledRows = (cancelledData ?? []) as CancelledJobRow[];
  // A customer only counts as "cancelled recurring" if they don't also
  // have a currently-active recurring job -- one cancelled plan plus one
  // still-running plan reads as active, not cancelled.
  const cancelledIds = new Set(
    cancelledRows
      .map((r) => r.jobber_client_id)
      .filter((id) => !activeIds.has(id))
  );

  return { activeIds, activeCategoriesById, cancelledIds };
}

type CustomerRow = {
  jobber_client_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
};

// Resolves who a campaign would actually reach. Used both for the live
// "This will reach N customers" preview and for the real send, so the
// count Ryan sees before sending is guaranteed to match who gets
// messaged -- same query, not two similar-but-different ones.
export async function resolveAudience(
  filters: CampaignFilters,
  channels: CampaignChannel[]
): Promise<CampaignRecipient[]> {
  const { activeIds, activeCategoriesById, cancelledIds } =
    await getActiveAndCancelledIds();

  let query = supabaseServer
    .from("customers")
    .select(
      "jobber_client_id, full_name, first_name, last_name, company_name, email, phone, city"
    );

  if (filters.city) {
    query = query.eq("city", filters.city);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const needsEmail = channels.includes("email");
  const needsSms = channels.includes("sms");

  const results: CampaignRecipient[] = [];

  for (const row of data as CustomerRow[]) {
    const id = row.jobber_client_id;

    if (filters.recurringStatus === "active_recurring") {
      if (!activeIds.has(id)) continue;
      if (filters.category) {
        const categories = activeCategoriesById.get(id) ?? [];
        if (!categories.includes(filters.category)) continue;
      }
    } else if (filters.recurringStatus === "non_recurring") {
      if (activeIds.has(id) || cancelledIds.has(id)) continue;
    } else if (filters.recurringStatus === "cancelled_recurring") {
      if (!cancelledIds.has(id)) continue;
    }

    const email = row.email?.trim() || null;
    const phone = row.phone?.trim() || null;

    // "Has email / has phone on file" folded into channel selection
    // rather than a separate filter control -- a customer only needs to
    // be reachable on one of the channels actually being sent.
    const reachable = Boolean((needsEmail && email) || (needsSms && phone));
    if (!reachable) continue;

    const name =
      row.full_name ||
      [row.first_name, row.last_name].filter(Boolean).join(" ") ||
      row.company_name ||
      "Customer";

    results.push({ jobberClientId: id, name, email, phone });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export function describeCampaignAudience(filters: CampaignFilters): string {
  const parts: string[] = [];

  parts.push(
    RECURRING_STATUS_OPTIONS.find((o) => o.key === filters.recurringStatus)
      ?.label ?? "All Customers"
  );

  if (filters.recurringStatus === "active_recurring" && filters.category) {
    parts.push(filters.category);
  }

  if (filters.city) {
    parts.push(filters.city);
  }

  return parts.join(", ");
}

// Runs `worker` over `items` with at most `limit` in flight at once --
// fast enough to keep the interactive Send button snappy without opening
// unlimited concurrent requests against Resend/Twilio the way
// lib/uploadVisitPhotosClient.ts's unlimited Promise.all does for "a
// handful of photos" (a campaign audience can be much larger than a
// handful).
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    const index = nextIndex++;
    if (index >= items.length) return;
    results[index] = await worker(items[index]);
    await runNext();
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runNext()));

  return results;
}

const SEND_CONCURRENCY = 5;

export type SendCampaignParams = {
  name: string;
  channels: CampaignChannel[];
  subject: string | null;
  body: string;
  filters: CampaignFilters;
  actorUserId: string | null;
  actorName: string | null;
};

export type SendCampaignResult = {
  campaignId: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
};

type SendAttempt = {
  jobberClientId: string;
  channel: CampaignChannel;
  status: "sent" | "failed";
  error: string | null;
};

export async function sendPromoCampaign(
  params: SendCampaignParams
): Promise<
  { ok: true; value: SendCampaignResult } | { ok: false; error: string }
> {
  if (params.channels.length === 0) {
    return { ok: false, error: "Pick at least one channel (email or text)." };
  }

  if (params.channels.includes("email") && !params.subject?.trim()) {
    return { ok: false, error: "Write a subject line for the email." };
  }

  if (!params.body.trim()) {
    return { ok: false, error: "Write a message before sending." };
  }

  const recipients = await resolveAudience(params.filters, params.channels);

  const { data: campaignRow, error: insertError } = await supabaseServer
    .from("promo_campaigns")
    .insert({
      name: params.name,
      channels: params.channels,
      subject: params.channels.includes("email") ? params.subject : null,
      body: params.body,
      audience_description: describeCampaignAudience(params.filters),
      created_by_user_id: params.actorUserId,
      created_by_name: params.actorName,
      recipient_count: recipients.length,
    })
    .select("id")
    .single();

  if (insertError || !campaignRow) {
    return {
      ok: false,
      error: insertError?.message ?? "Could not create the campaign record.",
    };
  }

  const campaignId = campaignRow.id as string;

  const attempts: SendAttempt[] = [];

  await mapWithConcurrency(recipients, SEND_CONCURRENCY, async (recipient) => {
    if (params.channels.includes("email") && recipient.email) {
      const sent = await sendManualEmail({
        toEmail: recipient.email,
        customerName: recipient.name,
        subject: params.subject as string,
        body: params.body,
        jobberClientId: recipient.jobberClientId,
        createdByUserId: params.actorUserId,
        createdByName: params.actorName,
      });

      attempts.push({
        jobberClientId: recipient.jobberClientId,
        channel: "email",
        status: sent ? "sent" : "failed",
        error: sent ? null : "Email send failed.",
      });
    }

    if (params.channels.includes("sms") && recipient.phone) {
      const sent = await sendManualSms({
        toPhone: recipient.phone,
        body: params.body,
        jobberClientId: recipient.jobberClientId,
        createdByUserId: params.actorUserId,
        createdByName: params.actorName,
      });

      attempts.push({
        jobberClientId: recipient.jobberClientId,
        channel: "sms",
        status: sent ? "sent" : "failed",
        error: sent ? null : "Text send failed.",
      });
    }
  });

  if (attempts.length > 0) {
    await supabaseServer.from("promo_campaign_sends").insert(
      attempts.map((attempt) => ({
        campaign_id: campaignId,
        jobber_client_id: attempt.jobberClientId,
        channel: attempt.channel,
        status: attempt.status,
        error: attempt.error,
      }))
    );
  }

  const sentCount = attempts.filter((a) => a.status === "sent").length;
  const failedCount = attempts.filter((a) => a.status === "failed").length;

  await supabaseServer
    .from("promo_campaigns")
    .update({ sent_count: sentCount, failed_count: failedCount })
    .eq("id", campaignId);

  return {
    ok: true,
    value: {
      campaignId,
      recipientCount: recipients.length,
      sentCount,
      failedCount,
    },
  };
}

export type CampaignHistoryRow = {
  id: string;
  name: string;
  channels: string[];
  audienceDescription: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  createdByName: string | null;
};

type PromoCampaignRow = {
  id: string;
  name: string;
  channels: string[] | null;
  audience_description: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  created_by_name: string | null;
};

export async function getRecentCampaigns(
  limit = 20
): Promise<CampaignHistoryRow[]> {
  const { data, error } = await supabaseServer
    .from("promo_campaigns")
    .select(
      "id, name, channels, audience_description, recipient_count, sent_count, failed_count, created_at, created_by_name"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as PromoCampaignRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    channels: row.channels ?? [],
    audienceDescription: row.audience_description,
    recipientCount: row.recipient_count,
    sentCount: row.sent_count,
    failedCount: row.failed_count,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
  }));
}
