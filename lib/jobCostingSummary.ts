import "server-only";

import { supabaseServer } from "@/lib/supabase-server";
import { isLaborMaterialName, parseLaborEmployeeName } from "@/lib/laborMaterialName";
import { toNumber } from "@/lib/format";

// Extracted out of app/(platform)/job-costing-analytics/page.tsx so the
// same profitability-by-category engine can be reused by anything else
// that needs "what's our margin looking like" without re-deriving this
// logic a second time -- first consumers are the AI Copilot's tools and
// the manager+ Command Center dashboard. This file is the data/calc
// engine only; the analytics page keeps its own timeframe-picker UI and
// per-job drill-down (customer names, invoice links) since those are
// specific to that page's UI, not needed by a chat tool or a KPI card.

export type InvoiceCostRow = {
  jobber_invoice_id: string;
  jobber_client_id: string | null;
  issue_date: string | null;
  revenue: number | string;
  direct_cost: number | string;
  overhead_allocated: number | string;
  estimated_profit: number | string;
  service_category: string | null;
};

export type CategorySummary = {
  service_category: string;
  invoice_count: number;
  unlogged_count: number;
  total_revenue: number;
  total_direct_cost: number;
  total_overhead_allocated: number;
  total_estimated_profit: number;
  avg_revenue_per_job: number;
  avg_profit_per_job: number;
  profit_margin_pct: number | null;
};

export type JobCostingTotals = {
  revenue: number;
  directCost: number;
  overhead: number;
  profit: number;
  invoices: number;
  unlogged: number;
};

export type JobCostingSummary = {
  categories: CategorySummary[];
  totals: JobCostingTotals;
  overallMargin: number;
};

export type CostBreakdown = {
  labor: number;
  materials: number;
  unloggedLabor: boolean;
  visitCount: number;
  firstVisitDate: string | null;
  lastVisitDate: string | null;
};

// costBreakdowns supplies laborCost/materialCost per invoice (calendar-
// month matched -- see fetchCostBreakdownForInvoices) so category totals
// are built from the same reliable numbers as the per-job drill-down,
// instead of the view's own direct_cost/estimated_profit columns, which
// still rely on Jobber's unreliable jobber_invoice_id visit link.
export function buildCategorySummaries(
  rows: InvoiceCostRow[],
  costBreakdowns: Map<string, CostBreakdown>
): CategorySummary[] {
  const map = new Map<string, CategorySummary>();

  for (const row of rows) {
    const category = row.service_category || "Uncategorized";
    const revenue = toNumber(row.revenue);
    const overhead = toNumber(row.overhead_allocated);
    const breakdown = costBreakdowns.get(row.jobber_invoice_id);
    const directCost = (breakdown?.labor ?? 0) + (breakdown?.materials ?? 0);
    const profit = revenue - directCost - overhead;

    const existing = map.get(category) ?? {
      service_category: category,
      invoice_count: 0,
      unlogged_count: 0,
      total_revenue: 0,
      total_direct_cost: 0,
      total_overhead_allocated: 0,
      total_estimated_profit: 0,
      avg_revenue_per_job: 0,
      avg_profit_per_job: 0,
      profit_margin_pct: null,
    };

    existing.invoice_count += 1;
    if (directCost === 0) existing.unlogged_count += 1;
    existing.total_revenue += revenue;
    existing.total_direct_cost += directCost;
    existing.total_overhead_allocated += overhead;
    existing.total_estimated_profit += profit;

    map.set(category, existing);
  }

  return Array.from(map.values())
    .map((category) => ({
      ...category,
      avg_revenue_per_job:
        category.invoice_count > 0
          ? category.total_revenue / category.invoice_count
          : 0,
      avg_profit_per_job:
        category.invoice_count > 0
          ? category.total_estimated_profit / category.invoice_count
          : 0,
      profit_margin_pct:
        category.total_revenue > 0
          ? (category.total_estimated_profit / category.total_revenue) * 100
          : null,
    }))
    .sort((a, b) => b.total_estimated_profit - a.total_estimated_profit);
}

// The same totals + overall-margin reduction the analytics page computes
// from its category list -- pulled out so both that page and any new
// consumer (Copilot, Command Center) agree on exactly how "totals" and
// "margin" are derived from a category list, instead of each rolling
// their own reduce.
export function summarizeCategories(categories: CategorySummary[]): {
  totals: JobCostingTotals;
  overallMargin: number;
} {
  const totals = categories.reduce<JobCostingTotals>(
    (acc, category) => ({
      revenue: acc.revenue + category.total_revenue,
      directCost: acc.directCost + category.total_direct_cost,
      overhead: acc.overhead + category.total_overhead_allocated,
      profit: acc.profit + category.total_estimated_profit,
      invoices: acc.invoices + category.invoice_count,
      unlogged: acc.unlogged + category.unlogged_count,
    }),
    { revenue: 0, directCost: 0, overhead: 0, profit: 0, invoices: 0, unlogged: 0 }
  );

  const overallMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  return { totals, overallMargin };
}

function monthKeyOf(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

const DRILLDOWN_BATCH_SIZE = 500;

// Recomputes a labor-vs-materials split per invoice by walking the same
// source tables /job-costs logs against: each invoice's visits, each
// visit's logged material usage (visit_material_usage, priced at
// unit_cost_at_time -- the point-in-time rate, not materials.unit_cost
// today), split by whether the material is a real material or one of the
// synthetic "Labor - {employee name}" rate rows addEmployee() creates --
// matched via lib/laborMaterialName.ts rather than a literal string
// comparison, since real data has these saved with an em dash instead of
// a hyphen for at least some employees (an earlier all-zero Labor column
// traced back to exactly this: every match was on a literal " - ").
//
// Committing an hour of labor to visit_material_usage requires someone to
// actually visit /job-costs (or the My Day quick-entry) and save it --
// job-costs/page.tsx's own timerMinutesMap only *pre-fills* that field
// from the job timer (visit_time_logs), it doesn't persist anything on
// its own. So a visit can have real clocked time and still show zero
// saved labor here. To avoid an all-zero Labor column for a shop that
// hasn't been doing that manual save step, this falls back to the same
// timer-derived estimate for any (visit, employee) pair that doesn't
// already have a saved usage row -- priced at today's rate rather than a
// point-in-time one, since there's no saved snapshot to price it from.
// unloggedLabor flags an invoice where the whole labor figure is this
// kind of estimate, so the UI can label it as such instead of implying
// it's as firm as a saved amount.
//
// Which visits belong to which invoice is decided by calendar month, NOT
// by Jobber's own jobber_visits.jobber_invoice_id link. That link turned
// out to bundle a property's completed-but-previously-uninvoiced visits
// into whatever invoice Jobber generated next, which doesn't match how
// this business actually wants costs attributed -- confirmed against
// Lehi Cove/Hampton Villas, where the Aug 2 invoice was linked to 5/2
// visits dated entirely in July. The explicit call was: "The August 2nd
// payment is for the August visits, not July." So here, an invoice for
// client X issued on any day of month M is matched against ALL of X's
// visits whose start_at also falls in month M, invoice link ignored
// entirely. This assumes one active recurring job per client in a given
// month (the view doesn't expose a job id to disambiguate two concurrent
// jobs for the same client) and that two invoices for the same client
// don't land in the same month (if they do, both would pull the same
// visits and double-count them) -- both reasonable for this business's
// actual billing pattern (one monthly invoice per property).
//
// Equipment usage (visit_equipment_usage) has no dollar rate of its own
// in this schema, so it isn't part of either bucket.
export async function fetchCostBreakdownForInvoices(
  rows: InvoiceCostRow[]
): Promise<Map<string, CostBreakdown>> {
  const result = new Map<string, CostBreakdown>();

  const eligibleRows = rows.filter(
    (r): r is InvoiceCostRow & { jobber_client_id: string; issue_date: string } =>
      Boolean(r.jobber_client_id) && Boolean(r.issue_date)
  );
  if (eligibleRows.length === 0) return result;

  const getBucket = (invoiceId: string): CostBreakdown => {
    const existing = result.get(invoiceId);
    if (existing) return existing;
    const fresh: CostBreakdown = {
      labor: 0,
      materials: 0,
      unloggedLabor: false,
      visitCount: 0,
      firstVisitDate: null,
      lastVisitDate: null,
    };
    result.set(invoiceId, fresh);
    return fresh;
  };

  const clientIds = Array.from(
    new Set(eligibleRows.map((r) => r.jobber_client_id))
  );

  // Bound the visits query to the actual months in play rather than each
  // client's entire history.
  const monthKeys = eligibleRows.map((r) => monthKeyOf(r.issue_date));
  const minMonth = monthKeys.reduce((a, b) => (a < b ? a : b));
  const maxMonth = monthKeys.reduce((a, b) => (a > b ? a : b));
  const rangeStart = `${minMonth}-01`;
  const [maxYear, maxMonthNum] = maxMonth.split("-").map(Number);
  const rangeEnd = new Date(Date.UTC(maxYear, maxMonthNum, 0))
    .toISOString()
    .slice(0, 10); // last day of maxMonth

  const visitsByClientMonth = new Map<
    string,
    { jobber_visit_id: string; start_at: string }[]
  >();

  for (let i = 0; i < clientIds.length; i += DRILLDOWN_BATCH_SIZE) {
    const batchIds = clientIds.slice(i, i + DRILLDOWN_BATCH_SIZE);
    const { data, error } = await supabaseServer
      .from("jobber_visits")
      .select("jobber_visit_id, jobber_client_id, start_at")
      .in("jobber_client_id", batchIds)
      .gte("start_at", `${rangeStart}T00:00:00-07:00`)
      .lte("start_at", `${rangeEnd}T23:59:59-07:00`);

    if (error) throw error;

    for (const row of (data ?? []) as {
      jobber_visit_id: string;
      jobber_client_id: string | null;
      start_at: string | null;
    }[]) {
      if (!row.jobber_client_id || !row.start_at) continue;
      const key = `${row.jobber_client_id}:${monthKeyOf(row.start_at)}`;
      const list = visitsByClientMonth.get(key) ?? [];
      list.push({ jobber_visit_id: row.jobber_visit_id, start_at: row.start_at });
      visitsByClientMonth.set(key, list);
    }
  }

  const visitToInvoice = new Map<string, string>();

  for (const row of eligibleRows) {
    const key = `${row.jobber_client_id}:${monthKeyOf(row.issue_date)}`;
    const visits = visitsByClientMonth.get(key) ?? [];
    if (visits.length === 0) continue;

    const bucket = getBucket(row.jobber_invoice_id);
    bucket.visitCount = visits.length;

    for (const visit of visits) {
      const visitDate = visit.start_at.slice(0, 10);
      if (!bucket.firstVisitDate || visitDate < bucket.firstVisitDate) {
        bucket.firstVisitDate = visitDate;
      }
      if (!bucket.lastVisitDate || visitDate > bucket.lastVisitDate) {
        bucket.lastVisitDate = visitDate;
      }
      visitToInvoice.set(visit.jobber_visit_id, row.jobber_invoice_id);
    }
  }

  const visitIds = Array.from(visitToInvoice.keys());
  if (visitIds.length === 0) return result;

  const usageRows: {
    jobber_visit_id: string;
    material_id: string;
    quantity_used: number | string;
    unit_cost_at_time: number | string;
  }[] = [];
  for (let i = 0; i < visitIds.length; i += DRILLDOWN_BATCH_SIZE) {
    const batchIds = visitIds.slice(i, i + DRILLDOWN_BATCH_SIZE);
    const { data, error } = await supabaseServer
      .from("visit_material_usage")
      .select("jobber_visit_id, material_id, quantity_used, unit_cost_at_time")
      .in("jobber_visit_id", batchIds);

    if (error) throw error;

    usageRows.push(...((data ?? []) as typeof usageRows));
  }

  // All materials, unfiltered -- old invoices can reference a rate that's
  // since been end-dated, and both the saved-usage loop and the
  // timer-fallback loop below need every name/rate, not just active ones.
  const { data: allMaterialsData, error: allMaterialsError } =
    await supabaseServer.from("materials").select("id, name, unit_cost");
  if (allMaterialsError) throw allMaterialsError;

  const allMaterials = (allMaterialsData ?? []) as {
    id: string;
    name: string | null;
    unit_cost: number | string | null;
  }[];
  const materialNameMap = new Map(allMaterials.map((m) => [m.id, m.name ?? ""]));
  // Keyed by the parsed *employee name*, not the raw material name -- the
  // dash character between "Labor" and the name isn't consistent across
  // rows (see lib/laborMaterialName.ts), so matching on employee name
  // instead of the literal string is what makes this actually work.
  const laborMaterialByEmployeeName = new Map<
    string,
    { id: string; unitCost: number }
  >();
  for (const m of allMaterials) {
    const employeeName = parseLaborEmployeeName(m.name);
    if (employeeName) {
      laborMaterialByEmployeeName.set(employeeName, {
        id: m.id,
        unitCost: toNumber(m.unit_cost),
      });
    }
  }

  const savedKeys = new Set<string>();

  for (const row of usageRows) {
    const invoiceId = visitToInvoice.get(row.jobber_visit_id);
    if (!invoiceId) continue;

    savedKeys.add(`${row.jobber_visit_id}:${row.material_id}`);

    const cost = toNumber(row.quantity_used) * toNumber(row.unit_cost_at_time);
    const isLabor = isLaborMaterialName(materialNameMap.get(row.material_id));

    const bucket = getBucket(invoiceId);
    if (isLabor) {
      bucket.labor += cost;
    } else {
      bucket.materials += cost;
    }
  }

  // Timer fallback for labor that was clocked but never saved.
  const userNameMap = new Map<string, string>();
  {
    const { data, error } = await supabaseServer.from("users").select("id, name");
    if (error) throw error;
    for (const row of (data ?? []) as { id: string; name: string | null }[]) {
      if (row.name) userNameMap.set(row.id, row.name);
    }
  }

  for (let i = 0; i < visitIds.length; i += DRILLDOWN_BATCH_SIZE) {
    const batchIds = visitIds.slice(i, i + DRILLDOWN_BATCH_SIZE);
    const { data, error } = await supabaseServer
      .from("visit_time_logs")
      .select("jobber_visit_id, user_id, started_at, stopped_at")
      .in("jobber_visit_id", batchIds)
      .not("stopped_at", "is", null);

    if (error) throw error;

    for (const row of (data ?? []) as {
      jobber_visit_id: string;
      user_id: string;
      started_at: string;
      stopped_at: string | null;
    }[]) {
      const invoiceId = visitToInvoice.get(row.jobber_visit_id);
      if (!invoiceId || !row.stopped_at) continue;

      const userName = userNameMap.get(row.user_id);
      if (!userName) continue;

      const labor = laborMaterialByEmployeeName.get(userName);
      if (!labor) continue;

      // Already committed via visit_material_usage for this employee on
      // this visit -- don't double-count on top of the saved amount.
      if (savedKeys.has(`${row.jobber_visit_id}:${labor.id}`)) continue;

      const startedMs = new Date(row.started_at).getTime();
      const stoppedMs = new Date(row.stopped_at).getTime();
      if (
        !Number.isFinite(startedMs) ||
        !Number.isFinite(stoppedMs) ||
        stoppedMs <= startedMs
      ) {
        continue;
      }

      const hours = (stoppedMs - startedMs) / 3_600_000;
      const bucket = getBucket(invoiceId);
      bucket.labor += hours * labor.unitCost;
      bucket.unloggedLabor = true;
    }
  }

  return result;
}

// Fetches every row of the view once, unfiltered -- callers slice this
// same in-memory set by date range for whatever timeframe they need,
// avoiding a second round trip through the view for what's a small
// dataset at this business's scale.
export async function fetchAllInvoiceCosts(): Promise<InvoiceCostRow[]> {
  const pageSize = 1000;
  const rows: InvoiceCostRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("invoice_cost_breakdown")
      .select(
        "jobber_invoice_id, jobber_client_id, issue_date, revenue, direct_cost, overhead_allocated, estimated_profit, service_category"
      )
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as InvoiceCostRow[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

export function filterRowsByRange(
  rows: InvoiceCostRow[],
  startDate: string | null,
  endDate: string
): InvoiceCostRow[] {
  return rows.filter((row) => {
    if (!row.issue_date) return false;
    if (row.issue_date > endDate) return false;
    if (startDate && row.issue_date < startDate) return false;
    return true;
  });
}

// The one-call convenience version for consumers that just want "the
// numbers" for a date range and don't need the per-job drill-down --
// the AI Copilot's job-costing tool and the Command Center dashboard.
// startDate null means "all time through endDate", matching the
// analytics page's own "all-time" timeframe option.
export async function getJobCostingSummary(
  startDate: string | null,
  endDate: string
): Promise<JobCostingSummary> {
  const allRows = await fetchAllInvoiceCosts();
  const rows = filterRowsByRange(allRows, startDate, endDate);
  const costBreakdowns = await fetchCostBreakdownForInvoices(rows);
  const categories = buildCategorySummaries(rows, costBreakdowns);
  const { totals, overallMargin } = summarizeCategories(categories);

  return { categories, totals, overallMargin };
}
