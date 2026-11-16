// "Needs reply": a conversation where the customer wrote last and nobody
// on staff has answered. The decision itself is a pure function so it can
// be checked without a database; loadNeedsReply() gathers the events.
//
// What counts:
//   * customer wrote  -- a portal chat message, or an inbound text/email
//     (a tapback like "Liked ..." is a reaction, not a question)
//   * staff answered  -- a portal reply, a text/email staff typed (anything
//     with a staff member on it), or a logged phone call
//   * "no reply needed" -- the button on the thread, for a "thanks!"
// Automated sends (invoice, reminder, receipt) do NOT count as answering.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import {
  findWaitingThreads,
  type ThreadEvent,
  type WaitingThread,
} from "@/lib/needsReplyLogic";

// Only recent conversations: a text from months ago that never got an
// answer is history, not a to-do.
const LOOKBACK_DAYS = 30;

export async function loadNeedsReply(): Promise<WaitingThread[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();

  const [chatResult, inboundResult, staffResult, handledResult] =
    await Promise.all([
      supabaseServer
        .from("portal_messages")
        .select("jobber_client_id, sender, created_at")
        .gte("created_at", since)
        .limit(2000),

      supabaseServer
        .from("contact_history")
        .select("jobber_client_id, created_at")
        .eq("direction", "inbound")
        .in("channel", ["email", "sms"])
        .or("subject.is.null,subject.neq.Reaction")
        .gte("created_at", since)
        .limit(2000),

      supabaseServer
        .from("contact_history")
        .select("jobber_client_id, created_at")
        .eq("direction", "outbound")
        .or("created_by_user_id.not.is.null,channel.eq.call")
        .gte("created_at", since)
        .limit(2000),

      supabaseServer
        .from("message_threads_handled")
        .select("jobber_client_id, handled_at")
        .gte("handled_at", since),
    ]);

  for (const result of [chatResult, inboundResult, staffResult, handledResult]) {
    if (result.error) {
      console.error("loadNeedsReply query failed:", result.error.message);
      return [];
    }
  }

  const events: ThreadEvent[] = [];

  for (const row of (chatResult.data ?? []) as {
    jobber_client_id: string;
    sender: "customer" | "staff";
    created_at: string;
  }[]) {
    events.push({
      clientId: row.jobber_client_id,
      kind: row.sender === "customer" ? "customer" : "staff",
      at: row.created_at,
    });
  }

  for (const row of (inboundResult.data ?? []) as {
    jobber_client_id: string | null;
    created_at: string;
  }[]) {
    if (row.jobber_client_id) {
      events.push({ clientId: row.jobber_client_id, kind: "customer", at: row.created_at });
    }
  }

  for (const row of (staffResult.data ?? []) as {
    jobber_client_id: string | null;
    created_at: string;
  }[]) {
    if (row.jobber_client_id) {
      events.push({ clientId: row.jobber_client_id, kind: "staff", at: row.created_at });
    }
  }

  for (const row of (handledResult.data ?? []) as {
    jobber_client_id: string;
    handled_at: string;
  }[]) {
    events.push({ clientId: row.jobber_client_id, kind: "handled", at: row.handled_at });
  }

  return findWaitingThreads(events);
}
