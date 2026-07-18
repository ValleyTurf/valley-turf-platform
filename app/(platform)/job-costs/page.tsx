export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { saveVisitCosts } from "../materials/actions";

type JobCostsPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
    show?: string;
  }>;
};

type Material = {
  id: string;
  name: string;
  unit_label: string;
  unit_cost: number | string;
};

type Equipment = {
  id: string;
  name: string;
};

type VisitRow = {
  jobber_visit_id: string;
  jobber_client_id: string | null;
  jobber_invoice_id: string | null;
  customer_name: string | null;
  job_number: string | null;
  title: string | null;
  visit_status: string | null;
  start_at: string | null;
  end_at: string | null;
  completed_at: string | null;
  service_category: string | null;
  has_logged_cost: boolean | null;
};

type UsageRow = {
  jobber_visit_id: string;
  material_id: string;
  quantity_used: number | string;
};

type EquipmentUsageRow = {
  jobber_visit_id: string;
  equipment_id: string;
};

type VisitCost = {
  jobber_visit_id: string;
  material_cost: number | string;
};

const PAGE_SIZE = 15;

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number | string | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(toNumber(value));
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function decimalHoursToHMM(decimalHours: number): string {
  if (!decimalHours) {
    return "";
  }

  const totalMinutes = Math.round(decimalHours * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function escapeSearchValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, "\\,")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildJobCostsUrl(
  page: number,
  search: string,
  showAll: boolean
): string {
  const params = new URLSearchParams();

  if (search) {
    params.set("q", search);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  if (showAll) {
    params.set("show", "all");
  }

  const query = params.toString();

  return query ? `/job-costs?${query}` : "/job-costs";
}

const RECURRING_CATEGORIES = new Set([
  "Monthly Maintenance",
  "Quarterly Cleaning",
  "Bimonthly Cleaning",
  "Semi-Annual Cleaning",
  "Weekly Maintenance",
  "Spray Only",
]);

function statusBadge(status: string | null): {
  label: string;
  classes: string;
} {
  const normalized = (status ?? "").toUpperCase();

  if (normalized === "COMPLETED") {
    return { label: "Completed", classes: "bg-green-100 text-green-800" };
  }

  if (normalized === "LATE") {
    return { label: "Late", classes: "bg-red-100 text-red-800" };
  }

  if (normalized === "UPCOMING") {
    return { label: "Upcoming", classes: "bg-blue-100 text-blue-800" };
  }

  return { label: status || "Unknown", classes: "bg-gray-100 text-gray-700" };
}

export default async function JobCostsPage({
  searchParams,
}: JobCostsPageProps) {
  const params = await searchParams;
  const search = String(params.q ?? "").trim();
  const showAll = params.show === "all";

  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const [materialsResult, equipmentResult] = await Promise.all([
    supabaseServer
      .from("materials")
      .select("id, name, unit_label, unit_cost")
      .order("name", { ascending: true }),
    (() => {
      const today = new Date().toISOString().slice(0, 10);
      return supabaseServer
        .from("equipment")
        .select("id, name")
        .or(`retired_date.is.null,retired_date.gt.${today}`)
        .order("name", { ascending: true });
    })(),
  ]);

  const materials = (materialsResult.data ?? []) as Material[];
  const equipmentList = (equipmentResult.data ?? []) as Equipment[];

  const nowIso = new Date().toISOString();

  let visitsQuery = supabaseServer
    .from("visit_costing_list")
    .select(
      "jobber_visit_id, jobber_client_id, jobber_invoice_id, customer_name, job_number, title, visit_status, start_at, end_at, completed_at, service_category, has_logged_cost",
      { count: "exact" }
    )
    .not("start_at", "is", null)
    .lte("start_at", nowIso)
    .order("start_at", { ascending: false })
    .range(from, to);

  if (!showAll) {
    visitsQuery = visitsQuery.eq("has_logged_cost", false);
  }

  if (search) {
    const safeSearch = escapeSearchValue(search);

    visitsQuery = visitsQuery.or(
      [
        `customer_name.ilike.%${safeSearch}%`,
        `title.ilike.%${safeSearch}%`,
      ].join(",")
    );
  }

  const { data: visitsData, count, error } = await visitsQuery;

  const visits = (visitsData ?? []) as VisitRow[];
  const totalVisits = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalVisits / PAGE_SIZE));

  const visitIds = visits.map((visit) => visit.jobber_visit_id);

  const [usageResult, equipmentUsageResult, costResult] = await Promise.all([
    visitIds.length > 0
      ? supabaseServer
          .from("visit_material_usage")
          .select("jobber_visit_id, material_id, quantity_used")
          .in("jobber_visit_id", visitIds)
      : Promise.resolve({ data: [] as UsageRow[] }),
    visitIds.length > 0
      ? supabaseServer
          .from("visit_equipment_usage")
          .select("jobber_visit_id, equipment_id")
          .in("jobber_visit_id", visitIds)
      : Promise.resolve({ data: [] as EquipmentUsageRow[] }),
    visitIds.length > 0
      ? supabaseServer
          .from("visit_material_cost")
          .select("jobber_visit_id, material_cost")
          .in("jobber_visit_id", visitIds)
      : Promise.resolve({ data: [] as VisitCost[] }),
  ]);

  const usageMap = new Map<string, number>();
  for (const row of (usageResult.data ?? []) as UsageRow[]) {
    usageMap.set(
      `${row.jobber_visit_id}:${row.material_id}`,
      toNumber(row.quantity_used)
    );
  }

  const equipmentUsageSet = new Set<string>();
  for (const row of (equipmentUsageResult.data ??
    []) as EquipmentUsageRow[]) {
    equipmentUsageSet.add(`${row.jobber_visit_id}:${row.equipment_id}`);
  }

  const costMap = new Map<string, number>();
  for (const row of (costResult.data ?? []) as VisitCost[]) {
    costMap.set(row.jobber_visit_id, toNumber(row.material_cost));
  }

  const previousPageUrl = buildJobCostsUrl(
    Math.max(1, currentPage - 1),
    search,
    showAll
  );
  const nextPageUrl = buildJobCostsUrl(
    Math.min(totalPages, currentPage + 1),
    search,
    showAll
  );
  const toggleShowUrl = buildJobCostsUrl(1, search, !showAll);

  const pageVisitIds = visitIds.join(",");
  const pageEquipmentIds = equipmentList.map((e) => e.id).join(",");

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Log Job Costs
            </h1>

            <p className="mt-2 text-sm text-[#6b705c]">
              {showAll
                ? "Showing every past visit, logged or not. Save several at once — leave fields blank or unchecked to skip."
                : "Working through past visits that still need costs logged — save one and it drops off the list."}{" "}
              Upcoming visits live on{" "}
              <Link href="/schedule" className="font-semibold underline">
                the schedule
              </Link>
              .
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/schedule"
              className="rounded-xl border border-[#174734] px-4 py-2 text-center text-sm font-bold transition hover:bg-white"
            >
              Schedule
            </Link>

            <Link
              href="/materials"
              className="rounded-xl border border-[#174734] px-4 py-2 text-center text-sm font-bold transition hover:bg-white"
            >
              Materials
            </Link>

            <Link
              href="/equipment"
              className="rounded-xl border border-[#174734] px-4 py-2 text-center text-sm font-bold transition hover:bg-white"
            >
              Equipment
            </Link>

            <Link
              href="/job-costing-analytics"
              className="rounded-xl border border-[#174734] px-4 py-2 text-center text-sm font-bold transition hover:bg-white"
            >
              Analytics
            </Link>

            <Link
              href={toggleShowUrl}
              className={`rounded-xl px-4 py-2 text-center text-sm font-bold transition ${
                showAll
                  ? "bg-[#174734] text-white"
                  : "border border-[#d4af37] bg-[#faf4e3] text-[#9c7a20] hover:bg-[#f5ecd3]"
              }`}
            >
              {showAll ? "Show Unlogged Only" : "Show All Visits"}
            </Link>
          </div>
        </header>

        {materials.length === 0 ? (
          <section className="mt-6 rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-[#6b705c]">
              No materials defined yet.{" "}
              <Link
                href="/materials"
                className="font-semibold text-[#9c7a20] hover:underline"
              >
                Add a material
              </Link>{" "}
              before logging usage.
            </p>
          </section>
        ) : (
          <>
            <section className="mt-5 rounded-2xl bg-white p-4 shadow">
              <form action="/job-costs" method="GET" className="flex gap-2">
                <input
                  name="q"
                  type="search"
                  defaultValue={search}
                  placeholder="Search customer or visit title..."
                  className="min-w-0 flex-1 rounded-xl border border-[#d9d4c6] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />

                <button
                  type="submit"
                  className="rounded-xl bg-[#174734] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#226246]"
                >
                  Search
                </button>

                {search && (
                  <Link
                    href="/job-costs"
                    className="rounded-xl border border-[#d9d4c6] px-4 py-2.5 text-sm font-bold transition hover:bg-[#f7f6f1]"
                  >
                    Clear
                  </Link>
                )}
              </form>
            </section>

            {error ? (
              <section className="mt-5 rounded-2xl border border-red-200 bg-white p-5 shadow">
                <p className="font-bold text-red-700">
                  Visits could not be loaded
                </p>
                <p className="mt-1 text-sm text-red-600">{error.message}</p>
              </section>
            ) : visits.length === 0 ? (
              <section className="mt-5 rounded-2xl bg-white p-5 shadow">
                <p className="text-sm text-[#6b705c]">
                  {search
                    ? "No visits found for that search."
                    : showAll
                      ? "No visits found."
                      : "All caught up — no unlogged visits right now."}
                </p>
                {!showAll && !search && (
                  <Link
                    href={toggleShowUrl}
                    className="mt-2 inline-block text-sm font-semibold text-[#9c7a20] hover:underline"
                  >
                    Show all visits anyway →
                  </Link>
                )}
              </section>
            ) : (
              <form action={saveVisitCosts}>
                <input
                  type="hidden"
                  name="page_visit_ids"
                  value={pageVisitIds}
                />
                <input
                  type="hidden"
                  name="page_equipment_ids"
                  value={pageEquipmentIds}
                />

                <button
                  type="submit"
                  className="sticky top-3 z-10 mt-5 w-full rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-[#226246]"
                >
                  Save Usage
                </button>

                <div className="mt-4 space-y-4">
                  {visits.map((visit) => {
                    const isRecurring = visit.service_category
                      ? RECURRING_CATEGORIES.has(visit.service_category)
                      : false;
                    const badge = statusBadge(visit.visit_status);

                    return (
                      <article
                        key={visit.jobber_visit_id}
                        className="rounded-2xl bg-white p-4 shadow"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold">
                              {visit.customer_name || "—"}
                            </p>
                            <p className="mt-0.5 text-xs text-[#6b705c]">
                              {formatDateTime(visit.start_at)}
                              {visit.title ? ` · ${visit.title}` : ""}
                            </p>
                          </div>

                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span
                              className={`rounded-full px-2 py-1 text-[10px] font-bold ${badge.classes}`}
                            >
                              {badge.label}
                            </span>

                            {visit.service_category && (
                              <span
                                className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                  isRecurring
                                    ? "bg-[#eef4ee] text-[#174734]"
                                    : "bg-[#faf4e3] text-[#9c7a20]"
                                }`}
                              >
                                {visit.service_category}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                          {materials.map((material) => {
                            const isTime =
                              material.unit_label.toLowerCase() === "hour";
                            const rawValue =
                              usageMap.get(
                                `${visit.jobber_visit_id}:${material.id}`
                              ) || 0;

                            return (
                              <label key={material.id} className="block">
                                <span className="text-xs font-bold text-[#9c7a20]">
                                  {material.name}
                                </span>
                                <span className="ml-1 text-[10px] font-normal text-[#6b705c]">
                                  {isTime
                                    ? "(h:mm)"
                                    : `(${material.unit_label}s)`}
                                </span>
                                <input
                                  type={isTime ? "text" : "number"}
                                  inputMode={isTime ? "text" : "decimal"}
                                  step={isTime ? undefined : "0.01"}
                                  min={isTime ? undefined : "0"}
                                  pattern={
                                    isTime
                                      ? "[0-9]{1,2}:[0-5][0-9]"
                                      : undefined
                                  }
                                  name={`usage[${visit.jobber_visit_id}][${material.id}]`}
                                  defaultValue={
                                    isTime
                                      ? decimalHoursToHMM(rawValue)
                                      : rawValue || ""
                                  }
                                  placeholder={isTime ? "1:30" : "0"}
                                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2.5 text-base outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                                />
                              </label>
                            );
                          })}
                        </div>

                        {equipmentList.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-3 border-t border-[#f0eee6] pt-3">
                            {equipmentList.map((item) => {
                              const checked = equipmentUsageSet.has(
                                `${visit.jobber_visit_id}:${item.id}`
                              );

                              return (
                                <label
                                  key={item.id}
                                  className="flex items-center gap-2 rounded-lg bg-[#f7f6f1] px-3 py-2"
                                >
                                  <input
                                    type="checkbox"
                                    name={`equipment[${visit.jobber_visit_id}][${item.id}]`}
                                    value="1"
                                    defaultChecked={checked}
                                    className="h-5 w-5 rounded border-[#d9d4c6] text-[#174734] focus:ring-[#d4af37]"
                                  />
                                  <span className="text-sm font-semibold">
                                    {item.name}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}

                        <div className="mt-3 flex items-center justify-between border-t border-[#f0eee6] pt-3 text-sm">
                          <span className="text-[#6b705c]">Direct cost</span>
                          <span className="font-bold">
                            {formatCurrency(
                              costMap.get(visit.jobber_visit_id) ?? 0
                            )}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <button
                  type="submit"
                  className="mt-5 w-full rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246]"
                >
                  Save Usage
                </button>
              </form>
            )}

            {totalVisits > 0 && (
              <nav className="mt-6 flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow">
                {currentPage > 1 ? (
                  <Link
                    href={previousPageUrl}
                    className="rounded-xl border border-[#d9d4c6] px-4 py-2 text-sm font-bold transition hover:bg-[#f7f6f1]"
                  >
                    ← Prev
                  </Link>
                ) : (
                  <span className="cursor-not-allowed rounded-xl border border-[#e6e2d8] px-4 py-2 text-sm font-bold text-[#aaa99f]">
                    ← Prev
                  </span>
                )}

                <p className="text-sm font-semibold">
                  Page {Math.min(currentPage, totalPages)} of {totalPages}
                </p>

                {currentPage < totalPages ? (
                  <Link
                    href={nextPageUrl}
                    className="rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
                  >
                    Next →
                  </Link>
                ) : (
                  <span className="cursor-not-allowed rounded-xl bg-[#d5d5cf] px-4 py-2 text-sm font-bold text-white">
                    Next →
                  </span>
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </main>
  );
}
