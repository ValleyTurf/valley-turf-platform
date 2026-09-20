"use client";

// Small generic timeframe <select> for the Profitability panel in the
// customer page header -- pushes the chosen value onto the URL as
// ?profitRange=... via router.push rather than a full page reload, same
// "stay put, just refresh the data" goal as the Link-based pill buttons
// on job-costing-analytics/page.tsx, just a <select> instead since this
// panel is a narrow header sidebar, not a full-width filter bar.
import { useRouter, usePathname } from "next/navigation";

export default function ProfitTimeframePicker({
  current,
  options,
}: {
  current: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <select
      value={current}
      onChange={(event) => {
        const params = new URLSearchParams(window.location.search);
        params.set("profitRange", event.target.value);
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      }}
      className="rounded-lg border border-[#d9d4c6] bg-white px-2 py-1 text-xs font-bold text-[#174734] outline-none focus:border-[#d4af37]"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
