// Sandbox-only test tooling for the bank feed (Plaid) -- Plaid's canned
// sandbox test transactions for Houndstooth Bank all happen to predate
// the 10/1/2026 cutoff (confirmed via the Recent Sync Activity
// breakdown: "42 dated before 10/1/2026, 6 deposits"), so there's no
// way to see a transaction actually make it through the full pipeline
// (filter -> category map -> insert into expenses) without manually
// injecting one. Plaid's own /sandbox/transactions/create endpoint
// exists for exactly this -- see CustomSandboxTransaction in the
// plaid SDK's generated types.
//
// GET rather than POST so it can be triggered by just visiting the URL
// in an already-logged-in browser tab -- same pattern as the existing
// Jobber sync buttons, which also hit GET endpoints
// (settings/jobber/SyncButton.tsx).
//
// Hard-gated to PLAID_ENV === "sandbox" so this can never touch a real
// bank connection even if left in place after testing -- there's no
// real-money equivalent of "create a fake transaction" to worry about
// here, this call simply 400s outside sandbox.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { getPlaidClient, getPlaidEnv } from "@/lib/plaid";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  if (getPlaidEnv() !== "sandbox") {
    return NextResponse.json(
      { error: "Only available when PLAID_ENV is set to sandbox." },
      { status: 400 }
    );
  }

  const { data: connection, error: connectionError } = await supabaseServer
    .from("bank_connections")
    .select("id, institution_name, plaid_access_token")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connectionError) {
    return NextResponse.json({ error: connectionError.message }, { status: 500 });
  }

  if (!connection) {
    return NextResponse.json(
      { error: "No active bank connection. Connect one first." },
      { status: 400 }
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const client = getPlaidClient();

    await client.sandboxTransactionsCreate({
      access_token: connection.plaid_access_token,
      transactions: [
        {
          date_transacted: today,
          date_posted: today,
          // Positive = money leaving the account, per Plaid's sign
          // convention -- this should show up as an expense once
          // synced.
          amount: 42.5,
          description: "Test Hardware Store (sandbox seed)",
        },
      ],
    });

    return NextResponse.json({
      success: true,
      message: `Added a $42.50 test transaction dated ${today} to ${connection.institution_name ?? "the connected account"}. Go run Sync Now to pull it in.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create the sandbox test transaction.",
      },
      { status: 500 }
    );
  }
}
