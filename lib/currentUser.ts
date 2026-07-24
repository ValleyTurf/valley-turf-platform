// Reads the identity middleware.ts attached to the request headers
// (x-user-*) after verifying the session cookie. Use this in server
// components, route handlers, and server actions that need to know who's
// logged in — it avoids re-verifying the signed token or hitting Supabase
// on every call.
//
// Server actions run in the same request scope as the page that invoked
// them, so headers() reflects what middleware set even there.

import { headers } from "next/headers";
import type { Role, SessionUser } from "@/lib/auth";

export async function getCurrentUser(): Promise<SessionUser | null> {
  const headerList = await headers();

  const id = headerList.get("x-user-id");
  const email = headerList.get("x-user-email");
  const name = headerList.get("x-user-name");
  const role = headerList.get("x-user-role") as Role | null;

  if (!id || !email || !name || (role !== "admin" && role !== "staff")) {
    return null;
  }

  return { id, email, name, role };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();

  if (!user || user.role !== "admin") {
    throw new Error("Admin access required.");
  }

  return user;
}
