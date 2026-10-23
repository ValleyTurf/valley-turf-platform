"use client";

import { useMemo, useState } from "react";

export type ReferralPickerCustomer = {
  id: string;
  name: string;
};

export type ReferralQrCampaign = {
  id: string;
  label: string;
};

// Plain {value, label} pairs -- same shape as
// lib/referralSource.ts's ReferralSourceOption, declared separately
// here so this client component has no server-only import (same
// reasoning as the two types above). Fetched server-side from the
// referral_sources table (migration 099) by whichever page renders this
// field, and passed down as a prop instead of a static imported list --
// that table is what makes the options Ryan-editable from
// /settings/referral-sources without a code change.
export type ReferralSourceOption = {
  value: string;
  label: string;
};

const inputClasses =
  "mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20";

// Shared by the New Customer form and the existing-customer Property
// Profile edit (see lib/referralSource.ts's header comment) so the two
// places a customer's referral source gets set can't drift apart. Only
// renders the sub-field that matches the currently-selected source --
// the other's hidden input simply isn't in the DOM, so it's absent from
// the form submit rather than needing to be blanked out.
//
// `customers` excludes the customer being edited (a customer can't refer
// themselves) -- callers filter that out before passing the list down.
export default function ReferralSourceField({
  initialSource,
  initialReferredBy,
  initialCampaignId,
  customers,
  campaigns,
  options,
}: {
  initialSource?: string | null;
  initialReferredBy?: ReferralPickerCustomer | null;
  initialCampaignId?: string | null;
  customers: ReferralPickerCustomer[];
  campaigns: ReferralQrCampaign[];
  options: ReferralSourceOption[];
}) {
  const [source, setSource] = useState<string>(initialSource ?? "");
  const [search, setSearch] = useState("");
  const [selectedReferrer, setSelectedReferrer] =
    useState<ReferralPickerCustomer | null>(initialReferredBy ?? null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers.slice(0, 25);
    return customers
      .filter((c) => c.name.toLowerCase().includes(query))
      .slice(0, 25);
  }, [customers, search]);

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="referral_source" className="text-xs font-bold text-[#9c7a20]">
          How did you hear about us?{" "}
          <span className="font-normal text-[#6b705c]">(optional)</span>
        </label>
        <select
          id="referral_source"
          name="referral_source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className={`${inputClasses} bg-white`}
        >
          <option value="">Not set</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {source === "referral" && (
        <div>
          <label className="text-xs font-bold text-[#9c7a20]">
            Referred by
          </label>

          {selectedReferrer ? (
            <div className="mt-1 flex items-center justify-between rounded-lg border border-[#d4af37] bg-[#fdf8ea] px-3 py-2 text-sm">
              <span className="font-semibold">{selectedReferrer.name}</span>
              <button
                type="button"
                onClick={() => setSelectedReferrer(null)}
                className="text-xs font-bold text-[#9c7a20] hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customers by name…"
                className={inputClasses}
              />

              {customers.length === 0 ? (
                <p className="mt-2 text-xs text-[#6b705c]">
                  No customers to pick from yet.
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
                        onClick={() => setSelectedReferrer(customer)}
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

          <input
            type="hidden"
            name="referred_by_customer_id"
            value={selectedReferrer?.id ?? ""}
          />
        </div>
      )}

      {source === "qr_code" && (
        <div>
          <label
            htmlFor="referral_campaign_id"
            className="text-xs font-bold text-[#9c7a20]"
          >
            Which QR code?
          </label>
          <select
            id="referral_campaign_id"
            name="referral_campaign_id"
            defaultValue={initialCampaignId ?? ""}
            className={`${inputClasses} bg-white`}
          >
            <option value="">Not set</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.label}
              </option>
            ))}
          </select>
          {campaigns.length === 0 && (
            <p className="mt-2 text-xs text-[#6b705c]">
              No QR codes set up yet — create one at{" "}
              <span className="font-semibold">Links &amp; QR Codes</span>{" "}
              first.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
