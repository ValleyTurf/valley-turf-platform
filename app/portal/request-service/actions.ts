"use server";

import { redirect } from "next/navigation";
import { requirePortalUser } from "@/lib/currentPortalUser";
import { supabaseServer } from "@/lib/supabase-server";
import type { PortalSessionUser } from "@/lib/portalAuth";

export async function submitServiceRequest(formData: FormData): Promise<void> {
  let customer: PortalSessionUser;

  try {
    customer = await requirePortalUser();
  } catch {
    redirect("/portal/login");
  }

  const rawMessage = formData.get("message");
  const message = typeof rawMessage === "string" ? rawMessage.trim() : "";

  if (!message) {
    redirect("/portal/request-service?result=invalid");
  }

  const rawPhone = formData.get("phone");
  const phone = typeof rawPhone === "string" ? rawPhone.trim() : "";

  const { error } = await supabaseServer.from("portal_service_requests").insert({
    jobber_client_id: customer.jobberClientId,
    customer_name: customer.name,
    email: customer.email,
    phone: phone || null,
    message,
    status: "new",
  });

  if (error) {
    console.error("Portal service request failed:", error);
    redirect("/portal/request-service?result=error");
  }

  redirect("/portal/request-service?result=sent");
}
