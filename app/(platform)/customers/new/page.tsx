export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import NewCustomerForm from "./NewCustomerForm";

export default function NewCustomerPage() {
  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Add Customer
            </h1>
            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Creates a real client in Jobber and shows them here right
              away — no need to wait for the next sync.
            </p>
          </div>

          <Link
            href="/customers"
            className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
          >
            Back to Customers
          </Link>
        </header>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow sm:p-8">
          <NewCustomerForm />
        </section>
      </div>
    </main>
  );
}
