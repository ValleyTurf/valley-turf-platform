"use server";

// Server actions behind the Leads table's per-row action buttons
// (LeadsTable.tsx). "Create Quote" isn't here -- it's just a plain link
// to /quotes/new?leadId=..., which that page reads directly (see its own
// searchParams handling) to pre-select the lead in QuoteRecipientPicker.
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";

// Deliberately just the three manual states Ryan asked for -- "New" is
// also the reset/undo target, same "reversible manual override" shape as
// the invoice-dismissal Undo button. This does NOT cover "Converted"/
// "Won": those read off of LeadsPage's own matchCustomer() lookup (a
// real customer record exists with the same phone/email), which isn't
// something a button should be able to fake by just writing a status
// string.
const LEAD_STATUSES = ["new", "contacted", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

type LeadForLabel = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

function leadLabel(lead: LeadForLabel): string {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
  return name || lead.email || lead.phone || "Lead";
}

export async function setLeadStatus(id: string, status: string): Promise<void> {
  const actor = await getCurrentUser();

  if (!actor) {
    throw new Error("You must be signed in to update a lead.");
  }

  if (!id) {
    throw new Error("Missing lead.");
  }

  if (!isLeadStatus(status)) {
    throw new Error(`Not a recognized lead status: ${status}`);
  }

  const { data: existing, error: fetchError } = await supabaseServer
    .from("leads")
    .select("id, first_name, last_name, email, phone, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) {
    throw new Error("Lead not found.");
  }

  const { error } = await supabaseServer
    .from("leads")
    .update({ status })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update lead status: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "lead",
    entityId: id,
    entityLabel: leadLabel(existing),
    before: { status: existing.status },
    after: { status },
  });

  revalidatePath("/leads");
}

// Hard delete -- safe to do: quotes.lead_id is `on delete set null`
// (migration 013_add_quotes.sql), and a quote already snapshots the
// recipient's name/email/phone/address at creation time, so deleting the
// lead a quote came from never loses anything off the quote itself.
// Nothing else in the schema references leads.id.
export async function deleteLead(id: string): Promise<void> {
  const actor = await getCurrentUser();

  if (!actor) {
    throw new Error("You must be signed in to delete a lead.");
  }

  if (!id) {
    throw new Error("Missing lead.");
  }

  const { data: existing, error: fetchError } = await supabaseServer
    .from("leads")
    .select("id, first_name, last_name, email, phone")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) {
    throw new Error("Lead not found.");
  }

  const { error } = await supabaseServer.from("leads").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete lead: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "delete",
    entityType: "lead",
    entityId: id,
    entityLabel: leadLabel(existing),
    before: existing,
  });

  revalidatePath("/leads");
}
