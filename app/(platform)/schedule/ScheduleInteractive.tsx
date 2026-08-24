"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import ScheduleGrids from "./ScheduleGrids";
import ScheduleMapPanel from "./ScheduleMapPanel";
import VisitDetailModal from "./VisitDetailModal";
import { phoenixDateTimeParts } from "./timeHelpers";
import { rescheduleVisit } from "./actions";
import type { AssignableUser, GridDate, SchedulePin, ScheduleVisit } from "./types";

type ViewMode = "day" | "week" | "month";

// Owns the two pieces of state shared between the calendar (day list /
// week grid / month grid) and the map panel: which visit is clicked
// (selectedId — also opens the detail modal from week/month) and which
// one is merely hovered (hoveredId — highlights its pin on the map for
// a quick look without clicking into anything). The map highlights
// whichever of the two is active, hover taking priority while the mouse
// is over a row/chip, falling back to the click-selection once it
// isn't. The calendar/header markup above the grid stays server-rendered
// (passed in as `children`) since none of it needs this state.
export default function ScheduleInteractive({
  view,
  visits,
  weekDates,
  monthDates,
  visitsByDate,
  dailyTotals,
  pins,
  mapTitle,
  canAssign,
  assignableUsers,
  children,
}: {
  view: ViewMode;
  visits: ScheduleVisit[];
  weekDates: GridDate[];
  monthDates: GridDate[];
  visitsByDate: Record<string, ScheduleVisit[]>;
  dailyTotals: Record<string, number>;
  pins: SchedulePin[];
  mapTitle: string;
  canAssign: boolean;
  assignableUsers: AssignableUser[];
  children: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [dragError, setDragError] = useState<string | null>(null);

  const visitById = useMemo(
    () => new Map(visits.map((v) => [v.id, v])),
    [visits]
  );

  const selectedVisit = selectedId ? visitById.get(selectedId) ?? null : null;
  const highlightedId = hoveredId ?? selectedId;

  function selectOnly(id: string) {
    setSelectedId(id);
  }

  function selectAndOpen(visit: ScheduleVisit) {
    setSelectedId(visit.id);
    setModalOpen(true);
  }

  // Month-view drag-and-drop: dropping a visit chip onto a different day
  // cell moves just that one visit to the new date, keeping its existing
  // time-of-day (same rescheduleVisit action the detail modal's
  // Reschedule form uses — see that component for why it needs
  // Phoenix-local date/time strings rather than raw ISO timestamps).
  function handleDropVisit(visitId: string, newDateStr: string) {
    const visit = visitById.get(visitId);
    if (!visit || visit.dateStr === newDateStr) return;

    setDragError(null);

    const startParts = phoenixDateTimeParts(visit.startAtIso);
    const endParts = phoenixDateTimeParts(visit.endAtIso);

    startTransition(async () => {
      const result = await rescheduleVisit(
        visitId,
        newDateStr,
        startParts.time || null,
        endParts.time || null
      );

      if (result.error) {
        setDragError(
          `Couldn't move ${visit.customerName}'s visit: ${result.error}`
        );
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-[1600px] items-start gap-3">
      <div className="min-w-0 flex-1">
        {children}

        {dragError && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
            {dragError}
            <button
              type="button"
              onClick={() => setDragError(null)}
              className="shrink-0 text-red-700 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {view === "day" &&
          (visits.length === 0 ? (
            <section className="mt-6 rounded-2xl bg-white p-8 text-center shadow">
              <p className="text-[#6b705c]">No visits scheduled this day.</p>
            </section>
          ) : (
            <section className="mt-6 space-y-3">
              {visits.map((visit) => (
                <button
                  key={visit.id}
                  type="button"
                  onClick={() => selectOnly(visit.id)}
                  onMouseEnter={() => setHoveredId(visit.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`block w-full rounded-2xl bg-white p-5 text-left shadow transition ${
                    visit.id === selectedId ? "ring-2 ring-[#d4af37]" : ""
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xl font-bold">
                        {visit.startTimeLabel}
                        {visit.durationMinutes
                          ? ` · ${visit.durationMinutes} min`
                          : ""}
                      </p>

                      <p
                        className={`mt-1 flex items-center gap-1.5 text-lg font-semibold ${
                          visit.statusLabel === "Completed"
                            ? "text-[#6b705c] line-through"
                            : ""
                        }`}
                      >
                        {visit.statusLabel === "Completed" && (
                          <span className="text-green-600 no-underline">✓</span>
                        )}
                        {visit.customerName}
                      </p>

                      {visit.service && (
                        <p className="flex items-center gap-1.5 text-base text-[#6b705c]">
                          <span
                            className="inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: visit.serviceColorHex }}
                          />
                          {visit.serviceLabel}
                        </p>
                      )}

                      {visit.address && (
                        <p className="mt-1 text-base text-[#6b705c]">
                          {visit.address}
                        </p>
                      )}

                      {visit.phone && (
                        <a
                          href={`tel:${visit.phone.replace(/[^\d+]/g, "")}`}
                          onClick={(event) => event.stopPropagation()}
                          className="mt-1 inline-block text-base font-semibold text-[#9c7a20] hover:underline"
                        >
                          {visit.phone}
                        </a>
                      )}

                      {visit.gateCode && (
                        <p className="mt-1 text-base text-[#6b705c]">
                          <span className="font-semibold text-[#174734]">
                            Gate Code:
                          </span>{" "}
                          {visit.gateCode}
                        </p>
                      )}

                      {visit.specialInstructions && (
                        <p className="mt-1 whitespace-pre-wrap text-base text-[#6b705c]">
                          <span className="font-semibold text-[#174734]">
                            Special Instructions:
                          </span>{" "}
                          {visit.specialInstructions}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-sm font-bold ${visit.statusClasses}`}
                      >
                        {visit.statusLabel}
                      </span>

                      {visit.clientId && (
                        <Link
                          href={`/customers/${encodeURIComponent(visit.clientId)}`}
                          onClick={(event) => event.stopPropagation()}
                          className="text-base font-semibold text-[#9c7a20] hover:underline"
                        >
                          View Customer →
                        </Link>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </section>
          ))}

        {view !== "day" && (
          <ScheduleGrids
            view={view}
            dates={view === "week" ? weekDates : monthDates}
            visitsByDate={visitsByDate}
            dailyTotals={dailyTotals}
            selectedId={selectedId}
            onSelectVisit={selectAndOpen}
            onHoverVisit={setHoveredId}
            onDropVisit={handleDropVisit}
          />
        )}
      </div>

      <ScheduleMapPanel
        pins={pins}
        title={mapTitle}
        selectedId={highlightedId}
        onSelectPin={selectOnly}
      />

      {modalOpen && selectedVisit && (
        <VisitDetailModal
          visit={selectedVisit}
          onClose={() => setModalOpen(false)}
          canAssign={canAssign}
          assignableUsers={assignableUsers}
        />
      )}
    </div>
  );
}
