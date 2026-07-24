export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import {
  addOverheadCost,
  updateOverheadCost,
  deleteOverheadCost,
} from "./actions";
import {
  toNumber,
  formatCurrencyPrecise as formatCurrency,
} from "@/lib/format";

type OverheadCost = {
  id: string;
  name: string;
  category: string | null;
  cost_type: string;
  amount: number | string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
};

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

const CATEGORY_OPTIONS = [
  "Software",
  "Facilities",
  "Marketing",
  "Insurance",
  "Professional Services",
  "Utilities",
  "Equipment",
  "Other",
];

export default async function CostsPage() {
  const { data, error } = await supabaseServer
    .from("overhead_costs")
    .select(
      "id, name, category, cost_type, amount, start_date, end_date, notes"
    )
    .order("cost_type", { ascending: true })
    .order("name", { ascending: true });

  const costs = (data ?? []) as OverheadCost[];

  const recurringCosts = costs.filter((c) => c.cost_type === "recurring");
  const amortizedCosts = costs.filter((c) => c.cost_type === "amortized");

  const recurringMonthlyTotal = recurringCosts.reduce(
    (sum, c) => sum + toNumber(c.amount),
    0
  );

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-4xl font-bold">Overhead Costs</h1>

            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Recurring and amortized business costs, used to calculate
              overhead per job on the Financial Dashboard.
            </p>
          </div>

          <Link
            href="/revenue"
            className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Back to Financial Dashboard
          </Link>
        </header>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <p className="text-sm text-[#6b705c]">
            Current recurring total
          </p>
          <p className="mt-1 text-3xl font-bold">
            {formatCurrency(recurringMonthlyTotal)}
            <span className="ml-1 text-base font-normal text-[#6b705c]">
              / month
            </span>
          </p>
        </section>

        {error && (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">
              Costs could not be loaded
            </p>
            <p className="mt-1 text-sm text-red-600">{error.message}</p>
          </section>
        )}

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Add a Cost</h2>

          <form action={addOverheadCost} className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="name"
                  className="text-xs font-bold text-[#9c7a20]"
                >
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Jobber Subscription"
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="category"
                  className="text-xs font-bold text-[#9c7a20]"
                >
                  Category
                </label>
                <select
                  id="category"
                  name="category"
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] bg-white px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="cost_type"
                  className="text-xs font-bold text-[#9c7a20]"
                >
                  Type
                </label>
                <select
                  id="cost_type"
                  name="cost_type"
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] bg-white px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                >
                  <option value="recurring">Recurring monthly</option>
                  <option value="amortized">
                    Amortized over a date range
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="amount"
                  className="text-xs font-bold text-[#9c7a20]"
                >
                  Amount ($)
                </label>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="Monthly for recurring, total for amortized"
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />
              </div>

              <div />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="start_date"
                  className="text-xs font-bold text-[#9c7a20]"
                >
                  Start Date
                </label>
                <input
                  id="start_date"
                  name="start_date"
                  type="date"
                  required
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="end_date"
                  className="text-xs font-bold text-[#9c7a20]"
                >
                  End Date{" "}
                  <span className="font-normal text-[#6b705c]">
                    (leave blank if ongoing; required for amortized)
                  </span>
                </label>
                <input
                  id="end_date"
                  name="end_date"
                  type="date"
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="notes"
                className="text-xs font-bold text-[#9c7a20]"
              >
                Notes
              </label>
              <input
                id="notes"
                name="notes"
                type="text"
                placeholder="Optional"
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>

            <button
              type="submit"
              className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Add Cost
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Recurring Monthly Costs</h2>

          <div className="mt-4 space-y-3">
            {recurringCosts.length === 0 ? (
              <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                No recurring costs yet.
              </p>
            ) : (
              recurringCosts.map((cost) => (
                <CostRow key={cost.id} cost={cost} />
              ))
            )}
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Amortized Costs</h2>

          <p className="mt-1 text-xs text-[#6b705c]">
            Spread evenly across the start and end date, and only counted
            during that window.
          </p>

          <div className="mt-4 space-y-3">
            {amortizedCosts.length === 0 ? (
              <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                No amortized costs yet.
              </p>
            ) : (
              amortizedCosts.map((cost) => (
                <CostRow key={cost.id} cost={cost} />
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function CostRow({ cost }: { cost: OverheadCost }) {
  const monthsSpan =
    cost.cost_type === "amortized" && cost.end_date
      ? Math.max(
          1,
          (new Date(cost.end_date).getFullYear() -
            new Date(cost.start_date).getFullYear()) *
            12 +
            (new Date(cost.end_date).getMonth() -
              new Date(cost.start_date).getMonth()) +
            1
        )
      : null;

  const monthlyEquivalent = monthsSpan
    ? toNumber(cost.amount) / monthsSpan
    : null;

  return (
    <details className="rounded-xl border border-[#e7e2d5] px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{cost.name}</p>
          <p className="text-xs text-[#6b705c]">
            {cost.category || "Uncategorized"} · {formatDate(cost.start_date)}
            {cost.end_date ? ` – ${formatDate(cost.end_date)}` : " – ongoing"}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-bold">{formatCurrency(cost.amount)}</p>
          {monthlyEquivalent !== null && (
            <p className="text-xs text-[#6b705c]">
              {formatCurrency(monthlyEquivalent)}/mo
            </p>
          )}
        </div>
      </summary>

      <div className="mt-4 border-t border-[#e7e2d5] pt-4">
        <form
          action={updateOverheadCost.bind(null, cost.id)}
          className="space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Name
              </label>
              <input
                name="name"
                type="text"
                defaultValue={cost.name}
                required
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Category
              </label>
              <select
                name="category"
                defaultValue={cost.category ?? "Other"}
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] bg-white px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Type
              </label>
              <select
                name="cost_type"
                defaultValue={cost.cost_type}
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] bg-white px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              >
                <option value="recurring">Recurring monthly</option>
                <option value="amortized">Amortized over a date range</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Amount ($)
              </label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                defaultValue={toNumber(cost.amount)}
                required
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>

            <div />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Start Date
              </label>
              <input
                name="start_date"
                type="date"
                defaultValue={cost.start_date}
                required
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                End Date
              </label>
              <input
                name="end_date"
                type="date"
                defaultValue={cost.end_date ?? ""}
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[#9c7a20]">Notes</label>
            <input
              name="notes"
              type="text"
              defaultValue={cost.notes ?? ""}
              className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Save Changes
            </button>
          </div>
        </form>

        <form action={deleteOverheadCost.bind(null, cost.id)} className="mt-3">
          <button
            type="submit"
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
          >
            Delete Cost
          </button>
        </form>
      </div>
    </details>
  );
}
