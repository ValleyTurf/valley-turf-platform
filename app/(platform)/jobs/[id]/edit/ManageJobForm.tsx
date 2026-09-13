"use client";

import { useActionState, useState, type FormEvent } from "react";
import { updateJob, cancelJob, reopenJob } from "./actions";
import { initialActionState } from "./actionState";

// Deliberately a locally-defined, structural subset rather than an
// `import type { JobDetails } from "@/lib/jobberJob"` — that file has
// `import "server-only"` at the top (see its own header comment on why),
// and this codebase treats "use client" components importing anything
// from a server-only module, even type-only, as worth avoiding on
// principle rather than trusting bundler elision. Same reasoning as
// NewJobForm.tsx's own local PickerCustomer type.
type Job = {
  id: string;
  jobNumber: string | null;
  title: string | null;
  instructions: string | null;
  jobStatus: string | null;
  lineItems: {
    id: string;
    name: string | null;
    unitPrice: number | null;
    details: string | null;
  }[];
};

const FREQUENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "one_time", label: "One-Time" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly (every 2 weeks)" },
  { value: "bimonthly", label: "Bi-Monthly (every 2 months)" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "triannual", label: "Every 4 Months" },
  { value: "semiannual", label: "Semi-Annual" },
];

export default function ManageJobForm({ job }: { job: Job }) {
  const [state, formAction, isPending] = useActionState(
    updateJob,
    initialActionState
  );
  const [updateSchedule, setUpdateSchedule] = useState(false);
  const [frequency, setFrequency] = useState("one_time");
  const isRecurring = frequency !== "one_time";

  // Roadmap item 18 (native multi-line-item jobs) -- one row per line
  // item, always at least one. A job with a real add-on (an extra
  // service beyond the regular cleaning) has more than one row here and
  // gets the full name+price editor below; an ordinary job has exactly
  // one and keeps the plain single Price field it always had.
  const [items, setItems] = useState<{ name: string; unitPrice: string }[]>(
    () =>
      job.lineItems.length > 1
        ? job.lineItems.map((li) => ({
            name: li.name ?? "",
            unitPrice: li.unitPrice != null ? String(li.unitPrice) : "",
          }))
        : [
            {
              name: job.lineItems[0]?.name ?? job.title ?? "",
              unitPrice:
                job.lineItems[0]?.unitPrice != null
                  ? String(job.lineItems[0].unitPrice)
                  : "",
            },
          ]
  );
  const hasAddOns = items.length > 1;
  // Same "leave blank to leave the current price alone" behavior as
  // before -- only actually submit a price/line-items change when
  // there's more than one row (an active add-on edit) or the single
  // price field has something typed into it.
  const shouldSubmitLineItems = hasAddOns || items[0].unitPrice.trim() !== "";

  function updateItem(index: number, field: "name" | "unitPrice", value: string) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function addLineItem() {
    setItems((prev) => [...prev, { name: "", unitPrice: "" }]);
  }

  function removeLineItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function confirmCancel(e: FormEvent<HTMLFormElement>) {
    if (
      !confirm(
        "Cancel this recurring service? Past visits stay as-is, but every upcoming visit gets deleted from the schedule. This can't be undone from here."
      )
    ) {
      e.preventDefault();
    }
  }

  function confirmReopen(e: FormEvent<HTMLFormElement>) {
    if (
      !confirm(
        "Reopen this job? Note: reopening does not bring back visits an earlier cancel deleted — you'll need to set a new schedule below if you want it recurring again."
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <form action={formAction} className="space-y-6 rounded-2xl bg-white p-5 shadow">
        <input type="hidden" name="job_id" value={job.id} />

        <div>
          <label htmlFor="title" className="text-xs font-bold text-[#9c7a20]">
            Job Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            defaultValue={job.title ?? ""}
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        </div>

        <div>
          <label
            htmlFor="instructions"
            className="text-xs font-bold text-[#9c7a20]"
          >
            Instructions
          </label>
          <textarea
            id="instructions"
            name="instructions"
            rows={3}
            defaultValue={job.instructions ?? ""}
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        </div>

        <div className="space-y-3 rounded-xl border border-[#eee9dc] p-4">
          <label className="text-xs font-bold text-[#9c7a20]">
            {hasAddOns ? "Line Items" : (
              <>
                Price ($) <span className="font-normal text-[#6b705c]">(optional)</span>
              </>
            )}
          </label>

          {hasAddOns ? (
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={index}>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateItem(index, "name", e.target.value)}
                      placeholder={index === 0 ? "e.g. Turf Cleaning" : "e.g. Infill Refresh"}
                      className="flex-1 rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                      placeholder="0.00"
                      className="w-28 rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                    />
                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      aria-label="Remove line item"
                      className="rounded-lg px-2 text-sm font-bold text-red-600 transition hover:bg-red-50"
                    >
                      ✕
                    </button>
                  </div>
                  {job.lineItems[index]?.details && (
                    <p className="mt-1 pl-1 text-xs text-[#6b705c]">
                      {job.lineItems[index]?.details}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <input
              type="number"
              step="0.01"
              min="0"
              value={items[0].unitPrice}
              onChange={(e) => updateItem(0, "unitPrice", e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
          )}

          <button
            type="button"
            onClick={addLineItem}
            className="text-xs font-semibold text-[#9c7a20] hover:underline"
          >
            + Add a line item{hasAddOns ? "" : " (e.g. an add-on)"}
          </button>

          <p className="text-xs text-[#6b705c]">
            {hasAddOns
              ? "The job's total is the sum of every line item above."
              : "Leave blank to leave the current price alone."}
          </p>

          {shouldSubmitLineItems && (
            <input
              type="hidden"
              name="line_items"
              value={JSON.stringify(
                items.map((item, index) => ({
                  name: item.name.trim() || (index === 0 ? job.title || "Service" : "Service"),
                  unitPrice: item.unitPrice.trim() === "" ? 0 : Number(item.unitPrice),
                }))
              )}
            />
          )}
        </div>

        <div className="rounded-xl border border-[#eee9dc] p-4">
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              name="update_schedule"
              checked={updateSchedule}
              onChange={(e) => setUpdateSchedule(e.target.checked)}
              className="h-4 w-4 rounded border-[#d9d4c6] text-[#174734] focus:ring-[#d4af37]"
            />
            Update recurring schedule
          </label>
          <p className="mt-1 text-xs text-[#6b705c]">
            This app can&apos;t read back a job&apos;s current cadence from
            Jobber, so this is off by default — turn it on only to set a
            new one.
          </p>

          {updateSchedule && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="frequency"
                  className="text-xs font-bold text-[#9c7a20]"
                >
                  Frequency
                </label>
                <select
                  id="frequency"
                  name="frequency"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] bg-white px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                >
                  {FREQUENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="start_date"
                  className="text-xs font-bold text-[#9c7a20]"
                >
                  {isRecurring ? "Next Visit Date" : "Visit Date"}
                </label>
                <input
                  id="start_date"
                  name="start_date"
                  type="date"
                  required={updateSchedule}
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />
              </div>
            </div>
          )}
        </div>

        {state.error && (
          <p className="text-sm font-semibold text-red-600">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-xl bg-[#174734] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save Changes"}
        </button>
      </form>

      <div className="rounded-2xl border border-[#e7e2d5] bg-white p-5 shadow">
        <p className="text-sm font-bold">Recurring Service Status</p>
        <p className="mt-1 text-xs text-[#6b705c]">
          Canceling stops future visits from generating. Reopening un-closes
          the job but won&apos;t bring back deleted visits on its own — pair
          it with a new schedule above if service should keep recurring.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <form action={cancelJob} onSubmit={confirmCancel}>
            <input type="hidden" name="job_id" value={job.id} />
            <button
              type="submit"
              className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100"
            >
              Cancel Recurring Service
            </button>
          </form>

          <form action={reopenJob} onSubmit={confirmReopen}>
            <input type="hidden" name="job_id" value={job.id} />
            <button
              type="submit"
              className="rounded-xl border border-[#174734] px-4 py-2 text-sm font-bold transition hover:bg-[#f7f6f1]"
            >
              Reopen Job
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
