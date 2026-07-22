export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

type CheckStatus = "pass" | "warn" | "fail";

type Check = {
  name: string;
  status: CheckStatus;
  detail: string;
  hint?: string;
};

function statusMeta(status: CheckStatus): {
  label: string;
  icon: string;
  classes: string;
} {
  if (status === "pass") {
    return {
      label: "Pass",
      icon: "✅",
      classes: "bg-green-50 text-green-800 border-green-200",
    };
  }

  if (status === "warn") {
    return {
      label: "Warning",
      icon: "⚠️",
      classes: "bg-amber-50 text-amber-800 border-amber-200",
    };
  }

  return {
    label: "Fail",
    icon: "❌",
    classes: "bg-red-50 text-red-800 border-red-200",
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function checkInvoiceSubjects(): Promise<Check> {
  const { count: total } = await supabaseServer
    .from("jobber_invoices")
    .select("*", { count: "exact", head: true });

  const { count: hasSubject } = await supabaseServer
    .from("jobber_invoices")
    .select("*", { count: "exact", head: true })
    .not("subject", "is", null);

  const totalCount = total ?? 0;
  const subjectCount = hasSubject ?? 0;
  const nullRate = totalCount > 0 ? 1 - subjectCount / totalCount : 0;

  if (totalCount === 0) {
    return {
      name: "Invoice subjects populated",
      status: "warn",
      detail: "No invoices found in jobber_invoices.",
    };
  }

  if (nullRate > 0.05) {
    return {
      name: "Invoice subjects populated",
      status: "fail",
      detail: `${formatPercent(nullRate)} of invoices are missing a subject (${
        totalCount - subjectCount
      } of ${totalCount}).`,
      hint: "The invoice sync may have stopped saving the subject field — check app/api/jobber/sync-invoices/route.ts.",
    };
  }

  return {
    name: "Invoice subjects populated",
    status: "pass",
    detail: `${subjectCount} of ${totalCount} invoices have a subject (${formatPercent(
      1 - nullRate
    )}).`,
  };
}

async function checkJobStatusValues(): Promise<Check> {
  const KNOWN_STATUSES = ["archived", "upcoming", "requires_invoicing"];

  const { data, error } = await supabaseServer
    .from("jobber_jobs")
    .select("job_status");

  if (error) {
    return {
      name: "Job status values",
      status: "fail",
      detail: `Query failed: ${error.message}`,
    };
  }

  const rows = data ?? [];
  const total = rows.length;
  const nullCount = rows.filter((row) => !row.job_status).length;
  const unknownStatuses = new Set(
    rows
      .map((row) => row.job_status)
      .filter(
        (status): status is string =>
          Boolean(status) && !KNOWN_STATUSES.includes(status)
      )
  );

  if (total === 0) {
    return {
      name: "Job status values",
      status: "warn",
      detail: "No rows found in jobber_jobs.",
    };
  }

  if (nullCount > 0 || unknownStatuses.size > 0) {
    const parts: string[] = [];
    if (nullCount > 0) parts.push(`${nullCount} jobs with no status`);
    if (unknownStatuses.size > 0)
      parts.push(`unexpected values: ${Array.from(unknownStatuses).join(", ")}`);

    return {
      name: "Job status values",
      status: "warn",
      detail: parts.join("; "),
      hint: "Known values are archived, upcoming, requires_invoicing. New values may mean Jobber added a status or the sync changed.",
    };
  }

  return {
    name: "Job status values",
    status: "pass",
    detail: `All ${total} jobs have a recognized status.`,
  };
}

async function checkMaterialCostSnapshots(): Promise<Check> {
  const { count: total } = await supabaseServer
    .from("invoice_material_usage")
    .select("*", { count: "exact", head: true });

  const { count: hasCost } = await supabaseServer
    .from("invoice_material_usage")
    .select("*", { count: "exact", head: true })
    .not("unit_cost_at_time", "is", null);

  const totalCount = total ?? 0;
  const costCount = hasCost ?? 0;

  if (totalCount === 0) {
    return {
      name: "Material usage cost snapshots",
      status: "warn",
      detail: "No material usage logged yet — nothing to check.",
    };
  }

  if (costCount < totalCount) {
    return {
      name: "Material usage cost snapshots",
      status: "fail",
      detail: `${totalCount - costCount} of ${totalCount} usage entries are missing a price snapshot.`,
      hint: "saveInvoiceMaterialUsage should always set unit_cost_at_time — check materials/actions.ts.",
    };
  }

  return {
    name: "Material usage cost snapshots",
    status: "pass",
    detail: `All ${totalCount} usage entries have a saved price.`,
  };
}

async function checkCustomerIdIntegrity(): Promise<Check> {
  const { data, error } = await supabaseServer
    .from("customers")
    .select("jobber_client_id");

  if (error) {
    return {
      name: "Customer ID integrity",
      status: "fail",
      detail: `Query failed: ${error.message}`,
    };
  }

  const rows = data ?? [];
  const total = rows.length;
  const nullCount = rows.filter((row) => !row.jobber_client_id).length;
  const distinctCount = new Set(
    rows.map((row) => row.jobber_client_id).filter(Boolean)
  ).size;
  const nonNullCount = total - nullCount;

  if (nullCount > 0) {
    return {
      name: "Customer ID integrity",
      status: "fail",
      detail: `${nullCount} customer rows have no jobber_client_id.`,
    };
  }

  if (distinctCount < nonNullCount) {
    return {
      name: "Customer ID integrity",
      status: "fail",
      detail: `${nonNullCount - distinctCount} duplicate jobber_client_id values found.`,
    };
  }

  return {
    name: "Customer ID integrity",
    status: "pass",
    detail: `${total} customers, all with unique IDs.`,
  };
}

async function checkInvoiceCountConsistency(): Promise<Check> {
  const { count: rawInvoices } = await supabaseServer
    .from("jobber_invoices")
    .select("*", { count: "exact", head: true });

  const { data: financialsData, error } = await supabaseServer
    .from("customer_financials")
    .select("invoice_count");

  if (error) {
    return {
      name: "Invoice count consistency",
      status: "fail",
      detail: `Query failed: ${error.message}`,
    };
  }

  const summedInvoices = (financialsData ?? []).reduce(
    (sum, row) => sum + Number(row.invoice_count ?? 0),
    0
  );

  const rawCount = rawInvoices ?? 0;

  if (rawCount === 0) {
    return {
      name: "Invoice count consistency",
      status: "warn",
      detail: "No invoices found in jobber_invoices.",
    };
  }

  const diff = Math.abs(rawCount - summedInvoices);
  const diffRate = diff / rawCount;

  if (diffRate > 0.1) {
    return {
      name: "Invoice count consistency",
      status: "warn",
      detail: `jobber_invoices has ${rawCount} rows, but customer_financials sums to ${summedInvoices} (${formatPercent(
        diffRate
      )} difference).`,
      hint: "A meaningful gap can mean invoices without a matched customer, or a view that's out of date.",
    };
  }

  return {
    name: "Invoice count consistency",
    status: "pass",
    detail: `jobber_invoices (${rawCount}) and customer_financials (${summedInvoices}) are consistent.`,
  };
}

async function checkOverheadCostsExist(): Promise<Check> {
  const { count } = await supabaseServer
    .from("overhead_costs")
    .select("*", { count: "exact", head: true });

  const total = count ?? 0;

  if (total === 0) {
    return {
      name: "Overhead costs configured",
      status: "fail",
      detail: "No rows in overhead_costs — overhead-per-job will show as unavailable.",
      hint: "Add costs at /costs.",
    };
  }

  return {
    name: "Overhead costs configured",
    status: "pass",
    detail: `${total} overhead cost${total === 1 ? "" : "s"} configured.`,
  };
}

async function checkMaterialsExist(): Promise<Check> {
  const { data, error } = await supabaseServer.from("materials").select("name");

  if (error) {
    return {
      name: "Materials configured",
      status: "fail",
      detail: `Query failed: ${error.message}`,
    };
  }

  const names = (data ?? []).map((row) => row.name as string);

  if (names.length === 0) {
    return {
      name: "Materials configured",
      status: "warn",
      detail: "No materials defined yet.",
      hint: "Add materials at /materials.",
    };
  }

  return {
    name: "Materials configured",
    status: "pass",
    detail: `${names.length} material${names.length === 1 ? "" : "s"} defined: ${names.join(", ")}.`,
  };
}

async function checkSyncFreshness(): Promise<Check> {
  const { data, error } = await supabaseServer
    .from("customers")
    .select("last_synced_at")
    .order("last_synced_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      name: "Customer sync freshness",
      status: "fail",
      detail: `Query failed: ${error.message}`,
    };
  }

  if (!data?.last_synced_at) {
    return {
      name: "Customer sync freshness",
      status: "warn",
      detail: "No sync timestamp found — customers may never have been synced.",
    };
  }

  const lastSynced = new Date(data.last_synced_at);
  const daysAgo = Math.floor(
    (Date.now() - lastSynced.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysAgo > 30) {
    return {
      name: "Customer sync freshness",
      status: "warn",
      detail: `Last synced ${daysAgo} days ago.`,
      hint: "Customer sync now runs automatically via webhooks and a daily backup job. If this persists, check /settings/jobber for sync status.",
    };
  }

  return {
    name: "Customer sync freshness",
    status: "pass",
    detail: `Last synced ${daysAgo === 0 ? "today" : `${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`}.`,
  };
}

export default async function HealthPage() {
  const checks = await Promise.all([
    checkInvoiceSubjects(),
    checkJobStatusValues(),
    checkMaterialCostSnapshots(),
    checkCustomerIdIntegrity(),
    checkInvoiceCountConsistency(),
    checkOverheadCostsExist(),
    checkMaterialsExist(),
    checkWebhookBacklog(),
    checkSyncFreshness(),
    checkJobberSyncStatus(),
  ]);

  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const passCount = checks.filter((c) => c.status === "pass").length;

  const overallStatus: CheckStatus =
    failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass";
  const overallMeta = statusMeta(overallStatus);

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-4xl font-bold">System Health</h1>

            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Diagnostic checks on your synced data, based on issues we've
              actually run into — data drift, missing config, and sync
              staleness.
            </p>
          </div>

          <Link
            href="/revenue"
            className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Back to Financial Dashboard
          </Link>
        </header>

        <section
          className={`mt-6 rounded-2xl border p-5 shadow-sm ${overallMeta.classes}`}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{overallMeta.icon}</span>
            <div>
              <p className="font-bold">
                {failCount > 0
                  ? "Attention needed"
                  : warnCount > 0
                    ? "Mostly healthy, a few things to review"
                    : "Everything looks healthy"}
              </p>
              <p className="text-sm">
                {passCount} passed, {warnCount} warning
                {warnCount === 1 ? "" : "s"}, {failCount} failed.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 space-y-3">
          {checks.map((check) => {
            const meta = statusMeta(check.status);

            return (
              <div
                key={check.name}
                className={`rounded-2xl border bg-white p-5 shadow-sm ${
                  check.status === "pass"
                    ? "border-[#e7e2d5]"
                    : meta.classes.split(" ").find((c) => c.startsWith("border-"))
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-bold">{check.name}</p>
                    <p className="mt-1 text-sm text-[#6b705c]">
                      {check.detail}
                    </p>
                    {check.hint && (
                      <p className="mt-2 text-xs text-[#9c7a20]">
                        {check.hint}
                      </p>
                    )}
                  </div>

                  <span
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${meta.classes}`}
                  >
                    {meta.icon} {meta.label}
                  </span>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}

async function checkWebhookBacklog(): Promise<Check> {
  const { count: failedCount } = await supabaseServer
    .from("jobber_webhook_events")
    .select("*", { count: "exact", head: true })
    .eq("status", "failed");

  const staleThreshold = new Date(
    Date.now() - 24 * 60 * 60 * 1000
  ).toISOString();

  const { count: stalePendingCount } = await supabaseServer
    .from("jobber_webhook_events")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending")
    .lt("created_at", staleThreshold);

  const failed = failedCount ?? 0;
  const stalePending = stalePendingCount ?? 0;

  if (failed > 0) {
    return {
      name: "Webhook processing backlog",
      status: "fail",
      detail: `${failed} webhook event${
        failed === 1 ? "" : "s"
      } permanently failed (hit max retry attempts) and need${
        failed === 1 ? "s" : ""
      } a manual reset.`,
      hint: "Reset in Supabase: update jobber_webhook_events set status='pending', attempts=0, error_message=null where status='failed'; then trigger /api/jobber/process-webhooks.",
    };
  }

  if (stalePending > 0) {
    return {
      name: "Webhook processing backlog",
      status: "warn",
      detail: `${stalePending} webhook event${
        stalePending === 1 ? "" : "s"
      } have been pending for over 24 hours - the sync cron may not be keeping up.`,
      hint: "Check /settings/jobber for sync status, or manually trigger /api/jobber/process-webhooks.",
    };
  }

  return {
    name: "Webhook processing backlog",
    status: "pass",
    detail: "No failed or stale pending webhook events.",
  };
}

async function checkJobberSyncStatus(): Promise<Check> {
  const { data, error } = await supabaseServer
    .from("jobber_sync_status")
    .select("sync_type, status, last_completed_at, last_error");

  if (error) {
    return {
      name: "Jobber sync status",
      status: "fail",
      detail: `Query failed: ${error.message}`,
    };
  }

  const rows = data ?? [];

  const failed = rows.filter((row) => row.status === "failed");

  if (failed.length > 0) {
    const names = failed.map((row) => row.sync_type).join(", ");

    return {
      name: "Jobber sync status",
      status: "fail",
      detail: `${failed.length} sync${
        failed.length === 1 ? "" : "s"
      } currently failing: ${names}.`,
      hint: failed[0].last_error
        ? `Latest error (${failed[0].sync_type}): ${failed[0].last_error}`
        : "Check /settings/jobber for details.",
    };
  }

  const staleThresholdDays = 3;
  const now = Date.now();

  const stale = rows.filter((row) => {
    if (!row.last_completed_at) return true;

    const daysAgo =
      (now - new Date(row.last_completed_at).getTime()) /
      (1000 * 60 * 60 * 24);

    return daysAgo > staleThresholdDays;
  });

  if (stale.length > 0) {
    const names = stale.map((row) => row.sync_type).join(", ");

    return {
      name: "Jobber sync status",
      status: "warn",
      detail: `${stale.length} sync${
        stale.length === 1 ? "" : "s"
      } haven't completed in over ${staleThresholdDays} days: ${names}.`,
      hint: "Check /settings/jobber for sync status, or trigger a manual sync.",
    };
  }

  return {
    name: "Jobber sync status",
    status: "pass",
    detail: `All ${rows.length} tracked syncs completed successfully within the last ${staleThresholdDays} days.`,
  };
}
