export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { addEmployee, updateEmployee, deleteEmployee } from "../materials/actions";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import {
  toNumber,
  formatCurrencyPrecise as formatCurrency,
} from "@/lib/format";

type EmployeeRow = {
  id: string;
  name: string;
  unit_cost: number | string;
};

function displayName(rawName: string): string {
  return rawName.replace(/^Labor\s*[—-]\s*/i, "").trim();
}

export default async function EmployeesPage() {
  const { data, error } = await supabaseServer
    .from("materials")
    .select("id, name, unit_cost")
    .eq("unit_label", "hour")
    .order("name", { ascending: true });

  const employees = (data ?? []) as EmployeeRow[];

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-4xl font-bold">Labor Rates</h1>

            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Hourly rates used purely for job-cost math on{" "}
              <Link href="/job-costs" className="font-semibold underline">
                job entries
              </Link>
              . Add anyone new here and they'll show up as a time field on
              every job.
            </p>

            <p className="mt-2 max-w-2xl text-sm text-[#9c7a20]">
              Looking for logins, roles, or pay profiles instead? That's{" "}
              <Link href="/team" className="font-semibold underline">
                Team
              </Link>
              .
            </p>
          </div>

          <Link
            href="/job-costs"
            className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Log Job Costs
          </Link>
        </header>

        {error && (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">
              Labor rates could not be loaded
            </p>
            <p className="mt-1 text-sm text-red-600">{error.message}</p>
          </section>
        )}

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Add a Labor Rate</h2>

          <form action={addEmployee} className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="employee_name"
                  className="text-xs font-bold text-[#9c7a20]"
                >
                  Employee Name
                </label>
                <input
                  id="employee_name"
                  name="employee_name"
                  type="text"
                  required
                  placeholder="e.g. Jordan"
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="hourly_rate"
                  className="text-xs font-bold text-[#9c7a20]"
                >
                  Hourly Rate ($)
                </label>
                <input
                  id="hourly_rate"
                  name="hourly_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />
              </div>
            </div>

            <button
              type="submit"
              className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Add Employee
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Current Labor Rates</h2>

          <div className="mt-4 space-y-3">
            {employees.length === 0 ? (
              <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                No labor rates added yet.
              </p>
            ) : (
              employees.map((employee) => (
                <EmployeeRowItem key={employee.id} employee={employee} />
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function EmployeeRowItem({ employee }: { employee: EmployeeRow }) {
  const name = displayName(employee.name);

  return (
    <details className="rounded-xl border border-[#e7e2d5] px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <p className="text-sm font-bold">{name}</p>

        <p className="text-sm font-bold">
          {formatCurrency(employee.unit_cost)}
          <span className="ml-1 text-xs font-normal text-[#6b705c]">
            /hr
          </span>
        </p>
      </summary>

      <div className="mt-4 border-t border-[#e7e2d5] pt-4">
        <form
          action={updateEmployee.bind(null, employee.id)}
          className="space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Employee Name
              </label>
              <input
                name="employee_name"
                type="text"
                defaultValue={name}
                required
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Hourly Rate ($)
              </label>
              <input
                name="hourly_rate"
                type="number"
                step="0.01"
                min="0"
                defaultValue={toNumber(employee.unit_cost)}
                required
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>
          </div>

          <button
            type="submit"
            className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Save Changes
          </button>
        </form>

        <form action={deleteEmployee.bind(null, employee.id)} className="mt-3">
          <ConfirmSubmitButton
            confirmMessage={`Remove ${name}'s labor rate? This can't be undone.`}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
          >
            Remove Employee
          </ConfirmSubmitButton>
        </form>
      </div>
    </details>
  );
}
