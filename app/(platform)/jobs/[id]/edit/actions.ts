"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import {
  editJobberJob,
  setJobberJobLineItems,
  cancelJobberJob,
  reopenJobberJob,
  type RecurrenceFrequency,
  type NativeLineItemInput,
} from "@/lib/jobberJob";
import {
  addVisitOneTimeCharge,
  removeVisitOneTimeCharge,
} from "@/lib/visitCharges";
import type { ActionState } from "./actionState";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

// Roadmap item 18 (native multi-line-item jobs) -- ManageJobForm.tsx only
// renders this hidden field at all when there's something to actually
// change (a filled-in price, or an active add-on edit), so an absent
// field here means "leave the current price alone" -- same behavior the
// old plain "price" field had.
function cleanLineItems(value: FormDataEntryValue | null): NativeLineItemInput[] | null {
  if (typeof value !== "string" || value.trim() === "") return null;

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;

    return parsed
      .map((item) => ({
        name: typeof item?.name === "string" ? item.name.trim() : "",
        unitPrice:
          typeof item?.unitPrice === "number" && Number.isFinite(item.unitPrice)
            ? item.unitPrice
            : 0,
        quantity: 1,
      }))
      .filter((item) => item.name.length > 0);
  } catch {
    return null;
  }
}

const RECURRENCE_VALUES: RecurrenceFrequency[] = [
  "weekly",
  "biweekly",
  "bimonthly",
  "monthly",
  "quarterly",
  "triannual",
  "semiannual",
];

function isRecurrenceFrequency(
  value: string | null
): value is RecurrenceFrequency {
  return value !== null && (RECURRENCE_VALUES as string[]).includes(value);
}

// Edits an existing job's title/instructions/line items and, optionally,
// its recurring schedule — see lib/jobberJob.ts's editJobberJob/
// setJobberJobLineItems for exactly which mutations get called and why
// line items live on a separate call from everything else.
export async function updateJob(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in to edit a job." };
  }

  const jobId = cleanText(formData.get("job_id"));
  const title = cleanText(formData.get("title"));
  const instructionsRaw = formData.get("instructions");
  const instructions =
    typeof instructionsRaw === "string" ? instructionsRaw.trim() : null;
  const lineItems = cleanLineItems(formData.get("line_items"));
  const updateSchedule = formData.get("update_schedule") === "on";
  const startDate = cleanText(formData.get("start_date"));
  const frequencyRaw = cleanText(formData.get("frequency"));

  if (!jobId) {
    return { error: "Missing job." };
  }

  const isRecurring = frequencyRaw !== null && frequencyRaw !== "one_time";

  if (updateSchedule) {
    if (!startDate) {
      return { error: "Pick a start date to update the schedule." };
    }
    if (isRecurring && !isRecurrenceFrequency(frequencyRaw)) {
      return { error: "Pick a valid recurring frequency." };
    }
  }

  const editResult = await editJobberJob({
    jobId,
    title,
    instructions,
    startDate: updateSchedule ? startDate : null,
    recurrence:
      updateSchedule && isRecurring && isRecurrenceFrequency(frequencyRaw)
        ? frequencyRaw
        : null,
    updateSchedule,
  });

  if (!editResult.ok) {
    return { error: `Couldn't update the job: ${editResult.error}` };
  }

  if (lineItems !== null && lineItems.length > 0) {
    const priceResult = await setJobberJobLineItems(
      jobId,
      title ?? "Service",
      lineItems
    );

    if (!priceResult.ok) {
      return { error: `Job details saved, but price update failed: ${priceResult.error}` };
    }
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "job",
    entityId: jobId,
    entityLabel: title,
    after: {
      title,
      instructions,
      line_items: lineItems,
      schedule_updated: updateSchedule,
      start_date: updateSchedule ? startDate : null,
      frequency: updateSchedule ? (isRecurring ? frequencyRaw : "one_time") : null,
    },
  });

  redirect(`/jobs/${encodeURIComponent(jobId)}/edit?saved=1`);
}

// Cancels a recurring job's future visits (see lib/jobberJob.ts's
// cancelJobberJob for exactly what Jobber does with past-vs-future
// visits) — a real, partially-irreversible action, so the form calling
// this has its own confirm() prompt rather than sharing the main save
// button.
export async function cancelJob(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const jobId = cleanText(formData.get("job_id"));

  if (!actor || !jobId) {
    redirect(`/jobs/${encodeURIComponent(jobId ?? "")}/edit?error=${encodeURIComponent("Missing job or not signed in.")}`);
  }

  const result = await cancelJobberJob(jobId);

  if (!result.ok) {
    redirect(
      `/jobs/${encodeURIComponent(jobId)}/edit?error=${encodeURIComponent(`Couldn't cancel: ${result.error}`)}`
    );
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "job",
    entityId: jobId,
    entityLabel: "Cancel recurring service",
    after: { action: "cancel_future_visits" },
  });

  redirect(`/jobs/${encodeURIComponent(jobId)}/edit?saved=1`);
}

export async function reopenJob(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const jobId = cleanText(formData.get("job_id"));

  if (!actor || !jobId) {
    redirect(`/jobs/${encodeURIComponent(jobId ?? "")}/edit?error=${encodeURIComponent("Missing job or not signed in.")}`);
  }

  const result = await reopenJobberJob(jobId);

  if (!result.ok) {
    redirect(
      `/jobs/${encodeURIComponent(jobId)}/edit?error=${encodeURIComponent(`Couldn't reopen: ${result.error}`)}`
    );
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "job",
    entityId: jobId,
    entityLabel: "Reopen job",
    after: { action: "reopen" },
  });

  redirect(`/jobs/${encodeURIComponent(jobId)}/edit?saved=1`);
}

// One-time visit charges (Ryan, 2026-09-27): "I still want to be able
// to add these without having to have it coded in" -- a self-serve
// alternative to the job-level line items above, scoped to exactly one
// visit instead of every future occurrence. See lib/visitCharges.ts's
// header comment for the full reasoning.
export async function addOneTimeCharge(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const jobId = cleanText(formData.get("job_id"));
  const visitId = cleanText(formData.get("visit_id"));
  const name = cleanText(formData.get("charge_name"));
  const priceRaw = cleanText(formData.get("charge_price"));
  const price = priceRaw ? Number(priceRaw) : NaN;

  if (!actor || !jobId || !visitId) {
    redirect(
      `/jobs/${encodeURIComponent(jobId ?? "")}/edit?error=${encodeURIComponent("Missing visit or not signed in.")}`
    );
  }

  if (!name || !Number.isFinite(price) || price <= 0) {
    redirect(
      `/jobs/${encodeURIComponent(jobId)}/edit?error=${encodeURIComponent("Enter a charge name and an amount greater than zero.")}`
    );
  }

  const result = await addVisitOneTimeCharge({
    visitId,
    name,
    unitPrice: price,
  });

  if (!result.ok) {
    redirect(
      `/jobs/${encodeURIComponent(jobId)}/edit?error=${encodeURIComponent(`Couldn't add charge: ${result.error}`)}`
    );
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "job",
    entityId: jobId,
    entityLabel: "Add one-time visit charge",
    after: { visit_id: visitId, charge_name: name, charge_price: price },
  });

  redirect(`/jobs/${encodeURIComponent(jobId)}/edit?saved=1`);
}

export async function removeOneTimeCharge(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const jobId = cleanText(formData.get("job_id"));
  const chargeId = cleanText(formData.get("charge_id"));

  if (!actor || !jobId || !chargeId) {
    redirect(
      `/jobs/${encodeURIComponent(jobId ?? "")}/edit?error=${encodeURIComponent("Missing charge or not signed in.")}`
    );
  }

  const result = await removeVisitOneTimeCharge(chargeId);

  if (!result.ok) {
    redirect(
      `/jobs/${encodeURIComponent(jobId)}/edit?error=${encodeURIComponent(`Couldn't remove charge: ${result.error}`)}`
    );
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "job",
    entityId: jobId,
    entityLabel: "Remove one-time visit charge",
    after: { charge_id: chargeId },
  });

  redirect(`/jobs/${encodeURIComponent(jobId)}/edit?saved=1`);
}
