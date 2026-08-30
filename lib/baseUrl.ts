// Shared "what's my own base URL" helper for building absolute links in
// server code -- portal magic-link emails, Stripe Checkout success/cancel
// URLs, and eventually native invoice "Pay Now" links. Reads the
// request's forwarded host rather than a hardcoded env var, so it works
// unchanged across localhost, preview deployments, and production with
// no per-environment configuration.
import "server-only";
import { headers } from "next/headers";

export async function getBaseUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = host?.includes("localhost") ? "http" : "https";

  return `${protocol}://${host}`;
}
