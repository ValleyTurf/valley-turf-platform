export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { groupByService, TURF_SIZE_RANGES, type ServicePriceRow } from "@/lib/servicePricing";
import { groupIncludedItems, type IncludedItemRow } from "@/lib/serviceIncludedItems";
import PricingGrid, { type PricingGroup } from "./PricingGrid";
import IncludedItemsGrid, { type IncludedItemsGroup } from "./IncludedItemsGrid";

type ServicePricingRow = {
  service_name: string;
  turf_size_range: string;
  price: number | string;
};

type IncludedItemsQueryRow = {
  service_name: string;
  item: string;
  sort_order: number;
};

export default async function ServicePricingPage() {
  const [pricingResult, includedItemsResult] = await Promise.all([
    supabaseServer
      .from("service_pricing")
      .select("service_name, turf_size_range, price")
      .order("service_name", { ascending: true }),
    supabaseServer
      .from("service_included_items")
      .select("service_name, item, sort_order")
      .order("service_name", { ascending: true }),
  ]);

  const { data, error } = pricingResult;

  const rows: ServicePriceRow[] = ((data ?? []) as ServicePricingRow[]).map((row) => ({
    serviceName: row.service_name,
    turfSizeRange: row.turf_size_range,
    price: Number(row.price),
  }));

  const grouped = groupByService(rows);

  const initialGroups: PricingGroup[] = Array.from(grouped.entries()).map(
    ([serviceName, priceMap]) => {
      const prices: Record<string, string> = {};
      for (const range of TURF_SIZE_RANGES) {
        const value = priceMap.get(range);
        prices[range] = value !== undefined ? String(value) : "";
      }
      return { serviceName, prices };
    }
  );

  const includedItemRows: IncludedItemRow[] = ((includedItemsResult.data ??
    []) as IncludedItemsQueryRow[]).map((row) => ({
    serviceName: row.service_name,
    item: row.item,
    sortOrder: row.sort_order,
  }));

  const groupedItems = groupIncludedItems(includedItemRows);
  const initialItemGroups: IncludedItemsGroup[] = Array.from(
    groupedItems.entries()
  ).map(([serviceName, items]) => ({ serviceName, items }));

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Service Pricing
            </h1>
            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Set a price for each service at each turf size range. The New
              Quote form uses this to suggest a price automatically once a
              customer&apos;s turf size and the service being quoted are both
              known — you can always override it before sending.
            </p>
          </div>

          <Link
            href="/quotes"
            className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
          >
            Back to Quotes
          </Link>
        </header>

        {error && (
          <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800 shadow-sm">
            <p className="font-bold">Couldn&apos;t load pricing</p>
            <p className="mt-1 text-sm">{error.message}</p>
          </section>
        )}

        <section className="mt-6">
          <PricingGrid initialGroups={initialGroups} />

          {initialGroups.length === 0 && (
            <p className="mt-2 text-sm text-[#6b705c]">
              No services priced yet — add one above to get started.
            </p>
          )}
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold">What&apos;s Included</h2>
          <p className="mt-2 max-w-2xl text-[#6b705c]">
            The bulleted list each service shows on a flat-price quote —
            e.g. &quot;Full Cleaning&quot; lists Turf Fluff Up, Edge
            Cleaning, and so on. The same list for every turf size; only
            the price above changes with size.
          </p>

          <div className="mt-6">
            <IncludedItemsGrid initialGroups={initialItemGroups} />

            {initialItemGroups.length === 0 && (
              <p className="mt-2 text-sm text-[#6b705c]">
                No included-items lists set yet — add one above to get
                started.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
