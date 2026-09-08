// Supabase-backed half of customer portal magic-link login — looking up
// a customer by email and creating/consuming a one-time login token.
// Deliberately separate from lib/portalAuth.ts (which only signs/verifies
// the resulting session token and must stay Edge-safe for proxy.ts) —
// same split app/api/login/route.ts already has with lib/auth.ts.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizePhone } from "@/lib/matching";

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

export type PortalLoginCustomer = {
  jobberClientId: string;
  // Nullable now that a customer can also sign in by phone (see
  // findPortalCustomerByPhone below) -- not every customer on file has
  // an email, and requiring one here would have blocked that path.
  email: string | null;
  name: string;
};

// 32 random bytes -> 64 hex chars. This grants a full portal session on
// a single click, so it needs meaningfully more entropy than the
// shareable quote-accept link (lib/quotes.ts's generatePublicToken).
function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function findPortalCustomerByEmail(
  email: string
): Promise<PortalLoginCustomer | null> {
  const { data, error } = await supabaseServer
    .from("customers")
    .select("jobber_client_id, email, full_name")
    .ilike("email", email.trim())
    .not("jobber_client_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (error || !data || !data.jobber_client_id) {
    return null;
  }

  return {
    jobberClientId: data.jobber_client_id as string,
    email: (data.email as string | null) ?? email.trim(),
    name: (data.full_name as string | null) || "there",
  };
}

export async function createPortalLoginToken(
  customer: PortalLoginCustomer
): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const { error } = await supabaseServer.from("portal_login_tokens").insert({
    token,
    jobber_client_id: customer.jobberClientId,
    email: customer.email,
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(`Unable to create portal login token: ${error.message}`);
  }

  return token;
}

// Phone counterpart to findPortalCustomerByEmail, for the text-based
// sign-in option. `customers.phone` isn't stored in one consistent
// format (formatted vs. digits-only depends on how Jobber synced it),
// so an exact/ilike column match can't be trusted -- instead this pulls
// the (small, single-business) set of phone-having customers and
// compares digits-only via the same normalizePhone() lib/campaignRoi.ts
// already relies on for cross-source phone matching.
export async function findPortalCustomerByPhone(
  phone: string
): Promise<PortalLoginCustomer | null> {
  const target = normalizePhone(phone);
  if (!target) return null;

  const { data, error } = await supabaseServer
    .from("customers")
    .select("jobber_client_id, email, phone, full_name")
    .not("jobber_client_id", "is", null)
    .not("phone", "is", null);

  if (error || !data) return null;

  const match = data.find(
    (row) => normalizePhone(row.phone as string | null) === target
  );

  if (!match || !match.jobber_client_id) return null;

  return {
    jobberClientId: match.jobber_client_id as string,
    email: (match.email as string | null) || null,
    name: (match.full_name as string | null) || "there",
  };
}

export type ConsumedPortalToken = {
  jobberClientId: string;
  email: string | null;
  name: string;
};

// Single-use: the used_at check + update means a link that's already
// been clicked (or is being replayed) never grants a second session,
// even if someone forwards the email or it's sitting in a shared inbox.
export async function consumePortalLoginToken(
  token: string
): Promise<ConsumedPortalToken | null> {
  const { data, error } = await supabaseServer
    .from("portal_login_tokens")
    .select("token, jobber_client_id, email, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !data || data.used_at) {
    return null;
  }

  if (new Date(data.expires_at as string).getTime() < Date.now()) {
    return null;
  }

  const { error: updateError } = await supabaseServer
    .from("portal_login_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token)
    .is("used_at", null);

  if (updateError) {
    return null;
  }

  const jobberClientId = data.jobber_client_id as string;

  const { data: customer } = await supabaseServer
    .from("customers")
    .select("full_name")
    .eq("jobber_client_id", jobberClientId)
    .maybeSingle();

  return {
    jobberClientId,
    email: data.email as string | null,
    name: (customer?.full_name as string | null) || "there",
  };
}
