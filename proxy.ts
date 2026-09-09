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
  // Stripe POSTs directly to this one too — no session, no cron secret.
  // Guards itself internally via the stripe-signature header check (see
  // route.ts) instead, same as the Jobber webhook above.
  "/api/webhooks/stripe",
  // Resend POSTs directly to this one too — guards itself internally via
  // the svix-signature header check (see route.ts), same pattern as the
  // Stripe webhook above.
  "/api/webhooks/resend",
  // Twilio POSTs directly to this one too (inbound SMS) — guards itself
  // internally via the X-Twilio-Signature header check (see route.ts),
  // same pattern as the Stripe/Resend webhooks above. This is the exact
  // bug class that broke marketing-site photos (missing public exemption
  // -> redirected to /login instead of reaching the route) — do not repeat
  // it here.
  "/api/webhooks/twilio",
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
  // Logo/wordmark assets referenced as plain <img> tags on public pages
  // (app/request-quote/page.tsx, and now the app/site marketing tree) --
  // without this, an anonymous visitor's browser request for the image
  // itself (a separate GET from the page it's embedded in) hit this same
  // auth check and got 302'd to /login, so the logo silently rendered as
  // a broken image for every signed-out visitor.
  "/branding",
  // Same bug, same fix, for the real hero/gallery/before-after photos
  // added to the marketing site (public/images/**). next/image's
  // optimizer fetches these from this same deployment over HTTP, so
  // without a public exemption every one of those fetches got redirected
  // to the login page (HTML) instead of the actual photo, which is
  // exactly why they rendered as broken images for a signed-out visitor.
  "/images",
  // Same reasoning as the PWA assets above — a crawler requesting this
  // with no session cookie was getting redirected to /login (HTML)
  // instead of the actual disallow rules, so Googlebot had no way to
  // even find out it wasn't supposed to be here.
  "/robots.txt",
  // Privacy Policy / Terms & Conditions, hosted here (not just on
  // valleyturfrevival.com) specifically so Twilio's A2P 10DLC campaign
  // vetting crawler can read them. That crawler fetches raw HTML and
  // doesn't execute JavaScript -- valleyturfrevival.com's Jobber-builder
  // pages render their actual policy text client-side, so a
  // non-JS-executing fetch of those pages returns an empty shell (no
  // policy text anywhere in the initial response), which is what
  // triggered the repeated 30908/30896/30882 rejections even though the
  // content is genuinely there for a human visitor. These pages mirror
  // that same approved text, but as plain server-rendered HTML with the
  // full text present on first load, no session cookie required.
  "/privacy-policy",
  "/terms-and-conditions",
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
  // Tier 2 Stage 3 (Jobber Independence Roadmap) — tops up native
  // recurring jobs' future visits. Not a Jobber route at all, but reuses
  // this same CRON_SECRET mechanism since it's the same "Vercel Cron
  // calls this on a schedule with no browser session" situation.
  "/api/jobs/generate-recurring-visits",
  // Tier 3 (Jobber Independence Roadmap) — daily pre-visit reminder send.
  // Same reasoning as generate-recurring-visits above.
  "/api/visits/send-reminders",
  // Tier 3 — review request send. Wired but inactive until Ryan enables
  // it from Settings (see lib/reviewRequests.ts's header comment).
  "/api/visits/send-review-requests",
  // Overdue invoice payment reminders + quote follow-up nudges (Ryan's
  // request) -- same reasoning as send-reminders above.
  "/api/invoices/send-overdue-reminders",
  "/api/quotes/send-followups",
  // Daily ops digest (Ryan's request) -- unlogged job costs, visits
  // missing photos, quotes approved but not scheduled, stuck
  // timeclock/job-timer entries.
  "/api/ops/send-daily-digest",
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

// Jobber Independence Roadmap, marketing-site build: the public
// valleyturfrevival.com domain and the CRM's go.valleyturfrevival.com
// subdomain are two Host headers pointed at this same Vercel deployment.
// Rather than build a second Next.js project, marketing pages live under
// app/site/ and only get served when the Host is one of these -- every
// other host (go.valleyturfrevival.com, Vercel preview URLs, localhost)
// falls straight through to the normal CRM routing below, completely
// unaffected.
const MARKETING_HOSTS = ["valleyturfrevival.com", "www.valleyturfrevival.com"];

// Only these paths get rewritten into app/site/* -- deliberately an
// allowlist rather than "rewrite everything on this host," so that
// /request-quote, /privacy-policy, /terms-and-conditions, /login, /api/*,
// PWA assets, etc. keep resolving to their existing pages unchanged
// regardless of which domain they're hit from (they already work fine on
// both, and are already public/shared).
const MARKETING_PATH_PREFIXES = ["/services", "/about", "/reviews", "/service-areas"];

// "/" is special-cased separately below since app/page.tsx (the CRM's
// own root) unconditionally redirects to /my-day -- a marketing-domain
// visitor hitting "/" must never reach that, it needs the actual
// homepage at app/site/page.tsx instead.
function marketingRewritePath(pathname: string): string | null {
  if (pathname === "/") return "/site";
  if (pathname === "/robots.txt") return "/site/robots.txt";
  if (pathname === "/sitemap.xml") return "/site/sitemap.xml";
  if (matchesPrefix(pathname, MARKETING_PATH_PREFIXES)) return `/site${pathname}`;
  return null;
}

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

  // Marketing domain routing -- checked first and returns immediately,
  // ahead of every other branch below (portal, cron, staff session).
  // These are public-by-definition pages that need no auth of any kind,
  // same reasoning as the token-based public paths further down.
  const hostname = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  if (MARKETING_HOSTS.includes(hostname)) {
    const rewritePath = marketingRewritePath(pathname);
    if (rewritePath) {
      return NextResponse.rewrite(new URL(rewritePath, request.url));
    }
    // Any other path on the marketing domain (e.g. /request-quote,
    // /privacy-policy, /login) falls through unchanged into the normal
    // logic below -- those already work identically on both domains.
  }

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
    // "" (not omitted) when the customer signed in by text and has no
    // email on file -- lib/currentPortalUser.ts treats that as valid and
    // maps it back to null, rather than treating a missing header as
    // "not signed in" the way it does for jobberClientId/name.
    headers.set("x-portal-email", portalUser.email ?? "");
    headers.set("x-portal-name", portalUser.name);

    return NextResponse.next({ request: { headers } });
  }

  const isPublicPath = matchesPrefix(pathname, PUBLIC_PATHS);
  const isPublicRedirect = pathname.startsWith("/r/");
  // Public quote view/accept/decline — same unguessable-token trust
  // model as /r/ above. Covers both the page and its Server Actions,
  // since those POST back to this same /q/[token] path.
  const isPublicQuote = pathname.startsWith("/q/");
  // Public invoice view/pay — same unguessable-token trust model as
  // /q/ above (public_token, migration 046). Covers both the page and
  // its Server Action (payInvoice posts back to this same /pay/[token]
  // path).
  const isPublicInvoicePay = pathname.startsWith("/pay/");
  // Staff-shared autopay enrollment link -- same unguessable-token trust
  // model as /pay/ and /q/ above (customer_payment_methods.enrollment_token,
  // migration 047). Covers both the page and its Server Action.
  const isPublicAutopay = pathname.startsWith("/autopay/");
  // Public visit-confirmation link sent in the 4-day/2-day reminder
  // text/email -- same unguessable-token trust model as /pay/ and /q/
  // above (jobber_visits.confirmation_token, migration 061). Covers both
  // the page and its Server Action.
  const isPublicConfirm = pathname.startsWith("/confirm/");
  // Public quote-request intake form (app/request-quote) — no token at
  // all, since this is where NEW leads originate rather than looking up
  // an existing record. Replaces the Jobber-embedded quote form as the
  // site's public lead capture (see 050_add_lead_form_fields.sql).
  const isPublicRequestQuote = pathname.startsWith("/request-quote");

  if (
    isPublicPath ||
    isPublicRedirect ||
    isPublicQuote ||
    isPublicInvoicePay ||
    isPublicAutopay ||
    isPublicRequestQuote ||
    isPublicConfirm
  ) {
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
