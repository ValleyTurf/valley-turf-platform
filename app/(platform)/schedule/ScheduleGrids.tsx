"use client";

import { useState } from "react";
import Link from "next/link";
import type { GridDate, ScheduleVisit } from "./types";

function VisitDetailModal({
  visit,
  onClose,
}: {
  visit: ScheduleVisit;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            {visit.clientId ? (
              <Link
                href={`/customers/${encodeURIComponent(visit.clientId)}`}
                className="text-xl font-bold text-[#174734] hover:underline"
              >
                {visit.customerName} →
              </Link>
            ) : (
              <p className="text-xl font-bold text-[#174734]">
                {visit.customerName}
              </p>
            )}
            <span
              className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${visit.statusClasses}`}
            >
              {visit.statusLabel}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg border border-[#d9d4c6] px-2 py-1 text-xs font-bold text-[#6b705c] transition hover:bg-[#f7f6f1]"
          >
            ✕
          </button>
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
              Date of Service
            </dt>
            <dd className="mt-0.5">{visit.dateHeading}</dd>
          </div>

          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
              Service Time
            </dt>
            <dd className="mt-0.5">
              {visit.startTimeLabel}
              {visit.endTimeLabel ? ` – ${visit.endTimeLabel}` : ""}
              {visit.durationMinutes ? ` · ${visit.durationMinutes} min` : ""}
            </dd>
          </div>

          {visit.service && (
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                Service
              </dt>
              <dd className="mt-0.5">{visit.serviceLabel}</dd>
            </div>
          )}

          {visit.address && (
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                Address
              </dt>
              <dd className="mt-0.5">{visit.address}</dd>
            </div>
          )}

          {visit.phone && (
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                Phone
              </dt>
              <dd className="mt-0.5">
                <a
                  href={`tel:${visit.phone.replace(/[^\d+]/g, "")}`}
                  className="font-semibold text-[#9c7a20] hover:underline"
                >
                  {visit.phone}
                </a>
              </dd>
            </div>
          )}

          {visit.gateCode && (
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                Gate Code
              </dt>
              <dd className="mt-0.5">{visit.gateCode}</dd>
            </div>
          )}

          {visit.specialInstructions && (
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                Special Instructions
              </dt>
              <dd className="mt-0.5 whitespace-pre-wrap">
                {visit.specialInstructions}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

export default function ScheduleGrids({
  view,
  dates,
  visitsByDate,
}: {
  view: "week" | "month";
  dates: GridDate[];
  visitsByDate: Record<string, ScheduleVisit[]>;
}) {
  const [selected, setSelected] = useState<ScheduleVisit | null>(null);

  if (view === "week") {
    return (
      <>
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
                          onClick={() => setSelected(visit)}
                          className="flex w-full items-center gap-1.5 text-left text-xs"
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

        {selected && (
          <VisitDetailModal visit={selected} onClose={() => setSelected(null)} />
        )}
      </>
    );
  }

  const weekdayHeaders = dates.slice(0, 7);

  return (
    <>
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
                          onClick={() => setSelected(visit)}
                          title={`${visit.serviceLabel} — ${visit.customerName}`}
                          className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-semibold leading-tight transition hover:brightness-95 ${visit.serviceChipClass}`}
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

      {selected && (
        <VisitDetailModal visit={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
