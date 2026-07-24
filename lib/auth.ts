// Signs and verifies per-user session tokens.
//
// Replaces the old single shared-password session (one HMAC-signed
// timestamp, no identity attached) with a token that carries who's
// actually logged in — user id, name, email, role — so middleware can
// both authenticate *and* authorize (gate admin-only pages) without a
// database round trip on every request.
//
// Uses the Web Crypto API (globalThis.crypto.subtle / btoa / atob)
// instead of Node's `crypto` module or `Buffer`, because this needs to
// run unchanged in both middleware's Edge runtime and the login route's
// serverless function. Password *hashing* (which is Node-only) lives in
// lib/passwords.ts and is never imported here.

export type Role = "admin" | "staff";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

type SessionPayload = SessionUser & { exp: number };

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000;

export const SESSION_COOKIE_NAME = "vtr_session";

function getSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;

  if (!secret) {
    throw new Error(
      "AUTH_SESSION_SECRET is not set. Sessions cannot be signed or verified without it."
    );
  }

  return secret;
}

async function getSigningKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
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

// Base64url encode/decode built on btoa/atob (both available in the Edge
// runtime) rather than Buffer (not reliably available there).
function encodePayload(payload: SessionPayload): string {
  const json = JSON.stringify(payload);
  const utf8Safe = btoa(unescape(encodeURIComponent(json)));

  return utf8Safe.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodePayload(encoded: string): SessionPayload | null {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(escape(atob(padded)));
    const parsed = JSON.parse(json);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.id !== "string" ||
      typeof parsed.email !== "string" ||
      typeof parsed.name !== "string" ||
      (parsed.role !== "admin" && parsed.role !== "staff") ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }

    return parsed as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSessionToken(
  user: SessionUser
): Promise<string> {
  const payload: SessionPayload = {
    ...user,
    exp: Date.now() + SESSION_MAX_AGE_MS,
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

export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionUser | null> {
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

  const { id, email, name, role } = payload;

  return { id, email, name, role };
}
