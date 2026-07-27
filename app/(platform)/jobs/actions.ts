"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { createJobberJob, fetchExistingPropertyId } from "@/lib/jobberJob";
import type { ActionState } from "./actionState";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

// Creates a job directly in Jobber for an existing customer — no local
// database row for the job itself, this only ever writes to Jobber (the
// next customer/visit sync pulls it back down as the read-only mirror
// this app otherwise shows). See lib/jobberJob.ts for the mutation
// itself and why only propertyId/title/invoicing are sent.
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

  if (!clientId) {
    return { error: "Pick a customer for this job." };
  }

  if (!title) {
    return { error: "Enter a job title." };
  }

  const propertyId = await fetchExistingPropertyId(clientId);

  if (!propertyId) {
    return {
      error:
        "This customer has no property in Jobber yet. Add one on their Jobber client record, then try again.",
    };
  }

  const jobResult = await createJobberJob({ propertyId, title });

  if (!jobResult.ok) {
    return { error: `Couldn't create the job in Jobber: ${jobResult.error}` };
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
    },
  });

  revalidatePath("/jobs/new");
  redirect(`/customers/${encodeURIComponent(clientId)}`);
}
