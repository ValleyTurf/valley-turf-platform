"use server";

import { redirect } from "next/navigation";
import { requirePortalUser } from "@/lib/currentPortalUser";
import { supabaseServer } from "@/lib/supabase-server";
import type { PortalSessionUser } from "@/lib/portalAuth";
import { getUnreadMessageCount } from "@/lib/contactHistory";
import { sendPushToAllSubscribers } from "@/lib/webPush";

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

  // Same home-screen badge inbound texts/emails get (see
  // lib/contactHistory.ts's logContactHistory/notifyInboundMessage) -- a
  // portal chat message is just as much a "customer is waiting on a
  // reply" signal, it just never passes through contact_history.
  try {
    const unreadCount = await getUnreadMessageCount();

    await sendPushToAllSubscribers({
      title: "New customer message",
      body: `${customer.name}: ${body.slice(0, 120)}`,
      url: `/messages/${encodeURIComponent(customer.jobberClientId)}`,
      badgeCount: unreadCount,
    });
  } catch (err) {
    console.error("Portal message push notification failed:", err);
  }

  redirect("/portal/messages");
}
