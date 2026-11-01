"use client";

// Shared "Add Job" popup -- Ryan (2026-11-02): "I want to be able to add
// a job directly from the schedule page... Also, I would like to be
// able to create a job from the customer page." One component instead
// of two near-duplicates: the Customer page passes `presetCustomer` (so
// the customer picker never shows at all -- it's already known), the
// Schedule page's per-day buttons pass `presetStartDate` (so the date
// field starts pre-filled to whichever day was clicked). Both render
// the same trigger-button-that-becomes-a-modal and post to the same
// createJob action (app/(platform)/jobs/actions.ts) that already backs
// /jobs/new's full-page form -- this isn't a separate, simpler path,
// it's the exact same native job creation (jobber_jobs/jobber_visits,
// no Jobber round-trip) with an added "or create a brand-new customer
// right here" option createJob now also understands.
//
// Deliberately a plain fixed-overlay modal (same pattern as
// schedule/VisitDetailModal.tsx: backdrop click + an inner stopPropagation
// click close it) rather than a second page, since both of Ryan's asks
// were specifically phrased as "pop up the screen."
import { useActionState, useState } from "react";
import { createJob } from "@/app/(platform)/jobs/actions";
import { initialActionState } from "@/app/(platform)/jobs/actionState";
import CustomerTypeahead from "./CustomerTypeahead";

export type PresetCustomer = { id: string; name: string };

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

const fieldClass =
  "mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20";

export default function AddJobModal({
  presetCustomer = null,
  presetStartDate = null,
  triggerLabel = "+ Add Job",
  triggerClassName,
}: {
  // Customer page: the job is obviously for this customer, so the
  // picker/"new customer" toggle never render at all.
  presetCustomer?: PresetCustomer | null;
  // Schedule page's per-day buttons: pre-fills the date field to the
  // day that was clicked, same "YYYY-MM-DD" shape GridDate.dateStr
  // already uses.
  presetStartDate?: string | null;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    createJob,
    initialActionState
  );

  const [customerMode, setCustomerMode] = useState<"existing" | "new">(
    "existing"
  );
  const [selected, setSelected] = useState<PresetCustomer | null>(
    presetCustomer
  );
  const [frequency, setFrequency] = useState("one_time");
  const isRecurring = frequency !== "one_time";
  const [items, setItems] = useState<{ name: string; unitPrice: string }[]>([
    { name: "", unitPrice: "" },
  ]);
  const hasAddOns = items.length > 1;

  const effectiveMode = presetCustomer ? "existing" : customerMode;

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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          "rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
        }
      >
        {triggerLabel}
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-[#174734]">Add Job</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-xl leading-none text-[#6b705c] hover:text-[#174734]"
          >
            ✕
          </button>
        </div>

        <form action={formAction} className="mt-4 space-y-5">
          <input type="hidden" name="customer_mode" value={effectiveMode} />

          {effectiveMode === "existing" && (
            <>
              <input type="hidden" name="customer_id" value={selected?.id ?? ""} />
              <input
                type="hidden"
                name="customer_name"
                value={selected?.name ?? ""}
              />
            </>
          )}

          {presetCustomer ? (
            <div>
              <p className="text-xs font-bold text-[#9c7a20]">Customer</p>
              <p className="mt-1 rounded-lg border border-[#d4af37] bg-[#fdf8ea] px-3 py-2 text-sm font-semibold">
                {presetCustomer.name}
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-[#9c7a20]">Customer</p>
                <div className="flex gap-2 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setCustomerMode("existing")}
                    className={
                      customerMode === "existing"
                        ? "text-[#174734] underline"
                        : "text-[#6b705c] hover:underline"
                    }
                  >
                    Existing
                  </button>
                  <span className="text-[#6b705c]">·</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerMode("new");
                      setSelected(null);
                    }}
                    className={
                      customerMode === "new"
                        ? "text-[#174734] underline"
                        : "text-[#6b705c] hover:underline"
                    }
                  >
                    New Customer
                  </button>
                </div>
              </div>

              {customerMode === "existing" ? (
                selected ? (
                  <div className="mt-1 flex items-center justify-between rounded-lg border border-[#d4af37] bg-[#fdf8ea] px-3 py-2 text-sm">
                    <span className="font-semibold">{selected.name}</span>
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="text-xs font-bold text-[#9c7a20] hover:underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <CustomerTypeahead
                    placeholder="Search customers by name…"
                    navigateOnSelect={false}
                    onSelect={(result) =>
                      setSelected({ id: result.jobberClientId, name: result.name })
                    }
                    className="mt-1"
                    inputClassName={fieldClass}
                  />
                )
              ) : (
                <div className="mt-2 space-y-2 rounded-xl border border-[#eee9dc] p-3">
                  <input
                    name="new_full_name"
                    type="text"
                    required
                    placeholder="Full name"
                    className={fieldClass}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      name="new_email"
                      type="email"
                      placeholder="Email (optional)"
                      className={fieldClass}
                    />
                    <input
                      name="new_phone"
                      type="tel"
                      placeholder="Phone (optional)"
                      className={fieldClass}
                    />
                  </div>
                  <input
                    name="new_street"
                    type="text"
                    placeholder="Street address (optional)"
                    className={fieldClass}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      name="new_city"
                      type="text"
                      placeholder="City"
                      className={fieldClass}
                    />
                    <input
                      name="new_state"
                      type="text"
                      placeholder="State"
                      className={fieldClass}
                    />
                    <input
                      name="new_zip"
                      type="text"
                      placeholder="Zip"
                      className={fieldClass}
                    />
                  </div>
                  <p className="text-xs text-[#6b705c]">
                    Referral source and any other details can be filled in
                    on their customer page afterward.
                  </p>
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="add-job-title" className="text-xs font-bold text-[#9c7a20]">
              Job Title
            </label>
            <input
              id="add-job-title"
              name="title"
              type="text"
              required
              placeholder="e.g. Turf Installation"
              className={fieldClass}
            />
            <p className="mt-1 text-xs text-[#6b705c]">
              For the Schedule&apos;s color-coding to match, format as
              &ldquo;Customer Name - Service&rdquo; and include the
              frequency word (Quarterly, Bimonthly, Monthly, Weekly,
              Semi-Annual, Spray Only).
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-[#eee9dc] p-3">
              <label className="text-xs font-bold text-[#9c7a20]">
                {hasAddOns ? (
                  "Line Items"
                ) : (
                  <>
                    Price ($){" "}
                    <span className="font-normal text-[#6b705c]">
                      (optional)
                    </span>
                  </>
                )}
              </label>

              {hasAddOns ? (
                <div className="space-y-2">
                  {items.map((item, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateItem(index, "name", e.target.value)}
                        placeholder={index === 0 ? "e.g. Turf Cleaning" : "e.g. Infill Refresh"}
                        className="flex-1 rounded-lg border border-[#d9d4c6] px-2 py-1.5 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                        placeholder="0.00"
                        className="w-20 rounded-lg border border-[#d9d4c6] px-2 py-1.5 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                      />
                      <button
                        type="button"
                        onClick={() => removeLineItem(index)}
                        aria-label="Remove line item"
                        className="rounded-lg px-1.5 text-sm font-bold text-red-600 transition hover:bg-red-50"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <input
                  name="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={items[0].unitPrice}
                  onChange={(e) => updateItem(0, "unitPrice", e.target.value)}
                  placeholder="0.00"
                  className={fieldClass}
                />
              )}

              <button
                type="button"
                onClick={addLineItem}
                className="text-xs font-semibold text-[#9c7a20] hover:underline"
              >
                + Add a line item{hasAddOns ? "" : " (e.g. an add-on)"}
              </button>

              {hasAddOns && (
                <input
                  type="hidden"
                  name="line_items"
                  value={JSON.stringify(
                    items.map((item) => ({
                      name: item.name.trim() || "Service",
                      unitPrice: item.unitPrice.trim() === "" ? 0 : Number(item.unitPrice),
                    }))
                  )}
                />
              )}
            </div>

            <div>
              <label htmlFor="add-job-frequency" className="text-xs font-bold text-[#9c7a20]">
                Frequency
              </label>
              <select
                id="add-job-frequency"
                name="frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className={`${fieldClass} bg-white`}
              >
                {FREQUENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <label
                htmlFor="add-job-start-date"
                className="mt-3 block text-xs font-bold text-[#9c7a20]"
              >
                Start Date{" "}
                <span className="font-normal text-[#6b705c]">
                  {isRecurring ? "(required)" : "(optional)"}
                </span>
              </label>
              <input
                id="add-job-start-date"
                name="start_date"
                type="date"
                required={isRecurring}
                defaultValue={presetStartDate ?? undefined}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="add-job-instructions" className="text-xs font-bold text-[#9c7a20]">
              Instructions{" "}
              <span className="font-normal text-[#6b705c]">(optional)</span>
            </label>
            <textarea
              id="add-job-instructions"
              name="instructions"
              rows={2}
              placeholder="Scope of work, gate codes, anything the crew needs to know"
              className={fieldClass}
            />
          </div>

          {state.error && (
            <p className="text-sm font-semibold text-red-600">{state.error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-xl border border-[#174734] px-4 py-2.5 text-sm font-bold transition hover:bg-[#f7f6f1]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isPending ||
                (effectiveMode === "existing" && !presetCustomer && !selected)
              }
              className="flex-1 rounded-xl bg-[#174734] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
            >
              {isPending ? "Creating…" : "Create Job"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
