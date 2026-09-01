// Step 2 of the QuickBooks OAuth flow -- Intuit redirects here after
// the admin approves the connection, with ?code=, ?realmId=, and
// ?state= (state is whatever /api/quickbooks/connect generated,
// "sandbox:<uuid>" or "production:<uuid>").
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { getBaseUrl } from "@/lib/baseUrl";
import { exchangeCodeForTokens, type QuickbooksEnvironment } from "@/lib/quickbooks";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const code = request.nextUrl.searchParams.get("code");
  const realmId = request.nextUrl.searchParams.get("realmId");
  const state = request.nextUrl.searchParams.get("state");
  const errorParam = request.nextUrl.searchParams.get("error");

  if (errorParam) {
    return NextResponse.json(
      { error: `QuickBooks declined the connection: ${errorParam}` },
      { status: 400 }
    );
  }

  if (!code || !realmId) {
    return NextResponse.json(
      { error: "Missing code or realmId from QuickBooks callback." },
      { status: 400 }
    );
  }

  const environment: QuickbooksEnvironment = state?.startsWith("production:")
    ? "production"
    : "sandbox";

  const baseUrl = await getBaseUrl();
  const redirectUri = `${baseUrl}/api/quickbooks/callback`;

  const result = await exchangeCodeForTokens({ code, redirectUri, realmId, environment });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: `QuickBooks (${environment}) connected successfully. Company realmId: ${realmId}.`,
  });
}
