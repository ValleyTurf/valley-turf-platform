"use server";

import { redirect } from "next/navigation";
import { requirePortalUser } from "@/lib/currentPortalUser";
import { supabaseServer } from "@/lib/supabase-server";
import type { PortalSessionUser } from "@/lib/portalAuth";

export async function sendPortalMessage(formData: FormData): Promise<void> {
  let customer: PortalSessionUser;

  try {
    customer = await requirePortalUser();
  } catch {
    redirect("/portal/login");
  }

  const rawBody = formData.get("body");
  const body = typeof rawBody === "string" ? rawBody.trim() : "";

  if (!body) {
    redirect("/portal/messages?result=invalid");
  }

  const { error } = await supabaseServer.from("portal_messages").insert({
    jobber_client_id: customer.jobberClientId,
    sender: "customer",
    sender_name: customer.name,
    body,
  });

  if (error) {
    console.error("Portal message send failed:", error);
    redirect("/portal/messages?result=error");
  }

  redirect("/portal/messages");
}
