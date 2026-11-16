// Pure helpers for the data backup (no database access here, so the
// logic can be unit tested). The actual export lives in lib/backup.ts.
//
// What is backed up: everything this app originates itself, plus the
// Jobber mirror tables so a restore doesn't depend on re-syncing from
// Jobber's API from scratch.
//
// Deliberately excluded (never put these in a downloadable file):
// - jobber_tokens, quickbooks_tokens, bank_connections: OAuth / Plaid
//   credentials.
// - portal_login_tokens, push_subscriptions: login links and device keys.
// - login_attempts, stripe_webhook_events, jobber_webhook_events,
//   jobber_sync_runs, jobber_sync_status, route_cache: operational
//   bookkeeping that rebuilds itself.
// - The *_summary / *_financials / *_profitability / *_costing views:
//   derived data, recomputed from the tables below.

export type BackupTable = {
  table: string;
  // Explicit column list where something must be held back (e.g.
  // password_hash). "*" otherwise.
  columns?: string;
};

export const BACKUP_TABLES: BackupTable[] = [
  {
    table: "users",
    columns:
      "id, email, name, role, active, hourly_rate, last_login_at, created_at, updated_at",
  },
  // Customers and their details
  { table: "customers" },
  { table: "customer_addresses" },
  { table: "customer_contacts" },
  { table: "customer_payment_methods" },
  { table: "customer_intelligence_exclusions" },
  { table: "recurring_customers" },
  { table: "referral_sources" },
  { table: "unknown_contacts" },
  // Marketing
  { table: "campaigns" },
  { table: "leads" },
  { table: "scans" },
  { table: "door_hanger_drops" },
  { table: "promo_campaigns" },
  { table: "promo_campaign_sends" },
  { table: "featured_gallery_photos" },
  // Quotes
  { table: "quotes" },
  { table: "quote_tiers" },
  { table: "quote_addons" },
  { table: "quote_followup_rules" },
  { table: "quote_followups_sent" },
  // Invoices and money in
  { table: "invoices" },
  { table: "invoice_line_items" },
  { table: "invoice_ratings" },
  { table: "invoice_number_counters" },
  { table: "invoice_reminder_rules" },
  { table: "invoice_reminder_overrides" },
  { table: "invoice_reminder_snoozes" },
  { table: "invoice_reminders_sent" },
  { table: "payments" },
  { table: "recurring_charges" },
  { table: "autopay_charge_attempts" },
  { table: "stripe_payouts" },
  { table: "deposit_invoice_matches" },
  // Jobs, visits, crew
  { table: "visit_assignments" },
  { table: "visit_notes" },
  { table: "visit_one_time_charges" },
  { table: "visit_time_logs" },
  { table: "shift_time_logs" },
  { table: "visit_reminder_rules" },
  { table: "visit_reminders_sent" },
  { table: "native_job_line_items" },
  { table: "native_job_number_counters" },
  { table: "tasks" },
  // Materials, equipment, costs
  { table: "materials" },
  { table: "equipment" },
  { table: "overhead_costs" },
  { table: "invoice_material_usage" },
  { table: "visit_material_usage" },
  { table: "equipment_usage" },
  { table: "visit_equipment_usage" },
  // Books
  { table: "expenses" },
  { table: "expense_category_rules" },
  { table: "bank_accounts" },
  // Messaging
  { table: "contact_history" },
  { table: "portal_messages" },
  { table: "portal_service_requests" },
  { table: "message_threads_handled" },
  { table: "saved_replies" },
  { table: "review_requests_sent" },
  // Settings
  { table: "service_pricing" },
  { table: "service_included_items" },
  { table: "schedule_service_colors" },
  { table: "knowledge_base_articles" },
  { table: "role_permissions" },
  { table: "business_settings" },
  { table: "daily_digest_settings" },
  { table: "review_request_settings" },
  { table: "quickbooks_settings" },
  { table: "user_push_preferences" },
  // History
  { table: "audit_log" },
  // Jobber mirror
  { table: "jobber_jobs" },
  { table: "jobber_invoices" },
  { table: "jobber_visits" },
  { table: "jobber_payments" },
  { table: "jobber_payouts" },
  { table: "jobber_payment_fees" },
  { table: "jobber_job_notes" },
  { table: "jobber_visit_labor" },
  { table: "jobber_quote_price_archive" },
];

// Tables that must never appear in a backup file.
export const NEVER_BACK_UP = [
  "jobber_tokens",
  "quickbooks_tokens",
  "bank_connections",
  "portal_login_tokens",
  "push_subscriptions",
  "login_attempts",
];

export type TableResult = {
  table: string;
  rows: number;
  error: string | null;
};

export type BackupSummary = {
  tables: number;
  rows: number;
  failedTables: string[];
};

export function summarizeBackup(results: TableResult[]): BackupSummary {
  return {
    tables: results.filter((r) => !r.error).length,
    rows: results.reduce((sum, r) => sum + (r.error ? 0 : r.rows), 0),
    failedTables: results.filter((r) => r.error).map((r) => r.table),
  };
}

export function backupFileName(date: Date): string {
  return `valley-turf-backup-${date.toISOString().slice(0, 10)}.zip`;
}

// Names are date-stamped, so a reverse sort is newest-first. Returns the
// files that fall outside the newest `keep`. Anything that is not one of
// our backup files is never touched.
export function backupsToDelete(names: string[], keep: number): string[] {
  const ours = names
    .filter((n) => /^valley-turf-backup-\d{4}-\d{2}-\d{2}\.zip$/.test(n))
    .sort()
    .reverse();

  return ours.slice(Math.max(keep, 1));
}

export function manifestText(
  generatedAt: Date,
  results: TableResult[]
): string {
  const summary = summarizeBackup(results);
  const lines = [
    "Valley Turf Revival data backup",
    `Created: ${generatedAt.toISOString()}`,
    `Tables saved: ${summary.tables}`,
    `Rows saved: ${summary.rows}`,
    "",
  ];

  if (summary.failedTables.length > 0) {
    lines.push(
      `Tables that could NOT be saved (${summary.failedTables.length}):`
    );
    for (const r of results.filter((x) => x.error)) {
      lines.push(`  ${r.table}: ${r.error}`);
    }
    lines.push("");
  }

  lines.push("Rows per table:");
  for (const r of results) {
    lines.push(`  ${r.table}: ${r.error ? "FAILED" : r.rows}`);
  }

  return lines.join("\n") + "\n";
}
