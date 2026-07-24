// Signs and verifies the admin session cookie so it's an opaque, expiring
// token rather than the literal admin password sitting in the browser's
// cookie jar (which was the previous behavior). Uses the Web Crypto API
// (globalThis.crypto.subtle) instead of Node's `crypto` module so the same
// code runs unchanged in both middleware's Edge runtime and the login
// route's serverless function.
//
// The signing key is derived from ADMIN_PASSWORD itself, so no additional
// Vercel env var or redeploy is required to roll this out — the HMAC
// signature can't be reversed back into the password, which is the actual
// security gap being closed here.

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000;

async function getSigningKey(): Promise<CryptoKey> {
  const secret = process.env.ADMIN_PASSWORD ?? "";

  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
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

export async function createSessionToken(): Promise<string> {
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  const key = await getSigningKey();

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(String(expiresAt))
  );

  return `${expiresAt}.${toHex(signature)}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<boolean> {
  if (!token) return false;

  const [expiresAtRaw, signatureHex] = token.split(".");
  const expiresAt = Number(expiresAtRaw);

  if (!expiresAtRaw || !signatureHex || !Number.isFinite(expiresAt)) {
    return false;
  }

  if (Date.now() > expiresAt) {
    return false;
  }

  const key = await getSigningKey();
  const expectedSignature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(String(expiresAt))
  );

  return toHex(expectedSignature) === signatureHex;
}
