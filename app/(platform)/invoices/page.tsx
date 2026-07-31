export const dynamic = "force-dynamic";
export const revalidate = 0;

// Native invoicing (roadmap #3): completed visits that don't have a
// Jobber invoice yet, one card each, so staff can bill a job without
// leaving this app. See lib/jobberInvoice.ts for the invoiceCreate
// mutation itself and its schema-discovery history.
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchJobDetails } from "@/lib/jobberJob";
import InvoiceCard, { type ReadyToInvoiceVisit } from "./InvoiceCard";

type InvoicesPageProps = {
  searchParams: Promise<{ page?: string }>;
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

function buildInvoicesUrl(page: number): string {
  return page > 1 ? `/invoices?page=${page}` : "/invoices";
}

export default async function InvoicesPage({
  searchParams,
}: InvoicesPageProps) {
  const params = await searchParams;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const {
    data: visitsData,
    count,
    error,
  } = await supabaseServer
    .from("jobber_visits")
    .select(
      "jobber_visit_id, jobber_job_id, jobber_client_id, customer_name, job_number, title, start_at, completed_at",
      { count: "exact" }
    )
    .eq("visit_status", "COMPLETED")
    .is("jobber_invoice_id", null)
    .order("completed_at", { ascending: false })
    .range(from, to);

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

  // Suggested price per visit, pulled from the job's own line item price
  // in Jobber (this app only ever creates single flat-price line items,
  // see lib/jobberJob.ts's createJobberJob) — a real head start instead
  // of a blank field, without guessing at a number ourselves. Fetched
  // once per distinct job (a recurring job's visits all share one), not
  // once per visit.
  const jobIds = Array.from(
    new Set(visits.map((v) => v.jobber_job_id).filter((id): id is string => Boolean(id)))
  );

  const jobDetailsEntries = await Promise.all(
    jobIds.map(async (jobId) => [jobId, await fetchJobDetails(jobId)] as const)
  );

  const jobPriceMap = new Map<string, number | null>();
  for (const [jobId, details] of jobDetailsEntries) {
    const price = details?.lineItems?.[0]?.unitPrice ?? null;
    jobPriceMap.set(jobId, price != null && price > 0 ? price : null);
  }

  const previousPageUrl = buildInvoicesUrl(Math.max(1, currentPage - 1));
  const nextPageUrl = buildInvoicesUrl(Math.min(totalPages, currentPage + 1));

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
          </div>
        </header>

        {error ? (
          <section className="mt-5 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">Visits could not be loaded</p>
            <p className="mt-1 text-sm text-red-600">{error.message}</p>
          </section>
        ) : visits.length === 0 ? (
          <section className="mt-5 rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-[#6b705c]">
              All caught up — every completed visit has an invoice.
            </p>
          </section>
        ) : (
          <div className="mt-5 space-y-3">
            {visits.map((visit) => (
              <InvoiceCard
                key={visit.jobber_visit_id}
                visit={visit}
                directCost={costMap.get(visit.jobber_visit_id) ?? 0}
                suggestedPrice={
                  visit.jobber_job_id
                    ? jobPriceMap.get(visit.jobber_job_id) ?? null
                    : null
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
