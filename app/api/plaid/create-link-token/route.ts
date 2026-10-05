// Bank feed, Phase 2 of the QuickBooks replacement. Step 1 of the Plaid
// Link flow -- the client calls this to get a link_token, then opens
// Plaid's hosted Link UI with it (see ConnectBankButton.tsx). Admin-gated
// same as every other action that touches a financial connection in
// this app.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { getPlaidClient } from "@/lib/plaid";
import { CountryCode, Products } from "plaid";

export const dynamic = "force-dynamic";

export async function POST() {
  let actor;

  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const client = getPlaidClient();

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
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create a Plaid Link token.",
      },
      { status: 500 }
    );
  }
}
