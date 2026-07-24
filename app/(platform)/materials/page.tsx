export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { addMaterial, updateMaterial, deleteMaterial } from "./actions";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import {
  toNumber,
  formatCurrencyPrecise as formatCurrency,
} from "@/lib/format";

type Material = {
  id: string;
  name: string;
  unit_label: string;
  unit_cost: number | string;
  notes: string | null;
};

export default async function MaterialsPage() {
  const { data, error } = await supabaseServer
    .from("materials")
    .select("id, name, unit_label, unit_cost, notes")
    .order("name", { ascending: true });

  const materials = (data ?? []) as Material[];

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-4xl font-bold">Materials</h1>

            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Cost per unit for consumables like OxyTurf and infill, used to
              calculate job-level material costs.
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
              Materials could not be loaded
            </p>
            <p className="mt-1 text-sm text-red-600">{error.message}</p>
          </section>
        )}

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Add a Material</h2>

          <form action={addMaterial} className="mt-4 space-y-4">
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
                  placeholder="e.g. OxyTurf"
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="unit_label"
                  className="text-xs font-bold text-[#9c7a20]"
                >
                  Unit
                </label>
                <input
                  id="unit_label"
                  name="unit_label"
                  type="text"
                  required
                  placeholder="e.g. gallon, bag"
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="unit_cost"
                  className="text-xs font-bold text-[#9c7a20]"
                >
                  Cost per Unit ($)
                </label>
                <input
                  id="unit_cost"
                  name="unit_cost"
                  type="number"
                  step="0.01"
                  min="0"
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
                placeholder="Optional — e.g. last purchased 275-gal tote for $3,717.50"
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>

            <button
              type="submit"
              className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Add Material
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Current Materials</h2>

          <div className="mt-4 space-y-3">
            {materials.length === 0 ? (
              <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                No materials yet.
              </p>
            ) : (
              materials.map((material) => (
                <MaterialRow key={material.id} material={material} />
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function MaterialRow({ material }: { material: Material }) {
  return (
    <details className="rounded-xl border border-[#e7e2d5] px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{material.name}</p>
          <p className="text-xs text-[#6b705c]">per {material.unit_label}</p>
        </div>

        <p className="shrink-0 text-sm font-bold">
          {formatCurrency(material.unit_cost)}
        </p>
      </summary>

      <div className="mt-4 border-t border-[#e7e2d5] pt-4">
        <form
          action={updateMaterial.bind(null, material.id)}
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
                defaultValue={material.name}
                required
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Unit
              </label>
              <input
                name="unit_label"
                type="text"
                defaultValue={material.unit_label}
                required
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Cost per Unit ($)
              </label>
              <input
                name="unit_cost"
                type="number"
                step="0.01"
                min="0"
                defaultValue={toNumber(material.unit_cost)}
                required
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[#9c7a20]">Notes</label>
            <input
              name="notes"
              type="text"
              defaultValue={material.notes ?? ""}
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

        <form action={deleteMaterial.bind(null, material.id)} className="mt-3">
          <ConfirmSubmitButton
            confirmMessage={`Delete ${material.name}? This can't be undone.`}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
          >
            Delete Material
          </ConfirmSubmitButton>
        </form>
      </div>
    </details>
  );
}
