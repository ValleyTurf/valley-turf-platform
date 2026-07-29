export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { fetchJobDetails } from "@/lib/jobberJob";
import ManageJobForm from "./ManageJobForm";

type JobEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function JobEditPage({
  params,
  searchParams,
}: JobEditPageProps) {
  const { id } = await params;
  const jobId = decodeURIComponent(id);
  const search = await searchParams;

  const job = await fetchJobDetails(jobId);

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
          <ManageJobForm job={job} />
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
