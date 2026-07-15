export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { saveInvoiceMaterialUsage } from "../materials/actions";

type JobCostsPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
  }>;
};

type Material = {
  id: string;
  name: string;
  unit_label: string;
  unit_cost: number | string;
};

type InvoiceRow = {
  jobber_invoice_id: string;
  invoice_number: string | null;
  subject: string | null;
  customer_name: string | null;
  issue_date: string | null;
  total: number | string;
  service_category: string | null;
};

type UsageRow = {
  jobber_invoice_id: string;
  material_id: string;
  quantity_used: number | string;
};

type InvoiceCost = {
  jobber_invoice_id: string;
  material_cost: number | string;
};

const PAGE_SIZE = 25;

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

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
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

function buildJobCostsUrl(page: number, search: string): string {
  const params = new URLSearchParams();

  if (search) {
    params.set("q", search);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();

  return query ? `/job-costs?${query}` : "/job-costs";
}

export default async function JobCostsPage({
  searchParams,
}: JobCostsPageProps) {
  const params = await searchParams;
  const search = String(params.q ?? "").trim();

  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const materialsResult = await supabaseServer
    .from("materials")
    .select("id, name, unit_label, unit_cost")
    .order("name", { ascending: true });

  const materials = (materialsResult.data ?? []) as Material[];

  let invoicesQuery = supabaseServer
    .from("invoice_costing_list")
    .select(
      "jobber_invoice_id, invoice_number, subject, customer_name, issue_date, total, service_category",
      { count: "exact" }
    )
    .order("issue_date", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (search) {
    const safeSearch = escapeSearchValue(search);

    invoicesQuery = invoicesQuery.or(
      [
        `customer_name.ilike.%${safeSearch}%`,
        `subject.ilike.%${safeSearch}%`,
      ].join(",")
    );
  }

  const { data: invoicesData, count, error } = await invoicesQuery;

  const invoices = (invoicesData ?? []) as InvoiceRow[];
  const totalInvoices = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalInvoices / PAGE_SIZE));

  const invoiceIds = invoices.map((invoice) => invoice.jobber_invoice_id);

  const [usageResult, costResult] = await Promise.all([
    invoiceIds.length > 0
      ? supabaseServer
          .from("invoice_material_usage")
          .select("jobber_invoice_id, material_id, quantity_used")
          .in("jobber_invoice_id", invoiceIds)
      : Promise.resolve({ data: [] as UsageRow[] }),
    invoiceIds.length > 0
      ? supabaseServer
          .from("invoice_material_cost")
          .select("jobber_invoice_id, material_cost")
          .in("jobber_invoice_id", invoiceIds)
      : Promise.resolve({ data: [] as InvoiceCost[] }),
  ]);

  const usageMap = new Map<string, number>();
  for (const row of (usageResult.data ?? []) as UsageRow[]) {
    usageMap.set(
      `${row.jobber_invoice_id}:${row.material_id}`,
      toNumber(row.quantity_used)
    );
  }

  const costMap = new Map<string, number>();
  for (const row of (costResult.data ?? []) as InvoiceCost[]) {
    costMap.set(row.jobber_invoice_id, toNumber(row.material_cost));
  }

  const previousPageUrl = buildJobCostsUrl(Math.max(1, currentPage - 1), search);
  const nextPageUrl = buildJobCostsUrl(
    Math.min(totalPages, currentPage + 1),
    search
  );

  const RECURRING_CATEGORIES = new Set([
    "Monthly Maintenance",
    "Quarterly Cleaning",
    "Bimonthly Cleaning",
    "Semi-Annual Cleaning",
    "Weekly Maintenance",
    "Spray Only",
  ]);

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              Log Material Usage
            </h1>

            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Enter how much of each material was used on each invoiced
              visit — recurring and one-off. Save several at once; leave a
              field blank to skip it.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/materials"
              className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
            >
              Manage Materials
            </Link>

            <Link
              href="/revenue"
              className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Back to Financial Dashboard
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
            <section className="mt-6 rounded-2xl bg-white p-5 shadow">
              <form action="/job-costs" method="GET" className="flex gap-3">
                <input
                  name="q"
                  type="search"
                  defaultValue={search}
                  placeholder="Search by customer or invoice subject..."
                  className="min-w-0 flex-1 rounded-xl border border-[#d9d4c6] bg-white px-4 py-3 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />

                <button
                  type="submit"
                  className="rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246]"
                >
                  Search
                </button>

                {search && (
                  <Link
                    href="/job-costs"
                    className="rounded-xl border border-[#d9d4c6] px-5 py-3 text-sm font-bold transition hover:bg-[#f7f6f1]"
                  >
                    Clear
                  </Link>
                )}
              </form>
            </section>

            {error ? (
              <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
                <p className="font-bold text-red-700">
                  Invoices could not be loaded
                </p>
                <p className="mt-1 text-sm text-red-600">{error.message}</p>
              </section>
            ) : invoices.length === 0 ? (
              <section className="mt-6 rounded-2xl bg-white p-5 shadow">
                <p className="text-sm text-[#6b705c]">
                  No invoices found{search ? " for that search" : ""}.
                </p>
              </section>
            ) : (
              <form action={saveInvoiceMaterialUsage}>
                <section className="mt-6 overflow-x-auto rounded-2xl bg-white p-5 shadow">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[#e7e2d5] text-left text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                        <th className="py-2 pr-3">Invoice</th>
                        <th className="py-2 pr-3">Customer</th>
                        <th className="py-2 pr-3">Service</th>
                        {materials.map((material) => (
                          <th key={material.id} className="py-2 pr-3">
                            {material.name}
                            <span className="block font-normal normal-case text-[#6b705c]">
                              {material.unit_label}s
                            </span>
                          </th>
                        ))}
                        <th className="py-2 pr-3">Direct Cost</th>
                      </tr>
                    </thead>

                    <tbody>
                      {invoices.map((invoice) => {
                        const isRecurring = invoice.service_category
                          ? RECURRING_CATEGORIES.has(invoice.service_category)
                          : false;

                        return (
                          <tr
                            key={invoice.jobber_invoice_id}
                            className="border-b border-[#f0eee6]"
                          >
                            <td className="py-2 pr-3">
                              <p className="font-semibold">
                                #{invoice.invoice_number ?? "—"}
                              </p>
                              <p className="text-xs text-[#6b705c]">
                                {formatDate(invoice.issue_date)}
                              </p>
                            </td>

                            <td className="py-2 pr-3 text-[#6b705c]">
                              {invoice.customer_name || "—"}
                            </td>

                            <td className="py-2 pr-3">
                              <span
                                className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  isRecurring
                                    ? "bg-[#eef4ee] text-[#174734]"
                                    : "bg-[#faf4e3] text-[#9c7a20]"
                                }`}
                              >
                                {invoice.service_category || "Uncategorized"}
                              </span>
                            </td>

                            {materials.map((material) => (
                              <td key={material.id} className="py-2 pr-3">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  name={`usage[${invoice.jobber_invoice_id}][${material.id}]`}
                                  defaultValue={
                                    usageMap.get(
                                      `${invoice.jobber_invoice_id}:${material.id}`
                                    ) || ""
                                  }
                                  placeholder="0"
                                  className="w-20 rounded-lg border border-[#d9d4c6] px-2 py-1 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                                />
                              </td>
                            ))}

                            <td className="py-2 pr-3 font-semibold">
                              {formatCurrency(
                                costMap.get(invoice.jobber_invoice_id) ?? 0
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <button
                    type="submit"
                    className="mt-5 rounded-lg bg-[#174734] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#226246]"
                  >
                    Save Usage
                  </button>
                </section>
              </form>
            )}

            {totalInvoices > 0 && (
              <nav className="mt-6 flex flex-col items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow sm:flex-row">
                {currentPage > 1 ? (
                  <Link
                    href={previousPageUrl}
                    className="rounded-xl border border-[#d9d4c6] px-4 py-2 text-sm font-bold transition hover:bg-[#f7f6f1]"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span className="cursor-not-allowed rounded-xl border border-[#e6e2d8] px-4 py-2 text-sm font-bold text-[#aaa99f]">
                    ← Previous
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
