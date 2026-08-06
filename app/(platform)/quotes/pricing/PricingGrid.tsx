"use client";

// Staff-managed price-per-service-per-turf-size-range table. Deliberately
// keeps two separate lists rather than one combined useState:
//  - `initialGroups` (a prop, from the server component) renders every
//    ALREADY-SAVED service directly — no local copy, so after a save or
//    delete triggers revalidatePath and the parent server component
//    re-fetches, the fresh prop value is what actually renders. Copying
//    it into useState once would freeze it at first-render and never
//    pick up server-side changes again.
//  - `newDrafts` is purely local state for in-progress "Add Service"
//    forms that haven't been saved yet. Once a draft saves successfully,
//    it's removed from this list — by then the freshly-revalidated
//    `initialGroups` prop already includes it, so it reappears there
//    instead, with no gap or duplicate.
import { useState, useTransition } from "react";
import { TURF_SIZE_RANGES } from "@/lib/servicePricing";
import { saveServicePricing, deleteServicePricing } from "./actions";

export type PricingGroup = {
  serviceName: string;
  prices: Record<string, string>; // turf size range -> price as a plain string, "" if unset
};

export default function PricingGrid({
  initialGroups,
}: {
  initialGroups: PricingGroup[];
}) {
  const [newDrafts, setNewDrafts] = useState<string[]>([]); // list of client-generated keys

  return (
    <div className="space-y-6">
      {initialGroups.map((group) => (
        <ServicePricingSection
          key={group.serviceName}
          serviceName={group.serviceName}
          initialPrices={group.prices}
          isNew={false}
        />
      ))}

      {newDrafts.map((draftKey) => (
        <ServicePricingSection
          key={draftKey}
          serviceName=""
          initialPrices={{}}
          isNew
          onSaved={() =>
            setNewDrafts((prev) => prev.filter((key) => key !== draftKey))
          }
          onCancel={() =>
            setNewDrafts((prev) => prev.filter((key) => key !== draftKey))
          }
        />
      ))}

      <button
        type="button"
        onClick={() => setNewDrafts((prev) => [...prev, crypto.randomUUID()])}
        className="rounded-xl border border-dashed border-[#174734]/40 px-4 py-3 text-sm font-bold text-[#174734] transition hover:border-[#174734] hover:bg-white"
      >
        + Add Service
      </button>
    </div>
  );
}

function ServicePricingSection({
  serviceName,
  initialPrices,
  isNew,
  onSaved,
  onCancel,
}: {
  serviceName: string;
  initialPrices: Record<string, string>;
  isNew: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(serviceName);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const formData = new FormData(event.currentTarget);
    const priceByRange: Record<string, string> = {};
    for (const range of TURF_SIZE_RANGES) {
      priceByRange[range] = String(formData.get(`price_${range}`) ?? "");
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Service name is required.");
      return;
    }

    startTransition(async () => {
      const result = await saveServicePricing(trimmedName, priceByRange);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSaved(true);
      onSaved?.();
    });
  }

  function handleDelete() {
    if (!confirm(`Delete all pricing for "${serviceName}"? This can't be undone.`)) {
      return;
    }

    startTransition(async () => {
      const result = await deleteServicePricing(serviceName);
      if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-[#e7e2d5] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {isNew ? (
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Service name, e.g. Aeration"
            autoFocus
            className="w-64 rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm font-bold outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        ) : (
          <h3 className="text-lg font-bold">{serviceName}</h3>
        )}

        {!isNew && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="text-xs font-bold text-red-600 hover:underline disabled:opacity-60"
          >
            Delete service
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {TURF_SIZE_RANGES.map((range) => (
            <div key={range}>
              <label
                htmlFor={`price_${range}`}
                className="text-xs font-bold text-[#9c7a20]"
              >
                {range} sq ft
              </label>
              <input
                id={`price_${range}`}
                name={`price_${range}`}
                type="number"
                min="0"
                step="0.01"
                defaultValue={initialPrices[range] ?? ""}
                placeholder="—"
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-2 py-1.5 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-[#174734] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Save Pricing"}
          </button>

          {isNew && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="text-xs font-bold text-[#6b705c] hover:underline disabled:opacity-60"
            >
              Cancel
            </button>
          )}

          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          {saved && !error && (
            <p className="text-xs font-semibold text-green-700">Saved.</p>
          )}
        </div>

        <p className="mt-2 text-xs text-[#6b705c]">
          Leave a range blank to clear its price. Ranges left blank won&apos;t
          get a suggested price on the New Quote form.
        </p>
      </form>
    </div>
  );
}
