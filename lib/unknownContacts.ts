// ROADMAP.md "Next up" #1: a text or email from a phone number/address
// that doesn't match any customer on file used to just get
// console.error'd and dropped inside the Twilio/Resend webhook handlers
// (app/api/webhooks/twilio/route.ts, app/api/webhooks/resend/route.ts) --
// meaning a brand-new prospect who got your number from a friend and
// texted in cold had no record anywhere. See migration
// 066_add_unknown_contacts.sql for the table this reads/writes.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { sendPush } from "@/lib/webPush";
import { getUnreadMessageCount } from "@/lib/contactHistory";

export type UnknownContact = {
  id: string;
  channel: "sms" | "email" | "call";
  phone: string | null;
  email: string | null;
  summary: string | null;
  createdAt: string;
  // Twilio recording id when this is a voicemail (migration 122).
  recordingSid: string | null;
};

type UnknownContactRow = {
  id: string;
  channel: "sms" | "email" | "call";
  phone: string | null;
  email: string | null;
  summary: string | null;
  created_at: string;
  recording_sid?: string | null;
};

function mapRow(row: UnknownContactRow): UnknownContact {
  return {
    id: row.id,
    channel: row.channel,
    phone: row.phone,
    email: row.email,
    summary: row.summary,
    createdAt: row.created_at,
    recordingSid: row.recording_sid ?? null,
  };
}

// Called from the Twilio/Resend webhooks whenever an inbound message
// (or, since app/api/webhooks/twilio-voice/route.ts, an inbound call)
// can't be matched to any customer. Best-effort and non-throwing, same
// as every other webhook-side write in this app (lib/contactHistory.ts's
// logContactHistory, etc.) -- a logging failure here must never turn
// into a 500 back to Twilio/Resend, which would just make them retry the
// same webhook indefinitely.
export async function logUnknownContact(params: {
  channel: "sms" | "email" | "call";
  phone?: string | null;
  email?: string | null;
  summary: string | null;
  recordingSid?: string | null;
}): Promise<void> {
  const { error } = await supabaseServer.from("unknown_contacts").insert({
    channel: params.channel,
    phone: params.phone ?? null,
    email: params.email ?? null,
    summary: params.summary,
    // Only sent when there is one, so a missing column (migration 122 not
    // run yet) never breaks ordinary unknown-sender logging.
    ...(params.recordingSid ? { recording_sid: params.recordingSid } : {}),
  });

  if (error) {
    console.error("Failed to log unknown contact:", error.message);
    return;
  }

  // A text or email from someone not on file is very often a new lead
  // -- exactly the message worth a buzz, and until now it sat in the
  // Unknown Senders queue until someone happened to open Messages.
  // Calls are left to the voice webhook, which knows whether the call
  // was actually missed. sendPush never throws.
  if (params.channel !== "call") {
    await sendPush("unknown_sender", {
      title: `Unknown sender: ${params.phone ?? params.email ?? "no number"}`,
      body: params.summary?.trim().slice(0, 160) || "New message from someone not on file.",
      url: "/messages",
      badgeCount: await getUnreadMessageCount().catch(() => 0),
    });
  }
}

// Messages page reads this to show a review queue -- only ever the ones
// nobody has acted on yet (added as a lead or dismissed).
export async function listNewUnknownContacts(): Promise<UnknownContact[]> {
  // Try with the voicemail column first; fall back if migration 122 has not
  // been run yet, so the queue never goes blank.
  const first = await supabaseServer
    .from("unknown_contacts")
    .select("id, channel, phone, email, summary, created_at, recording_sid")
    .eq("status", "new")
    .order("created_at", { ascending: false })
    .limit(200);

  let data: UnknownContactRow[] | null = first.data as UnknownContactRow[] | null;
  let error: { message: string } | null = first.error;

  if (error) {
    ({ data, error } = await supabaseServer
      .from("unknown_contacts")
      .select("id, channel, phone, email, summary, created_at")
      .eq("status", "new")
      .order("created_at", { ascending: false })
      .limit(200));
  }

  if (error) {
    console.error("listNewUnknownContacts failed:", error.message);
    return [];
  }

  return ((data ?? []) as UnknownContactRow[]).map(mapRow);
}
