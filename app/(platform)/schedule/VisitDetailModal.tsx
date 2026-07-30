"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { AssignableUser, ScheduleVisit } from "./types";
import { phoenixDateTimeParts } from "./timeHelpers";
import { rescheduleVisit, skipVisit, assignVisit } from "./actions";

export default function VisitDetailModal({
  visit,
  onClose,
  canAssign,
  assignableUsers,
}: {
  visit: ScheduleVisit;
  onClose: () => void;
  canAssign: boolean;
  assignableUsers: AssignableUser[];
}) {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const [error, setError] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  const startParts = phoenixDateTimeParts(visit.startAtIso);
  const endParts = phoenixDateTimeParts(visit.endAtIso);

  const [date, setDate] = useState(startParts.date);
  const [startTime, setStartTime] = useState(startParts.time);
  const [endTime, setEndTime] = useState(endParts.time);

  function handleAssignChange(userId: string) {
    setAssignError(null);
    startTransition(async () => {
      const result = await assignVisit(visit.id, userId || null);

      if (result.error) {
        setAssignError(result.error);
      }
    });
  }

  function handleReschedule() {
    setError(null);
    startTransition(async () => {
      const result = await rescheduleVisit(
        visit.id,
        date,
        startTime || null,
        endTime || null
      );

      if (result.error) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  }

  function handleSkip() {
    if (
      !confirm(
        `Skip this visit for ${visit.customerName} on ${visit.dateHeading}? This deletes just this one occurrence in Jobber — the rest of the recurring schedule is untouched. Can't be undone from here.`
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await skipVisit(visit.id);

      if (result.error) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  }

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

          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
              Assigned To
            </dt>
            {canAssign ? (
              <dd className="mt-0.5">
                <select
                  value={visit.assignedUserId ?? ""}
                  onChange={(e) => handleAssignChange(e.target.value)}
                  disabled={isPending}
                  className="w-full rounded-lg border border-[#d9d4c6] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 disabled:opacity-60"
                >
                  <option value="">Unassigned</option>
                  {assignableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
                {assignError && (
                  <p className="mt-1 text-xs font-semibold text-red-600">
                    {assignError}
                  </p>
                )}
              </dd>
            ) : (
              <dd className="mt-0.5">
                {visit.assignedUserName ?? "Unassigned"}
              </dd>
            )}
          </div>

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

        <div className="mt-5 border-t border-[#eee9dc] pt-4">
          {mode === "view" ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode("reschedule")}
                className="rounded-xl border border-[#174734] px-4 py-2 text-sm font-bold transition hover:bg-[#f7f6f1]"
              >
                Reschedule
              </button>

              <button
                type="button"
                onClick={handleSkip}
                disabled={isPending}
                className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
              >
                Skip This Visit
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                Reschedule This Visit
              </p>

              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="text-xs font-semibold text-[#6b705c]">
                    Date
                  </span>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-2 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-[#6b705c]">
                    Start
                  </span>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-2 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-[#6b705c]">
                    End
                  </span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-2 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                  />
                </label>
              </div>

              <p className="text-xs text-[#6b705c]">
                Only moving the date? Leave Start/End alone — they&apos;re
                prefilled with the current time.
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReschedule}
                  disabled={isPending || !date}
                  className="rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
                >
                  {isPending ? "Saving…" : "Save New Time"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode("view");
                    setError(null);
                  }}
                  className="rounded-xl border border-[#d9d4c6] px-4 py-2 text-sm font-bold transition hover:bg-[#f7f6f1]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
