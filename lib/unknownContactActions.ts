"use server";

// Actions behind the "Unknown senders" review queue on the Messages page
// (app/(platform)/messages/page.tsx) -- see lib/unknownContacts.ts and
// migration 066_add_unknown_contacts.sql for the table these read/write.
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";

type UnknownContactRow = {
  id: string;
  channel: "sms" | "email";
  phone: string | null;
  email: string | null;
  summary: string | null;
  status: string;
};

// Turns an unrecognized inbound text/email into a real row in `leads` --
// the same table (and the same Leads page) every QR-scan and
// request-quote lead already lands in, so this doesn't invent a second,
// parallel place for a prospect to live.
export async function addUnknownContactAsLead(
  id: string
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in." };
  }

  const { data: contact, error: contactError } = await supabaseServer
    .from("unknown_contacts")
    .select("id, channel, phone, email, summary, status")
    .eq("id", id)
    .maybeSingle();

  if (contactError || !contact) {
    return { error: "Couldn't find that message." };
  }

  const row = contact as UnknownContactRow;

  if (row.status !== "new") {
    return { error: "This one's already been handled." };
  }

  const source =
    row.channel === "sms" ? "Unknown sender (text)" : "Unknown sender (email)";

  const { data: lead, error: leadError } = await supabaseServer
    .from("leads")
    .insert({
      phone: row.phone,
      email: row.email,
      source,
      status: "New",
    })
    .select("id")
    .single();

  if (leadError || !lead) {
    return { error: leadError?.message || "Couldn't create the lead." };
  }

  const { error: updateError } = await supabaseServer
    .from("unknown_contacts")
    .update({
      status: "added_as_lead",
      lead_id: lead.id,
      resolved_at: new Date().toISOString(),
      resolved_by_user_id: actor.id,
    })
    .eq("id", id);

  if (updateError) {
    console.error(
      "Failed to mark unknown contact as converted:",
      updateError.message
    );
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "lead",
    entityId: lead.id as string,
    entityLabel: row.phone || row.email || "Unknown sender",
    after: { source, phone: row.phone, email: row.email },
  });

  revalidatePath("/messages");
  revalidatePath("/leads");

  return { error: null };
}

// Marks a row as noise (wrong number, spam, etc.) without creating a
// lead -- keeps the review queue from filling up with things nobody's
// ever going to act on.
export async function dismissUnknownContact(
  id: string
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in." };
  }

  const { error } = await supabaseServer
    .from("unknown_contacts")
    .update({
      status: "dismissed",
      resolved_at: new Date().toISOString(),
      resolved_by_user_id: actor.id,
    })
    .eq("id", id)
    .eq("status", "new");

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/messages");

  return { error: null };
}
