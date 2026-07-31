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
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { completeVisit } from "./actions";
import VisitTimer from "./VisitTimer";

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

function navigateUrl(contact: CustomerContact | null): string | null {
  if (!contact) return null;

  const lat = contact.latitude != null ? Number(contact.latitude) : NaN;
  const lng = contact.longitude != null ? Number(contact.longitude) : NaN;

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }

  const address = [contact.address_line_1, contact.city, contact.state]
    .filter(Boolean)
    .join(", ");

  if (!address) return null;

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
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
            {visits.map((visit) => {
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
              const mapsHref = navigateUrl(contact);
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
                <article
                  key={visit.jobber_visit_id}
                  className="rounded-2xl bg-white p-4 shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-bold">
                        {formatTime(visit.start_at)}
                      </p>
                      <p className="mt-0.5 font-semibold">
                        {visit.customer_name || "Unnamed Customer"}
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

                  <div className="mt-4 flex gap-2">
                    {mapsHref && (
                      <a
                        href={mapsHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 rounded-xl bg-[#174734] px-4 py-2.5 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
                      >
                        Navigate
                      </a>
                    )}

                    {contact?.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="flex-1 rounded-xl border border-[#174734] px-4 py-2.5 text-center text-sm font-bold transition hover:bg-[#f7f6f1]"
                      >
                        Call
                      </a>
                    )}
                  </div>

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
              );
            })}
          </div>
        )}

        <Link
          href="/schedule"
          className="mt-6 block text-center text-sm font-semibold text-[#9c7a20] hover:underline"
        >
          View full schedule →
        </Link>
      </div>
    </main>
  );
}
