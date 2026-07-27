export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import NewJobForm, { type PickerCustomer } from "./NewJobForm";

type CustomerRow = {
  jobber_client_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
};

function customerDisplayName(row: CustomerRow): string {
  return (
    row.full_name ||
    [row.first_name, row.last_name].filter(Boolean).join(" ") ||
    row.company_name ||
    "Unnamed Customer"
  );
}

export default async function NewJobPage() {
  const { data, error } = await supabaseServer
    .from("customers")
    .select("jobber_client_id, full_name, first_name, last_name, company_name")
    .order("full_name", { ascending: true })
    .limit(2000);

  const customers: PickerCustomer[] = ((data ?? []) as CustomerRow[]).map(
    (row) => ({
      id: row.jobber_client_id,
      name: customerDisplayName(row),
    })
  );

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Create Job
            </h1>
            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Pick an existing customer and give the job a title — it&apos;s
              created directly in Jobber against their first property.
              Pricing, scheduling, and scope of work still get filled in
              over in Jobber afterward.
            </p>
          </div>

          <Link
            href="/customers"
            className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
          >
            Back to Customers
          </Link>
        </header>

        {error && (
          <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800 shadow-sm">
            <p className="font-bold">Couldn&apos;t load customers</p>
            <p className="mt-1 text-sm">{error.message}</p>
          </section>
        )}

        <section className="mt-6 rounded-2xl bg-white p-5 shadow sm:p-8">
          <NewJobForm customers={customers} />
        </section>
      </div>
    </main>
  );
}
