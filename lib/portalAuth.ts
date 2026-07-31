// Signs and verifies customer portal session tokens — the exact same
// HMAC-signed-payload approach as lib/auth.ts, but for a completely
// separate session (its own cookie, its own payload shape) so a staff
// login and a customer portal login never share or collide with each
// other's cookie.
//
// Deliberately does NOT `import "server-only"`, and deliberately does
// NOT import lib/supabase-server.ts — same reasoning as lib/auth.ts's
// own header comment: proxy.ts (Edge runtime) needs to verify a portal
// session on every /portal/* request, and lib/supabase-server.ts's
// module-scope createClient() call breaks the moment it's pulled into
// that runtime. The actual Supabase-backed magic-link token lookup
// (looking up a customer by email, writing/consuming a
// portal_login_tokens row) lives in the route handlers themselves
// (app/portal/login/actions.ts, app/portal/verify/route.ts) — same split
// app/api/login/route.ts already uses with lib/auth.ts.

export type PortalSessionUser = {
  jobberClientId: string;
  email: string;
  name: string;
};

type PortalSessionPayload = PortalSessionUser & { exp: number };

const PORTAL_SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
export const PORTAL_SESSION_MAX_AGE_SECONDS =
  PORTAL_SESSION_MAX_AGE_MS / 1000;

export const PORTAL_SESSION_COOKIE_NAME = "vtr_portal_session";

function getSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;

  if (!secret) {
    throw new Error(
      "AUTH_SESSION_SECRET is not set. Portal sessions cannot be signed or verified without it."
    );
  }

  return secret;
}

async function getSigningKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    // Distinct derived key material from the staff session (namespaced
    // suffix) so a portal token and a staff token are never
    // cryptographically interchangeable even though they share the same
    // underlying secret.
    new TextEncoder().encode(`${getSecret()}:portal`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function encodePayload(payload: PortalSessionPayload): string {
  const json = JSON.stringify(payload);
  const utf8Safe = btoa(unescape(encodeURIComponent(json)));

  return utf8Safe.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodePayload(encoded: string): PortalSessionPayload | null {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(escape(atob(padded)));
    const parsed = JSON.parse(json);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.jobberClientId !== "string" ||
      typeof parsed.email !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }

    return parsed as PortalSessionPayload;
  } catch {
    return null;
  }
}

export async function createPortalSessionToken(
  user: PortalSessionUser
): Promise<string> {
  const payload: PortalSessionPayload = {
    ...user,
    exp: Date.now() + PORTAL_SESSION_MAX_AGE_MS,
  };

  const encodedPayload = encodePayload(payload);
  const key = await getSigningKey();

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );

  return `${encodedPayload}.${toHex(signature)}`;
}

export async function verifyPortalSessionToken(
  token: string | undefined | null
): Promise<PortalSessionUser | null> {
  if (!token) return null;

  const [encodedPayload, signatureHex] = token.split(".");

  if (!encodedPayload || !signatureHex) {
    return null;
  }

  const payload = decodePayload(encodedPayload);

  if (!payload) {
    return null;
  }

  if (Date.now() > payload.exp) {
    return null;
  }

  const key = await getSigningKey();
  const expectedSignature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );

  if (toHex(expectedSignature) !== signatureHex) {
    return null;
  }

  const { jobberClientId, email, name } = payload;

  return { jobberClientId, email, name };
}
