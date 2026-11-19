// Visit data shared by the customer page and the visit page: a customer's
// visits, what each one cost (labor, materials, equipment, overhead share,
// card fees), crew and time on site. Moved out of
// app/(platform)/customers/[id]/page.tsx so both pages always agree on the
// numbers.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { isLaborMaterialName, parseLaborEmployeeName } from "@/lib/laborMaterialName";
import { toNumber } from "@/lib/format";
import { toPhoenixDateString } from "@/lib/phoenixDate";

export type MaterialOption = {
  id: string;
  name: string;
  unit_label: string;
};

export type EquipmentOption = {
  id: string;
  name: string;
  nextUseCost: number | string;
};

export type VisitCostLine = {
  label: string;
  quantity: number;
  unitLabel: string;
  cost: number;
};

export type VisitCostBreakdown = {
  laborLines: VisitCostLine[];
  materialLines: VisitCostLine[];
  equipmentLines: VisitCostLine[];
  overheadLines: VisitCostLine[];
  laborTotal: number;
  materialTotal: number;
  equipmentTotal: number;
  overheadTotal: number;
  // This invoice-month's share of card processing fees (Ryan,
  // 2026-11-05 -- "should we be factoring [tips and processing fees]
  // in?"). A single number, not an itemized line list like overhead,
  // since it's already one real expense row per payment rather than a
  // pool split across named sources -- see getProcessingFeeShareByMonth.
  processingFeeTotal: number;
};

// Per-item amount, already divided down to a single invoice's share --
// what getOverheadSharePerInvoiceByMonth produces, reshaped into the
// same {label, quantity, unitLabel, cost} shape VisitCostBreakdownSection
// already knows how to render (quantity/unitLabel unused here, same as
// the Equipment Used lines above).
export type OverheadLine = {
  label: string;
  amount: number;
};

export type CustomerVisit = {
  jobber_visit_id: string;
  title: string | null;
  visit_status: string | null;
  start_at: string | null;
  completed_at: string | null;
};

export type VisitUsageRow = {
  jobber_visit_id: string;
  material_id: string;
  quantity_used: number | string;
};

export type VisitEquipmentUsageRow = {
  jobber_visit_id: string;
  equipment_id: string;
};

export type VisitCost = {
  jobber_visit_id: string;
  material_cost: number | string;
};

export async function getMaterialsList(): Promise<MaterialOption[]> {
  const { data, error } = await supabaseServer
    .from("materials")
    .select("id, name, unit_label")
    .order("name", { ascending: true });

  if (error) {
    console.error("Materials query failed:", error.message);
    return [];
  }

  return (data ?? []) as MaterialOption[];
}

export async function getEquipmentList(): Promise<EquipmentOption[]> {
  const today = new Date().toISOString().slice(0, 10);

  // equipment_usage_summary (the same view /materials reads for its
  // "next use" column) rather than the bare equipment table -- that's
  // where next_use_cost actually lives, the flat per-use billing rate
  // (Ryan wants it kept at $1 regardless of the equipment's real
  // purchase-price-amortized cost, same view /materials' EquipmentRow
  // already labels "next use"). id:equipment_id aliases it back to the
  // plain `id` every other EquipmentOption caller in this file expects.
  const { data, error } = await supabaseServer
    .from("equipment_usage_summary")
    .select("id:equipment_id, name, next_use_cost")
    .or(`retired_date.is.null,retired_date.gt.${today}`)
    .order("name", { ascending: true });

  if (error) {
    console.error("Equipment query failed:", error.message);
    return [];
  }

  return ((data ?? []) as { id: string; name: string; next_use_cost: number | string }[]).map(
    (row) => ({ id: row.id, name: row.name, nextUseCost: row.next_use_cost })
  );
}

// Job canceled directly in Jobber's own UI (not through this app) only
// fires a job-level webhook -- it never touches the visit rows
// themselves, so without this filter a canceled job's visits sit in
// jobber_visits forever looking "upcoming." Same fix already applied on
// /schedule, /my-day, and /crew-status -- see 051_add_job_status_to_visits.sql
// and jobberWebhookProcessor.ts's syncSingleJob comment. This page had
// never picked it up, which is exactly why Brittany Pratz's canceled job
// was still showing a future "Next Visit" here (2026-09-21).
//
// Written as job_status.is.null OR job_status.neq.archived (not a bare
// .neq()) because a plain <> comparison excludes NULL rows in SQL, which
// would hide every visit not yet backfilled/synced with a job_status at
// all. completed_at.not.is.null is the third branch: a visit that
// already happened should always still show on Past Visits, regardless
// of what its job's status becomes afterward (e.g. Jobber archiving a
// one-off job once it's closed out and invoiced -- not a cancellation).
// Only a still-upcoming, never-completed visit on a truly-archived
// (canceled) job should stay hidden.
export const ACTIVE_JOB_VISIT_FILTER =
  "job_status.is.null,job_status.neq.archived,completed_at.not.is.null";

export async function getPastVisits(
  jobberClientId: string
): Promise<CustomerVisit[]> {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseServer
    .from("jobber_visits")
    .select(
      "jobber_visit_id, title, visit_status, start_at, completed_at"
    )
    .eq("jobber_client_id", jobberClientId)
    .not("start_at", "is", null)
    .lt("start_at", nowIso)
    .or(ACTIVE_JOB_VISIT_FILTER)
    .order("start_at", { ascending: false });

  if (error) {
    console.error("Past visits query failed:", error.message);
    return [];
  }

  return (data ?? []) as CustomerVisit[];
}

export async function getNextVisit(
  jobberClientId: string
): Promise<CustomerVisit | null> {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseServer
    .from("jobber_visits")
    .select(
      "jobber_visit_id, title, visit_status, start_at, completed_at"
    )
    .eq("jobber_client_id", jobberClientId)
    .not("start_at", "is", null)
    .gte("start_at", nowIso)
    .or(ACTIVE_JOB_VISIT_FILTER)
    .order("start_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Next visit query failed:", error.message);
    return null;
  }

  return (data as CustomerVisit | null) ?? null;
}

// Ryan (2026-09-21): the page had a single "Next Visit" card but nowhere
// to see anything further out -- Past Visits existed, nothing for
// future. Paginated the same as Past Visits below (LIST_PAGE_SIZE),
// moved between Past Visits/Payment History (2026-09-22) to match.
export async function getUpcomingVisits(
  jobberClientId: string
): Promise<CustomerVisit[]> {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseServer
    .from("jobber_visits")
    .select(
      "jobber_visit_id, title, visit_status, start_at, completed_at"
    )
    .eq("jobber_client_id", jobberClientId)
    .not("start_at", "is", null)
    .gte("start_at", nowIso)
    .or(ACTIVE_JOB_VISIT_FILTER)
    .order("start_at", { ascending: true });

  if (error) {
    console.error("Upcoming visits query failed:", error.message);
    return [];
  }

  return (data ?? []) as CustomerVisit[];
}

export async function getVisitUsageMaps(visitIds: string[]): Promise<{
  usageMap: Map<string, number>;
  equipmentUsageSet: Set<string>;
  costMap: Map<string, number>;
}> {
  if (visitIds.length === 0) {
    return {
      usageMap: new Map(),
      equipmentUsageSet: new Set(),
      costMap: new Map(),
    };
  }

  const [usageResult, equipmentUsageResult, costResult] = await Promise.all([
    supabaseServer
      .from("visit_material_usage")
      .select("jobber_visit_id, material_id, quantity_used")
      .in("jobber_visit_id", visitIds),
    supabaseServer
      .from("visit_equipment_usage")
      .select("jobber_visit_id, equipment_id")
      .in("jobber_visit_id", visitIds),
    supabaseServer
      .from("visit_material_cost")
      .select("jobber_visit_id, material_cost")
      .in("jobber_visit_id", visitIds),
  ]);

  const usageMap = new Map<string, number>();
  for (const row of (usageResult.data ?? []) as VisitUsageRow[]) {
    usageMap.set(
      `${row.jobber_visit_id}:${row.material_id}`,
      Number(row.quantity_used ?? 0)
    );
  }

  const equipmentUsageSet = new Set<string>();
  for (const row of (equipmentUsageResult.data ??
    []) as VisitEquipmentUsageRow[]) {
    equipmentUsageSet.add(`${row.jobber_visit_id}:${row.equipment_id}`);
  }

  const costMap = new Map<string, number>();
  for (const row of (costResult.data ?? []) as VisitCost[]) {
    costMap.set(row.jobber_visit_id, Number(row.material_cost ?? 0));
  }

  return { usageMap, equipmentUsageSet, costMap };
}

export type VisitUsageDetailRow = {
  jobber_visit_id: string;
  material_id: string;
  quantity_used: number | string;
  unit_cost_at_time: number | string;
};

// Read-only cost breakdown for Past Visits (Ryan, 2026-10-15): the
// existing VisitCostForm above is an edit form -- raw inputs, no dollar
// figures, no labor/materials split -- so there was nowhere to actually
// see what a visit's logged cost was made of. Reuses the same
// visit_material_usage rows, priced at unit_cost_at_time (the
// point-in-time rate -- same source lib/jobCostingSummary.ts's
// fetchCostBreakdownForInvoices reads for the invoice-level numbers), so
// this always foots to the same total already shown next to each visit
// (visitCostMap, from the visit_material_cost view) instead of
// introducing a second, possibly-drifting way to add it up.
export async function getVisitCostBreakdowns(
  visitIds: string[],
  materialsList: MaterialOption[],
  equipmentList: EquipmentOption[],
  visitEquipmentUsageSet: Set<string>
): Promise<Map<string, VisitCostBreakdown>> {
  const breakdowns = new Map<string, VisitCostBreakdown>();

  if (visitIds.length === 0) {
    return breakdowns;
  }

  for (const visitId of visitIds) {
    const equipmentLines: VisitCostLine[] = equipmentList
      .filter((item) => visitEquipmentUsageSet.has(`${visitId}:${item.id}`))
      .map((item) => ({
        label: item.name,
        quantity: 1,
        unitLabel: "use",
        cost: Number(item.nextUseCost ?? 0),
      }));

    breakdowns.set(visitId, {
      laborLines: [],
      materialLines: [],
      equipmentLines,
      overheadLines: [],
      laborTotal: 0,
      materialTotal: 0,
      equipmentTotal: equipmentLines.reduce((sum, line) => sum + line.cost, 0),
      overheadTotal: 0,
      processingFeeTotal: 0,
    });
  }

  const { data, error } = await supabaseServer
    .from("visit_material_usage")
    .select("jobber_visit_id, material_id, quantity_used, unit_cost_at_time")
    .in("jobber_visit_id", visitIds);

  if (error) {
    console.error("Visit cost breakdown query failed:", error.message);
    return breakdowns;
  }

  const materialById = new Map(materialsList.map((m) => [m.id, m]));

  for (const row of (data ?? []) as VisitUsageDetailRow[]) {
    const breakdown = breakdowns.get(row.jobber_visit_id);
    const material = materialById.get(row.material_id);
    if (!breakdown || !material) continue;

    const quantity = Number(row.quantity_used ?? 0);
    const unitCost = Number(row.unit_cost_at_time ?? 0);
    const cost = quantity * unitCost;
    const isLabor = isLaborMaterialName(material.name);

    const line: VisitCostLine = {
      label: isLabor
        ? parseLaborEmployeeName(material.name) ?? material.name
        : material.name,
      quantity,
      unitLabel: material.unit_label,
      cost,
    };

    if (isLabor) {
      breakdown.laborLines.push(line);
      breakdown.laborTotal += cost;
    } else {
      breakdown.materialLines.push(line);
      breakdown.materialTotal += cost;
    }
  }

  return breakdowns;
}

// Per-invoice share of the Job Costing overhead pool for a given month,
// itemized by what actually makes it up -- the lump
// invoice_cost_breakdown.overhead_allocated figure already shown on Past
// Invoices below (and on Job Costing Analytics sitewide), broken down
// into its named sources. Ryan (2026-11-01): "can we break down what
// those amortized costs are per job?" after discussing insurance -- the
// view behind that lump figure (overhead_by_month, supabase/migrations/
// 033 + 094) only exposes four bucket TOTALS, not which named cost made
// up each one, and /expenses/job-costing (the only other place the pool
// is visible) shows the month's raw tagged expenses, not each one's
// prorated dollar contribution or its per-job share -- so this mirrors
// that view's SQL in JS against the same three source tables
// (overhead_costs, expenses, monthly_financials) rather than querying
// the view itself.
//
// Visits are matched to a month by their own start_at, not by chasing
// down which invoice actually covers them -- this mirrors the
// convention lib/jobCostingSummary.ts's fetchCostBreakdownForInvoices
// already established sitewide ("an invoice for client X issued in
// month M is matched against ALL of X's visits whose start_at also
// falls in month M"), so a visit's breakdown here always agrees with
// what the Past Invoices "+ $Y overhead" figure already shows for the
// same job, without a second visit-to-invoice lookup.
export async function getOverheadSharePerInvoiceByMonth(
  months: string[]
): Promise<Map<string, OverheadLine[]>> {
  const result = new Map<string, OverheadLine[]>();
  const uniqueMonths = Array.from(new Set(months)).filter(Boolean);
  if (uniqueMonths.length === 0) return result;

  const todayStr =
    toPhoenixDateString(new Date().toISOString()) ?? uniqueMonths[0];
  const currentMonthKey = todayStr.slice(0, 7);
  const monthStartDates = uniqueMonths.map((m) => `${m}-01`);

  const [overheadCostsResult, expensesResult, financialsResult] =
    await Promise.all([
      supabaseServer
        .from("overhead_costs")
        .select("name, cost_type, amount, start_date, end_date"),
      supabaseServer
        .from("expenses")
        .select(
          "vendor, description, amount, expense_date, job_costing_treatment, amortization_end_date"
        )
        .not("job_costing_treatment", "is", null),
      supabaseServer
        .from("monthly_financials")
        .select("month, invoice_count")
        .in("month", monthStartDates),
    ]);

  const invoiceCountByMonth = new Map<string, number>();
  for (const row of (financialsResult.data ?? []) as {
    month: string;
    invoice_count: number | string;
  }[]) {
    invoiceCountByMonth.set(row.month.slice(0, 7), toNumber(row.invoice_count));
  }

  const prorationFactor = (monthKey: string): number => {
    if (monthKey !== currentMonthKey) return 1;
    const [year, month] = monthKey.split("-").map(Number);
    const dayOfMonth = Number(todayStr.slice(8, 10));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return dayOfMonth / daysInMonth;
  };

  const monthSpan = (startMonthKey: string, endMonthKey: string): number => {
    const [sy, sm] = startMonthKey.split("-").map(Number);
    const [ey, em] = endMonthKey.split("-").map(Number);
    return Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
  };

  const overheadCostsRows = (overheadCostsResult.data ?? []) as {
    name: string | null;
    cost_type: string | null;
    amount: number | string;
    start_date: string;
    end_date: string | null;
  }[];
  const expenseRows = (expensesResult.data ?? []) as {
    vendor: string | null;
    description: string | null;
    amount: number | string;
    expense_date: string;
    job_costing_treatment: string | null;
    amortization_end_date: string | null;
  }[];

  for (const monthKey of uniqueMonths) {
    const invoiceCount = invoiceCountByMonth.get(monthKey) ?? 0;
    if (invoiceCount <= 0) {
      result.set(monthKey, []);
      continue;
    }

    const monthStart = `${monthKey}-01`;
    const [y, m] = monthKey.split("-").map(Number);
    const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const factor = prorationFactor(monthKey);
    const lines: OverheadLine[] = [];

    for (const row of overheadCostsRows) {
      const amount = toNumber(row.amount);
      if (amount === 0) continue;

      if (
        row.cost_type === "recurring" &&
        row.start_date <= monthEnd &&
        (!row.end_date || row.end_date >= monthStart)
      ) {
        const share = (amount * factor) / invoiceCount;
        if (share > 0) {
          lines.push({ label: row.name || "Recurring cost", amount: share });
        }
      } else if (
        row.cost_type === "amortized" &&
        row.end_date &&
        row.start_date <= monthEnd &&
        row.end_date >= monthStart
      ) {
        const span = monthSpan(row.start_date.slice(0, 7), row.end_date.slice(0, 7));
        const share = ((amount / span) * factor) / invoiceCount;
        if (share > 0) {
          lines.push({ label: row.name || "Amortized cost", amount: share });
        }
      }
    }

    for (const row of expenseRows) {
      const amount = toNumber(row.amount);
      if (amount === 0) continue;
      const label = row.vendor || row.description || "Expense";

      if (
        row.job_costing_treatment === "one_time" &&
        row.expense_date.slice(0, 7) === monthKey
      ) {
        const share = amount / invoiceCount;
        if (share > 0) lines.push({ label, amount: share });
      } else if (
        row.job_costing_treatment === "amortized" &&
        row.amortization_end_date &&
        row.expense_date <= monthEnd &&
        row.amortization_end_date >= monthStart
      ) {
        const span = monthSpan(
          row.expense_date.slice(0, 7),
          row.amortization_end_date.slice(0, 7)
        );
        const share = ((amount / span) * factor) / invoiceCount;
        if (share > 0) lines.push({ label, amount: share });
      }
    }

    result.set(
      monthKey,
      lines.sort((a, b) => b.amount - a.amount)
    );
  }

  return result;
}

// This client's own share of card processing fees, per month (Ryan,
// 2026-11-05 -- see VisitCostBreakdown.processingFeeTotal's comment).
// Unlike getOverheadSharePerInvoiceByMonth above, this isn't a pool
// split sitewide -- a processing fee is charged against one specific
// payment, which is already tied to one specific invoice
// (jobber_payment_fees.jobber_invoice_id), so this only has to find
// this client's own invoices issued in the given months, then sum the
// fee expenses already linked to those invoices via jobber_payment_fees
// -- same join lib/jobCostingSummary.ts's fetchCostBreakdownForInvoices
// uses, just scoped to one client instead of a batch of invoice ids.
// Sourced from `expenses` (not jobber_payment_fees directly) so this
// reflects any manual correction Ryan makes, same as every other direct
// cost here. Native Stripe charges are excluded for the same reason
// given there -- no bridge back to a jobber_invoice_id yet.
export async function getProcessingFeeShareByMonth(
  jobberClientId: string,
  months: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const uniqueMonths = Array.from(new Set(months)).filter(Boolean);
  if (uniqueMonths.length === 0) return result;

  const { data: invoiceRows, error: invoiceError } = await supabaseServer
    .from("jobber_invoices")
    .select("jobber_invoice_id, issue_date")
    .eq("jobber_client_id", jobberClientId);

  if (invoiceError) {
    console.error("Processing fee share query failed:", invoiceError.message);
    return result;
  }

  const monthByInvoiceId = new Map<string, string>();
  for (const row of (invoiceRows ?? []) as {
    jobber_invoice_id: string;
    issue_date: string | null;
  }[]) {
    const month = row.issue_date?.slice(0, 7);
    if (month && uniqueMonths.includes(month)) {
      monthByInvoiceId.set(row.jobber_invoice_id, month);
    }
  }

  const invoiceIds = Array.from(monthByInvoiceId.keys());
  if (invoiceIds.length === 0) return result;

  const { data: paymentFeeRows, error: paymentFeeError } = await supabaseServer
    .from("jobber_payment_fees")
    .select("jobber_payment_record_id, jobber_invoice_id")
    .in("jobber_invoice_id", invoiceIds);

  if (paymentFeeError) {
    console.error("Processing fee share query failed:", paymentFeeError.message);
    return result;
  }

  const invoiceIdByPaymentRecordId = new Map(
    (
      (paymentFeeRows ?? []) as {
        jobber_payment_record_id: string;
        jobber_invoice_id: string | null;
      }[]
    )
      .filter((row) => row.jobber_invoice_id)
      .map((row) => [row.jobber_payment_record_id, row.jobber_invoice_id as string])
  );

  const paymentRecordIds = Array.from(invoiceIdByPaymentRecordId.keys());
  if (paymentRecordIds.length === 0) return result;

  const { data: feeExpenseRows, error: feeExpenseError } = await supabaseServer
    .from("expenses")
    .select("jobber_payment_record_id, amount")
    .eq("source", "processing_fee")
    .in("jobber_payment_record_id", paymentRecordIds);

  if (feeExpenseError) {
    console.error("Processing fee share query failed:", feeExpenseError.message);
    return result;
  }

  for (const row of (feeExpenseRows ?? []) as {
    jobber_payment_record_id: string | null;
    amount: number | string;
  }[]) {
    if (!row.jobber_payment_record_id) continue;
    const invoiceId = invoiceIdByPaymentRecordId.get(row.jobber_payment_record_id);
    const month = invoiceId ? monthByInvoiceId.get(invoiceId) : undefined;
    if (!month) continue;

    result.set(month, (result.get(month) ?? 0) + toNumber(row.amount));
  }

  return result;
}

export type VisitTimeLogRow = {
  jobber_visit_id: string;
  started_at: string;
  stopped_at: string | null;
};

// Wall-clock time on-site per visit (not summed labor-hours — two techs
// working the same visit together shouldn't double it), for "how long
// each visit actually took" so future scheduling can budget the right
// amount of time per service type. Takes the earliest start and latest
// stop across every completed visit_time_logs segment for a visit,
// covering multi-person and paused/resumed visits alike. See
// 019_add_visit_time_logs.sql and job-costs/page.tsx's timerMinutesMap
// for the sibling calculation that sums (rather than spans) this same
// table for labor-cost purposes.
export async function getVisitDurationMinutes(
  visitIds: string[]
): Promise<Map<string, number>> {
  if (visitIds.length === 0) return new Map();

  const { data, error } = await supabaseServer
    .from("visit_time_logs")
    .select("jobber_visit_id, started_at, stopped_at")
    .in("jobber_visit_id", visitIds)
    .not("stopped_at", "is", null);

  if (error) {
    console.error("Visit time logs query failed:", error.message);
    return new Map();
  }

  const bounds = new Map<string, { min: number; max: number }>();

  for (const row of (data ?? []) as VisitTimeLogRow[]) {
    if (!row.stopped_at) continue;

    const start = new Date(row.started_at).getTime();
    const stop = new Date(row.stopped_at).getTime();

    if (!Number.isFinite(start) || !Number.isFinite(stop) || stop <= start) {
      continue;
    }

    const existing = bounds.get(row.jobber_visit_id);
    if (!existing) {
      bounds.set(row.jobber_visit_id, { min: start, max: stop });
    } else {
      existing.min = Math.min(existing.min, start);
      existing.max = Math.max(existing.max, stop);
    }
  }

  const minutesByVisit = new Map<string, number>();
  for (const [visitId, { min, max }] of bounds) {
    minutesByVisit.set(visitId, (max - min) / 60000);
  }

  return minutesByVisit;
}

export type JobberVisitLaborRow = {
  jobber_visit_id: string;
  duration_seconds: number;
};

// Historical fallback for getVisitDurationMinutes above: this app's own
// on-site timer (visit_time_logs) only has data for visits that
// happened after that feature shipped. For everything before that,
// jobber_visit_labor (029_add_jobber_visit_labor.sql, filled in by
// app/api/jobber/sync-visit-labor/route.ts) holds whatever labor
// duration Jobber itself tracked. Callers should prefer
// visitDurationMap and only fall back to this when it has nothing for
// a given visit — see the "on site" vs "logged (Jobber)" rendering on
// Past Visits below.
export async function getVisitLaborMinutes(
  visitIds: string[]
): Promise<Map<string, number>> {
  if (visitIds.length === 0) return new Map();

  const { data, error } = await supabaseServer
    .from("jobber_visit_labor")
    .select("jobber_visit_id, duration_seconds")
    .in("jobber_visit_id", visitIds);

  if (error) {
    console.error("Jobber visit labor query failed:", error.message);
    return new Map();
  }

  const minutesByVisit = new Map<string, number>();
  for (const row of (data ?? []) as JobberVisitLaborRow[]) {
    if (row.duration_seconds > 0) {
      minutesByVisit.set(row.jobber_visit_id, row.duration_seconds / 60);
    }
  }

  return minutesByVisit;
}

export function formatDurationMinutes(minutes: number | undefined): string | null {
  if (!minutes || minutes <= 0) return null;

  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export type VisitAssignmentRow = {
  jobber_visit_id: string;
  assigned_user_id: string;
};

export type UserNameRow = {
  id: string;
  name: string;
};

// Who was on-site for each visit, alongside formatDurationMinutes above
// — seeing both together on Past Visits is what actually makes them
// useful for scheduling ("Sarah takes about 45 min for this service, so
// budget accordingly"). Deliberately doesn't filter to active users only
// (unlike schedule/page.tsx's assignment lookup, which only offers
// active users as assignment *targets*) — a past visit should still show
// who did it even if that person isn't with the company anymore.
export async function getVisitAssignedNames(
  visitIds: string[]
): Promise<Map<string, string[]>> {
  if (visitIds.length === 0) return new Map();

  const [{ data: assignmentsData }, { data: usersData }] = await Promise.all([
    supabaseServer
      .from("visit_assignments")
      .select("jobber_visit_id, assigned_user_id")
      .in("jobber_visit_id", visitIds),
    supabaseServer.from("users").select("id, name"),
  ]);

  const userNameById = new Map<string, string>(
    ((usersData ?? []) as UserNameRow[]).map((u) => [u.id, u.name])
  );

  const namesByVisit = new Map<string, string[]>();

  for (const row of (assignmentsData ?? []) as VisitAssignmentRow[]) {
    const userName = userNameById.get(row.assigned_user_id);
    if (!userName) continue;

    const list = namesByVisit.get(row.jobber_visit_id) ?? [];
    list.push(userName);
    namesByVisit.set(row.jobber_visit_id, list);
  }

  return namesByVisit;
}

export type VisitFinancials = {
  usageMap: Map<string, number>;
  equipmentUsageSet: Set<string>;
  breakdownMap: Map<string, VisitCostBreakdown>;
  // Labor + materials + equipment + overhead share + card fee share per
  // visit: the one number shown next to a visit everywhere.
  displayTotalMap: Map<string, number>;
  // This app's own on-site timer wins; jobber_visit_labor only fills in
  // for visits from before the timer existed.
  displayDurationMap: Map<string, { minutes: number; source: "own" | "jobber" }>;
  assignedNamesMap: Map<string, string[]>;
};

export async function loadVisitFinancials(params: {
  visits: CustomerVisit[];
  customerId: string;
  materialsList: MaterialOption[];
  equipmentList: EquipmentOption[];
}): Promise<VisitFinancials> {
  const { visits, customerId, materialsList, equipmentList } = params;
  const allVisitIds = visits.map((visit) => visit.jobber_visit_id);

  const {
    usageMap,
    equipmentUsageSet,
    costMap: visitCostMap,
  } = await getVisitUsageMaps(allVisitIds);

  const breakdownMap = await getVisitCostBreakdowns(
    allVisitIds,
    materialsList,
    equipmentList,
    equipmentUsageSet
  );

  // Overhead share per job (Ryan, 2026-11-01) -- computed per distinct
  // month present among the visits, then attached onto each visit's
  // breakdown. See getOverheadSharePerInvoiceByMonth for why
  // month-of-visit is the right key.
  const overheadMonths = visits
    .map((visit) => visit.start_at?.slice(0, 7))
    .filter((month): month is string => Boolean(month));
  const overheadByMonth = await getOverheadSharePerInvoiceByMonth(overheadMonths);

  // Processing fee share, same per-month keying (Ryan, 2026-11-05).
  const processingFeeByMonth = await getProcessingFeeShareByMonth(
    customerId,
    overheadMonths
  );

  for (const visit of visits) {
    const month = visit.start_at?.slice(0, 7);
    const breakdown = breakdownMap.get(visit.jobber_visit_id);
    if (!breakdown || !month) continue;

    const overheadLines: VisitCostLine[] = (overheadByMonth.get(month) ?? []).map(
      (line) => ({
        label: line.label,
        quantity: 1,
        unitLabel: "",
        cost: line.amount,
      })
    );
    breakdown.overheadLines = overheadLines;
    breakdown.overheadTotal = overheadLines.reduce((sum, line) => sum + line.cost, 0);
    breakdown.processingFeeTotal = processingFeeByMonth.get(month) ?? 0;
  }

  // Collapsed total shown next to a visit must equal the expanded
  // breakdown total (Ryan, 2026-11-02: $139 collapsed vs $162 expanded).
  const displayTotalMap = new Map<string, number>();
  for (const visit of visits) {
    const breakdown = breakdownMap.get(visit.jobber_visit_id);
    const total = breakdown
      ? breakdown.laborTotal +
        breakdown.materialTotal +
        breakdown.equipmentTotal +
        breakdown.overheadTotal +
        breakdown.processingFeeTotal
      : (visitCostMap.get(visit.jobber_visit_id) ?? 0);
    displayTotalMap.set(visit.jobber_visit_id, total);
  }

  const durationMap = await getVisitDurationMinutes(allVisitIds);
  const laborMap = await getVisitLaborMinutes(allVisitIds);
  const assignedNamesMap = await getVisitAssignedNames(allVisitIds);

  const displayDurationMap = new Map<
    string,
    { minutes: number; source: "own" | "jobber" }
  >();

  for (const visitId of allVisitIds) {
    const ownMinutes = durationMap.get(visitId);
    if (ownMinutes) {
      displayDurationMap.set(visitId, { minutes: ownMinutes, source: "own" });
      continue;
    }

    const jobberMinutes = laborMap.get(visitId);
    if (jobberMinutes) {
      displayDurationMap.set(visitId, { minutes: jobberMinutes, source: "jobber" });
    }
  }

  return {
    usageMap,
    equipmentUsageSet,
    breakdownMap,
    displayTotalMap,
    displayDurationMap,
    assignedNamesMap,
  };
}
