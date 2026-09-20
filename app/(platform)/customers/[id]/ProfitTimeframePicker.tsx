"use client";

// Small generic <select> for the Profitability panel in the customer
// page header -- pushes the chosen value onto the URL via router.push
// rather than a full page reload, same "stay put, just refresh the
// data" goal as the Link-based pill buttons on
// job-costing-analytics/page.tsx, just a <select> instead since this
// panel is a header sidebar, not a full-width filter bar.
//
// Despite the filename, this now backs both pickers in that panel (the
// timeframe select, paramName="profitRange", and the target-margin
// select added after, paramName="marginTarget") -- kept the original
// name rather than renaming the file/import to avoid orphaned-file
// churn for what's still a small page-local component, same reasoning
// CustomerContactsSection.tsx's own header comment gives for keeping
// its name after outgrowing it.
import { useRouter, usePathname } from "next/navigation";

export default function ProfitTimeframePicker({
  current,
  options,
  paramName,
}: {
  current: string;
  options: { value: string; label: string }[];
  paramName: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <select
      value={current}
      onChange={(event) => {
        const params = new URLSearchParams(window.location.search);
        params.set(paramName, event.target.value);
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
