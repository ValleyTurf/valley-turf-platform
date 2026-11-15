// Server-side record of pages/actions/routes that threw (Ryan,
// 2026-11-15). The Bank Feed page crashed for days showing only "This
// page couldn't load ... ERROR 455897394" -- production Next.js hides
// the real message from the browser on purpose and only hands out that
// digest number, and nothing in this app was keeping the real message
// anywhere Ryan (or Claude) could read it. instrumentation.ts's
// onRequestError hook now sends every server error here.
//
// Stored in audit_log (entity_type "page_error", entity_id = the digest)
// rather than a new table: no migration to run, it's already indexed by
// time, and it shows up in the Audit Log like any other event. Three
// readers: the (platform) error screen (looks up its own digest to show
// admins the real message), the System Health page, and the daily
// digest.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

export const PAGE_ERROR_ENTITY = "page_error";

// One crash loop (a page that throws on every load, reloaded a few
// times) shouldn't write a row per reload.
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

export type PageErrorRecord = {
  digest: string | null;
  path: string | null;
  message: string | null;
  stack: string | null;
  routeType: string | null;
  at: string;
};

type AuditRow = {
  entity_id: string | null;
  entity_label: string | null;
  changes: Record<string, { after?: unknown } | undefined> | null;
  created_at: string;
};

function field(row: AuditRow, name: string): string | null {
  const value = row.changes?.[name]?.after;
  return typeof value === "string" && value ? value : null;
}

function toRecord(row: AuditRow): PageErrorRecord {
  return {
    digest: row.entity_id,
    path: row.entity_label,
    message: field(row, "message"),
    stack: field(row, "stack"),
    routeType: field(row, "route_type"),
    at: row.created_at,
  };
}

// Never throws -- this runs inside the error path itself, and a logging
// failure must not turn one error into two.
export async function logPageError(params: {
  digest: string | null;
  path: string;
  method: string;
  message: string;
  stack: string | null;
  routePath: string | null;
  routeType: string | null;
}): Promise<void> {
  try {
    const dedupeKey = params.digest ?? `${params.path}:${params.message}`.slice(0, 200);
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();

    const { data: recent } = await supabaseServer
      .from("audit_log")
      .select("id")
      .eq("entity_type", PAGE_ERROR_ENTITY)
      .eq("entity_id", dedupeKey)
      .gte("created_at", since)
      .limit(1);

    if (recent && recent.length > 0) return;

    // Same {field: {before, after}} shape lib/auditLog.ts writes for a
    // create, so the Audit Log page renders these like any other row.
    const values: Record<string, string | null> = {
      message: params.message.slice(0, 2000),
      stack: params.stack ? params.stack.split("\n").slice(0, 12).join("\n").slice(0, 4000) : null,
      route: params.routePath,
      route_type: params.routeType,
      method: params.method,
    };

    const changes: Record<string, { before: null; after: string | null }> = {};
    for (const [key, value] of Object.entries(values)) {
      changes[key] = { before: null, after: value };
    }

    await supabaseServer.from("audit_log").insert({
      actor_name: "System",
      action: "create",
      entity_type: PAGE_ERROR_ENTITY,
      entity_id: dedupeKey,
      // Path only -- a query string can carry a search term or token.
      entity_label: params.path.split("?")[0].slice(0, 300),
      changes,
    });
  } catch (error) {
    console.error("logPageError failed:", error);
  }
}

export async function getPageErrorByDigest(digest: string): Promise<PageErrorRecord | null> {
  const { data, error } = await supabaseServer
    .from("audit_log")
    .select("entity_id, entity_label, changes, created_at")
    .eq("entity_type", PAGE_ERROR_ENTITY)
    .eq("entity_id", digest)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;

  return toRecord(data[0] as AuditRow);
}

export async function listRecentPageErrors(sinceIso: string, limit = 50): Promise<PageErrorRecord[]> {
  const { data, error } = await supabaseServer
    .from("audit_log")
    .select("entity_id, entity_label, changes, created_at")
    .eq("entity_type", PAGE_ERROR_ENTITY)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as AuditRow[]).map(toRecord);
}
