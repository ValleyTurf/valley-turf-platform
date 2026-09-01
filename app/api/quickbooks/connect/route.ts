// Step 1 of the QuickBooks OAuth flow -- admin visits this route,
// gets redirected to Intuit to approve the connection, and lands back
// at /api/quickbooks/callback.
//
// ?env=sandbox (default) or ?env=production controls which environment
// the resulting connection gets tagged as (see lib/quickbooks.ts) --
// it's on the caller to make sure QBO_CLIENT_ID/QBO_CLIENT_SECRET
// currently hold the matching Development or Production keys from the
// Intuit developer dashboard, since that's what actually determines
// whether Intuit connects you to the sandbox or a real company.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { getBaseUrl } from "@/lib/baseUrl";
import { getQuickbooksAuthUrl } from "@/lib/quickbooks";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const envParam = request.nextUrl.searchParams.get("env");
  const environment = envParam === "production" ? "production" : "sandbox";

  const baseUrl = await getBaseUrl();
  const redirectUri = `${baseUrl}/api/quickbooks/callback`;

  // Environment is encoded directly in `state` -- the callback has no
  // other way to know which environment this connection is for, and a
  // single admin-only integration doesn't need anything fancier than
  // this for basic CSRF protection.
  const state = `${environment}:${crypto.randomUUID()}`;

  const authUrl = getQuickbooksAuthUrl({ redirectUri, state });

  return NextResponse.redirect(authUrl);
}
