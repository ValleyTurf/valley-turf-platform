"use client";

import Link from "next/link";
import type { GridDate, ScheduleVisit } from "./types";

export default function ScheduleGrids({
  view,
  dates,
  visitsByDate,
  selectedId,
  onSelectVisit,
}: {
  view: "week" | "month";
  dates: GridDate[];
  visitsByDate: Record<string, ScheduleVisit[]>;
  selectedId: string | null;
  onSelectVisit: (visit: ScheduleVisit) => void;
}) {
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
                    {visibleVisits.map((visit) => (
                      <button
                        key={visit.id}
                        type="button"
                        onClick={() => onSelectVisit(visit)}
                        className={`flex w-full items-center gap-1.5 rounded text-left text-xs ${
                          visit.id === selectedId
                            ? "ring-2 ring-[#d4af37]"
                            : ""
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${visit.statusDotClass}`}
                        />
                        <span className="truncate hover:underline">
                          {visit.startTimeLabel} · {visit.customerName}
                        </span>
                      </button>
                    ))}
                    {remaining > 0 && (
                      <p className="text-xs font-semibold text-[#9c7a20]">
                        +{remaining} more
                      </p>
                    )}
                  </>
                )}
              </div>
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

              return (
                <div
                  key={day.dateStr}
                  className={`min-h-[92px] border-b border-r border-[#eee9dc] p-2 ${
                    day.inMonth ? "bg-white" : "bg-[#faf9f5]"
                  }`}
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
                    {dayVisits.map((visit) => (
                      <button
                        key={visit.id}
                        type="button"
                        onClick={() => onSelectVisit(visit)}
                        title={`${visit.serviceLabel} — ${visit.customerName}`}
                        className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-semibold leading-tight transition hover:brightness-95 ${
                          visit.serviceChipClass
                        } ${
                          visit.id === selectedId
                            ? "ring-2 ring-[#174734]"
                            : ""
                        }`}
                      >
                        {visit.startTimeLabel} {visit.customerName}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
