// ROADMAP.md "Next up" #1: a text or email from a phone number/address
// that doesn't match any customer on file used to just get
// console.error'd and dropped inside the Twilio/Resend webhook handlers
// (app/api/webhooks/twilio/route.ts, app/api/webhooks/resend/route.ts) --
// meaning a brand-new prospect who got your number from a friend and
// texted in cold had no record anywhere. See migration
// 066_add_unknown_contacts.sql for the table this reads/writes.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

export type UnknownContact = {
  id: string;
  channel: "sms" | "email";
  phone: string | null;
  email: string | null;
  summary: string | null;
  createdAt: string;
};

type UnknownContactRow = {
  id: string;
  channel: "sms" | "email";
  phone: string | null;
  email: string | null;
  summary: string | null;
  created_at: string;
};

function mapRow(row: UnknownContactRow): UnknownContact {
  return {
    id: row.id,
    channel: row.channel,
    phone: row.phone,
    email: row.email,
    summary: row.summary,
    createdAt: row.created_at,
  };
}

// Called from the Twilio/Resend webhooks whenever an inbound message
// can't be matched to any customer. Best-effort and non-throwing, same
// as every other webhook-side write in this app (lib/contactHistory.ts's
// logContactHistory, etc.) -- a logging failure here must never turn
// into a 500 back to Twilio/Resend, which would just make them retry the
// same webhook indefinitely.
export async function logUnknownContact(params: {
  channel: "sms" | "email";
  phone?: string | null;
  email?: string | null;
  summary: string | null;
}): Promise<void> {
  const { error } = await supabaseServer.from("unknown_contacts").insert({
    channel: params.channel,
    phone: params.phone ?? null,
    email: params.email ?? null,
    summary: params.summary,
  });

  if (error) {
    console.error("Failed to log unknown contact:", error.message);
  }
}

// Messages page reads this to show a review queue -- only ever the ones
// nobody has acted on yet (added as a lead or dismissed).
export async function listNewUnknownContacts(): Promise<UnknownContact[]> {
  const { data, error } = await supabaseServer
    .from("unknown_contacts")
    .select("id, channel, phone, email, summary, created_at")
    .eq("status", "new")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("listNewUnknownContacts failed:", error.message);
    return [];
  }

  return ((data ?? []) as UnknownContactRow[]).map(mapRow);
}
