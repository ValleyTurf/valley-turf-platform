// Unified customer contact history (email, SMS, manually-logged phone
// calls) -- see migration 056_add_contact_history.sql's header comment
// for the full schema reasoning. This file has three jobs:
//
//   1. logContactHistory() -- called from inside every customer-facing
//      send function in lib/notifications.ts, right after a successful
//      send. Best-effort and non-throwing: a logging failure should
//      never take down the actual email/SMS send it's recording.
//   2. markEmailDelivered/markEmailOpened -- called by the Resend
//      webhook handler (app/api/webhooks/resend/route.ts) to update a
//      row after the fact, matched by resend_email_id.
//   3. getContactHistoryForCustomer() -- reads contact_history AND
//      portal_messages (migration 023) for one customer and merges them
//      into a single chronological timeline for the Customer page. Chat
//      messages live in their own table already shaped exactly right
//      (sender, body, created_at) -- no reason to copy them into
//      contact_history too, just merge at read time.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

export type ContactChannel = "email" | "sms" | "call";
export type ContactDirection = "outbound" | "inbound";

export type LogContactHistoryParams = {
  jobberClientId: string | null;
  channel: ContactChannel;
  direction?: ContactDirection;
  subject?: string | null;
  summary?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
  // Only ever set for channel: "email" -- Resend's own message id,
  // captured from the send API's response body, so a later webhook
  // event can find this row again.
  resendEmailId?: string | null;
  createdByUserId?: string | null;
  createdByName?: string | null;
};

export async function logContactHistory(
  params: LogContactHistoryParams
): Promise<void> {
  // A row with no customer to attach to isn't useful on any Customer
  // page -- silently skip rather than insert an orphaned row. Every
  // real call site has a jobber_client_id in hand; this guards against
  // callers that don't (e.g. a lead with no linked customer yet).
  if (!params.jobberClientId) {
    return;
  }

  const { error } = await supabaseServer.from("contact_history").insert({
    jobber_client_id: params.jobberClientId,
    channel: params.channel,
    direction: params.direction ?? "outbound",
    subject: params.subject ?? null,
    summary: params.summary ?? null,
    related_type: params.relatedType ?? null,
    related_id: params.relatedId ?? null,
    resend_email_id: params.resendEmailId ?? null,
    created_by_user_id: params.createdByUserId ?? null,
    created_by_name: params.createdByName ?? null,
  });

  if (error) {
    // Logging is a nice-to-have next to the actual send -- a customer
    // who received their invoice email but doesn't get a contact-history
    // row is a much smaller problem than the send itself failing, so
    // this only logs to the console rather than throwing back into
    // whatever notification function called it.
    console.error("logContactHistory failed:", error.message, params);
  }
}

export async function markEmailDelivered(resendEmailId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("contact_history")
    .update({ delivered_at: new Date().toISOString() })
    .eq("resend_email_id", resendEmailId)
    // Never overwrite an existing delivered_at -- Resend can resend the
    // same webhook event, and the first timestamp is the accurate one.
    .is("delivered_at", null);

  if (error) {
    console.error("markEmailDelivered failed:", error.message, resendEmailId);
  }
}

export async function markEmailOpened(resendEmailId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("contact_history")
    .update({ opened_at: new Date().toISOString() })
    .eq("resend_email_id", resendEmailId)
    .is("opened_at", null);

  if (error) {
    console.error("markEmailOpened failed:", error.message, resendEmailId);
  }
}

export type ContactHistoryEntry = {
  id: string;
  channel: ContactChannel | "chat";
  direction: ContactDirection;
  subject: string | null;
  summary: string | null;
  openedAt: string | null;
  deliveredAt: string | null;
  createdByName: string | null;
  createdAt: string;
};

type ContactHistoryRow = {
  id: string;
  channel: ContactChannel;
  direction: ContactDirection;
  subject: string | null;
  summary: string | null;
  opened_at: string | null;
  delivered_at: string | null;
  created_by_name: string | null;
  created_at: string;
};

type PortalMessageRow = {
  id: string;
  sender: "customer" | "staff";
  sender_name: string | null;
  body: string;
  created_at: string;
};

export async function getContactHistoryForCustomer(
  jobberClientId: string
): Promise<ContactHistoryEntry[]> {
  const [historyResult, messagesResult] = await Promise.all([
    supabaseServer
      .from("contact_history")
      .select(
        "id, channel, direction, subject, summary, opened_at, delivered_at, created_by_name, created_at"
      )
      .eq("jobber_client_id", jobberClientId)
      .order("created_at", { ascending: false })
      .limit(100),

    supabaseServer
      .from("portal_messages")
      .select("id, sender, sender_name, body, created_at")
      .eq("jobber_client_id", jobberClientId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const historyRows = (historyResult.data ?? []) as ContactHistoryRow[];
  const messageRows = (messagesResult.data ?? []) as PortalMessageRow[];

  const historyEntries: ContactHistoryEntry[] = historyRows.map((row) => ({
    id: `history-${row.id}`,
    channel: row.channel,
    direction: row.direction,
    subject: row.subject,
    summary: row.summary,
    openedAt: row.opened_at,
    deliveredAt: row.delivered_at,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  }));

  const chatEntries: ContactHistoryEntry[] = messageRows.map((row) => ({
    id: `chat-${row.id}`,
    channel: "chat",
    direction: row.sender === "customer" ? "inbound" : "outbound",
    subject: row.sender === "customer" ? "Chat from customer" : "Chat to customer",
    summary: row.body,
    openedAt: null,
    deliveredAt: null,
    createdByName: row.sender_name,
    createdAt: row.created_at,
  }));

  return [...historyEntries, ...chatEntries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
