export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import {
  updateMaterial,
  deleteMaterial,
  updateEmployee,
  deleteEmployee,
  updateEquipment,
  deleteEquipment,
} from "./actions";
import { updateOverheadCost, deleteOverheadCost } from "../costs/actions";
import { OVERHEAD_CATEGORY_OPTIONS } from "./constants";
import AddCostInputForm from "./AddCostInputForm";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import {
  toNumber,
  formatCurrencyPrecise as formatCurrency,
  formatDateOnly as formatDate,
} from "@/lib/format";

// Materials, Labor Rates, Equipment, and Overhead Costs used to be four
// separate pages, each with its own always-expanded "Add" form and its
// own flat list. Consolidated onto one page: a single "Add" form whose
// fields change based on a Type dropdown (AddCostInputForm.tsx), and one
// "Current X" box per kind below it — so there's one place to manage
// every job-cost input instead of four.

type Material = {
  id: string;
  name: string;
  unit_label: string;
  unit_cost: number | string;
  notes: string | null;
  start_date: string | null;
  end_date: string | null;
};

type EmployeeRow = {
  id: string;
  name: string;
  unit_cost: number | string;
  start_date: string | null;
  end_date: string | null;
};

type EquipmentSummary = {
  equipment_id: string;
  name: string;
  total_cost: number | string;
  in_service_date: string;
  retired_date: string | null;
  uses_logged: number | string;
  next_use_cost: number | string;
};

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

function employeeDisplayName(rawName: string): string {
  return rawName.replace(/^Labor\s*[—-]\s*/i, "").trim();
}

function isRetired(retiredDate: string | null): boolean {
  if (!retiredDate) {
    return false;
  }

  return new Date(`${retiredDate}T00:00:00`) <= new Date();
}

// Same "is this date in the past" check as isRetired above, named
// generically since it's shared by Materials and Labor Rates — neither
// is "retired" exactly, but an end_date works the same way: once it's
// passed, the row is inactive and drops out of the job-costs logging
// selector (see job-costs/page.tsx's materials query).
function isEnded(endDate: string | null): boolean {
  return isRetired(endDate);
}

export default async function MaterialsPage() {
  const [materialsResult, employeesResult, equipmentResult, costsResult] =
    await Promise.all([
      supabaseServer
        .from("materials")
        .select("id, name, unit_label, unit_cost, notes, start_date, end_date")
        .neq("unit_label", "hour")
        .order("name", { ascending: true }),

      supabaseServer
        .from("materials")
        .select("id, name, unit_cost, start_date, end_date")
        .eq("unit_label", "hour")
        .order("name", { ascending: true }),

      supabaseServer
        .from("equipment_usage_summary")
        .select(
          "equipment_id, name, total_cost, in_service_date, retired_date, uses_logged, next_use_cost"
        )
        .order("name", { ascending: true }),

      supabaseServer
        .from("overhead_costs")
        .select(
          "id, name, category, cost_type, amount, start_date, end_date, notes"
        )
        .order("cost_type", { ascending: true })
        .order("name", { ascending: true }),
    ]);

  const materials = (materialsResult.data ?? []) as Material[];
  const employees = (employeesResult.data ?? []) as EmployeeRow[];
  const equipment = (equipmentResult.data ?? []) as EquipmentSummary[];
  const costs = (costsResult.data ?? []) as OverheadCost[];

  const recurringCosts = costs.filter((c) => c.cost_type === "recurring");
  const amortizedCosts = costs.filter((c) => c.cost_type === "amortized");

  const loadErrors = [
    materialsResult.error && "materials",
    employeesResult.error && "labor rates",
    equipmentResult.error && "equipment",
    costsResult.error && "overhead costs",
  ].filter(Boolean) as string[];

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Materials &amp; Costs
            </h1>

            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Everything used to calculate job cost and overhead — material
              unit costs, labor rates, equipment cost-per-use, and business
              overhead — in one place.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/job-costs"
              className="rounded-xl bg-[#d4af37] px-5 py-3 text-center text-sm font-bold text-[#174734] transition hover:bg-[#e6c766]"
            >
              Log Job Costs
            </Link>

            <Link
              href="/revenue"
              className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Back to Financial Dashboard
            </Link>
          </div>
        </header>

        {loadErrors.length > 0 && (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">
              Couldn&apos;t load {loadErrors.join(", ")}
            </p>
          </section>
        )}

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Add</h2>
          <AddCostInputForm />
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl bg-white p-5 shadow">
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

          <section className="rounded-2xl bg-white p-5 shadow">
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

          <section className="rounded-2xl bg-white p-5 shadow">
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

          <section className="rounded-2xl bg-white p-5 shadow">
            <h2 className="text-lg font-bold">Current Overhead Costs</h2>

            <div className="mt-4">
              <p className="text-sm font-semibold text-[#6b705c]">
                Recurring Monthly
              </p>
              <div className="mt-3 space-y-3">
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
            </div>

            <div className="mt-6">
              <p className="text-sm font-semibold text-[#6b705c]">
                Amortized
                <span className="ml-2 font-normal text-xs text-[#9c7a20]">
                  Spread evenly across the start and end date, only counted
                  during that window.
                </span>
              </p>
              <div className="mt-3 space-y-3">
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
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function MaterialRow({ material }: { material: Material }) {
  const ended = isEnded(material.end_date);

  return (
    <details className="rounded-xl border border-[#e7e2d5] px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold">{material.name}</p>
            {ended && (
              <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                Ended {formatDate(material.end_date)}
              </span>
            )}
          </div>
          <p className="text-xs text-[#6b705c]">
            per {material.unit_label}
            {material.start_date ? ` · since ${formatDate(material.start_date)}` : ""}
          </p>
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

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Start Date
              </label>
              <input
                name="start_date"
                type="date"
                defaultValue={material.start_date ?? ""}
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
                defaultValue={material.end_date ?? ""}
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

function EmployeeRowItem({ employee }: { employee: EmployeeRow }) {
  const name = employeeDisplayName(employee.name);
  const ended = isEnded(employee.end_date);

  return (
    <details className="rounded-xl border border-[#e7e2d5] px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold">{name}</p>
            {ended && (
              <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                Ended {formatDate(employee.end_date)}
              </span>
            )}
          </div>
          {employee.start_date && (
            <p className="text-xs text-[#6b705c]">
              since {formatDate(employee.start_date)}
            </p>
          )}
        </div>

        <p className="shrink-0 text-sm font-bold">
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

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Start Date
              </label>
              <input
                name="start_date"
                type="date"
                defaultValue={employee.start_date ?? ""}
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
                defaultValue={employee.end_date ?? ""}
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

function EquipmentRow({ item }: { item: EquipmentSummary }) {
  const retired = isRetired(item.retired_date);

  return (
    <details className="rounded-xl border border-[#e7e2d5] px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold">{item.name}</p>
            {retired && (
              <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                Retired {formatDate(item.retired_date)}
              </span>
            )}
          </div>
          <p className="text-xs text-[#6b705c]">
            {formatCurrency(item.total_cost)} · in service{" "}
            {formatDate(item.in_service_date)} ·{" "}
            {toNumber(item.uses_logged)} use
            {toNumber(item.uses_logged) === 1 ? "" : "s"} logged
          </p>
        </div>

        <div className="shrink-0 text-right">
          {!retired && (
            <>
              <p className="text-sm font-bold">
                {formatCurrency(item.next_use_cost)}
              </p>
              <p className="text-xs text-[#6b705c]">next use</p>
            </>
          )}
        </div>
      </summary>

      <div className="mt-4 border-t border-[#e7e2d5] pt-4">
        <form
          action={updateEquipment.bind(null, item.equipment_id)}
          className="space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Retirement Date{" "}
                <span className="font-normal text-[#6b705c]">
                  (optional)
                </span>
              </label>
              <input
                name="retired_date"
                type="date"
                defaultValue={item.retired_date ?? ""}
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

        <form
          action={deleteEquipment.bind(null, item.equipment_id)}
          className="mt-3"
        >
          <ConfirmSubmitButton
            confirmMessage={`Delete ${item.name}? This can't be undone.`}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
          >
            Delete Equipment
          </ConfirmSubmitButton>
        </form>
      </div>
    </details>
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
                {OVERHEAD_CATEGORY_OPTIONS.map((option) => (
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
          <ConfirmSubmitButton
            confirmMessage={`Delete ${cost.name}? This can't be undone.`}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
          >
            Delete Cost
          </ConfirmSubmitButton>
        </form>
      </div>
    </details>
  );
}
