"use client";

import { useActionState } from "react";
import { createQuote } from "../actions";
import { initialActionState } from "../actionState";
import QuoteRecipientPicker, {
  type PickerCustomer,
  type PickerLead,
} from "../QuoteRecipientPicker";

export default function NewQuoteForm({
  customers,
  leads,
  defaultExpiresAt,
}: {
  customers: PickerCustomer[];
  leads: PickerLead[];
  defaultExpiresAt: string;
}) {
  const [state, formAction, isPending] = useActionState(
    createQuote,
    initialActionState
  );

  return (
    <form action={formAction} className="mt-4 space-y-6">
      <QuoteRecipientPicker customers={customers} leads={leads} />

      <div className="grid gap-3 sm:grid-cols-2">
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
            placeholder="e.g. Turf Installation"
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        </div>

        <div>
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
            placeholder="0.00"
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        </div>
      </div>

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
