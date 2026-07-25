import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.AUTH_SESSION_SECRET = "test-secret-do-not-use-in-production";
});

describe("createSessionToken / verifySessionToken", () => {
  it("round-trips a valid session token", async () => {
    const { createSessionToken, verifySessionToken } = await import(
      "./auth"
    );

    const user = {
      id: "user-1",
      email: "admin@example.com",
      name: "Admin User",
      role: "admin" as const,
    };

    const token = await createSessionToken(user);
    const verified = await verifySessionToken(token);

    expect(verified).toEqual(user);
  });

  it("rejects a missing token", async () => {
    const { verifySessionToken } = await import("./auth");

    expect(await verifySessionToken(null)).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const { createSessionToken, verifySessionToken } = await import(
      "./auth"
    );

    const token = await createSessionToken({
      id: "user-1",
      email: "staff@example.com",
      name: "Staff User",
      role: "staff",
    });

    const [payload, signature] = token.split(".");
    // Flip the role by re-encoding a modified payload, but keep the
    // original (now-mismatched) signature — simulates someone trying to
    // escalate their own role by editing the cookie.
    const tamperedPayload =
      payload.slice(0, -1) + (payload.slice(-1) === "A" ? "B" : "A");

    expect(
      await verifySessionToken(`${tamperedPayload}.${signature}`)
    ).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const { createSessionToken, verifySessionToken } = await import(
      "./auth"
    );

    const token = await createSessionToken({
      id: "user-1",
      email: "admin@example.com",
      name: "Admin User",
      role: "admin",
    });

    process.env.AUTH_SESSION_SECRET = "a-different-secret";

    expect(await verifySessionToken(token)).toBeNull();

    process.env.AUTH_SESSION_SECRET = "test-secret-do-not-use-in-production";
  });

  it("rejects an expired token", async () => {
    const authModule = await import("./auth");
    const token = await authModule.createSessionToken({
      id: "user-1",
      email: "admin@example.com",
      name: "Admin User",
      role: "admin",
    });

    // Decode, force exp into the past, re-encode with a fresh valid
    // signature so this exercises the expiry check specifically (not the
    // signature check).
    const [encodedPayload] = token.split(".");
    const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(escape(atob(padded)));
    const payload = JSON.parse(json);
    payload.exp = Date.now() - 1000;

    const reencoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(process.env.AUTH_SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(reencoded)
    );
    const signatureHex = Array.from(new Uint8Array(signature))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    expect(
      await authModule.verifySessionToken(`${reencoded}.${signatureHex}`)
    ).toBeNull();
  });
});
