export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { groupByService, TURF_SIZE_RANGES, type ServicePriceRow } from "@/lib/servicePricing";
import PricingGrid, { type PricingGroup } from "./PricingGrid";

type ServicePricingRow = {
  service_name: string;
  turf_size_range: string;
  price: number | string;
};

export default async function ServicePricingPage() {
  const { data, error } = await supabaseServer
    .from("service_pricing")
    .select("service_name, turf_size_range, price")
    .order("service_name", { ascending: true });

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
      </div>
    </main>
  );
}
