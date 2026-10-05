// Bank feed, Phase 2 of the QuickBooks replacement. Step 2 of the Plaid
// Link flow -- exchanges the public_token Plaid Link returned on
// success for a permanent access_token, fetches the linked account(s),
// and stores one `bank_connections` row + one `bank_accounts` row per
// account. Admin-gated.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { getPlaidClient } from "@/lib/plaid";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAuditLog } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let actor;

  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const publicToken = body?.publicToken;
  // Plaid Link's own onSuccess metadata already carries the
  // institution's name/id client-side -- using that instead of a second
  // server round trip to /institutions/get_by_id.
  const institutionName =
    typeof body?.institutionName === "string" ? body.institutionName : null;
  const institutionId =
    typeof body?.institutionId === "string" ? body.institutionId : null;

  if (typeof publicToken !== "string" || !publicToken) {
    return NextResponse.json(
      { error: "Missing publicToken from Plaid Link." },
      { status: 400 }
    );
  }

  try {
    const client = getPlaidClient();

    const exchangeResponse = await client.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    const accountsResponse = await client.accountsGet({
      access_token: accessToken,
    });

    const { data: connection, error: connectionError } = await supabaseServer
      .from("bank_connections")
      .insert({
        provider: "plaid",
        plaid_item_id: itemId,
        plaid_access_token: accessToken,
        institution_name: institutionName,
        institution_id: institutionId,
        status: "active",
      })
      .select("id")
      .single();

    if (connectionError || !connection) {
      throw new Error(
        connectionError?.message ?? "Failed to save the bank connection."
      );
    }

    const accountRows = accountsResponse.data.accounts.map((account) => ({
      bank_connection_id: connection.id,
      plaid_account_id: account.account_id,
      name: account.name,
      mask: account.mask,
      subtype: account.subtype,
    }));

    const { error: accountsError } = await supabaseServer
      .from("bank_accounts")
      .insert(accountRows);

    if (accountsError) {
      throw new Error(accountsError.message);
    }

    // Never pass the access token itself into the audit log -- it isn't
    // in lib/auditDiff.ts's REDACT_FIELDS list (that's password fields
    // only), so this builds the "after" payload by hand rather than
    // relying on redaction to catch it.
    await recordAuditLog({
      actor,
      action: "create",
      entityType: "bank_connection",
      entityId: connection.id,
      entityLabel: institutionName ?? "Bank connection",
      after: {
        institution_name: institutionName,
        accounts: accountRows.map((row) => ({
          name: row.name,
          mask: row.mask,
          subtype: row.subtype,
        })),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to connect the bank account.",
      },
      { status: 500 }
    );
  }
}
