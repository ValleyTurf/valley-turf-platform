export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { getAllCampaignRoi, type CampaignRoi } from "@/lib/campaignRoi";
import {
  toNumber,
  formatCurrency,
  formatNumber,
  formatDateOnly as formatDateLabel,
} from "@/lib/format";

type JobCostingAnalyticsProps = {
  searchParams: Promise<{
    timeframe?: string;
    start?: string;
    end?: string;
  }>;
};

type Timeframe =
  | "last-7-days"
  | "last-month"
  | "this-month"
  | "last-90-days"
  | "ytd"
  | "all-time"
  | "custom";

type InvoiceCostRow = {
  jobber_invoice_id: string;
  jobber_client_id: string | null;
  issue_date: string | null;
  revenue: number | string;
  direct_cost: number | string;
  overhead_allocated: number | string;
  estimated_profit: number | string;
  service_category: string | null;
};

// One row per invoice within a category, for the click-to-expand
// drill-down — lets the user compare individual recurring customers
// against each other within a category (e.g. which Quarterly clients
// are profitable vs. not) instead of only seeing the category total.
type CategoryJobRow = {
  jobber_invoice_id: string;
  invoice_number: string | null;
  jobber_web_uri: string | null;
  issue_date: string | null;
  client_name: string;
  revenue: number;
  direct_cost: number;
  overhead_allocated: number;
  estimated_profit: number;
  profit_margin_pct: number | null;
  // Recomputed from the same source tables /job-costs logs against
  // (visit_material_usage, keyed off each material's point-in-time
  // unit_cost_at_time) rather than read off the view — direct_cost on
  // invoice_cost_breakdown is only a single combined figure. laborCost +
  // materialCost should track close to direct_cost but isn't guaranteed
  // to match it to the penny; Total Cost in the UI stays sourced from
  // direct_cost + overhead_allocated so it's always authoritative.
  laborCost: number;
  materialCost: number;
};

type CategorySummary = {
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

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getPhoenixToday(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((part) => part.type === "year")?.value ?? 0);
  const month = Number(
    parts.find((part) => part.type === "month")?.value ?? 1
  );
  const day = Number(parts.find((part) => part.type === "day")?.value ?? 1);

  return new Date(Date.UTC(year, month - 1, day));
}

function isTimeframe(value: string | undefined): value is Timeframe {
  return [
    "last-7-days",
    "last-month",
    "this-month",
    "last-90-days",
    "ytd",
    "all-time",
    "custom",
  ].includes(value ?? "");
}

function getDateRange(
  timeframe: Timeframe,
  customStart?: string,
  customEnd?: string
): { startDate: string | null; endDate: string; label: string } {
  const today = getPhoenixToday();
  let start: Date | null = new Date(today);
  let end = new Date(today);

  if (timeframe === "last-7-days") {
    start!.setUTCDate(start!.getUTCDate() - 6);
  } else if (timeframe === "last-month") {
    start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)
    );
    end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  } else if (timeframe === "this-month") {
    start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)
    );
  } else if (timeframe === "last-90-days") {
    start!.setUTCDate(start!.getUTCDate() - 89);
  } else if (timeframe === "ytd") {
    start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  } else if (timeframe === "all-time") {
    start = null;
  } else if (timeframe === "custom") {
    const parsedStart = customStart
      ? new Date(`${customStart}T00:00:00Z`)
      : null;
    const parsedEnd = customEnd ? new Date(`${customEnd}T00:00:00Z`) : null;

    if (parsedStart && !Number.isNaN(parsedStart.getTime())) {
      start = parsedStart;
    }

    if (parsedEnd && !Number.isNaN(parsedEnd.getTime())) {
      end = parsedEnd;
    }

    if (start && start > end) {
      [start, end] = [end, start];
    }
  }

  const startDate = start ? formatDateInput(start) : null;
  const endDate = formatDateInput(end);

  const label = startDate
    ? `${formatDateLabel(startDate)} – ${formatDateLabel(endDate)}`
    : `All time through ${formatDateLabel(endDate)}`;

  return { startDate, endDate, label };
}

function buildCategorySummaries(rows: InvoiceCostRow[]): CategorySummary[] {
  const map = new Map<string, CategorySummary>();

  for (const row of rows) {
    const category = row.service_category || "Uncategorized";
    const directCost = toNumber(row.direct_cost);

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
    existing.total_revenue += toNumber(row.revenue);
    existing.total_direct_cost += directCost;
    existing.total_overhead_allocated += toNumber(row.overhead_allocated);
    existing.total_estimated_profit += toNumber(row.estimated_profit);

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

// Groups the (already timeframe-filtered) invoice rows by category into
// per-job detail rows for the drill-down, joining in customer name and
// invoice number/link the same batched-IN-query way lib/visitReport.ts
// and lib/transactions.ts join their own tables. Sorted by estimated
// profit, highest to lowest, within each category — matching the
// category-level sort so "which Quarterlys are doing well" reads the
// same way at both levels.
function buildCategoryJobRows(
  rows: InvoiceCostRow[],
  customerNames: Map<string, string>,
  invoiceMeta: Map<
    string,
    { invoice_number: string | null; jobber_web_uri: string | null }
  >,
  costBreakdowns: Map<string, CostBreakdown>
): Map<string, CategoryJobRow[]> {
  const map = new Map<string, CategoryJobRow[]>();

  for (const row of rows) {
    const category = row.service_category || "Uncategorized";
    const revenue = toNumber(row.revenue);
    const directCost = toNumber(row.direct_cost);
    const overhead = toNumber(row.overhead_allocated);
    const profit = toNumber(row.estimated_profit);
    const meta = invoiceMeta.get(row.jobber_invoice_id);
    const breakdown = costBreakdowns.get(row.jobber_invoice_id);

    const jobRow: CategoryJobRow = {
      jobber_invoice_id: row.jobber_invoice_id,
      invoice_number: meta?.invoice_number ?? null,
      jobber_web_uri: meta?.jobber_web_uri ?? null,
      issue_date: row.issue_date,
      client_name: row.jobber_client_id
        ? customerNames.get(row.jobber_client_id) ?? "Unknown Customer"
        : "Unknown Customer",
      revenue,
      direct_cost: directCost,
      overhead_allocated: overhead,
      estimated_profit: profit,
      profit_margin_pct: revenue > 0 ? (profit / revenue) * 100 : null,
      laborCost: breakdown?.labor ?? 0,
      materialCost: breakdown?.materials ?? 0,
    };

    const list = map.get(category) ?? [];
    list.push(jobRow);
    map.set(category, list);
  }

  for (const list of map.values()) {
    list.sort((a, b) => b.estimated_profit - a.estimated_profit);
  }

  return map;
}

const DRILLDOWN_BATCH_SIZE = 500;

async function fetchCustomerNamesByIds(
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  for (let i = 0; i < ids.length; i += DRILLDOWN_BATCH_SIZE) {
    const batchIds = ids.slice(i, i + DRILLDOWN_BATCH_SIZE);
    const { data, error } = await supabaseServer
      .from("customers")
      .select("jobber_client_id, full_name")
      .in("jobber_client_id", batchIds);

    if (error) throw error;

    for (const row of (data ?? []) as {
      jobber_client_id: string;
      full_name: string | null;
    }[]) {
      map.set(row.jobber_client_id, row.full_name || "Unknown Customer");
    }
  }

  return map;
}

async function fetchInvoiceMetaByIds(
  ids: string[]
): Promise<
  Map<string, { invoice_number: string | null; jobber_web_uri: string | null }>
> {
  const map = new Map<
    string,
    { invoice_number: string | null; jobber_web_uri: string | null }
  >();
  if (ids.length === 0) return map;

  for (let i = 0; i < ids.length; i += DRILLDOWN_BATCH_SIZE) {
    const batchIds = ids.slice(i, i + DRILLDOWN_BATCH_SIZE);
    const { data, error } = await supabaseServer
      .from("jobber_invoices")
      .select("jobber_invoice_id, invoice_number, jobber_web_uri")
      .in("jobber_invoice_id", batchIds);

    if (error) throw error;

    for (const row of (data ?? []) as {
      jobber_invoice_id: string;
      invoice_number: string | null;
      jobber_web_uri: string | null;
    }[]) {
      map.set(row.jobber_invoice_id, {
        invoice_number: row.invoice_number,
        jobber_web_uri: row.jobber_web_uri,
      });
    }
  }

  return map;
}

type CostBreakdown = { labor: number; materials: number };

// Recomputes a labor-vs-materials split per invoice by walking the same
// source tables /job-costs logs against: each invoice's visits, each
// visit's logged material usage (visit_material_usage, priced at
// unit_cost_at_time — the point-in-time rate, not materials.unit_cost
// today), split by whether the material is a real material or one of the
// synthetic "Labor - {employee name}" rate rows addEmployee() creates
// (see job-costs/page.tsx's identical convention). Equipment usage
// (visit_equipment_usage) has no dollar rate of its own in this schema,
// so it isn't part of either bucket.
async function fetchCostBreakdownByInvoice(
  invoiceIds: string[]
): Promise<Map<string, CostBreakdown>> {
  const result = new Map<string, CostBreakdown>();
  if (invoiceIds.length === 0) return result;

  const visitToInvoice = new Map<string, string>();
  for (let i = 0; i < invoiceIds.length; i += DRILLDOWN_BATCH_SIZE) {
    const batchIds = invoiceIds.slice(i, i + DRILLDOWN_BATCH_SIZE);
    const { data, error } = await supabaseServer
      .from("jobber_visits")
      .select("jobber_visit_id, jobber_invoice_id")
      .in("jobber_invoice_id", batchIds);

    if (error) throw error;

    for (const row of (data ?? []) as {
      jobber_visit_id: string;
      jobber_invoice_id: string | null;
    }[]) {
      if (row.jobber_invoice_id) {
        visitToInvoice.set(row.jobber_visit_id, row.jobber_invoice_id);
      }
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

    usageRows.push(
      ...((data ?? []) as typeof usageRows)
    );
  }
  if (usageRows.length === 0) return result;

  // Unfiltered on purpose — old invoices can reference a material/labor
  // rate that's since been end-dated, and its name is still needed here.
  const materialIds = Array.from(
    new Set(usageRows.map((row) => row.material_id))
  );
  const materialNameMap = new Map<string, string>();
  for (let i = 0; i < materialIds.length; i += DRILLDOWN_BATCH_SIZE) {
    const batchIds = materialIds.slice(i, i + DRILLDOWN_BATCH_SIZE);
    const { data, error } = await supabaseServer
      .from("materials")
      .select("id, name")
      .in("id", batchIds);

    if (error) throw error;

    for (const row of (data ?? []) as { id: string; name: string | null }[]) {
      materialNameMap.set(row.id, row.name ?? "");
    }
  }

  for (const row of usageRows) {
    const invoiceId = visitToInvoice.get(row.jobber_visit_id);
    if (!invoiceId) continue;

    const cost = toNumber(row.quantity_used) * toNumber(row.unit_cost_at_time);
    const isLabor = materialNameMap.get(row.material_id)?.startsWith("Labor - ") ?? false;

    const existing = result.get(invoiceId) ?? { labor: 0, materials: 0 };
    if (isLabor) {
      existing.labor += cost;
    } else {
      existing.materials += cost;
    }
    result.set(invoiceId, existing);
  }

  return result;
}

// Fetches every row of the view once, unfiltered. The page then slices this
// same in-memory set by date range for the selected timeframe AND uses the
// unfiltered whole for the all-time "True Net Profit" figure — avoiding a
// second round trip through the view for what's a small dataset at this
// business's scale.
async function fetchAllInvoiceCosts(): Promise<InvoiceCostRow[]> {
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

function filterRowsByRange(
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

function sumInvoiceRows(rows: InvoiceCostRow[]) {
  return rows.reduce(
    (acc, row) => ({
      revenue: acc.revenue + toNumber(row.revenue),
      directCost: acc.directCost + toNumber(row.direct_cost),
      overhead: acc.overhead + toNumber(row.overhead_allocated),
      profit: acc.profit + toNumber(row.estimated_profit),
    }),
    { revenue: 0, directCost: 0, overhead: 0, profit: 0 }
  );
}

export default async function JobCostingAnalyticsPage({
  searchParams,
}: JobCostingAnalyticsProps) {
  const params = await searchParams;
  const timeframe: Timeframe = isTimeframe(params.timeframe)
    ? params.timeframe
    : "all-time";

  const { startDate, endDate, label } = getDateRange(
    timeframe,
    params.start,
    params.end
  );

  const timeframeOptions: Array<{ value: Timeframe; label: string }> = [
    { value: "last-7-days", label: "Last 7 Days" },
    { value: "last-month", label: "Last Month" },
    { value: "this-month", label: "This Month" },
    { value: "last-90-days", label: "Last 90 Days" },
    { value: "ytd", label: "YTD" },
    { value: "all-time", label: "All Time" },
    { value: "custom", label: "Custom" },
  ];

  let allRows: InvoiceCostRow[] = [];
  let fetchError: string | null = null;
  let campaignRoi: Map<string, CampaignRoi> = new Map();
  const campaignNames = new Map<string, string>();

  try {
    const [rowsResult, roiResult, campaignsResult] = await Promise.all([
      fetchAllInvoiceCosts(),
      getAllCampaignRoi(),
      supabaseServer.from("campaigns").select("id, name, alias"),
    ]);

    allRows = rowsResult;
    campaignRoi = roiResult;

    for (const campaign of (campaignsResult.data ?? []) as Array<{
      id: string;
      name: string | null;
      alias: string | null;
    }>) {
      campaignNames.set(campaign.id, campaign.alias || campaign.name || "Untitled campaign");
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Unknown error";
  }

  const rows = filterRowsByRange(allRows, startDate, endDate);
  const categories = buildCategorySummaries(rows);

  // Per-job drill-down data for the currently selected timeframe only —
  // scoped to `rows`, not `allRows`, so expanding a category shows the
  // same jobs the category card's own totals are built from. Non-fatal
  // on failure: the category summaries above are the core feature and
  // still render fine without the expanded job list.
  let categoryJobRows: Map<string, CategoryJobRow[]> = new Map();
  try {
    const clientIds = Array.from(
      new Set(
        rows
          .map((row) => row.jobber_client_id)
          .filter((id): id is string => Boolean(id))
      )
    );
    const invoiceIds = Array.from(
      new Set(rows.map((row) => row.jobber_invoice_id))
    );

    const [customerNames, invoiceMeta, costBreakdowns] = await Promise.all([
      fetchCustomerNamesByIds(clientIds),
      fetchInvoiceMetaByIds(invoiceIds),
      fetchCostBreakdownByInvoice(invoiceIds),
    ]);

    categoryJobRows = buildCategoryJobRows(
      rows,
      customerNames,
      invoiceMeta,
      costBreakdowns
    );
  } catch (err) {
    console.error("Category drill-down lookup failed:", err);
  }

  // Marketing spend has no date dimension in this app today — a campaign's
  // "spend" is a single lifetime total entered once, not logged per period,
  // and its attributed revenue (getAllCampaignRoi) counts everything from a
  // customer's first touch onward with no end bound either. So the only
  // honest way to fold marketing into a P&L is all-time: mixing a
  // period-scoped job revenue against a lifetime spend figure would produce
  // a misleading "true profit" for anything shorter than "all time".
  const allTimeJobTotals = sumInvoiceRows(allRows);
  const marketingTotals = Array.from(campaignRoi.values()).reduce(
    (acc, roi) => ({
      spend: acc.spend + roi.spend,
      attributedRevenue: acc.attributedRevenue + roi.revenue,
    }),
    { spend: 0, attributedRevenue: 0 }
  );
  const trueNetProfit =
    allTimeJobTotals.profit - marketingTotals.spend;
  const trueMarginPct =
    allTimeJobTotals.revenue > 0
      ? (trueNetProfit / allTimeJobTotals.revenue) * 100
      : 0;
  const topCampaigns = Array.from(campaignRoi.entries())
    .filter(([, roi]) => roi.spend > 0 || roi.revenue > 0)
    .sort((a, b) => b[1].spend - a[1].spend)
    .slice(0, 5);

  const totals = categories.reduce(
    (acc, category) => ({
      revenue: acc.revenue + category.total_revenue,
      directCost: acc.directCost + category.total_direct_cost,
      overhead: acc.overhead + category.total_overhead_allocated,
      profit: acc.profit + category.total_estimated_profit,
      invoices: acc.invoices + category.invoice_count,
      unlogged: acc.unlogged + category.unlogged_count,
    }),
    {
      revenue: 0,
      directCost: 0,
      overhead: 0,
      profit: 0,
      invoices: 0,
      unlogged: 0,
    }
  );

  const overallMargin =
    totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  const unloggedRate =
    totals.invoices > 0 ? totals.unlogged / totals.invoices : 0;

  const maxProfit = Math.max(
    1,
    ...categories.map((c) => Math.abs(c.total_estimated_profit))
  );

  function buildUrl(overrides: Partial<{ timeframe: Timeframe }>): string {
    const p = new URLSearchParams();
    const nextTimeframe = overrides.timeframe ?? timeframe;
    p.set("timeframe", nextTimeframe);

    if (nextTimeframe === "custom") {
      if (params.start) p.set("start", params.start);
      if (params.end) p.set("end", params.end);
    }

    return `/job-costing-analytics?${p.toString()}`;
  }

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Job Costing Analytics
            </h1>

            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Profitability by service category, combining revenue, direct
              costs (materials, labor, fuel), and allocated overhead — plus a
              true, all-time net profit figure below that also nets out
              marketing spend.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/job-costs"
              className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
            >
              Log Job Costs
            </Link>

            <Link
              href="/job-costing-analytics/trends"
              className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
            >
              Seasonal Trends
            </Link>

            <Link
              href="/revenue"
              className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Back to Financial Dashboard
            </Link>
          </div>
        </header>

        <section
          id="timeframe"
          className="mt-8 scroll-mt-6 rounded-3xl bg-white p-6 shadow"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                Timeframe
              </p>
              <h2 className="mt-1 text-2xl font-bold">{label}</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {timeframeOptions.map((option) => (
                <Link
                  key={option.value}
                  href={buildUrl({ timeframe: option.value })}
                  scroll={false}
                  className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                    timeframe === option.value
                      ? "bg-[#d4af37] text-[#174734]"
                      : "border border-[#d8d3c6] bg-white text-[#6b705c] hover:border-[#d4af37]"
                  }`}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>

          {timeframe === "custom" && (
            <form
              method="GET"
              action="/job-costing-analytics#timeframe"
              className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl bg-[#f7f6f1] p-4"
            >
              <input type="hidden" name="timeframe" value="custom" />

              <label className="text-sm font-semibold text-[#6b705c]">
                Start date
                <input
                  type="date"
                  name="start"
                  defaultValue={startDate ?? ""}
                  className="mt-1 block rounded-xl border border-[#d8d3c6] bg-white px-3 py-2 text-[#174734]"
                />
              </label>

              <label className="text-sm font-semibold text-[#6b705c]">
                End date
                <input
                  type="date"
                  name="end"
                  defaultValue={endDate}
                  className="mt-1 block rounded-xl border border-[#d8d3c6] bg-white px-3 py-2 text-[#174734]"
                />
              </label>

              <button
                type="submit"
                className="rounded-xl bg-[#174734] px-5 py-2.5 text-sm font-bold text-white"
              >
                Apply Dates
              </button>
            </form>
          )}
        </section>

        {!fetchError && (
          <section className="mt-8 rounded-3xl bg-[#174734] p-5 text-white shadow sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#d4af37]">
                  True Net Profit · All Time
                </p>
                <p
                  className={`mt-2 text-4xl font-bold ${
                    trueNetProfit >= 0 ? "text-white" : "text-red-300"
                  }`}
                >
                  {formatCurrency(trueNetProfit)}
                </p>
                <p className="mt-2 text-sm text-white/70">
                  {trueMarginPct.toFixed(1)}% true margin — revenue minus
                  direct cost, overhead, and marketing spend, since day one.
                  Payroll is already folded into direct cost (employees are
                  logged as hourly line items against jobs).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-white/60">Revenue</p>
                  <p className="mt-1 text-lg font-bold">
                    {formatCurrency(allTimeJobTotals.revenue)}
                  </p>
                </div>
                <div>
                  <p className="text-white/60">Direct + Overhead</p>
                  <p className="mt-1 text-lg font-bold">
                    {formatCurrency(
                      allTimeJobTotals.directCost + allTimeJobTotals.overhead
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-white/60">Job Profit</p>
                  <p className="mt-1 text-lg font-bold">
                    {formatCurrency(allTimeJobTotals.profit)}
                  </p>
                </div>
                <div>
                  <p className="text-white/60">Marketing Spend</p>
                  <p className="mt-1 text-lg font-bold">
                    {formatCurrency(marketingTotals.spend)}
                  </p>
                </div>
              </div>
            </div>

            {topCampaigns.length > 0 && (
              <div className="mt-6 border-t border-white/15 pt-5">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#d4af37]">
                  Top Campaigns by Spend
                </p>

                <div className="mt-3 space-y-2">
                  {topCampaigns.map(([campaignId, roi]) => (
                    <div
                      key={campaignId}
                      className="flex flex-col gap-1 rounded-xl bg-white/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <p className="font-semibold">
                        {campaignNames.get(campaignId) ?? "Untitled campaign"}
                      </p>
                      <p className="text-sm text-white/80">
                        {formatCurrency(roi.spend)} spent ·{" "}
                        {formatCurrency(roi.revenue)} attributed revenue
                        {roi.roiPercent !== null && (
                          <>
                            {" "}
                            ·{" "}
                            <span
                              className={
                                roi.roiPercent >= 0
                                  ? "text-green-300"
                                  : "text-red-300"
                              }
                            >
                              {roi.roiPercent.toFixed(0)}% ROI
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  ))}
                </div>

                <Link
                  href="/codes"
                  className="mt-4 inline-block text-sm font-semibold text-[#d4af37] underline"
                >
                  See all campaigns →
                </Link>
              </div>
            )}
          </section>
        )}

        {fetchError ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">
              Analytics could not be loaded
            </p>
            <p className="mt-1 text-sm text-red-600">{fetchError}</p>
          </section>
        ) : categories.length === 0 ? (
          <section className="mt-6 rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-[#6b705c]">
              No invoice data found for this timeframe.
            </p>
          </section>
        ) : (
          <>
            {unloggedRate > 0.5 && (
              <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800 shadow-sm">
                <p className="font-bold">
                  Heads up — most invoices in this period have no logged
                  costs yet
                </p>
                <p className="mt-1 text-sm">
                  {formatNumber(totals.unlogged)} of{" "}
                  {formatNumber(totals.invoices)} invoices (
                  {(unloggedRate * 100).toFixed(0)}%) have no material,
                  labor, or fuel logged against them. Profit numbers below
                  only reflect overhead so far for those — they&apos;ll get more
                  accurate as you log usage on{" "}
                  <Link href="/job-costs" className="font-semibold underline">
                    /job-costs
                  </Link>
                  .
                </p>
              </section>
            )}

            <p className="mt-6 text-sm text-[#6b705c]">
              The figures below are scoped to {label} and don&apos;t include
              marketing spend — campaign spend is tracked as a lifetime
              total, not by date, so it only nets out cleanly in the
              all-time True Net Profit figure above.
            </p>

            <section className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-3xl bg-white p-6 shadow">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                  Total Revenue
                </p>
                <p className="mt-3 text-3xl font-bold">
                  {formatCurrency(totals.revenue)}
                </p>
              </article>

              <article className="rounded-3xl bg-white p-6 shadow">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                  Total Direct + Overhead Cost
                </p>
                <p className="mt-3 text-3xl font-bold">
                  {formatCurrency(totals.directCost + totals.overhead)}
                </p>
                <p className="mt-2 text-sm text-[#6b705c]">
                  {formatCurrency(totals.directCost)} direct,{" "}
                  {formatCurrency(totals.overhead)} overhead
                </p>
              </article>

              <article className="rounded-3xl bg-white p-6 shadow">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                  Estimated Profit
                </p>
                <p
                  className={`mt-3 text-3xl font-bold ${
                    totals.profit >= 0 ? "text-green-700" : "text-red-600"
                  }`}
                >
                  {formatCurrency(totals.profit)}
                </p>
              </article>

              <article className="rounded-3xl bg-white p-6 shadow">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                  Overall Margin
                </p>
                <p className="mt-3 text-3xl font-bold">
                  {overallMargin.toFixed(1)}%
                </p>
              </article>
            </section>

            <section className="mt-8 rounded-3xl bg-white p-5 shadow sm:p-8">
              <h2 className="text-2xl font-bold">
                Profit by Service Category
              </h2>

              <p className="mt-1 text-[#6b705c]">
                Ranked by total estimated profit, highest to lowest, for{" "}
                {label}. Click a category to see the individual jobs behind
                it.
              </p>

              <div className="mt-7 space-y-4">
                {categories.map((category) => {
                  const isNegative = category.total_estimated_profit < 0;
                  const barWidth = Math.max(
                    2,
                    (Math.abs(category.total_estimated_profit) / maxProfit) *
                      100
                  );
                  const unloggedPct =
                    category.invoice_count > 0
                      ? (category.unlogged_count / category.invoice_count) *
                        100
                      : 0;
                  const jobRows =
                    categoryJobRows.get(category.service_category) ?? [];

                  return (
                    <details
                      key={category.service_category}
                      className="group rounded-2xl border border-[#e7e2d5] p-5"
                    >
                      <summary className="flex cursor-pointer list-none flex-col gap-3 [&::-webkit-details-marker]:hidden sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-bold">
                            <svg
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              className="h-3.5 w-3.5 flex-shrink-0 text-[#9c7a20] transition-transform group-open:rotate-90"
                            >
                              <path
                                fillRule="evenodd"
                                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                                clipRule="evenodd"
                              />
                            </svg>
                            {category.service_category}
                          </p>
                          <p className="mt-1 text-sm text-[#6b705c]">
                            {formatNumber(category.invoice_count)} invoices
                            {unloggedPct > 0 && (
                              <span className="text-[#9c7a20]">
                                {" "}
                                · {unloggedPct.toFixed(0)}% unlogged
                              </span>
                            )}
                            {jobRows.length > 0 && (
                              <span> · click to see jobs</span>
                            )}
                          </p>
                        </div>

                        <div className="text-left sm:text-right">
                          <p
                            className={`text-2xl font-bold ${
                              isNegative ? "text-red-600" : "text-green-700"
                            }`}
                          >
                            {formatCurrency(category.total_estimated_profit)}
                          </p>
                          <p className="text-sm text-[#6b705c]">
                            {category.profit_margin_pct !== null
                              ? `${category.profit_margin_pct.toFixed(1)}% margin`
                              : "— margin"}
                          </p>
                        </div>
                      </summary>

                      <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#eeeae0]">
                        <div
                          className={`h-full rounded-full ${
                            isNegative ? "bg-red-500" : "bg-[#174734]"
                          }`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                        <div>
                          <p className="text-[#6b705c]">Revenue</p>
                          <p className="font-semibold">
                            {formatCurrency(category.total_revenue)}
                          </p>
                        </div>

                        <div>
                          <p className="text-[#6b705c]">Direct Cost</p>
                          <p className="font-semibold">
                            {formatCurrency(category.total_direct_cost)}
                          </p>
                        </div>

                        <div>
                          <p className="text-[#6b705c]">Overhead</p>
                          <p className="font-semibold">
                            {formatCurrency(
                              category.total_overhead_allocated
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-[#6b705c]">Avg / Job</p>
                          <p className="font-semibold">
                            {formatCurrency(category.avg_profit_per_job)}
                          </p>
                        </div>
                      </div>

                      {jobRows.length > 0 && (
                        <div className="mt-5 hidden group-open:block">
                          <div className="overflow-x-auto rounded-xl border border-[#e7e2d5]">
                            <table className="w-full min-w-[760px] text-left text-sm">
                              <thead className="bg-[#f7f6f1] text-xs font-semibold uppercase tracking-wide text-[#6b705c]">
                                <tr>
                                  <th className="px-4 py-2">Customer</th>
                                  <th className="px-4 py-2">Invoice</th>
                                  <th className="px-4 py-2">Date</th>
                                  <th className="px-4 py-2 text-right">
                                    Revenue
                                  </th>
                                  <th className="px-4 py-2 text-right">
                                    Labor
                                  </th>
                                  <th className="px-4 py-2 text-right">
                                    Materials
                                  </th>
                                  <th className="px-4 py-2 text-right">
                                    Total Cost
                                  </th>
                                  <th className="px-4 py-2 text-right">
                                    Profit
                                  </th>
                                  <th className="px-4 py-2 text-right">
                                    Margin
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#eeeae0]">
                                {jobRows.map((job) => (
                                  <tr key={job.jobber_invoice_id}>
                                    <td className="px-4 py-2 font-medium">
                                      {job.client_name}
                                    </td>
                                    <td className="px-4 py-2">
                                      {job.jobber_web_uri ? (
                                        <a
                                          href={job.jobber_web_uri}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[#9c7a20] underline"
                                        >
                                          {job.invoice_number ??
                                            job.jobber_invoice_id}
                                        </a>
                                      ) : (
                                        (job.invoice_number ?? "—")
                                      )}
                                    </td>
                                    <td className="px-4 py-2 text-[#6b705c]">
                                      {job.issue_date
                                        ? formatDateLabel(job.issue_date)
                                        : "—"}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                      {formatCurrency(job.revenue)}
                                    </td>
                                    <td className="px-4 py-2 text-right text-[#6b705c]">
                                      {formatCurrency(job.laborCost)}
                                    </td>
                                    <td className="px-4 py-2 text-right text-[#6b705c]">
                                      {formatCurrency(job.materialCost)}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                      {formatCurrency(
                                        job.direct_cost +
                                          job.overhead_allocated
                                      )}
                                    </td>
                                    <td
                                      className={`px-4 py-2 text-right font-semibold ${
                                        job.estimated_profit < 0
                                          ? "text-red-600"
                                          : "text-green-700"
                                      }`}
                                    >
                                      {formatCurrency(job.estimated_profit)}
                                    </td>
                                    <td className="px-4 py-2 text-right text-[#6b705c]">
                                      {job.profit_margin_pct !== null
                                        ? `${job.profit_margin_pct.toFixed(0)}%`
                                        : "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p className="mt-2 text-xs text-[#9c7a20]">
                            Labor and Materials reflect logged usage; Total
                            Cost also folds in allocated overhead.
                          </p>
                        </div>
                      )}
                    </details>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
