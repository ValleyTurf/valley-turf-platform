// Shared "what's my own base URL" helper for building absolute links in
// server code -- portal magic-link emails, Stripe Checkout success/cancel
// URLs, native invoice "Pay Now" links, and every link a cron job puts in
// a customer text/email (visit-reminder confirm links, overdue-invoice
// pay links, quote follow-ups). Reads the request's forwarded host
// rather than a hardcoded env var, so it works unchanged across
// localhost and preview deployments.
//
// One exception (Ryan, 2026-11-15): on the PRODUCTION deployment, a
// request that arrives on a *.vercel.app host is answered with the real
// public address instead. Vercel's cron jobs call the deployment's own
// generated address (valley-turf-platform-<hash>-...vercel.app), not
// go.valleyturfrevival.com, so every cron-sent link was going out to
// customers pointing at a throwaway address tied to whichever build
// happened to be live that day -- odd-looking in a text, and frozen on
// that day's code forever. Preview deployments keep their own host on
// purpose, so testing a preview still links back to that preview.
import "server-only";
import { headers } from "next/headers";

const PRODUCTION_ORIGIN = "https://go.valleyturfrevival.com";

// Pure so it can be checked without a request context.
export function resolveBaseUrl(
  host: string | null,
  vercelEnv: string | undefined,
  configuredOrigin: string | undefined
): string {
  const productionOrigin = (configuredOrigin || PRODUCTION_ORIGIN).replace(/\/+$/, "");

  if (!host) {
    return productionOrigin;
  }

  // "Anything that isn't explicitly a preview" rather than "explicitly
  // production" -- if Vercel's system env vars were ever switched off,
  // VERCEL_ENV would be undefined and this would silently go back to
  // sending customers throwaway addresses.
  if (vercelEnv !== "preview" && host.toLowerCase().endsWith(".vercel.app")) {
    return productionOrigin;
  }

  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function getBaseUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");

  return resolveBaseUrl(host, process.env.VERCEL_ENV, process.env.APP_BASE_URL);
}
