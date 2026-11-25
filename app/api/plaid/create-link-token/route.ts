// Bank feed, Phase 2 of the QuickBooks replacement. Step 1 of the Plaid
// Link flow -- the client calls this to get a link_token, then opens
// Plaid's hosted Link UI with it (see ConnectBankButton.tsx). Admin-gated
// same as every other action that touches a financial connection in
// this app.
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/currentUser";
import { getPlaidClient, describePlaidError } from "@/lib/plaid";
import { CountryCode, Products } from "plaid";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let actor;

  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const client = getPlaidClient();

    // Reconnect ("update mode"): when the bank revokes or expires a
    // connection (e.g. "OAuth connection ... has been invalidated"), Plaid
    // Link is opened with the EXISTING access token and no products, so the
    // same item is re-authorized instead of a duplicate connection being
    // created. The body is optional; a plain call starts a new connection.
    const body = await request.json().catch(() => null);
    const connectionId = typeof body?.connectionId === "string" ? body.connectionId : null;

    if (connectionId) {
      const { data: connection } = await supabaseServer
        .from("bank_connections")
        .select("plaid_access_token")
        .eq("id", connectionId)
        .maybeSingle();

      if (!connection?.plaid_access_token) {
        return NextResponse.json({ error: "Bank connection not found." }, { status: 404 });
      }

      const updateResponse = await client.linkTokenCreate({
        user: { client_user_id: actor.id },
        client_name: "Valley Turf Revival",
        country_codes: [CountryCode.Us],
        language: "en",
        access_token: connection.plaid_access_token,
      });

      return NextResponse.json({ linkToken: updateResponse.data.link_token });
    }

    const response = await client.linkTokenCreate({
      user: { client_user_id: actor.id },
      client_name: "Valley Turf Revival",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });

    return NextResponse.json({ linkToken: response.data.link_token });
  } catch (error) {
    return NextResponse.json(
      { error: describePlaidError(error) },
      { status: 500 }
    );
  }
}
