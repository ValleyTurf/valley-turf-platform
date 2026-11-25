// Bank feed reconnect, final step. After the admin re-authorizes an
// existing connection in Plaid Link (update mode), nothing needs to be
// exchanged -- the same access token works again -- so this just flips the
// connection back to "active" and clears the stored error so the next sync
// picks it up. Admin-gated and audit logged.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
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
  const connectionId = typeof body?.connectionId === "string" ? body.connectionId : null;

  if (!connectionId) {
    return NextResponse.json({ error: "Missing connectionId." }, { status: 400 });
  }

  const { data: connection } = await supabaseServer
    .from("bank_connections")
    .select("id, institution_name, status, last_error")
    .eq("id", connectionId)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ error: "Bank connection not found." }, { status: 404 });
  }

  const { error } = await supabaseServer
    .from("bank_connections")
    .update({ status: "active", last_error: null })
    .eq("id", connectionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "bank_connection",
    entityId: connection.id,
    entityLabel: connection.institution_name ?? "Bank connection",
    before: { status: connection.status, last_error: connection.last_error },
    after: { status: "active", last_error: null },
  });

  return NextResponse.json({ success: true });
}
