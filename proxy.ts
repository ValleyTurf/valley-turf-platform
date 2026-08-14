import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import {
  PORTAL_SESSION_COOKIE_NAME,
  verifyPortalSessionToken,
} from "@/lib/portalAuth";

// Deliberately no lib/permissions or lib/supabase-server import here.
// This file runs in a restricted (Edge-like) runtime that can't load the
// Supabase client — the role/section permission check now happens in
// app/(platform)/layout.tsx instead (a real Node.js server component),
// using the x-pathname header set below to know what was requested.

const PUBLIC_PATHS = [
  "/login",
  "/api/login",
  "/api/logout",
  // Jobber POSTs directly to this one — no session, no cron secret.
  "/api/jobber/webhook",
  "/api/scan-leads",
  // Called by an external automation (Jobber automation / Zapier), not
  // from inside this app. Guards itself internally with its own
  // LEADS_WEBHOOK_SECRET bearer check (see route.ts) rather than a
  // session cookie, since the caller has no browser session.
  "/api/leads",
  // PWA installability assets — none of these carry sensitive data, and
  // all of them need to be fetchable with no session cookie present.
  // Before this, they all silently 302'd to /login (HTML) instead of
  // returning the actual manifest/icon/script, which meant Chrome/iOS
  // could never see a valid manifest or service worker on a first visit
  // (no cookie yet) and installability checks failed. /offline.html
  // specifically also needs to survive a session that has since expired
  // while the device was offline.
  "/manifest.json",
  "/icons",
  "/sw.js",
  "/offline.html",
  // Same reasoning as the PWA assets above — a crawler requesting this
  // with no session cookie was getting redirected to /login (HTML)
  // instead of the actual disallow rules, so Googlebot had no way to
  // even find out it wasn't supposed to be here.
  "/robots.txt",
];

// Routes Vercel Cron calls on a schedule (see vercel.json) that have no
// auth check of their own. These get no browser session cookie, so they
// were silently redirected to /login and never actually running — which
// is why, e.g., the payments sync never produced its first status row.
// Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` on
// cron-triggered requests once CRON_SECRET is set as an env var, so we
// accept that instead of a session for just these paths.
const CRON_PATHS = [
  "/api/jobber/sync-customers",
  "/api/jobber/sync-invoices",
  "/api/jobber/sync-jobs",
  "/api/jobber/sync-payments",
  "/api/jobber/sync-payouts",
  "/api/jobber/sync-payment-fees",
  "/api/jobber/sync-visits",
  "/api/jobber/process-webhooks",
];

// The customer portal is a completely separate auth world from the staff
// app above — its own cookie (lib/portalAuth.ts), its own login flow
// (magic-link email, not username/password), and its own identity
// headers below (x-portal-*, not x-user-*). /portal/login (request a
// link) and /portal/verify (consume a token from that emailed link) have
// to be reachable with no session at all — that's the whole point of a
// magic link. /portal/logout is included too so clearing an already-
// expired/invalid cookie never itself gets redirect-looped.
const PORTAL_PUBLIC_PATHS = ["/portal/login", "/portal/verify", "/portal/logout"];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isAuthorizedCronRequest(
  request: NextRequest,
  pathname: string
): boolean {
  if (!matchesPrefix(pathname, CRON_PATHS)) {
    return false;
  }

  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handled entirely separately from the staff session logic below —
  // a customer hitting /portal/* should never be redirected to the
  // staff /login page, and a staff member's own session cookie has no
  // bearing on portal access at all.
  if (pathname === "/portal" || pathname.startsWith("/portal/")) {
    if (matchesPrefix(pathname, PORTAL_PUBLIC_PATHS)) {
      return NextResponse.next();
    }

    const portalToken = request.cookies.get(PORTAL_SESSION_COOKIE_NAME)?.value;
    const portalUser = await verifyPortalSessionToken(portalToken);

    if (!portalUser) {
      return NextResponse.redirect(new URL("/portal/login", request.url));
    }

    const headers = new Headers(request.headers);
    headers.set("x-portal-client-id", portalUser.jobberClientId);
    headers.set("x-portal-email", portalUser.email);
    headers.set("x-portal-name", portalUser.name);

    return NextResponse.next({ request: { headers } });
  }

  const isPublicPath = matchesPrefix(pathname, PUBLIC_PATHS);
  const isPublicRedirect = pathname.startsWith("/r/");
  // Public quote view/accept/decline — same unguessable-token trust
  // model as /r/ above. Covers both the page and its Server Actions,
  // since those POST back to this same /q/[token] path.
  const isPublicQuote = pathname.startsWith("/q/");

  if (isPublicPath || isPublicRedirect || isPublicQuote) {
    return NextResponse.next();
  }

  // Let an authorized Vercel Cron request through without requiring a
  // user session — but only for the specific cron-triggered paths above.
  // A logged-in admin's browser clicking "Sync Now" still works too,
  // since that goes through the normal session check below instead.
  if (isAuthorizedCronRequest(request, pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = await verifySessionToken(token);

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);

    return NextResponse.redirect(loginUrl);
  }

  // Role/section permission enforcement lives in
  // app/(platform)/layout.tsx now, not here — see note at the top of this
  // file. This layer only handles authentication (is there a valid
  // session at all).

  // Hand the verified identity to server components/actions via request
  // headers, so pages that need to know "who's logged in" (Team page,
  // audit trails, nav gating) don't have to re-verify or hit the DB.
  // x-pathname lets the (platform) layout — which has no other way to
  // see the current path — run the permission check against it.
  const headers = new Headers(request.headers);
  headers.set("x-user-id", user.id);
  headers.set("x-user-email", user.email);
  headers.set("x-user-name", user.name);
  headers.set("x-user-role", user.role);
  headers.set("x-pathname", pathname);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
