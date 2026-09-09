// Extra phone numbers/emails per customer -- see migration
// 060_add_customer_contacts.sql's header comment for the full schema
// reasoning. customers.email/phone (the single columns Jobber sync has
// always written) are untouched and still drive every automated send by
// default; this file only adds the ADDITIONAL contacts on top, each
// optionally flagged to also receive those same automated sends.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizePhone } from "@/lib/matching";

export type CustomerContact = {
  id: string;
  jobberClientId: string;
  label: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  receivesNotifications: boolean;
  createdAt: string;
};

type CustomerContactRow = {
  id: string;
  jobber_client_id: string;
  label: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  receives_notifications: boolean;
  created_at: string;
};

function mapRow(row: CustomerContactRow): CustomerContact {
  return {
    id: row.id,
    jobberClientId: row.jobber_client_id,
    label: row.label,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    receivesNotifications: row.receives_notifications,
    createdAt: row.created_at,
  };
}

export async function listContactsForCustomer(
  jobberClientId: string
): Promise<CustomerContact[]> {
  const { data, error } = await supabaseServer
    .from("customer_contacts")
    .select(
      "id, jobber_client_id, label, contact_name, email, phone, receives_notifications, created_at"
    )
    .eq("jobber_client_id", jobberClientId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`listContactsForCustomer failed for ${jobberClientId}:`, error.message);
    return [];
  }

  return ((data ?? []) as CustomerContactRow[]).map(mapRow);
}

export type AddContactParams = {
  jobberClientId: string;
  label: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  receivesNotifications: boolean;
};

export async function addContact(
  params: AddContactParams
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!params.email && !params.phone) {
    return { ok: false, error: "Enter at least an email or a phone number." };
  }

  const { error } = await supabaseServer.from("customer_contacts").insert({
    jobber_client_id: params.jobberClientId,
    label: params.label,
    contact_name: params.contactName,
    email: params.email,
    phone: params.phone,
    receives_notifications: params.receivesNotifications,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export type UpdateContactParams = Omit<AddContactParams, "jobberClientId">;

export async function updateContact(
  id: string,
  params: UpdateContactParams
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!params.email && !params.phone) {
    return { ok: false, error: "Enter at least an email or a phone number." };
  }

  const { error } = await supabaseServer
    .from("customer_contacts")
    .update({
      label: params.label,
      contact_name: params.contactName,
      email: params.email,
      phone: params.phone,
      receives_notifications: params.receivesNotifications,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function deleteContact(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseServer.from("customer_contacts").delete().eq("id", id);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

// Every customer-facing automated send (invoice email/text, visit
// reminders, on-my-way, review requests, autopay receipts) calls this
// instead of using customers.email/phone directly -- it always includes
// the primary, plus any additional contact explicitly flagged
// receives_notifications, deduped and with blanks filtered out. Ryan's
// explicit call (see migration 060): additional contacts are
// reference-only by default, not an all-or-nothing broadcast.
export async function getNotificationRecipients(
  jobberClientId: string,
  primaryEmail: string | null,
  primaryPhone: string | null
): Promise<{ emails: string[]; phones: string[] }> {
  const contacts = await listContactsForCustomer(jobberClientId);
  const flagged = contacts.filter((contact) => contact.receivesNotifications);

  const emails = new Set<string>();
  const phones = new Set<string>();

  if (primaryEmail) emails.add(primaryEmail);
  if (primaryPhone) phones.add(primaryPhone);

  for (const contact of flagged) {
    if (contact.email) emails.add(contact.email);
    if (contact.phone) phones.add(contact.phone);
  }

  return { emails: Array.from(emails), phones: Array.from(phones) };
}

// Reverse lookup for inbound texts (app/api/webhooks/twilio/route.ts) --
// Twilio hands us the sender's number in E.164 (+14805551234), but
// customers.phone/customer_contacts.phone were typed in by hand over
// time in whatever format Jobber or a staff member used, so this
// compares via normalizePhone's bare-10-digit form on both sides rather
// than an exact string match. A full-table pull + in-memory compare
// rather than a SQL filter, same trade-off lib/matching.ts's other
// callers already make -- fine at this business's customer-list size,
// and phone numbers can't be normalized in a WHERE clause anyway.
export async function findJobberClientIdByPhone(
  rawPhone: string
): Promise<string | null> {
  const target = normalizePhone(rawPhone);

  if (!target) return null;

  const [customersResult, contactsResult] = await Promise.all([
    supabaseServer.from("customers").select("jobber_client_id, phone").not("phone", "is", null),
    supabaseServer
      .from("customer_contacts")
      .select("jobber_client_id, phone")
      .not("phone", "is", null),
  ]);

  const customerMatch = (
    (customersResult.data ?? []) as { jobber_client_id: string; phone: string | null }[]
  ).find((row) => normalizePhone(row.phone) === target);

  if (customerMatch) return customerMatch.jobber_client_id;

  const contactMatch = (
    (contactsResult.data ?? []) as { jobber_client_id: string; phone: string | null }[]
  ).find((row) => normalizePhone(row.phone) === target);

  return contactMatch?.jobber_client_id ?? null;
}
