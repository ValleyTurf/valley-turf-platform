"use client";

import Link from "next/link";
import type { ScheduleVisit } from "./types";

export default function VisitDetailModal({
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
              <dd className="mt-0.5 flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: visit.serviceColorHex }}
                />
                {visit.serviceLabel}
              </dd>
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
