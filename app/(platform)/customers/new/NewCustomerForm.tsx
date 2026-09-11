"use client";

import { useActionState } from "react";
import { createCustomer } from "./actions";
import { initialActionState } from "./actionState";
import ReferralSourceField, {
  type ReferralPickerCustomer,
  type ReferralQrCampaign,
} from "@/app/components/ReferralSourceField";

export default function NewCustomerForm({
  customers,
  campaigns,
}: {
  customers: ReferralPickerCustomer[];
  campaigns: ReferralQrCampaign[];
}) {
  const [state, formAction, isPending] = useActionState(
    createCustomer,
    initialActionState
  );

  return (
    <form action={formAction} className="mt-4 space-y-6">
      <div>
        <label htmlFor="full_name" className="text-xs font-bold text-[#9c7a20]">
          Full Name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          placeholder="e.g. Jane Smith"
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className="text-xs font-bold text-[#9c7a20]">
            Email <span className="font-normal text-[#6b705c]">(optional)</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="jane@example.com"
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        </div>

        <div>
          <label htmlFor="phone" className="text-xs font-bold text-[#9c7a20]">
            Phone <span className="font-normal text-[#6b705c]">(optional)</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            placeholder="(555) 555-5555"
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        </div>
      </div>

      <div>
        <label htmlFor="street" className="text-xs font-bold text-[#9c7a20]">
          Street Address{" "}
          <span className="font-normal text-[#6b705c]">(optional)</span>
        </label>
        <input
          id="street"
          name="street"
          type="text"
          placeholder="123 Main St"
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="city" className="text-xs font-bold text-[#9c7a20]">
            City <span className="font-normal text-[#6b705c]">(optional)</span>
          </label>
          <input
            id="city"
            name="city"
            type="text"
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        </div>

        <div>
          <label htmlFor="state" className="text-xs font-bold text-[#9c7a20]">
            State <span className="font-normal text-[#6b705c]">(optional)</span>
          </label>
          <input
            id="state"
            name="state"
            type="text"
            placeholder="AZ"
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        </div>

        <div>
          <label htmlFor="zip" className="text-xs font-bold text-[#9c7a20]">
            Zip <span className="font-normal text-[#6b705c]">(optional)</span>
          </label>
          <input
            id="zip"
            name="zip"
            type="text"
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        </div>
      </div>

      <ReferralSourceField customers={customers} campaigns={campaigns} />

      {state.error && (
        <p className="text-sm font-semibold text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-[#174734] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
      >
        {isPending ? "Adding…" : "Add Customer"}
      </button>
    </form>
  );
}
