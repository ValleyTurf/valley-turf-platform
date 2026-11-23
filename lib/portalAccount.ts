// Server side of the portal "My Info" page: a customer viewing and updating
// their own contact details. Everything is scoped to the signed-in
// customer's jobber_client_id; nothing here trusts an id from the browser
// without checking it belongs to that customer.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizePhone } from "@/lib/matching";
import { recordAuditLog } from "@/lib/auditLog";
import { escapeLikePattern } from "@/lib/portalLogic";
import { listContactsForCustomer, addContact, deleteContact } from "@/lib/customerContacts";
import type { ExtraContactResult } from "@/lib/portalContactLogic";

export type PortalAccount = {
  email: string | null;
  phone: string | null;
  address: string | null;
};

export async function getPortalAccount(jobberClientId: string): Promise<PortalAccount> {
  const { data } = await supabaseServer
    .from("customers")
    .select("email, phone, address_line_1, address_line_2, city, state, postal_code")
    .eq("jobber_client_id", jobberClientId)
    .maybeSingle();

  const cityLine = [data?.city, [data?.state, data?.postal_code].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const address = [data?.address_line_1, data?.address_line_2, cityLine].filter(Boolean).join(", ");

  return {
    email: (data?.email as string | null) ?? null,
    phone: (data?.phone as string | null) ?? null,
    address: address || null,
  };
}

export { listContactsForCustomer };

export type UpdateResult = { ok: true } | { ok: false; error: string };

// Sign-in finds a customer by email or phone, so two customers must never
// share one. Compared case-insensitively / by digits, ignoring this customer.
async function emailTakenByOther(email: string, jobberClientId: string): Promise<boolean> {
  const { data } = await supabaseServer
    .from("customers")
    .select("jobber_client_id")
    .ilike("email", escapeLikePattern(email))
    .neq("jobber_client_id", jobberClientId)
    .limit(1);
  return (data ?? []).length > 0;
}

async function phoneTakenByOther(phone: string, jobberClientId: string): Promise<boolean> {
  const target = normalizePhone(phone);
  if (!target) return false;
  const { data } = await supabaseServer
    .from("customers")
    .select("jobber_client_id, phone")
    .not("phone", "is", null)
    .neq("jobber_client_id", jobberClientId);
  return (data ?? []).some((row) => normalizePhone(row.phone as string | null) === target);
}

export async function updatePrimaryContact(params: {
  jobberClientId: string;
  customerName: string;
  email: string | null;
  phone: string | null;
}): Promise<UpdateResult> {
  const before = await getPortalAccount(params.jobberClientId);

  if (params.email && params.email !== (before.email ?? "").toLowerCase()) {
    if (await emailTakenByOther(params.email, params.jobberClientId)) {
      return { ok: false, error: "conflict_email" };
    }
  }

  if (params.phone && normalizePhone(params.phone) !== normalizePhone(before.phone)) {
    if (await phoneTakenByOther(params.phone, params.jobberClientId)) {
      return { ok: false, error: "conflict_phone" };
    }
  }

  const { error } = await supabaseServer
    .from("customers")
    .update({ email: params.email, phone: params.phone })
    .eq("jobber_client_id", params.jobberClientId);

  if (error) {
    console.error("Portal contact update failed:", error.message);
    return { ok: false, error: "error" };
  }

  await recordAuditLog({
    actor: null,
    action: "update",
    entityType: "customer",
    entityId: params.jobberClientId,
    entityLabel: params.customerName,
    before: { email: before.email, phone: before.phone },
    after: { email: params.email, phone: params.phone },
    note: "Customer updated their own contact info in the portal",
  });

  return { ok: true };
}

export async function addPortalContact(
  jobberClientId: string,
  customerName: string,
  parsed: Extract<ExtraContactResult, { ok: true }>
): Promise<UpdateResult> {
  const result = await addContact({ jobberClientId, ...parsed.value });
  if (!result.ok) {
    console.error("Portal add contact failed:", result.error);
    return { ok: false, error: "error" };
  }

  await recordAuditLog({
    actor: null,
    action: "create",
    entityType: "customer_contact",
    entityId: jobberClientId,
    entityLabel: parsed.value.contactName || parsed.value.label || customerName,
    after: { ...parsed.value },
    note: "Customer added an extra contact in the portal",
  });

  return { ok: true };
}

export async function removePortalContact(
  jobberClientId: string,
  customerName: string,
  contactId: string
): Promise<UpdateResult> {
  // Only delete a contact that belongs to this customer.
  const { data } = await supabaseServer
    .from("customer_contacts")
    .select("id, contact_name, label, email, phone")
    .eq("id", contactId)
    .eq("jobber_client_id", jobberClientId)
    .maybeSingle();

  if (!data) return { ok: false, error: "error" };

  const result = await deleteContact(contactId);
  if (!result.ok) return { ok: false, error: "error" };

  await recordAuditLog({
    actor: null,
    action: "delete",
    entityType: "customer_contact",
    entityId: jobberClientId,
    entityLabel: (data.contact_name as string | null) || (data.label as string | null) || customerName,
    before: {
      email: data.email as string | null,
      phone: data.phone as string | null,
    },
    note: "Customer removed an extra contact in the portal",
  });

  return { ok: true };
}
