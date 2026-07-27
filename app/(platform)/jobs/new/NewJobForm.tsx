"use client";

import { useActionState, useMemo, useState } from "react";
import { createJob } from "../actions";
import { initialActionState } from "../actionState";

export type PickerCustomer = {
  id: string;
  name: string;
};

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
        <p className="mt-1 text-xs text-[#6b705c]">
          Pricing, line items, and scheduling still get set in Jobber after
          the job is created.
        </p>
      </div>

      {state.error && (
        <p className="text-sm font-semibold text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending || !selected}
        className="rounded-xl bg-[#174734] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
      >
        {isPending ? "Creating…" : "Create Job in Jobber"}
      </button>
    </form>
  );
}
