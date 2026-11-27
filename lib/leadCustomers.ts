// Links a lead to a real customer record, creating one when none exists.
// Shared by the website quote form, the lead webhook and the Leads
// page's "Add as Customer" buttons so every path behaves the same way.
// Never throws: callers get { ok: false, error } and decide what to do
// (the intake paths just log it -- a lead is never lost over this).
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { createNativeCustomer } from "@/lib/nativeCustomers";
import { normalizeEmail, normalizePhone } from "@/lib/matching";

export type CustomerContact = {
  jobber_client_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

// PostgREST caps a single select at 1000 rows, and the customer list is
// now well past that -- an unpaged select silently drops the rest, which
// made newer customers (the native ones!) look like "no match".
export async function loadAllCustomerContacts(): Promise<CustomerContact[]> {
  const pageSize = 1000;
  const all: CustomerContact[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("customers")
      .select("jobber_client_id, full_name, email, phone")
      .order("jobber_client_id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("loadAllCustomerContacts failed:", error.message);
      break;
    }

    const rows = (data ?? []) as CustomerContact[];
    all.push(...rows);

    if (rows.length < pageSize) break;
  }

  return all;
}

export type EnsureCustomerResult =
  | { ok: true; clientId: string; created: boolean }
  | { ok: false; error: string };

export async function ensureCustomerForLead(
  leadId: string
): Promise<EnsureCustomerResult> {
  try {
    const { data: lead, error } = await supabaseServer
      .from("leads")
      .select(
        "id, first_name, last_name, email, phone, address, city, state, zip, address_lat, address_lng, jobber_client_id"
      )
      .eq("id", leadId)
      .maybeSingle();

    if (error || !lead) {
      return { ok: false, error: error?.message || "Lead not found." };
    }

    const customers = await loadAllCustomerContacts();

    if (lead.jobber_client_id) {
      if (customers.some((c) => c.jobber_client_id === lead.jobber_client_id)) {
        return { ok: true, clientId: lead.jobber_client_id, created: false };
      }
    }

    const phone = normalizePhone(lead.phone);
    const email = normalizeEmail(lead.email);
    const existing = customers.find(
      (c) =>
        (phone && normalizePhone(c.phone) === phone) ||
        (email && normalizeEmail(c.email) === email)
    );

    let clientId: string;
    let created = false;

    if (existing) {
      clientId = existing.jobber_client_id;
    } else {
      const fullName =
        [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() ||
        lead.email ||
        lead.phone ||
        "Customer";

      const result = await createNativeCustomer({
        fullName,
        email: lead.email,
        phone: lead.phone,
        street: lead.address,
        city: lead.city,
        state: lead.state,
        zip: lead.zip,
        knownLatitude: lead.address_lat ?? null,
        knownLongitude: lead.address_lng ?? null,
      });

      if (!result.ok) {
        return { ok: false, error: result.error };
      }

      clientId = result.value.clientId;
      created = true;
    }

    await supabaseServer
      .from("leads")
      .update({ jobber_client_id: clientId })
      .eq("id", lead.id);

    // Quotes written for this lead before it had a customer sat with no
    // customer_id and never showed on the customer's page.
    await supabaseServer
      .from("quotes")
      .update({ customer_id: clientId })
      .eq("lead_id", lead.id)
      .is("customer_id", null);

    return { ok: true, clientId, created };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unexpected error.",
    };
  }
}
