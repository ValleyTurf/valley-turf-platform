"use client";

// "When to charge" picker in the customer page's Autopay box (migration
// 105). A client island only so the day/days number field can appear
// for the two options that need one and so a save error shows inline --
// the choice itself is saved by updateAutopaySchedule in ./actions.
import { useState, useTransition } from "react";
import type { AutopayTiming } from "@/lib/autopayTiming";
import { updateAutopaySchedule } from "./actions";

export default function AutopayScheduleForm({
  jobberClientId,
  timing: initialTiming,
  dayOfMonth: initialDay,
  delayDays: initialDelay,
}: {
  jobberClientId: string;
  timing: AutopayTiming;
  dayOfMonth: number | null;
  delayDays: number | null;
}) {
  const [timing, setTiming] = useState<AutopayTiming>(initialTiming);
  const [dayOfMonth, setDayOfMonth] = useState(String(initialDay ?? 1));
  const [delayDays, setDelayDays] = useState(String(initialDelay ?? 7));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await updateAutopaySchedule(jobberClientId, {
        timing,
        dayOfMonth: timing === "day_of_month" ? Number(dayOfMonth) : null,
        delayDays: timing === "days_after_invoice" ? Number(delayDays) : null,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setSaved(true);
    });
  }

  const inputClasses =
    "rounded-lg border border-[#d9d4c6] bg-white px-2 py-1 text-xs outline-none focus:border-[#d4af37]";

  return (
    <div className="mt-3 border-t border-[#e7e2d5] pt-3">
      <p className="text-xs font-semibold text-[#174734]">Charge the card</p>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <select
          value={timing}
          onChange={(event) => {
            setTiming(event.target.value as AutopayTiming);
            setSaved(false);
          }}
          disabled={isPending}
          className={inputClasses}
          aria-label="When to charge the card"
        >
          <option value="on_invoice">As soon as each invoice is sent</option>
          <option value="day_of_month">On a set day of the month</option>
          <option value="days_after_invoice">A set number of days after each invoice</option>
        </select>

        {timing === "day_of_month" && (
          <label className="flex items-center gap-1 text-xs text-[#6b705c]">
            Day
            <input
              type="number"
              min={1}
              max={28}
              value={dayOfMonth}
              onChange={(event) => {
                setDayOfMonth(event.target.value);
                setSaved(false);
              }}
              disabled={isPending}
              className={`${inputClasses} w-14`}
            />
            <span>(1-28)</span>
          </label>
        )}

        {timing === "days_after_invoice" && (
          <label className="flex items-center gap-1 text-xs text-[#6b705c]">
            Days
            <input
              type="number"
              min={1}
              max={60}
              value={delayDays}
              onChange={(event) => {
                setDelayDays(event.target.value);
                setSaved(false);
              }}
              disabled={isPending}
              className={`${inputClasses} w-14`}
            />
          </label>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg border border-[#174734] px-2.5 py-1 text-xs font-bold transition hover:bg-white disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save"}
        </button>

        {saved && <span className="text-xs font-bold text-green-700">✓ Saved</span>}
      </div>

      {timing !== "on_invoice" && (
        <p className="mt-1.5 text-[11px] text-[#6b705c]">
          Invoices still go out right away, with a line telling the customer
          the date their card will be charged. Overdue reminders wait until
          after that date. An unpaid invoice already past its date is
          charged the next morning.
        </p>
      )}

      {error && <p className="mt-1.5 text-[11px] font-semibold text-red-600">{error}</p>}
    </div>
  );
}
