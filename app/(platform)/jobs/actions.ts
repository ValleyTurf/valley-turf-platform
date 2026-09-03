"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { createNativeJob, type RecurrenceFrequency } from "@/lib/nativeJobs";
import type { ActionState } from "./actionState";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanPrice(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const RECURRENCE_VALUES: RecurrenceFrequency[] = [
  "weekly",
  "bimonthly",
  "monthly",
  "quarterly",
  "semiannual",
];

function isRecurrenceFrequency(
  value: string | null
): value is RecurrenceFrequency {
  return (
    value !== null &&
    (RECURRENCE_VALUES as string[]).includes(value)
  );
}

// Tier 2 (Jobber Independence Roadmap) — creates the job natively,
// straight into this app's own jobber_jobs/jobber_visits tables (see
// lib/nativeJobs.ts's createNativeJob). No Jobber round-trip, no waiting
// on a sync/webhook for the job to become visible, and no dependency on
// the customer already having a Jobber property (this used to require
// one via fetchExistingPropertyId — native jobs don't need a property at
// all, since the customer's address already lives in the customers
// table). Confirmed with Ryan (2026-09-02): crews use this app
// exclusively, not Jobber's own mobile app/calendar, so a job existing
// only here is not a gap for anyone's day-to-day workflow.
export async function createJob(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in to create a job." };
  }

  const clientId = cleanText(formData.get("customer_id"));
  const customerName = cleanText(formData.get("customer_name"));
  const title = cleanText(formData.get("title"));
  const instructions = cleanText(formData.get("instructions"));
  const price = cleanPrice(formData.get("price"));
  const startDate = cleanText(formData.get("start_date"));
  const frequencyRaw = cleanText(formData.get("frequency"));

  if (!clientId) {
    return { error: "Pick a customer for this job." };
  }

  if (!title) {
    return { error: "Enter a job title." };
  }

  const isRecurring = frequencyRaw !== null && frequencyRaw !== "one_time";

  if (isRecurring && !isRecurrenceFrequency(frequencyRaw)) {
    return { error: "Pick a valid recurring frequency." };
  }

  if (isRecurring && !startDate) {
    return { error: "A start date is required for a recurring job." };
  }

  const jobResult = await createNativeJob({
    jobberClientId: clientId,
    customerName: customerName,
    title,
    instructions,
    price,
    startDate,
    recurrence: isRecurring && isRecurrenceFrequency(frequencyRaw)
      ? frequencyRaw
      : null,
  });

  if (!jobResult.ok) {
    return { error: `Couldn't create the job: ${jobResult.error}` };
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "job",
    entityId: jobResult.value.jobId,
    entityLabel: `${title}${customerName ? ` for ${customerName}` : ""}`,
    after: {
      jobber_job_id: jobResult.value.jobId,
      jobber_job_number: jobResult.value.jobNumber,
      customer_id: clientId,
      title,
      instructions,
      price,
      start_date: startDate,
      frequency: isRecurring ? frequencyRaw : "one_time",
    },
  });

  revalidatePath("/jobs/new");
  redirect(`/customers/${encodeURIComponent(clientId)}`);
}
