// Password hashing for individual user accounts (replaces the single
// shared ADMIN_PASSWORD). Uses Node's built-in scrypt rather than pulling
// in bcrypt as a dependency — scrypt is memory-hard, well-vetted, and
// ships with Node's `crypto` module, so no extra package is needed.
//
// This file is Node-only (uses the `crypto` module directly, not Web
// Crypto), so it must only be imported from code that runs in the Node.js
// runtime — API routes and server actions, never `middleware.ts` (which
// runs on the Edge runtime). Session *token* signing/verification, which
// does need to run in middleware, lives in `lib/auth.ts` and uses Web
// Crypto instead.

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derivedKey = scryptSync(password, salt, KEY_LENGTH);

  return `${salt}:${derivedKey.toString("hex")}`;
}

export function verifyPassword(
  password: string,
  storedHash: string
): boolean {
  const [salt, hashHex] = storedHash.split(":");

  if (!salt || !hashHex) {
    return false;
  }

  const derivedKey = scryptSync(password, salt, KEY_LENGTH);
  const storedBuffer = Buffer.from(hashHex, "hex");

  if (derivedKey.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, storedBuffer);
}
