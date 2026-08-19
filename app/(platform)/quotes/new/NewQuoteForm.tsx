"use client";

import { useActionState, useMemo, useState } from "react";
import { createQuote } from "../actions";
import { initialActionState } from "../actionState";
import QuoteRecipientPicker, {
  type PickerCustomer,
  type PickerLead,
} from "../QuoteRecipientPicker";
import {
  TURF_SIZE_RANGES,
  findPrice,
  distinctServiceNames,
  type ServicePriceRow,
} from "@/lib/servicePricing";
import { TIER_KEYS, DEFAULT_TIER_NAMES, type TierKey } from "@/lib/quotes";

export default function NewQuoteForm({
  customers,
  leads,
  defaultExpiresAt,
  servicePrices,
}: {
  customers: PickerCustomer[];
  leads: PickerLead[];
  defaultExpiresAt: string;
  servicePrices: ServicePriceRow[];
}) {
  const [state, formAction, isPending] = useActionState(
    createQuote,
    initialActionState
  );

  const [turfSizeRange, setTurfSizeRange] = useState("");
  const [serviceCategory, setServiceCategory] = useState("");
  const [priceTotal, setPriceTotal] = useState("");
  const [pricingMode, setPricingMode] = useState<"flat" | "tiered">("flat");
  const [featuredTier, setFeaturedTier] = useState<TierKey>("better");

  const serviceNames = useMemo(
    () => distinctServiceNames(servicePrices),
    [servicePrices]
  );

  const suggestedPrice = useMemo(
    () => findPrice(servicePrices, serviceCategory, turfSizeRange),
    [servicePrices, serviceCategory, turfSizeRange]
  );

  return (
    <form action={formAction} className="mt-4 space-y-6">
      <QuoteRecipientPicker
        customers={customers}
        leads={leads}
        onTurfSizeChange={(range) => setTurfSizeRange(range ?? "")}
      />

      <div>
        <label
          htmlFor="turf_size_range"
          className="text-xs font-bold text-[#9c7a20]"
        >
          Turf Size
        </label>
        <select
          id="turf_size_range"
          value={turfSizeRange}
          onChange={(event) => setTurfSizeRange(event.target.value)}
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 sm:w-64"
        >
          <option value="">Unknown / not applicable</option>
          {TURF_SIZE_RANGES.map((range) => (
            <option key={range} value={range}>
              {range} sq ft
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-[#6b705c]">
          Auto-filled from the selected customer&apos;s property profile when
          known — change it anytime. Used only to suggest a price below, it
          isn&apos;t saved on the quote.
        </p>
      </div>

      <div>
        <label
          htmlFor="service_category"
          className="text-xs font-bold text-[#9c7a20]"
        >
          Service Category
        </label>
        <input
          id="service_category"
          name="service_category"
          type="text"
          list="service-name-options"
          value={serviceCategory}
          onChange={(event) => setServiceCategory(event.target.value)}
          placeholder="e.g. Turf Installation"
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 sm:w-64"
        />
        <datalist id="service-name-options">
          {serviceNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>

      <div>
        <input type="hidden" name="pricing_mode" value={pricingMode} />
        <p className="text-xs font-bold text-[#9c7a20]">Pricing</p>
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={() => setPricingMode("flat")}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
              pricingMode === "flat"
                ? "bg-[#174734] text-white"
                : "border border-[#d8d3c6] bg-white text-[#6b705c] hover:border-[#d4af37]"
            }`}
          >
            One Price
          </button>
          <button
            type="button"
            onClick={() => setPricingMode("tiered")}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
              pricingMode === "tiered"
                ? "bg-[#174734] text-white"
                : "border border-[#d8d3c6] bg-white text-[#6b705c] hover:border-[#d4af37]"
            }`}
          >
            Good / Better / Best
          </button>
        </div>
      </div>

      {pricingMode === "flat" ? (
        <div className="sm:w-64">
          <label htmlFor="price_total" className="text-xs font-bold text-[#9c7a20]">
            Price
          </label>
          <input
            id="price_total"
            name="price_total"
            type="number"
            min="0"
            step="0.01"
            required
            value={priceTotal}
            onChange={(event) => setPriceTotal(event.target.value)}
            placeholder="0.00"
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
          {suggestedPrice !== null && (
            <button
              type="button"
              onClick={() => setPriceTotal(String(suggestedPrice))}
              className="mt-1 text-xs font-bold text-[#174734] hover:underline"
            >
              Use suggested price — ${suggestedPrice.toFixed(2)}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-[#6b705c]">
            Leave a tier&apos;s price blank to leave it out (e.g. skip
            &quot;Better&quot; to send just two options). One feature per
            line. Pick which tier to highlight as the recommended option.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {TIER_KEYS.map((key) => (
              <div
                key={key}
                className="rounded-xl border border-[#d9d4c6] p-4"
              >
                <label
                  htmlFor={`tier_${key}_name`}
                  className="text-xs font-bold text-[#9c7a20]"
                >
                  Tier Name
                </label>
                <input
                  id={`tier_${key}_name`}
                  name={`tier_${key}_name`}
                  type="text"
                  defaultValue={DEFAULT_TIER_NAMES[key]}
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />

                <label
                  htmlFor={`tier_${key}_price`}
                  className="mt-3 block text-xs font-bold text-[#9c7a20]"
                >
                  Price
                </label>
                <input
                  id={`tier_${key}_price`}
                  name={`tier_${key}_price`}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />

                <label
                  htmlFor={`tier_${key}_features`}
                  className="mt-3 block text-xs font-bold text-[#9c7a20]"
                >
                  What&apos;s Included
                </label>
                <textarea
                  id={`tier_${key}_features`}
                  name={`tier_${key}_features`}
                  rows={4}
                  placeholder={"One item per line"}
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />

                <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#174734]">
                  <input
                    type="radio"
                    name="featured_tier"
                    value={key}
                    checked={featuredTier === key}
                    onChange={() => setFeaturedTier(key)}
                    className="h-4 w-4"
                  />
                  Highlight as recommended
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <label htmlFor="description" className="text-xs font-bold text-[#9c7a20]">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={4}
          placeholder="What's being quoted — scope of work, materials, timeline, whatever the customer needs to see."
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        />
      </div>

      <div className="sm:w-64">
        <label htmlFor="expires_at" className="text-xs font-bold text-[#9c7a20]">
          Valid Until
        </label>
        <input
          id="expires_at"
          name="expires_at"
          type="date"
          defaultValue={defaultExpiresAt}
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        />
        <p className="mt-1 text-xs text-[#6b705c]">
          Optional — leave blank for a quote with no expiration.
        </p>
      </div>

      {state.error && (
        <p className="text-sm font-semibold text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-[#174734] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
      >
        {isPending ? "Creating…" : "Create Quote"}
      </button>
    </form>
  );
}
