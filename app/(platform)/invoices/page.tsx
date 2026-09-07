export const dynamic = "force-dynamic";
export const revalidate = 0;

// Native invoicing (roadmap #3): completed visits that don't have a
// Jobber invoice yet, one card each, so staff can bill a job without
// leaving this app. See lib/jobberInvoice.ts for the invoiceCreate
// mutation itself and its schema-discovery history.
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchJobDetails } from "@/lib/jobberJob";
import { escapeSearchValue } from "@/lib/searchUtils";
import CustomerTypeahead from "@/app/components/CustomerTypeahead";
import InvoiceCard, { type ReadyToInvoiceVisit } from "./InvoiceCard";

type InvoicesPageProps = {
  searchParams: Promise<{ page?: string; q?: string }>;
};

type VisitRow = ReadyToInvoiceVisit & {
  jobber_job_id: string | null;
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

function buildInvoicesUrl(page: number, search: string): string {
  const params = new URLSearchParams();

  if (search) {
    params.set("q", search);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();

  return query ? `/invoices?${query}` : "/invoices";
}

export default async function InvoicesPage({
  searchParams,
}: InvoicesPageProps) {
  const params = await searchParams;
  const search = String(params.q ?? "").trim();
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let visitsQuery = supabaseServer
    .from("jobber_visits")
    .select(
      "jobber_visit_id, jobber_job_id, jobber_client_id, customer_name, job_number, title, start_at, completed_at",
      { count: "exact" }
    )
    .eq("visit_status", "COMPLETED")
    .is("jobber_invoice_id", null)
    .order("completed_at", { ascending: false })
    .range(from, to);

  if (search) {
    const safeSearch = escapeSearchValue(search);

    visitsQuery = visitsQuery.or(
      [
        `customer_name.ilike.%${safeSearch}%`,
        `title.ilike.%${safeSearch}%`,
        `job_number.ilike.%${safeSearch}%`,
      ].join(",")
    );
  }

  const { data: visitsData, count, error } = await visitsQuery;

  const visits = (visitsData ?? []) as VisitRow[];
  const totalVisits = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalVisits / PAGE_SIZE));

  const visitIds = visits.map((v) => v.jobber_visit_id);

  const [{ data: costData }] = await Promise.all([
    visitIds.length > 0
      ? supabaseServer
          .from("visit_material_cost")
          .select("jobber_visit_id, material_cost")
          .in("jobber_visit_id", visitIds)
      : Promise.resolve({ data: [] as VisitCost[] }),
  ]);

  const costMap = new Map<string, number>();
  for (const row of (costData ?? []) as VisitCost[]) {
    costMap.set(row.jobber_visit_id, toNumber(row.material_cost));
  }

  // Suggested line items per visit, pulled straight from the job's own
  // line items in Jobber -- this app's own job-creation flow
  // (lib/jobberJob.ts's createJobberJob) only ever writes one flat-price
  // line, but a job entered/edited directly in Jobber can carry several
  // (e.g. "Turf Cleaning" + "Infill Refresh"), and those used to get
  // silently collapsed into a single suggested price. Passing the whole
  // array through lets staff invoice by type of cleaning instead of one
  // lump sum. Fetched once per distinct job (a recurring job's visits
  // all share one), not once per visit.
  const jobIds = Array.from(
    new Set(visits.map((v) => v.jobber_job_id).filter((id): id is string => Boolean(id)))
  );

  const jobDetailsEntries = await Promise.all(
    jobIds.map(async (jobId) => [jobId, await fetchJobDetails(jobId)] as const)
  );

  const jobLineItemsMap = new Map<
    string,
    { description: string; quantity: number; unitPrice: number; details: string | null }[]
  >();
  for (const [jobId, details] of jobDetailsEntries) {
    const items = (details?.lineItems ?? [])
      .filter((li) => li.unitPrice != null && li.unitPrice > 0)
      .map((li) => ({
        description: li.name?.trim() || "Service",
        quantity: 1,
        unitPrice: li.unitPrice as number,
        details: li.details,
      }));
    jobLineItemsMap.set(jobId, items);
  }

  const previousPageUrl = buildInvoicesUrl(Math.max(1, currentPage - 1), search);
  const nextPageUrl = buildInvoicesUrl(
    Math.min(totalPages, currentPage + 1),
    search
  );

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Create Invoices
            </h1>

            <p className="mt-2 text-sm text-[#6b705c]">
              Completed visits that don&apos;t have a Jobber invoice yet.
              Creating one here sends it straight to Jobber — no need to
              switch apps.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/job-costs"
              className="rounded-xl border border-[#174734] px-4 py-2 text-center text-sm font-bold transition hover:bg-white"
            >
              Log Job Costs
            </Link>

            <Link
              href="/job-costing-analytics"
              className="rounded-xl border border-[#174734] px-4 py-2 text-center text-sm font-bold transition hover:bg-white"
            >
              Analytics
            </Link>

            <Link
              href="/invoices/history"
              className="rounded-xl border border-[#174734] px-4 py-2 text-center text-sm font-bold transition hover:bg-white"
            >
              Invoiced History
            </Link>

            <Link
              href="/invoices/routing"
              className="rounded-xl border border-[#174734] px-4 py-2 text-center text-sm font-bold transition hover:bg-white"
            >
              Stage 7: Invoicing Routing
            </Link>
          </div>
        </header>

        <section className="mt-5 rounded-2xl bg-white p-4 shadow">
          <form action="/invoices" method="GET" className="flex gap-2">
            <CustomerTypeahead
              name="q"
              defaultValue={search}
              placeholder="Search customer or visit title..."
              navigateOnSelect={false}
              className="min-w-0 flex-1"
              inputClassName="w-full rounded-xl border border-[#d9d4c6] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />

            <button
              type="submit"
              className="rounded-xl bg-[#174734] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Search
            </button>

            {search && (
              <Link
                href="/invoices"
                className="rounded-xl border border-[#d9d4c6] px-4 py-2.5 text-sm font-bold transition hover:bg-[#f7f6f1]"
              >
                Clear
              </Link>
            )}
          </form>
        </section>

        {error ? (
          <section className="mt-5 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">Visits could not be loaded</p>
            <p className="mt-1 text-sm text-red-600">{error.message}</p>
          </section>
        ) : visits.length === 0 ? (
          <section className="mt-5 rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-[#6b705c]">
              {search
                ? "No visits found for that search."
                : "All caught up — every completed visit has an invoice."}
            </p>
          </section>
        ) : (
          <div className="mt-5 space-y-3">
            {visits.map((visit) => (
              <InvoiceCard
                key={visit.jobber_visit_id}
                visit={visit}
                directCost={costMap.get(visit.jobber_visit_id) ?? 0}
                suggestedLineItems={
                  visit.jobber_job_id
                    ? jobLineItemsMap.get(visit.jobber_job_id) ?? []
                    : []
                }
              />
            ))}
          </div>
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
      </div>
    </main>
  );
}
