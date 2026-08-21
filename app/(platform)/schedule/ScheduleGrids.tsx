"use client";

import Link from "next/link";
import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { GridDate, ScheduleVisit } from "./types";

// Native HTML5 drag-and-drop data-transfer key for a dragged visit's id —
// month view only, per how this was scoped (week view stays click-only).
const VISIT_DRAG_TYPE = "application/x-vtr-visit-id";

// Small rounded-full $ badge dropped at the bottom of a day cell —
// shared between week and month layouts below rather than duplicated,
// and only rendered when there's a nonzero total so days with no priced
// visits (unscheduled/no linked job) don't show a "$0" badge.
function DailyTotalPill({ total }: { total: number }) {
  if (total <= 0) return null;

  return (
    <p className="mt-1.5 inline-block rounded-full bg-[#174734] px-2 py-0.5 text-xs font-bold text-white">
      {formatCurrency(total)}
    </p>
  );
}

export default function ScheduleGrids({
  view,
  dates,
  visitsByDate,
  dailyTotals,
  selectedId,
  onSelectVisit,
  onDropVisit,
}: {
  view: "week" | "month";
  dates: GridDate[];
  visitsByDate: Record<string, ScheduleVisit[]>;
  dailyTotals: Record<string, number>;
  selectedId: string | null;
  onSelectVisit: (visit: ScheduleVisit) => void;
  onDropVisit: (visitId: string, newDateStr: string) => void;
}) {
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  if (view === "week") {
    return (
      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-7">
        {dates.map((day) => {
          const dayVisits = visitsByDate[day.dateStr] ?? [];
          const visibleVisits = dayVisits.slice(0, 5);
          const remaining = dayVisits.length - visibleVisits.length;

          return (
            <div
              key={day.dateStr}
              className={`rounded-2xl bg-white p-3 shadow ${
                day.isToday ? "ring-2 ring-[#d4af37]" : ""
              }`}
            >
              <Link href={day.dayHref} className="block hover:underline">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#9c7a20]">
                  {day.weekdayShort}
                </p>
                <p className="text-lg font-bold">{day.dayNumber}</p>
              </Link>

              <div className="mt-2 space-y-1.5">
                {dayVisits.length === 0 ? (
                  <p className="text-xs text-[#6b705c]">No visits</p>
                ) : (
                  <>
                    {visibleVisits.map((visit) => {
                      const completed = visit.statusLabel === "Completed";

                      return (
                        <button
                          key={visit.id}
                          type="button"
                          onClick={() => onSelectVisit(visit)}
                          className={`flex w-full items-start gap-1.5 rounded text-left text-sm ${
                            visit.id === selectedId
                              ? "ring-2 ring-[#d4af37]"
                              : ""
                          }`}
                        >
                          <span
                            className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${visit.statusDotClass}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className={`flex items-center gap-1 truncate hover:underline ${
                                completed
                                  ? "text-[#6b705c] line-through"
                                  : ""
                              }`}
                            >
                              {completed && (
                                <span className="text-green-600 no-underline">
                                  ✓
                                </span>
                              )}
                              {visit.startTimeLabel} · {visit.customerName}
                            </span>
                            <span className="block truncate text-xs text-[#9c7a20]">
                              {visit.serviceLabel}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    {remaining > 0 && (
                      <p className="text-xs font-semibold text-[#9c7a20]">
                        +{remaining} more
                      </p>
                    )}
                  </>
                )}
              </div>

              <DailyTotalPill total={dailyTotals[day.dateStr] ?? 0} />
            </div>
          );
        })}
      </section>
    );
  }

  const weekdayHeaders = dates.slice(0, 7);

  return (
    <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow">
      <div className="overflow-x-auto">
        <div className="min-w-[840px]">
          <div className="grid grid-cols-7 border-b border-[#eee9dc] bg-[#f7f6f1]">
            {weekdayHeaders.map((day) => (
              <div
                key={day.weekdayShort}
                className="p-2 text-center text-xs font-bold uppercase tracking-wide text-[#9c7a20]"
              >
                {day.weekdayShort}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {dates.map((day) => {
              const dayVisits = day.inMonth
                ? visitsByDate[day.dateStr] ?? []
                : [];

              const isDragOver = day.inMonth && dragOverDate === day.dateStr;

              return (
                <div
                  key={day.dateStr}
                  onDragOver={(event) => {
                    if (!day.inMonth) return;
                    event.preventDefault();
                    if (dragOverDate !== day.dateStr) {
                      setDragOverDate(day.dateStr);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverDate === day.dateStr) setDragOverDate(null);
                  }}
                  onDrop={(event) => {
                    if (!day.inMonth) return;
                    event.preventDefault();
                    setDragOverDate(null);
                    const visitId = event.dataTransfer.getData(VISIT_DRAG_TYPE);
                    if (visitId) onDropVisit(visitId, day.dateStr);
                  }}
                  className={`min-h-[92px] border-b border-r border-[#eee9dc] p-2 transition ${
                    day.inMonth ? "bg-white" : "bg-[#faf9f5]"
                  } ${isDragOver ? "bg-[#fdf8ea] ring-2 ring-inset ring-[#d4af37]" : ""}`}
                >
                  <Link
                    href={day.dayHref}
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition hover:bg-[#f0eee6] ${
                      day.isToday
                        ? "bg-[#d4af37] text-[#174734]"
                        : day.inMonth
                          ? "text-[#174734]"
                          : "text-[#b5b09f]"
                    }`}
                  >
                    {day.dayNumber}
                  </Link>

                  <div className="mt-1 space-y-1">
                    {dayVisits.map((visit) => {
                      const completed = visit.statusLabel === "Completed";

                      return (
                        <button
                          key={visit.id}
                          type="button"
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData(
                              VISIT_DRAG_TYPE,
                              visit.id
                            );
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onClick={() => onSelectVisit(visit)}
                          title={`${visit.serviceLabel} — ${visit.customerName} (drag to move)`}
                          className={`block w-full cursor-grab truncate rounded px-1.5 py-0.5 text-left text-xs leading-tight transition hover:brightness-95 active:cursor-grabbing ${
                            visit.serviceChipClass
                          } ${
                            visit.id === selectedId
                              ? "ring-2 ring-[#174734]"
                              : ""
                          }`}
                        >
                          <span
                            className={`flex items-center gap-1 truncate font-semibold ${
                              completed ? "line-through opacity-70" : ""
                            }`}
                          >
                            {completed && <span className="no-underline">✓</span>}
                            {visit.startTimeLabel} {visit.customerName}
                          </span>
                          <span className="block truncate font-normal opacity-80">
                            {visit.serviceLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {day.inMonth && (
                    <DailyTotalPill total={dailyTotals[day.dateStr] ?? 0} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
