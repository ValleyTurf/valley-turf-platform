"use client";

import { useState } from "react";

// Preset ranges for properties nobody's measured exactly — kept as plain
// strings (not a min/max pair) since they're stored verbatim in
// customers.turf_size_range and only ever displayed, never computed with.
const RANGE_OPTIONS = [
  "<300",
  "300-500",
  "500-750",
  "750-1000",
  "1000-1250",
  "1250-1500",
  "1500-1750",
  "1750-2000",
  "2000-2250",
  "2250-2500",
  "2500-2750",
  "2750-3000",
  ">3000",
];

const inputClasses =
  "mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20";

// Only one of turf_size_range / turf_size_sqft is ever rendered into the
// form at a time (mode toggles which), so submitting always clears
// whichever column the mode isn't set to — see updateCustomerProfile's
// comment in actions.ts for why that's intentional. Needs to be a client
// component for the mode toggle itself; the rest of the Property Profile
// form around it stays a plain server-rendered form with no other JS.
export default function TurfSizeField({
  initialRange,
  initialExact,
}: {
  initialRange: string | null;
  initialExact: number | string | null;
}) {
  const hasExact = initialExact !== null && initialExact !== "";
  const [mode, setMode] = useState<"range" | "exact">(
    hasExact ? "exact" : "range"
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-[#9c7a20]">
          Turf Size
        </label>

        <div className="flex overflow-hidden rounded-lg border border-[#d9d4c6] text-[10px] font-bold">
          <button
            type="button"
            onClick={() => setMode("range")}
            className={`px-2 py-1 transition ${
              mode === "range"
                ? "bg-[#174734] text-white"
                : "bg-white text-[#6b705c] hover:bg-[#f7f6f1]"
            }`}
          >
            Range
          </button>
          <button
            type="button"
            onClick={() => setMode("exact")}
            className={`px-2 py-1 transition ${
              mode === "exact"
                ? "bg-[#174734] text-white"
                : "bg-white text-[#6b705c] hover:bg-[#f7f6f1]"
            }`}
          >
            Exact
          </button>
        </div>
      </div>

      {mode === "range" ? (
        <select
          name="turf_size_range"
          defaultValue={initialRange ?? ""}
          className={`${inputClasses} bg-white`}
        >
          <option value="">Not set</option>
          {RANGE_OPTIONS.map((range) => (
            <option key={range} value={range}>
              {range} sq ft
            </option>
          ))}
        </select>
      ) : (
        <input
          type="number"
          name="turf_size_sqft"
          min="0"
          defaultValue={initialExact ?? ""}
          placeholder="e.g. 1450"
          className={inputClasses}
        />
      )}
    </div>
  );
}
