import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { isAdminOnlyPath } from "@/lib/permissions";

const PUBLIC_PATHS = [
  "/login",
  "/api/login",
  "/api/logout",
  // Jobber POSTs directly to this one — no session, no cron secret.
  "/api/jobber/webhook",
  // Guards itself internally with its own JOBBER_SYNC_SECRET bearer
  // check (see route.ts) — that's a different secret than CRON_SECRET
  // below, and Vercel's automatic cron auth only ever sends CRON_SECRET,
  // so this one has to stay public here and rely on its own check.
  "/api/jobber/process-webhooks",
  "/api/scan-leads",
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
  "/api/jobber/sync-visits",
];

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

  const isPublicPath = matchesPrefix(pathname, PUBLIC_PATHS);
  const isPublicRedirect = pathname.startsWith("/r/");

  if (isPublicPath || isPublicRedirect) {
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

  if (user.role !== "admin" && isAdminOnlyPath(pathname)) {
    const dashboardUrl = new URL("/dashboard", request.url);

    return NextResponse.redirect(dashboardUrl);
  }

  // Hand the verified identity to server components/actions via request
  // headers, so pages that need to know "who's logged in" (Team page,
  // audit trails, nav gating) don't have to re-verify or hit the DB.
  const headers = new Headers(request.headers);
  headers.set("x-user-id", user.id);
  headers.set("x-user-email", user.email);
  headers.set("x-user-name", user.name);
  headers.set("x-user-role", user.role);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
