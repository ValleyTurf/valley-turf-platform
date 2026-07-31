// On-demand data backup: an admin-only download of a ZIP containing one
// CSV per table for everything that would actually be *lost* (not just
// slow to rebuild) if Supabase disappeared — the data this app originates
// itself, plus the Jobber mirror tables so a restore doesn't depend on
// re-syncing from Jobber's API from scratch.
//
// Deliberately excluded:
// - jobber_tokens: OAuth credentials. Never belongs in a downloadable file.
// - login_attempts: a security/rate-limit log, not business data.
// - jobber_sync_runs, jobber_sync_status, jobber_webhook_events:
//   operational bookkeeping that rebuilds itself on the next sync.
// - The various *_summary / *_financials / *_profitability / *_costing
//   Supabase views: pure derived data, recomputed from the tables below,
//   so backing them up would just be redundant snapshots of a query.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { rowsToCsv } from "@/lib/csv";
import { buildZip, type ZipEntry } from "@/lib/zip";

const PAGE_SIZE = 1000;

type BackupTable = {
  table: string;
  // Explicit column list where we want to hold something back (e.g.
  // password_hash) — "*" for everything otherwise.
  columns?: string;
};

const BACKUP_TABLES: BackupTable[] = [
  {
    table: "users",
    columns:
      "id, email, name, role, active, hourly_rate, last_login_at, created_at, updated_at",
  },
  { table: "customers" },
  { table: "campaigns" },
  { table: "leads" },
  { table: "scans" },
  { table: "door_hanger_drops" },
  { table: "materials" },
  { table: "equipment" },
  { table: "overhead_costs" },
  { table: "invoice_material_usage" },
  { table: "visit_material_usage" },
  { table: "equipment_usage" },
  { table: "visit_equipment_usage" },
  { table: "recurring_customers" },
  { table: "customer_intelligence_exclusions" },
  { table: "audit_log" },
  { table: "jobber_jobs" },
  { table: "jobber_invoices" },
  { table: "jobber_visits" },
  { table: "jobber_payments" },
  { table: "jobber_payouts" },
  { table: "jobber_payment_fees" },
];

async function fetchAllRows(
  table: string,
  columns: string
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;

  // Supabase/PostgREST caps a single request's rows, so tables larger
  // than PAGE_SIZE (jobber_jobs, jobber_invoices, etc. over time) need to
  // be paged through rather than fetched in one .select("*").
  while (true) {
    const { data, error } = await supabaseServer
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to export "${table}": ${error.message}`);
    }

    const page = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return rows;
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403 }
    );
  }

  const entries: ZipEntry[] = [];

  try {
    for (const { table, columns } of BACKUP_TABLES) {
      const rows = await fetchAllRows(table, columns ?? "*");

      entries.push({
        name: `${table}.csv`,
        data: Buffer.from(rowsToCsv(rows), "utf8"),
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Backup export failed.";

    return NextResponse.json({ error: message }, { status: 500 });
  }

  const zip = buildZip(entries);
  const timestamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="valley-turf-backup-${timestamp}.zip"`,
      "Content-Length": String(zip.length),
    },
  });
}
