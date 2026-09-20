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
import { findIncludedItems, type IncludedItemRow } from "@/lib/serviceIncludedItems";
import { TIER_KEYS, DEFAULT_TIER_NAMES, type TierKey } from "@/lib/quotes";

type AddonDraft = {
  key: string;
  name: string;
  price: string;
};

export default function NewQuoteForm({
  customers,
  leads,
  initialLead,
  defaultExpiresAt,
  servicePrices,
  includedItems,
}: {
  customers: PickerCustomer[];
  leads: PickerLead[];
  initialLead?: PickerLead | null;
  defaultExpiresAt: string;
  servicePrices: ServicePriceRow[];
  includedItems: IncludedItemRow[];
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
  const [addons, setAddons] = useState<AddonDraft[]>([]);

  const serviceNames = useMemo(
    () => distinctServiceNames(servicePrices),
    [servicePrices]
  );

  const suggestedPrice = useMemo(
    () => findPrice(servicePrices, serviceCategory, turfSizeRange),
    [servicePrices, serviceCategory, turfSizeRange]
  );

  // Catalog-derived, not free-typed — matches whatever's set for this
  // service on /quotes/pricing. Read-only here on purpose: the bullet
  // list is a property of the service, not something to retype for
  // every quote (see lib/serviceIncludedItems.ts).
  const whatsIncluded = useMemo(
    () => findIncludedItems(includedItems, serviceCategory),
    [includedItems, serviceCategory]
  );

  const addonsTotal = useMemo(
    () =>
      addons.reduce((sum, addon) => {
        const value = Number(addon.price);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0),
    [addons]
  );

  const priceValue = Number(priceTotal);
  const addonsExceedTotal =
    addons.length > 0 &&
    Number.isFinite(priceValue) &&
    addonsTotal > priceValue;

  function addAddonRow() {
    setAddons((prev) => [
      ...prev,
      { key: crypto.randomUUID(), name: "", price: "" },
    ]);
  }

  function updateAddonRow(key: string, field: "name" | "price", value: string) {
    setAddons((prev) =>
      prev.map((addon) => (addon.key === key ? { ...addon, [field]: value } : addon))
    );
  }

  function removeAddonRow(key: string) {
    setAddons((prev) => prev.filter((addon) => addon.key !== key));
  }

  return (
    <form action={formAction} className="mt-4 space-y-6">
      <QuoteRecipientPicker
        customers={customers}
        leads={leads}
        initialLead={initialLead}
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
          name="turf_size_range"
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
          known — change it anytime. Suggests a price below and shows on
          the quote itself as &quot;{turfSizeRange || "…"} Sq Ft -{" "}
          {serviceCategory || "…"}&quot;.
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

      {pricingMode === "flat" && (
        <div className="rounded-xl border border-[#e7e2d5] bg-[#f5f4ef] p-4">
          <p className="text-xs font-bold text-[#9c7a20]">
            What&apos;s Included Preview
          </p>
          {serviceCategory.trim() === "" ? (
            <p className="mt-1 text-sm text-[#6b705c]">
              Enter a service category above to see its included-items
              list.
            </p>
          ) : whatsIncluded.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-[#174734]">
              {whatsIncluded.map((item, index) => (
                <li key={index}>• {item}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-[#6b705c]">
              No included-items list set for &quot;{serviceCategory}&quot;
              yet.
            </p>
          )}
          <a
            href="/quotes/pricing"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs font-bold text-[#174734] hover:underline"
          >
            Manage included items on the Service Pricing page →
          </a>
        </div>
      )}

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
        <>
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
            <p className="mt-1 text-xs text-[#6b705c]">
              This is the whole-service total the customer sees as the big
              price. Add-ons below are a priced breakdown of what&apos;s
              inside it, not an extra charge on top.
            </p>
          </div>

          <div>
            <input type="hidden" name="addons" value={JSON.stringify(
              addons
                .map((addon) => ({ name: addon.name.trim(), price: addon.price }))
                .filter((addon) => addon.name)
            )} />
            <p className="text-xs font-bold text-[#9c7a20]">
              Add-on Line Items
            </p>
            <p className="mt-1 text-xs text-[#6b705c]">
              Optional. E.g. &quot;Urine Extraction&quot; — $35.00. Shown to
              the customer as its own priced line under What&apos;s
              Included.
            </p>

            {addons.length > 0 && (
              <div className="mt-3 space-y-2">
                {addons.map((addon) => (
                  <div key={addon.key} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={addon.name}
                      onChange={(event) =>
                        updateAddonRow(addon.key, "name", event.target.value)
                      }
                      placeholder="e.g. Urine Extraction"
                      className="flex-1 rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={addon.price}
                      onChange={(event) =>
                        updateAddonRow(addon.key, "price", event.target.value)
                      }
                      placeholder="0.00"
                      className="w-28 rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                    />
                    <button
                      type="button"
                      onClick={() => removeAddonRow(addon.key)}
                      className="text-xs font-bold text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={addAddonRow}
              className="mt-3 rounded-lg border border-dashed border-[#174734]/40 px-4 py-2 text-xs font-bold text-[#174734] transition hover:border-[#174734] hover:bg-white"
            >
              + Add a line item
            </button>

            {addonsExceedTotal && (
              <p className="mt-2 text-xs font-semibold text-amber-700">
                Add-ons total ${addonsTotal.toFixed(2)}, which is more than
                the ${priceValue.toFixed(2)} price above — double check the
                price before sending.
              </p>
            )}
          </div>
        </>
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
