// One-off diagnostic (2026-11-11): Ryan hitting "This page couldn't
// load / A server error occurred" specifically on Settings > Bank Feed
// (React error #441 client-side -- a server exception during
// streaming SSR), nowhere else in the app. That page's own three
// Supabase queries (bank_connections, audit_log, then bank_accounts if
// any connections exist) all already defensively fall back to [] on a
// normal {error} response, so whatever's throwing isn't a normal query
// error -- more likely the underlying fetch() itself throwing
// (network/DNS/TLS to Supabase), which @supabase-js doesn't catch, and
// production Next.js redacts the real message from the client (just a
// digest), so there's no way to see it without either Vercel's server
// logs or running the exact same calls somewhere that reports back
// directly. This does the latter -- same three queries, each wrapped so
// a thrown exception (not just an {error} response) is caught and
// reported instead of crashing. Read-only, admin-gated.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function tryQuery(label: string, run: () => PromiseLike<{ data: unknown; error: unknown }>) {
  const startedAt = Date.now();

  try {
    const { data, error } = await run();
    return {
      label,
      ms: Date.now() - startedAt,
      threw: false,
      error: error ? (error as { message?: string }).message ?? String(error) : null,
      rowCount: Array.isArray(data) ? data.length : data ? 1 : 0,
    };
  } catch (thrown) {
    return {
      label,
      ms: Date.now() - startedAt,
      threw: true,
      error:
        thrown instanceof Error
          ? `${thrown.name}: ${thrown.message}`
          : String(thrown),
      stack: thrown instanceof Error ? thrown.stack ?? null : null,
    };
  }
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const connectionsCheck = await tryQuery("bank_connections", () =>
    supabaseServer
      .from("bank_connections")
      .select("id, institution_name, status, cursor, last_synced_at, last_error, created_at")
      .order("created_at", { ascending: false })
  );

  const auditCheck = await tryQuery("audit_log", () =>
    supabaseServer
      .from("audit_log")
      .select("id, entity_label, changes, created_at")
      .eq("entity_type", "bank_feed_sync")
      .order("created_at", { ascending: false })
      .limit(10)
  );

  // Mirrors page.tsx: only runs if there's at least one non-disconnected
  // connection, using its real id(s) rather than a guess.
  let accountsCheck: Awaited<ReturnType<typeof tryQuery>> | { skipped: string } = {
    skipped: "No active connection id available to test with.",
  };

  const { data: connections } = await supabaseServer
    .from("bank_connections")
    .select("id, status")
    .neq("status", "disconnected");

  const connectionIds = (connections ?? []).map((c) => c.id as string);

  if (connectionIds.length > 0) {
    accountsCheck = await tryQuery("bank_accounts", () =>
      supabaseServer
        .from("bank_accounts")
        .select("id, bank_connection_id, name, mask, subtype, include_in_expense_sync")
        .in("bank_connection_id", connectionIds)
        .order("name", { ascending: true })
    );
  }

  const { data: auditRows } = await supabaseServer
    .from("audit_log")
    .select("id, entity_label, changes, created_at")
    .eq("entity_type", "bank_feed_sync")
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    auditRows,
    connectionsCheck,
    auditCheck,
    accountsCheck,
    connectionIdsTested: connectionIds,
  });
}
