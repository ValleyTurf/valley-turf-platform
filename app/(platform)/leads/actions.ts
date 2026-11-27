"use server";

// Server actions behind the Leads table's per-row action buttons
// (LeadsTable.tsx). "Create Quote" isn't here -- it's just a plain link
// to /quotes/new?leadId=..., which that page reads directly (see its own
// searchParams handling) to pre-select the lead in QuoteRecipientPicker.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { ensureCustomerForLead } from "@/lib/leadCustomers";

// Deliberately just the four manual states Ryan asked for (needs_info =
// "can't send a quote -- not enough info", added 2026-11-27). The stages
// past these (Quote Sent / Declined / Won...) are derived from the lead's
// quotes in lib/leadPipelineLogic.ts, never stored here -- "New" is
// also the reset/undo target, same "reversible manual override" shape as
// the invoice-dismissal Undo button. This does NOT cover "Converted"/
// "Won": those read off of LeadsPage's own matchCustomer() lookup (a
// real customer record exists with the same phone/email), which isn't
// something a button should be able to fake by just writing a status
// string.
const LEAD_STATUSES = ["new", "contacted", "lost", "needs_info"] as const;
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
  // Detail page (app/(platform)/leads/[id]/page.tsx, added 2026-09-28) --
  // this action is bound to buttons on both /leads and /leads/[id], and
  // a status change made from the detail page should reflect there too
  // without a manual reload.
  revalidatePath(`/leads/${id}`);
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
  // Also bound to the Delete button on /leads/[id] (added 2026-09-28) --
  // that page no longer has a lead to show once this runs, so send
  // staff back to the list instead of leaving them on a 404.
  redirect("/leads");
}

// "Add as Customer" button: links the lead to an existing customer with
// the same phone/email, or creates a native one. Also backfills the
// customer onto any quotes already written for the lead.
export async function createCustomerForLead(id: string): Promise<void> {
  const actor = await getCurrentUser();

  if (!actor) {
    throw new Error("You must be signed in to add a customer.");
  }

  const result = await ensureCustomerForLead(id);

  if (!result.ok) {
    throw new Error(`Couldn't add this lead as a customer: ${result.error}`);
  }

  if (result.created) {
    await recordAuditLog({
      actor,
      action: "create",
      entityType: "customer",
      entityId: result.clientId,
      entityLabel: "Customer created from lead",
      after: { lead_id: id },
    });
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  revalidatePath("/customers");
}

// One click to clear the backlog: every lead that isn't linked to a
// customer yet gets linked/created. Skips leads with no name, phone or
// email at all (nothing to build a customer from).
export async function createMissingCustomers(): Promise<void> {
  const actor = await getCurrentUser();

  if (!actor) {
    throw new Error("You must be signed in to add customers.");
  }

  const { data: leads, error } = await supabaseServer
    .from("leads")
    .select("id, first_name, last_name, email, phone")
    .is("jobber_client_id", null);

  if (error) {
    throw new Error(`Couldn't load leads: ${error.message}`);
  }

  let created = 0;

  for (const lead of leads ?? []) {
    if (!lead.first_name && !lead.last_name && !lead.email && !lead.phone) {
      continue;
    }

    const result = await ensureCustomerForLead(lead.id);

    if (result.ok && result.created) created += 1;
  }

  if (created > 0) {
    await recordAuditLog({
      actor,
      action: "create",
      entityType: "customer",
      entityId: null,
      entityLabel: `${created} customers created from leads`,
      after: { created },
    });
  }

  revalidatePath("/leads");
  revalidatePath("/customers");
}
