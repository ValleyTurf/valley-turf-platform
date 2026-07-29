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
  lineItems: { id: string; name: string | null; unitPrice: number | null }[];
};

const FREQUENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "one_time", label: "One-Time" },
  { value: "weekly", label: "Weekly" },
  { value: "bimonthly", label: "Bi-Monthly (every 2 months)" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
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

  const singleLineItem =
    job.lineItems.length === 1 ? job.lineItems[0] : null;
  const priceLocked = job.lineItems.length > 1;

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

        <div>
          <label htmlFor="price" className="text-xs font-bold text-[#9c7a20]">
            Price ($){" "}
            <span className="font-normal text-[#6b705c]">
              {priceLocked ? "(multiple line items — edit in Jobber)" : "(optional)"}
            </span>
          </label>
          <input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0"
            disabled={priceLocked}
            defaultValue={singleLineItem?.unitPrice ?? ""}
            placeholder="0.00"
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 disabled:bg-[#f5f4ef] disabled:text-[#9c9887]"
          />
          <p className="mt-1 text-xs text-[#6b705c]">
            Leave blank to leave the current price alone.
          </p>
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
