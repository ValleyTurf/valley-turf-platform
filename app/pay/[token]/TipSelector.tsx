"use client";

// Ryan's request: the /pay/[token] page never actually offered a tip,
// even though lib/stripeCheckout.ts's createCheckoutSession has
// supported a tipCents line item since Tier 1 -- nothing calling it from
// this page ever passed one through. Picked client-side, before Pay Now
// is clicked, and submitted as a hidden form field so the server action
// (payInvoice) can fold it into the Checkout Session it creates. Stripe
// Checkout itself has no native tip prompt for online payments (that's
// Terminal-only), so this -- computing the amount first, listing it as
// its own line item -- is the standard workaround.
import { useState } from "react";

const PRESET_PERCENTAGES = [0, 15, 20, 25];

export function TipSelector({ invoiceTotal }: { invoiceTotal: number }) {
  const [selected, setSelected] = useState<number | "custom">(0);
  const [customAmount, setCustomAmount] = useState("");

  const tipDollars =
    selected === "custom" ? Number(customAmount) || 0 : (invoiceTotal * selected) / 100;
  const tipCents = Math.max(0, Math.round(tipDollars * 100));

  return (
    <div className="mt-2 border-b border-[#eee9dc] pb-5">
      <p className="text-sm font-semibold text-[#174734]">Add a tip?</p>

      <div className="mt-2 flex flex-wrap gap-2">
        {PRESET_PERCENTAGES.map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => setSelected(pct)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
              selected === pct
                ? "border-[#174734] bg-[#174734] text-white"
                : "border-[#e7e2d5] text-[#174734] hover:border-[#9c7a20]"
            }`}
          >
            {pct === 0 ? "No tip" : `${pct}%`}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSelected("custom")}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
            selected === "custom"
              ? "border-[#174734] bg-[#174734] text-white"
              : "border-[#e7e2d5] text-[#174734] hover:border-[#9c7a20]"
          }`}
        >
          Custom
        </button>
      </div>

      {selected === "custom" && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-[#6b705c]">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={customAmount}
            onChange={(event) => setCustomAmount(event.target.value)}
            placeholder="0.00"
            className="w-28 rounded-lg border border-[#e7e2d5] px-3 py-1.5 text-sm"
          />
        </div>
      )}

      {tipCents > 0 && (
        <p className="mt-3 text-sm text-[#6b705c]">
          Tip: ${(tipCents / 100).toFixed(2)} — new total: $
          {(invoiceTotal + tipCents / 100).toFixed(2)}
        </p>
      )}

      <input type="hidden" name="tipCents" value={tipCents} />
    </div>
  );
}
