"use client";

import { useActionState, useMemo, useState } from "react";
import { createJob } from "../actions";
import { initialActionState } from "../actionState";

export type PickerCustomer = {
  id: string;
  name: string;
};

const FREQUENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "one_time", label: "One-Time" },
  { value: "weekly", label: "Weekly" },
  { value: "bimonthly", label: "Bi-Monthly (every 2 months)" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semiannual", label: "Semi-Annual" },
];

export default function NewJobForm({
  customers,
}: {
  customers: PickerCustomer[];
}) {
  const [state, formAction, isPending] = useActionState(
    createJob,
    initialActionState
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PickerCustomer | null>(null);
  const [frequency, setFrequency] = useState("one_time");
  const isRecurring = frequency !== "one_time";

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers.slice(0, 25);
    return customers
      .filter((c) => c.name.toLowerCase().includes(query))
      .slice(0, 25);
  }, [customers, search]);

  return (
    <form action={formAction} className="mt-4 space-y-6">
      <input type="hidden" name="customer_id" value={selected?.id ?? ""} />
      <input
        type="hidden"
        name="customer_name"
        value={selected?.name ?? ""}
      />

      <div>
        <label htmlFor="customer_search" className="text-xs font-bold text-[#9c7a20]">
          Customer
        </label>

        {selected ? (
          <div className="mt-1 flex items-center justify-between rounded-lg border border-[#d4af37] bg-[#fdf8ea] px-3 py-2 text-sm">
            <span className="font-semibold">{selected.name}</span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs font-bold text-[#9c7a20] hover:underline"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              id="customer_search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers by name…"
              className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />

            {customers.length === 0 ? (
              <p className="mt-2 text-xs text-[#6b705c]">
                No synced customers found yet.
              </p>
            ) : (
              <div className="mt-2 max-h-56 divide-y divide-[#eee9dc] overflow-y-auto rounded-lg border border-[#eee9dc]">
                {filtered.length === 0 ? (
                  <p className="p-3 text-xs text-[#6b705c]">
                    No customers match &ldquo;{search}&rdquo;.
                  </p>
                ) : (
                  filtered.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => setSelected(customer)}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-[#f5f4ef]"
                    >
                      {customer.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <label htmlFor="title" className="text-xs font-bold text-[#9c7a20]">
          Job Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          placeholder="e.g. Turf Installation"
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="price" className="text-xs font-bold text-[#9c7a20]">
            Price ($){" "}
            <span className="font-normal text-[#6b705c]">(optional)</span>
          </label>
          <input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
          <p className="mt-1 text-xs text-[#6b705c]">
            Added as a single line item using the job title.
          </p>
        </div>

        <div>
          <label
            htmlFor="frequency"
            className="text-xs font-bold text-[#9c7a20]"
          >
            Frequency
          </label>
          <select
            id="frequency"
            name="frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] bg-white px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          >
            {FREQUENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="start_date" className="text-xs font-bold text-[#9c7a20]">
          Start Date{" "}
          <span className="font-normal text-[#6b705c]">
            {isRecurring ? "(required for a recurring job)" : "(optional)"}
          </span>
        </label>
        <input
          id="start_date"
          name="start_date"
          type="date"
          required={isRecurring}
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        />
        <p className="mt-1 text-xs text-[#6b705c]">
          {isRecurring
            ? "First visit date — future visits generate automatically on this cadence. Adjust the schedule anytime from Manage Job."
            : "If set, schedules a single visit on this date. Leave blank to schedule it later."}
        </p>
      </div>

      <div>
        <label
          htmlFor="instructions"
          className="text-xs font-bold text-[#9c7a20]"
        >
          Instructions{" "}
          <span className="font-normal text-[#6b705c]">(optional)</span>
        </label>
        <textarea
          id="instructions"
          name="instructions"
          rows={3}
          placeholder="Scope of work, gate codes, anything the crew needs to know"
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        />
      </div>

      {state.error && (
        <p className="text-sm font-semibold text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending || !selected}
        className="rounded-xl bg-[#174734] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
      >
        {isPending ? "Creating…" : "Create Job"}
      </button>
    </form>
  );
}
