"use client";

// Client component for the interactive bits of /stripe-test (live tip
// math, selected-button styling) -- the page itself stays a server
// component that reads searchParams and passes the server action down.
// Tip is added as its own Checkout line item (see actions.ts /
// lib/stripeCheckout.ts), not a Stripe-native tip prompt -- Stripe's
// hosted Checkout has no built-in tipping field for online payments
// (that only exists on Terminal, the in-person card-reader product), so
// this is the standard workaround: compute the amount here, show it as
// a separate line before the customer ever leaves this page.
import { useMemo, useState } from "react";

const TIP_PRESETS = [15, 18, 20];

type TipMode = "none" | "custom" | (typeof TIP_PRESETS)[number];

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default function PaymentForm({
  action,
}: {
  action: (formData: FormData) => void;
}) {
  const [amount, setAmount] = useState("");
  const [tipMode, setTipMode] = useState<TipMode>("none");
  const [customTip, setCustomTip] = useState("");

  const amountCents = useMemo(() => {
    const parsed = Number(amount);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
  }, [amount]);

  const tipCents = useMemo(() => {
    if (tipMode === "none") return 0;

    if (tipMode === "custom") {
      const parsed = Number(customTip);
      return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
    }

    return Math.round((amountCents * tipMode) / 100);
  }, [tipMode, customTip, amountCents]);

  const totalCents = amountCents + tipCents;

  function tipButtonClass(active: boolean): string {
    return `rounded-xl border px-3 py-2 text-sm font-bold transition ${
      active
        ? "border-[#174734] bg-[#174734] text-white"
        : "border-[#d9d4c6] hover:bg-[#f7f6f1]"
    }`;
  }

  return (
    <form
      action={action}
      className="mt-5 space-y-4 rounded-2xl bg-white p-5 shadow"
    >
      <div>
        <label htmlFor="description" className="block text-sm font-bold">
          Description
        </label>
        <input
          id="description"
          name="description"
          type="text"
          required
          placeholder="e.g. Turf cleaning -- 123 Main St"
          className="mt-1 w-full rounded-xl border border-[#d9d4c6] px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="amount" className="block text-sm font-bold">
          Amount (USD)
        </label>
        <input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          min="0.50"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="150.00"
          className="mt-1 w-full rounded-xl border border-[#d9d4c6] px-3 py-2 text-sm"
        />
      </div>

      <div>
        <span className="block text-sm font-bold">Tip</span>

        <div className="mt-1 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTipMode("none")}
            className={tipButtonClass(tipMode === "none")}
          >
            No tip
          </button>

          {TIP_PRESETS.map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => setTipMode(pct)}
              className={tipButtonClass(tipMode === pct)}
            >
              {pct}%
            </button>
          ))}

          <button
            type="button"
            onClick={() => setTipMode("custom")}
            className={tipButtonClass(tipMode === "custom")}
          >
            Custom
          </button>
        </div>

        {tipMode === "custom" && (
          <input
            type="number"
            step="0.01"
            min="0"
            value={customTip}
            onChange={(event) => setCustomTip(event.target.value)}
            placeholder="Tip amount"
            className="mt-2 w-full rounded-xl border border-[#d9d4c6] px-3 py-2 text-sm"
          />
        )}
      </div>

      <input type="hidden" name="tipCents" value={tipCents} />

      <div className="rounded-xl bg-[#f5f4ef] px-3 py-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[#6b705c]">Service</span>
          <span>{formatCents(amountCents)}</span>
        </div>

        {tipCents > 0 && (
          <div className="flex justify-between">
            <span className="text-[#6b705c]">Tip</span>
            <span>{formatCents(tipCents)}</span>
          </div>
        )}

        <div className="mt-1 flex justify-between border-t border-[#e6e2d8] pt-1 font-bold">
          <span>Total</span>
          <span>{formatCents(totalCents)}</span>
        </div>
      </div>

      <button
        type="submit"
        className="w-full rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
      >
        Create Payment Link
      </button>
    </form>
  );
}
