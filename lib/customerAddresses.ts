// Extra property addresses per customer -- see migration
// 079_add_customer_addresses.sql's header comment for the full schema
// reasoning. Deliberately the same shape as lib/customerContacts.ts:
// reference-only, doesn't touch customers.address_line_1/latitude/
// longitude (which still drive navigation) or sync to Jobber.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

export type CustomerAddress = {
  id: string;
  jobberClientId: string;
  label: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  createdAt: string;
};

type CustomerAddressRow = {
  id: string;
  jobber_client_id: string;
  label: string | null;
  address_line_1: string;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  created_at: string;
};

function mapRow(row: CustomerAddressRow): CustomerAddress {
  return {
    id: row.id,
    jobberClientId: row.jobber_client_id,
    label: row.label,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    createdAt: row.created_at,
  };
}

export async function listAddressesForCustomer(
  jobberClientId: string
): Promise<CustomerAddress[]> {
  const { data, error } = await supabaseServer
    .from("customer_addresses")
    .select(
      "id, jobber_client_id, label, address_line_1, address_line_2, city, state, postal_code, created_at"
    )
    .eq("jobber_client_id", jobberClientId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`listAddressesForCustomer failed for ${jobberClientId}:`, error.message);
    return [];
  }

  return ((data ?? []) as CustomerAddressRow[]).map(mapRow);
}

export type AddAddressParams = {
  jobberClientId: string;
  label: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

export async function addAddress(
  params: AddAddressParams
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!params.addressLine1.trim()) {
    return { ok: false, error: "Enter a street address." };
  }

  const { error } = await supabaseServer.from("customer_addresses").insert({
    jobber_client_id: params.jobberClientId,
    label: params.label,
    address_line_1: params.addressLine1,
    address_line_2: params.addressLine2,
    city: params.city,
    state: params.state,
    postal_code: params.postalCode,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function deleteAddress(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseServer.from("customer_addresses").delete().eq("id", id);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
