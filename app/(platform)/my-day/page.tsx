export const dynamic = "force-dynamic";
export const revalidate = 0;

// Stripped-down, mobile-first view for field crew: today's stops in the
// order they happen, with just what someone standing at a truck needs —
// time, customer, gate code, special instructions, and a one-tap link to
// navigate there. Deliberately NOT the full /schedule page (that's a
// desktop-oriented multi-view calendar with a map panel meant for office
// use) — this is read-only, no filters, no view switcher, just "what's
// next." Lives under app/(platform) like everything else, so it's
// automatically login-gated by that layout; it has no entry in
// lib/permissionRules.ts's SECTION_PREFIXES, so (same as /schedule) every
// role including staff can reach it without any new permission plumbing.
import { Fragment } from "react";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { haversineMiles } from "@/lib/geoDistance";
import { computeRouteLegs, HOME_BASE_ADDRESS } from "@/lib/googleRoutes";
import { completeVisit, saveVisitJobCostQuickEntry } from "./actions";
import VisitTimer from "./VisitTimer";

// Fixed, curated subset of materials/equipment shown right on the crew
// card — not the full Materials & Costs list (that stays on the
// dedicated /job-costs page, along with manager-only fields like mileage
// and fuel). Looked up by name rather than hardcoded IDs, so nothing
// breaks if these get recreated with a new point-in-time row (see
// /materials' end_date rollover) — a name just has to keep matching.
const QUICK_ENTRY_MATERIALS = ["Infill", "OxyTurf"];
const QUICK_ENTRY_EQUIPMENT = ["Blower", "Power Broom", "Turf Vacuum"];

// Must match the identical transform in ./actions.ts's
// saveVisitJobCostQuickEntry — kept as two independent copies rather
// than a shared import since actions.ts is "use server" and can only
// export async functions (see the commit that fixed the Vercel build
// for exporting a plain constant from a 'use server' file).
function quickEntryFieldKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "_");
}

type MyDayPageProps = {
  searchParams: Promise<{ date?: string }>;
};

type VisitRow = {
  jobber_visit_id: string;
  jobber_client_id: string | null;
  customer_name: string | null;
  title: string | null;
  visit_status: string | null;
  start_at: string | null;
  end_at: string | null;
};

type CustomerContact = {
  jobber_client_id: string;
  phone: string | null;
  address_line_1: string | null;
  city: string | null;
  state: string | null;
  gate_code: string | null;
  service_instructions: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
};

type VisitAssignmentRow = {
  jobber_visit_id: string;
  assigned_user_id: string;
};

type UserRow = {
  id: string;
  name: string;
};

type TimeLogRow = {
  id: string;
  jobber_visit_id: string;
  started_at: string;
  stopped_at: string | null;
};

type QuickEntryMaterial = {
  id: string;
  name: string;
  unit_label: string;
};

type QuickEntryEquipment = {
  id: string;
  name: string;
};

type MaterialUsageRow = {
  jobber_visit_id: string;
  material_id: string;
  quantity_used: number | string;
};

type EquipmentUsageRow = {
  jobber_visit_id: string;
  equipment_id: string;
};

function getPhoenixToday(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((p) => p.type === "year")?.value ?? 0);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 1);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? 1);

  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function parseDate(value: string | undefined): Date {
  if (value) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return getPhoenixToday();
}

function formatDateHeading(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatTime(value: string | null): string {
  if (!value) return "Unscheduled";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unscheduled";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusMeta(status: string | null): { label: string; classes: string } {
  const normalized = (status ?? "").toUpperCase();

  if (normalized === "COMPLETED") {
    return { label: "Done", classes: "bg-green-100 text-green-800" };
  }
  if (normalized === "LATE") {
    return { label: "Late", classes: "bg-red-100 text-red-800" };
  }
  if (normalized === "UPCOMING") {
    return { label: "Upcoming", classes: "bg-blue-100 text-blue-800" };
  }

  return { label: status || "Unknown", classes: "bg-gray-100 text-gray-700" };
}

// Same "{Customer} - {Service}" convention used on /schedule — strip the
// leading customer segment so the card doesn't repeat the customer name
// twice.
function visitServiceLabel(title: string | null): string | null {
  const trimmed = (title ?? "").trim();
  if (!trimmed) return null;

  const separatorIndex = trimmed.indexOf(" - ");
  if (separatorIndex === -1) return trimmed;

  const service = trimmed.slice(separatorIndex + 3).trim();
  return service || trimmed;
}

type NavigateLinks = { google: string; apple: string; waze: string };

// Three separate map links instead of one — crews carry a mix of iPhone
// and Android, and everyone has their own preferred app regardless.
// Each service's own "universal link" scheme is used so it opens the
// installed app directly when there is one, falling back to that
// service's website otherwise. Coordinates are preferred when the
// customer record has them (more reliable than an address string); the
// address is the fallback for the (hopefully rare) contact missing
// lat/lng.
function navigateLinks(contact: CustomerContact | null): NavigateLinks | null {
  if (!contact) return null;

  const coords = contactLatLng(contact);
  const address = [contact.address_line_1, contact.city, contact.state]
    .filter(Boolean)
    .join(", ");

  if (!coords && !address) return null;

  if (coords) {
    const { lat, lng } = coords;
    return {
      google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
      apple: `https://maps.apple.com/?daddr=${lat},${lng}`,
      waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
    };
  }

  const encoded = encodeURIComponent(address);
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
    apple: `https://maps.apple.com/?daddr=${encoded}`,
    waze: `https://waze.com/ul?q=${encoded}&navigate=yes`,
  };
}

type LatLng = { lat: number; lng: number };

function contactLatLng(contact: CustomerContact | null): LatLng | null {
  if (!contact) return null;

  const lat = contact.latitude != null ? Number(contact.latitude) : NaN;
  const lng = contact.longitude != null ? Number(contact.longitude) : NaN;

  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function formatMiles(miles: number): string {
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

export default async function MyDayPage({ searchParams }: MyDayPageProps) {
  const params = await searchParams;
  const selectedDate = parseDate(params.date);
  const dateStr = formatDateInput(selectedDate);

  const today = getPhoenixToday();
  const todayStr = formatDateInput(today);
  const isToday = dateStr === todayStr;

  const queryStart = `${dateStr}T00:00:00-07:00`;
  const queryEnd = `${dateStr}T23:59:59-07:00`;

  const [{ data, error }, currentUser] = await Promise.all([
    supabaseServer
      .from("jobber_visits")
      .select(
        "jobber_visit_id, jobber_client_id, customer_name, title, visit_status, start_at, end_at"
      )
      .gte("start_at", queryStart)
      .lte("start_at", queryEnd)
      .order("start_at", { ascending: true }),
    getCurrentUser(),
  ]);

  const allVisits = (data ?? []) as VisitRow[];

  const clientIds = Array.from(
    new Set(allVisits.map((v) => v.jobber_client_id).filter(Boolean))
  ) as string[];

  const visitIds = allVisits.map((v) => v.jobber_visit_id);

  const [
    { data: contactsData },
    { data: assignmentsData },
    { data: usersData },
    { data: timeLogsData },
    { data: myActiveTimer },
  ] = await Promise.all([
    clientIds.length > 0
      ? supabaseServer
          .from("customers")
          .select(
            "jobber_client_id, phone, address_line_1, city, state, gate_code, service_instructions, latitude, longitude"
          )
          .in("jobber_client_id", clientIds)
      : Promise.resolve({ data: [] as CustomerContact[] }),
    visitIds.length > 0
      ? supabaseServer
          .from("visit_assignments")
          .select("jobber_visit_id, assigned_user_id")
          .in("jobber_visit_id", visitIds)
      : Promise.resolve({ data: [] as VisitAssignmentRow[] }),
    supabaseServer.from("users").select("id, name"),
    visitIds.length > 0
      ? supabaseServer
          .from("visit_time_logs")
          .select("id, jobber_visit_id, started_at, stopped_at")
          .in("jobber_visit_id", visitIds)
      : Promise.resolve({ data: [] as TimeLogRow[] }),
    currentUser
      ? supabaseServer
          .from("visit_time_logs")
          .select("id, jobber_visit_id, started_at")
          .eq("user_id", currentUser.id)
          .is("stopped_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null as { id: string; jobber_visit_id: string; started_at: string } | null }),
  ]);

  const contactMap = new Map<string, CustomerContact>(
    ((contactsData ?? []) as CustomerContact[]).map((c) => [c.jobber_client_id, c])
  );

  const userNameById = new Map<string, string>(
    ((usersData ?? []) as UserRow[]).map((u) => [u.id, u.name])
  );

  const assignedNamesByVisit = new Map<string, string[]>();
  const assignedIdsByVisit = new Map<string, Set<string>>();
  for (const row of (assignmentsData ?? []) as VisitAssignmentRow[]) {
    if (!assignedIdsByVisit.has(row.jobber_visit_id)) {
      assignedIdsByVisit.set(row.jobber_visit_id, new Set());
      assignedNamesByVisit.set(row.jobber_visit_id, []);
    }

    assignedIdsByVisit.get(row.jobber_visit_id)!.add(row.assigned_user_id);

    const name = userNameById.get(row.assigned_user_id);
    if (name) {
      assignedNamesByVisit.get(row.jobber_visit_id)!.push(name);
    }
  }

  // Total logged minutes per visit, from every finished (stopped_at set)
  // time segment regardless of who logged it — running segments don't
  // count toward this total (that's what the live ticking display in
  // VisitTimer is for).
  const loggedMinutesByVisit = new Map<string, number>();
  for (const log of (timeLogsData ?? []) as TimeLogRow[]) {
    if (!log.stopped_at) continue;

    const startMs = new Date(log.started_at).getTime();
    const stopMs = new Date(log.stopped_at).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(stopMs) || stopMs < startMs) continue;

    const minutes = (stopMs - startMs) / 60000;
    loggedMinutesByVisit.set(
      log.jobber_visit_id,
      (loggedMinutesByVisit.get(log.jobber_visit_id) ?? 0) + minutes
    );
  }

  // Quick job-cost entry: a fixed, curated subset of materials/equipment
  // (see QUICK_ENTRY_MATERIALS/QUICK_ENTRY_EQUIPMENT above), looked up
  // by name rather than assumed to exist — if they haven't been set up
  // yet in Materials & Costs, this section just doesn't render rather
  // than crashing or showing a blank/broken field.
  const [{ data: quickMaterialsData }, { data: quickEquipmentData }] =
    await Promise.all([
      supabaseServer
        .from("materials")
        .select("id, name, unit_label")
        .in("name", QUICK_ENTRY_MATERIALS)
        .or(`end_date.is.null,end_date.gt.${dateStr}`),
      supabaseServer
        .from("equipment")
        .select("id, name")
        .in("name", QUICK_ENTRY_EQUIPMENT)
        .or(`retired_date.is.null,retired_date.gt.${dateStr}`),
    ]);

  const quickMaterials = (quickMaterialsData ?? []) as QuickEntryMaterial[];
  const quickEquipment = (quickEquipmentData ?? []) as QuickEntryEquipment[];

  const quickMaterialIds = quickMaterials.map((m) => m.id);
  const quickEquipmentIds = quickEquipment.map((e) => e.id);

  const [{ data: quickUsageData }, { data: quickEquipmentUsageData }] =
    await Promise.all([
      quickMaterialIds.length > 0 && visitIds.length > 0
        ? supabaseServer
            .from("visit_material_usage")
            .select("jobber_visit_id, material_id, quantity_used")
            .in("jobber_visit_id", visitIds)
            .in("material_id", quickMaterialIds)
        : Promise.resolve({ data: [] as MaterialUsageRow[] }),
      quickEquipmentIds.length > 0 && visitIds.length > 0
        ? supabaseServer
            .from("visit_equipment_usage")
            .select("jobber_visit_id, equipment_id")
            .in("jobber_visit_id", visitIds)
            .in("equipment_id", quickEquipmentIds)
        : Promise.resolve({ data: [] as EquipmentUsageRow[] }),
    ]);

  const quickUsageMap = new Map<string, number>();
  for (const row of (quickUsageData ?? []) as MaterialUsageRow[]) {
    quickUsageMap.set(
      `${row.jobber_visit_id}:${row.material_id}`,
      Number(row.quantity_used ?? 0)
    );
  }

  const quickEquipmentUsageSet = new Set<string>();
  for (const row of (quickEquipmentUsageData ??
    []) as EquipmentUsageRow[]) {
    quickEquipmentUsageSet.add(`${row.jobber_visit_id}:${row.equipment_id}`);
  }

  // The current user's one active (if any) timer — global, not scoped
  // to today, since it's possible they started it on a visit that isn't
  // on today's list. See the banner below the header for that case.
  const activeTimer = myActiveTimer as {
    id: string;
    jobber_visit_id: string;
    started_at: string;
  } | null;
  const activeTimerVisitIsToday =
    activeTimer && allVisits.some((v) => v.jobber_visit_id === activeTimer.jobber_visit_id);

  let activeTimerElsewhereCustomer: string | null = null;
  if (activeTimer && !activeTimerVisitIsToday) {
    const { data: elsewhereVisit } = await supabaseServer
      .from("jobber_visits")
      .select("customer_name")
      .eq("jobber_visit_id", activeTimer.jobber_visit_id)
      .maybeSingle();
    activeTimerElsewhereCustomer = elsewhereVisit?.customer_name ?? "another visit";
  }

  // Crew (staff) only ever see stops they're personally assigned to —
  // managers/admins keep seeing everything, same split as who's allowed
  // to edit assignments on /schedule. A staff member with nothing
  // assigned still sees the "nothing on the books" empty state, just
  // worded to distinguish "nothing assigned to you" from "nothing
  // scheduled at all" (see totalScheduledCount below).
  const isCrewOnly = currentUser?.role === "staff";
  const totalScheduledCount = allVisits.length;

  const visits =
    isCrewOnly && currentUser
      ? allVisits.filter((v) =>
          assignedIdsByVisit.get(v.jobber_visit_id)?.has(currentUser.id)
        )
      : allVisits;

  const doneCount = visits.filter(
    (v) => (v.visit_status ?? "").toUpperCase() === "COMPLETED"
  ).length;

  // Real driving distance/time between each consecutive stop, via
  // Google's Routes API (lib/googleRoutes.ts) when GOOGLE_ROUTES_API_KEY
  // is configured. Falls back to the straight-line haversineMiles()
  // estimate (lib/geoDistance.ts) per contiguous run of stops where the
  // real routing call isn't available (no key) or fails (network error,
  // Google API error) — grouped into "runs" of consecutive stops that
  // all have coordinates, since a real route can only be computed across
  // an unbroken chain, and one stop missing an address shouldn't take
  // out the estimate for the stops around it.
  const visitCoords: (LatLng | null)[] = visits.map((visit) => {
    const contact = visit.jobber_client_id
      ? contactMap.get(visit.jobber_client_id) ?? null
      : null;

    return contactLatLng(contact);
  });

  let runStart: number | null = null;
  const coordRuns: { start: number; end: number }[] = [];

  for (let i = 0; i < visitCoords.length; i++) {
    if (visitCoords[i]) {
      if (runStart === null) runStart = i;
    } else if (runStart !== null) {
      coordRuns.push({ start: runStart, end: i - 1 });
      runStart = null;
    }
  }
  if (runStart !== null) {
    coordRuns.push({ start: runStart, end: visitCoords.length - 1 });
  }

  // First/last stop that actually has coordinates — the crew's
  // real starting and ending point for the day's drive time, whatever
  // position they happen to be at in the (possibly gapped) list.
  const firstCoordIndex = visitCoords.findIndex((coord) => coord !== null);
  let lastCoordIndex = -1;
  for (let i = visitCoords.length - 1; i >= 0; i--) {
    if (visitCoords[i]) {
      lastCoordIndex = i;
      break;
    }
  }

  const [runResults, startingLeg, endingLeg] = await Promise.all([
    Promise.all(
      coordRuns
        .filter((run) => run.end > run.start)
        .map(async (run) => {
          const runCoords = visitCoords
            .slice(run.start, run.end + 1)
            .map((coord) => coord as LatLng);

          const legs = await computeRouteLegs(runCoords);

          return { run, runCoords, legs };
        })
    ),
    // Home -> first stop. No straight-line fallback here (unlike the
    // inter-stop legs above) since the home base is only ever given as
    // an address string, not coordinates — if Google's call fails, this
    // leg just isn't shown rather than guessing at a distance.
    firstCoordIndex !== -1
      ? computeRouteLegs([
          { address: HOME_BASE_ADDRESS },
          visitCoords[firstCoordIndex] as LatLng,
        ])
      : Promise.resolve(null),
    // Last stop -> home.
    lastCoordIndex !== -1
      ? computeRouteLegs([
          visitCoords[lastCoordIndex] as LatLng,
          { address: HOME_BASE_ADDRESS },
        ])
      : Promise.resolve(null),
  ]);

  const startingDriveMiles = startingLeg ? startingLeg[0].distanceMiles : null;
  const startingDriveMinutes = startingLeg
    ? startingLeg[0].durationMinutes
    : null;
  const endingDriveMiles = endingLeg ? endingLeg[0].distanceMiles : null;
  const endingDriveMinutes = endingLeg ? endingLeg[0].durationMinutes : null;

  const distanceToNext: (number | null)[] = new Array(visits.length).fill(
    null
  );
  const durationToNext: (number | null)[] = new Array(visits.length).fill(
    null
  );

  for (const { run, runCoords, legs } of runResults) {
    for (let i = run.start; i < run.end; i++) {
      const localIndex = i - run.start;

      if (legs) {
        distanceToNext[i] = legs[localIndex].distanceMiles;
        durationToNext[i] = legs[localIndex].durationMinutes;
      } else {
        const from = runCoords[localIndex];
        const to = runCoords[localIndex + 1];

        distanceToNext[i] = haversineMiles(from.lat, from.lng, to.lat, to.lng);
        durationToNext[i] = null;
      }
    }
  }

  let totalMiles = distanceToNext.reduce(
    (sum: number, miles) => sum + (miles ?? 0),
    0
  );
  let hasAnyDistance = distanceToNext.some((miles) => miles != null);
  let totalMinutes = durationToNext.reduce(
    (sum: number, minutes) => sum + (minutes ?? 0),
    0
  );
  let hasAnyDuration = durationToNext.some((minutes) => minutes != null);

  // Fold the home commute legs into the day's total — they only ever
  // exist as a matched (real distance + real duration) pair, since
  // there's no straight-line fallback for them, so adding them never
  // disturbs the "is everything real" check below.
  if (startingDriveMiles != null) {
    totalMiles += startingDriveMiles;
    hasAnyDistance = true;
  }
  if (startingDriveMinutes != null) {
    totalMinutes += startingDriveMinutes;
    hasAnyDuration = true;
  }
  if (endingDriveMiles != null) {
    totalMiles += endingDriveMiles;
    hasAnyDistance = true;
  }
  if (endingDriveMinutes != null) {
    totalMinutes += endingDriveMinutes;
    hasAnyDuration = true;
  }

  // True only when every leg that has a distance also has a real
  // duration — i.e. nothing fell back to the straight-line estimate.
  // Computed after folding in the commute legs above, since those alone
  // can flip hasAnyDistance to true on a single-stop day.
  const allDistancesAreReal =
    hasAnyDistance &&
    distanceToNext.every(
      (miles, i) => miles == null || durationToNext[i] != null
    );

  const prevHref = `/my-day?date=${formatDateInput(addDays(selectedDate, -1))}`;
  const nextHref = `/my-day?date=${formatDateInput(addDays(selectedDate, 1))}`;
  const todayHref = `/my-day?date=${todayStr}`;

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-5 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
          Valley Turf Revival OS
        </p>

        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">My Day</h1>
        {isCrewOnly && (
          <p className="text-xs font-semibold text-[#9c7a20]">
            Showing your assigned stops
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <Link
            href={prevHref}
            className="rounded-xl border border-[#174734] px-4 py-2.5 text-sm font-bold transition hover:bg-white"
          >
            ← Prev
          </Link>

          <div className="text-center">
            <p className="font-bold">{formatDateHeading(selectedDate)}</p>
            {!isToday && (
              <Link
                href={todayHref}
                className="text-xs font-semibold text-[#9c7a20] hover:underline"
              >
                Jump to today
              </Link>
            )}
          </div>

          <Link
            href={nextHref}
            className="rounded-xl border border-[#174734] px-4 py-2.5 text-sm font-bold transition hover:bg-white"
          >
            Next →
          </Link>
        </div>

        <p className="mt-3 text-sm text-[#6b705c]">
          {visits.length === 0
            ? "No stops scheduled."
            : `${visits.length} stop${visits.length === 1 ? "" : "s"} · ${doneCount} done`}
          {hasAnyDistance && (
            <span>
              {" "}
              · ~{formatMiles(totalMiles)}
              {hasAnyDuration
                ? ` · ~${Math.round(totalMinutes)} min drive time`
                : ""}{" "}
              today
              {allDistancesAreReal
                ? ""
                : hasAnyDuration
                  ? " (partly estimated)"
                  : " (straight-line)"}
            </span>
          )}
        </p>

        {activeTimerElsewhereCustomer && (
          <p className="mt-2 rounded-xl border border-[#d4af37] bg-[#fdf8ea] px-3 py-2 text-xs font-semibold text-[#9c7a20]">
            ⏱ Timer still running for {activeTimerElsewhereCustomer} on
            another day — stop it there before starting a new one.
          </p>
        )}

        {error ? (
          <section className="mt-5 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">Stops could not be loaded</p>
            <p className="mt-1 text-sm text-red-600">{error.message}</p>
          </section>
        ) : visits.length === 0 ? (
          <section className="mt-5 rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-[#6b705c]">
              {isCrewOnly && totalScheduledCount > 0
                ? "Nothing assigned to you today — check with a manager if that doesn't look right."
                : "Nothing on the books for this day."}
            </p>
          </section>
        ) : (
          <div className="mt-4 space-y-3">
            {startingDriveMiles != null && (
              <p className="text-center text-xs font-semibold text-[#9c7a20]">
                🏠 Drive from home: ~{formatMiles(startingDriveMiles)}
                {startingDriveMinutes != null
                  ? ` · ~${Math.round(startingDriveMinutes)} min`
                  : ""}
              </p>
            )}

            {visits.map((visit, index) => {
              const contact = visit.jobber_client_id
                ? contactMap.get(visit.jobber_client_id) ?? null
                : null;
              const badge = statusMeta(visit.visit_status);
              const service = visitServiceLabel(visit.title);
              const address = contact
                ? [contact.address_line_1, contact.city, contact.state]
                    .filter(Boolean)
                    .join(", ")
                : null;
              const navLinks = navigateLinks(contact);
              const milesToNext = distanceToNext[index];
              const minutesToNext = durationToNext[index];
              const assignedNames = assignedNamesByVisit.get(visit.jobber_visit_id) ?? [];
              // Crew already know they're on it (that's why it's on their
              // list) — the useful bit is who ELSE is coming. Managers/
              // admins see everyone regardless, so show the full list.
              const crewNote = isCrewOnly
                ? assignedNames.filter((name) => name !== currentUser?.name)
                : assignedNames;
              const isThisVisitActive =
                activeTimer?.jobber_visit_id === visit.jobber_visit_id;

              return (
                <Fragment key={visit.jobber_visit_id}>
                  <article className="rounded-2xl bg-white p-4 shadow">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-bold">
                        {formatTime(visit.start_at)}
                        {visit.end_at && (
                          <span className="text-sm font-semibold text-[#6b705c]">
                            {" "}
                            – {formatTime(visit.end_at)}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 font-semibold">
                        {visit.jobber_client_id && !isCrewOnly ? (
                          <Link
                            href={`/customers/${encodeURIComponent(
                              visit.jobber_client_id
                            )}`}
                            className="hover:underline"
                          >
                            {visit.customer_name || "Unnamed Customer"}
                          </Link>
                        ) : (
                          visit.customer_name || "Unnamed Customer"
                        )}
                      </p>
                      {service && (
                        <p className="text-xs text-[#6b705c]">{service}</p>
                      )}
                      {crewNote.length > 0 && (
                        <p className="mt-1 text-xs font-semibold text-[#9c7a20]">
                          {isCrewOnly ? "With " : "Assigned: "}
                          {crewNote.join(", ")}
                        </p>
                      )}
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${badge.classes}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {address && (
                    <p className="mt-3 text-sm text-[#6b705c]">{address}</p>
                  )}

                  {contact?.gate_code && (
                    <div className="mt-3 rounded-lg border border-[#d4af37] bg-[#fdf8ea] px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#9c7a20]">
                        Gate Code
                      </p>
                      <p className="text-sm font-bold">{contact.gate_code}</p>
                    </div>
                  )}

                  {contact?.service_instructions && (
                    <div className="mt-3 rounded-lg bg-[#f7f6f1] px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#6b705c]">
                        Instructions
                      </p>
                      <p className="text-sm">{contact.service_instructions}</p>
                    </div>
                  )}

                  {navLinks && (
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <a
                        href={navLinks.google}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl border border-[#174734] px-2 py-2.5 text-center text-xs font-bold transition hover:bg-[#f7f6f1]"
                      >
                        Google
                      </a>
                      <a
                        href={navLinks.apple}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl border border-[#174734] px-2 py-2.5 text-center text-xs font-bold transition hover:bg-[#f7f6f1]"
                      >
                        Apple
                      </a>
                      <a
                        href={navLinks.waze}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl border border-[#174734] px-2 py-2.5 text-center text-xs font-bold transition hover:bg-[#f7f6f1]"
                      >
                        Waze
                      </a>
                    </div>
                  )}

                  {contact?.phone && (
                    <div className="mt-2 flex gap-2">
                      <a
                        href={`sms:${contact.phone}`}
                        className="flex-1 rounded-xl bg-[#174734] px-4 py-2.5 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
                      >
                        Message
                      </a>
                      <a
                        href={`tel:${contact.phone}`}
                        className="flex-1 rounded-xl border border-[#174734] px-4 py-2.5 text-center text-sm font-bold transition hover:bg-[#f7f6f1]"
                      >
                        Call
                      </a>
                    </div>
                  )}

                  {(quickMaterials.length > 0 || quickEquipment.length > 0) && (
                    <form
                      action={saveVisitJobCostQuickEntry.bind(
                        null,
                        visit.jobber_visit_id
                      )}
                      className="mt-3 space-y-2 rounded-xl border border-[#174734]/15 bg-[#f7f6f1] p-3"
                    >
                      <p className="text-xs font-bold uppercase tracking-wide text-[#174734]/70">
                        Job Costs
                      </p>

                      {quickMaterials.length > 0 && (
                        <div className="grid grid-cols-2 gap-2">
                          {quickMaterials.map((material) => (
                            <label
                              key={material.id}
                              className="text-xs font-semibold text-[#174734]"
                            >
                              {material.name}
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                name={quickEntryFieldKey(material.name)}
                                defaultValue={
                                  quickUsageMap.get(
                                    `${visit.jobber_visit_id}:${material.id}`
                                  ) || ""
                                }
                                placeholder={material.unit_label ?? ""}
                                className="mt-1 w-full rounded-lg border border-[#174734]/20 px-2 py-1.5 text-sm"
                              />
                            </label>
                          ))}
                        </div>
                      )}

                      {quickEquipment.length > 0 && (
                        <div className="flex flex-wrap gap-3">
                          {quickEquipment.map((equipment) => (
                            <label
                              key={equipment.id}
                              className="flex items-center gap-1.5 text-xs font-semibold text-[#174734]"
                            >
                              <input
                                type="checkbox"
                                name={quickEntryFieldKey(equipment.name)}
                                value="1"
                                defaultChecked={quickEquipmentUsageSet.has(
                                  `${visit.jobber_visit_id}:${equipment.id}`
                                )}
                                className="h-4 w-4 rounded border-[#174734]/30"
                              />
                              {equipment.name}
                            </label>
                          ))}
                        </div>
                      )}

                      <button
                        type="submit"
                        className="w-full rounded-lg border border-[#174734] px-3 py-1.5 text-xs font-bold text-[#174734] transition hover:bg-white"
                      >
                        Save Job Costs
                      </button>
                    </form>
                  )}

                  {(visit.visit_status ?? "").toUpperCase() !== "COMPLETED" && (
                    <VisitTimer
                      visitId={visit.jobber_visit_id}
                      activeTimeLogId={isThisVisitActive ? activeTimer!.id : null}
                      activeStartedAt={isThisVisitActive ? activeTimer!.started_at : null}
                      loggedMinutes={loggedMinutesByVisit.get(visit.jobber_visit_id) ?? 0}
                    />
                  )}

                  {(visit.visit_status ?? "").toUpperCase() !== "COMPLETED" && (
                    <form action={completeVisit} className="mt-2">
                      <input
                        type="hidden"
                        name="visit_id"
                        value={visit.jobber_visit_id}
                      />
                      <button
                        type="submit"
                        className="w-full rounded-xl bg-[#d4af37] px-4 py-2.5 text-center text-sm font-bold text-[#174734] transition hover:bg-[#c49f2f]"
                      >
                        Mark Complete
                      </button>
                    </form>
                  )}
                  </article>

                  {milesToNext != null && (
                    <p className="py-1 text-center text-xs font-semibold text-[#9c7a20]">
                      🚗 ~{formatMiles(milesToNext)}
                      {minutesToNext != null
                        ? ` · ~${Math.round(minutesToNext)} min`
                        : ""}{" "}
                      to next stop
                      {minutesToNext == null ? " (straight-line)" : ""}
                    </p>
                  )}
                </Fragment>
              );
            })}

            {endingDriveMiles != null && (
              <p className="text-center text-xs font-semibold text-[#9c7a20]">
                🏠 Drive home: ~{formatMiles(endingDriveMiles)}
                {endingDriveMinutes != null
                  ? ` · ~${Math.round(endingDriveMinutes)} min`
                  : ""}
              </p>
            )}
          </div>
        )}

        {/* /schedule is behind general_access now, which staff don't
            have by default (see lib/permissionRules.ts) — pointing them
            at a link they can't use isn't useful, and just bounces them
            back to /my-day. */}
        {!isCrewOnly && (
          <Link
            href="/schedule"
            className="mt-6 block text-center text-sm font-semibold text-[#9c7a20] hover:underline"
          >
            View full schedule →
          </Link>
        )}
      </div>
    </main>
  );
}
