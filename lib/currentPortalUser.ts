// Reads the portal customer identity proxy.ts attached to the request
// headers (x-portal-*) after verifying the portal session cookie. Mirrors
// lib/currentUser.ts's relationship to the staff session exactly, just
// for the separate customer portal session.

import { headers } from "next/headers";
import type { PortalSessionUser } from "@/lib/portalAuth";

export async function getCurrentPortalUser(): Promise<PortalSessionUser | null> {
  const headerList = await headers();

  const jobberClientId = headerList.get("x-portal-client-id");
  const email = headerList.get("x-portal-email");
  const name = headerList.get("x-portal-name");

  if (!jobberClientId || !email || !name) {
    return null;
  }

  return { jobberClientId, email, name };
}

export async function requirePortalUser(): Promise<PortalSessionUser> {
  const user = await getCurrentPortalUser();

  if (!user) {
    throw new Error("Portal sign-in required.");
  }

  return user;
}
