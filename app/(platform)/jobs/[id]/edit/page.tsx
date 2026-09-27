export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { fetchJobDetails } from "@/lib/jobberJob";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchVisitOneTimeChargesForVisits } from "@/lib/visitCharges";
import ManageJobForm, { type VisitWithCharges } from "./ManageJobForm";

type JobEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
};

// One-time visit charges (Ryan, 2026-09-27) -- window wide enough to
// cover a charge added shortly after a visit happens (before it's been
// invoiced) as well as one planned ahead for an upcoming visit. See
// lib/visitCharges.ts's header comment for what this is for.
const VISIT_WINDOW_PAST_DAYS = 30;
const VISIT_WINDOW_FUTURE_DAYS = 180;
const MAX_VISITS_SHOWN = 30;

async function fetchVisitsForCharges(jobId: string): Promise<VisitWithCharges[]> {
  const now = Date.now();
  const rangeStart = new Date(now - VISIT_WINDOW_PAST_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rangeEnd = new Date(now + VISIT_WINDOW_FUTURE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseServer
    .from("jobber_visits")
    .select("jobber_visit_id, start_at")
    .eq("jobber_job_id", jobId)
    .gte("start_at", rangeStart)
    .lte("start_at", rangeEnd)
    .order("start_at", { ascending: true })
    .limit(MAX_VISITS_SHOWN);

  if (error || !data) return [];

  const visitIds = data.map((row) => row.jobber_visit_id as string);
  const chargesByVisit = await fetchVisitOneTimeChargesForVisits(visitIds);

  return data.map((row) => ({
    id: row.jobber_visit_id as string,
    startAt: row.start_at as string | null,
    charges: (chargesByVisit.get(row.jobber_visit_id as string) ?? []).map((charge) => ({
      id: charge.id,
      name: charge.name,
      unitPrice: charge.unitPrice,
    })),
  }));
}

export default async function JobEditPage({
  params,
  searchParams,
}: JobEditPageProps) {
  const { id } = await params;
  const jobId = decodeURIComponent(id);
  const search = await searchParams;

  const [job, visits] = await Promise.all([
    fetchJobDetails(jobId),
    fetchVisitsForCharges(jobId),
  ]);

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
          Valley Turf Revival OS
        </p>

        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Manage Job</h1>

        {job?.jobNumber && (
          <p className="mt-1 text-sm text-[#6b705c]">
            Job #{job.jobNumber}
            {job.jobStatus ? ` · ${job.jobStatus}` : ""}
          </p>
        )}

        {search.saved && (
          <p className="mt-4 rounded-xl bg-[#eef4ee] px-4 py-3 text-sm font-semibold text-[#174734]">
            Saved.
          </p>
        )}

        {search.error && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {search.error}
          </p>
        )}

        {!job ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">Couldn&apos;t load this job</p>
            <p className="mt-1 text-sm text-[#6b705c]">
              It may have been deleted in Jobber, or this app&apos;s Jobber
              connection needs attention.
            </p>
          </section>
        ) : (
          <ManageJobForm job={job} visits={visits} />
        )}

        <Link
          href="/recurring-services"
          className="mt-6 block text-center text-sm font-semibold text-[#9c7a20] hover:underline"
        >
          ← Back to Recurring Services
        </Link>
      </div>
    </main>
  );
}
