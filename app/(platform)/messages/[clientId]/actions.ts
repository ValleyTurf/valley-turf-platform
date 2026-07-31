"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

// Any staff member who can reach this page (gated by the customer_portal
// permission section, not a role check) can reply — replying to a
// customer isn't a manager-only action the way Crew Status/Timecards are.
export async function replyToCustomer(
  jobberClientId: string,
  formData: FormData
): Promise<void> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Sign-in required.");
  }

  const rawBody = formData.get("body");
  const body = typeof rawBody === "string" ? rawBody.trim() : "";

  if (!body) {
    return;
  }

  const { error } = await supabaseServer.from("portal_messages").insert({
    jobber_client_id: jobberClientId,
    sender: "staff",
    sender_name: user.name,
    body,
  });

  if (error) {
    throw new Error(`Unable to send reply: ${error.message}`);
  }

  revalidatePath(`/messages/${jobberClientId}`);
  revalidatePath("/messages");
}

export async function updateServiceRequestStatus(
  requestId: string,
  jobberClientId: string,
  formData: FormData
): Promise<void> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Sign-in required.");
  }

  const rawStatus = formData.get("status");
  const status = typeof rawStatus === "string" ? rawStatus : "";
  const allowedStatuses = ["new", "in_progress", "resolved"];

  if (!allowedStatuses.includes(status)) {
    return;
  }

  const { error } = await supabaseServer
    .from("portal_service_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", requestId);

  if (error) {
    throw new Error(`Unable to update request status: ${error.message}`);
  }

  revalidatePath(`/messages/${jobberClientId}`);
  revalidatePath("/messages");
}
