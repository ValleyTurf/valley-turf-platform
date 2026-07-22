export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseServer } from "@/lib/supabase-server";
import MapLoader from "./MapLoader";

export type MapCustomer = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  tier: "current" | "recent" | "past" | "no_service";
};

export type MapDoorHanger = {
  id: string;
  latitude: number;
  longitude: number;
  status: "door_hanger" | "lead";
  notes: string | null;
  droppedAt: string;
};

type CustomerRow = {
  jobber_client_id: string;
  full_name: string | null;
  latitude: number | null;
  longitude: number | null;
  last_job_at: string | null;
  total_completed_jobs: number | string | null;
};

function classifyCustomer(
  customer: CustomerRow,
  recurringIds: Set<string>
): MapCustomer["tier"] {
  if (recurringIds.has(customer.jobber_client_id)) {
    return "current";
  }

  const totalCompleted = Number(customer.total_completed_jobs ?? 0);

  if (totalCompleted === 0 || !customer.last_job_at) {
    return "no_service";
  }

  const daysSinceLastJob =
    (Date.now() - new Date(customer.last_job_at).getTime()) /
    (1000 * 60 * 60 * 24);

  return daysSinceLastJob <= 365 ? "recent" : "past";
}

export default async function CustomerMapPage() {
  const [customersResult, recurringResult, doorHangersResult] =
    await Promise.all([
      supabaseServer
        .from("customers")
        .select(
          "jobber_client_id, full_name, latitude, longitude, last_job_at, total_completed_jobs"
        )
        .not("latitude", "is", null)
        .not("longitude", "is", null),
      supabaseServer.from("recurring_customers").select("jobber_client_id"),
      supabaseServer.from("door_hanger_drops").select("*"),
    ]);

  const recurringIds = new Set(
    (recurringResult.data ?? []).map((row) => row.jobber_client_id)
  );

  const customers: MapCustomer[] = (
    (customersResult.data ?? []) as CustomerRow[]
  ).map((row) => ({
    id: row.jobber_client_id,
    name: row.full_name ?? "Unnamed Customer",
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    tier: classifyCustomer(row, recurringIds),
  }));

  const doorHangers: MapDoorHanger[] = (doorHangersResult.data ?? []).map(
    (row) => ({
      id: row.id,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      status: row.status,
      notes: row.notes,
      droppedAt: row.dropped_at,
    })
  );

  const tierCounts = {
    current: customers.filter((c) => c.tier === "current").length,
    recent: customers.filter((c) => c.tier === "recent").length,
    past: customers.filter((c) => c.tier === "past").length,
    no_service: customers.filter((c) => c.tier === "no_service").length,
  };

  return (
    <main className="flex min-h-screen flex-col bg-[#f5f4ef] p-8">
      <div className="mx-auto w-full max-w-7xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
          Valley Turf Revival OS
        </p>
        <h1 className="mt-2 text-4xl font-bold text-[#174734]">
          Customer Map
        </h1>

        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#16a34a]" />
            Current ({tierCounts.current})
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#f59e0b]" />
            Recent ({tierCounts.recent})
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#6b7280]" />
            Past ({tierCounts.past})
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#c9c3b3]" />
            No Service ({tierCounts.no_service})
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#9333ea]" />
            Door Hanger Hung
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#2563eb]" />
            Moved to Lead
          </span>
        </div>
      </div>

      <div className="mx-auto mt-6 h-[75vh] w-full max-w-7xl overflow-hidden rounded-3xl border border-[#e7e2d5] shadow">
        <MapLoader customers={customers} doorHangers={doorHangers} />
      </div>
    </main>
  );
}
