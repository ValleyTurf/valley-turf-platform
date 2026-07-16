export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { addEquipment, updateEquipment, deleteEquipment } from "../materials/actions";

type EquipmentSummary = {
  equipment_id: string;
  name: string;
  total_cost: number | string;
  in_service_date: string;
  uses_logged: number | string;
  next_use_cost: number | string;
};

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

export default async function EquipmentPage() {
  const { data, error } = await supabaseServer
    .from("equipment_usage_summary")
    .select(
      "equipment_id, name, total_cost, in_service_date, uses_logged, next_use_cost"
    )
    .order("name", { ascending: true });

  const equipment = (data ?? []) as EquipmentSummary[];

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-4xl font-bold">Equipment</h1>

            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Equipment like the vacuum and power broom, where cost per use
              declines as it gets used more — total cost ÷ uses so far.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/job-costs"
              className="rounded-xl bg-[#d4af37] px-5 py-3 text-center text-sm font-bold text-[#174734] transition hover:bg-[#e6c766]"
            >
              Log Job Usage
            </Link>

            <Link
              href="/revenue"
              className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Back to Financial Dashboard
            </Link>
          </div>
        </header>

        {error && (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">
              Equipment could not be loaded
            </p>
            <p className="mt-1 text-sm text-red-600">{error.message}</p>
          </section>
        )}

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Add Equipment</h2>

          <form action={addEquipment} className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
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
                  placeholder="e.g. Turf Vacuum"
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="total_cost"
                  className="text-xs font-bold text-[#9c7a20]"
                >
                  Purchase Price ($)
                </label>
                <input
                  id="total_cost"
                  name="total_cost"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="in_service_date"
                  className="text-xs font-bold text-[#9c7a20]"
                >
                  In Service Date
                </label>
                <input
                  id="in_service_date"
                  name="in_service_date"
                  type="date"
                  required
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
              Add Equipment
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Current Equipment</h2>

          <div className="mt-4 space-y-3">
            {equipment.length === 0 ? (
              <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                No equipment yet.
              </p>
            ) : (
              equipment.map((item) => (
                <EquipmentRow key={item.equipment_id} item={item} />
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function EquipmentRow({ item }: { item: EquipmentSummary }) {
  return (
    <details className="rounded-xl border border-[#e7e2d5] px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{item.name}</p>
          <p className="text-xs text-[#6b705c]">
            {formatCurrency(item.total_cost)} · in service{" "}
            {formatDate(item.in_service_date)} ·{" "}
            {toNumber(item.uses_logged)} use
            {toNumber(item.uses_logged) === 1 ? "" : "s"} logged
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-bold">
            {formatCurrency(item.next_use_cost)}
          </p>
          <p className="text-xs text-[#6b705c]">next use</p>
        </div>
      </summary>

      <div className="mt-4 border-t border-[#e7e2d5] pt-4">
        <form
          action={updateEquipment.bind(null, item.equipment_id)}
          className="space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Name
              </label>
              <input
                name="name"
                type="text"
                defaultValue={item.name}
                required
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Purchase Price ($)
              </label>
              <input
                name="total_cost"
                type="number"
                step="0.01"
                min="0"
                defaultValue={toNumber(item.total_cost)}
                required
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                In Service Date
              </label>
              <input
                name="in_service_date"
                type="date"
                defaultValue={item.in_service_date}
                required
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>
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

        <form action={deleteEquipment.bind(null, item.equipment_id)} className="mt-3">
          <button
            type="submit"
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
          >
            Delete Equipment
          </button>
        </form>
      </div>
    </details>
  );
}
