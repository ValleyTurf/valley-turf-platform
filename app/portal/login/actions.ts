"use server";

import { redirect } from "next/navigation";
import {
  createPortalLoginToken,
  findPortalCustomerByEmail,
} from "@/lib/portalLoginTokens";
import { sendPortalMagicLinkEmail } from "@/lib/notifications";
import { getBaseUrl } from "@/lib/baseUrl";

export async function requestPortalLogin(formData: FormData): Promise<void> {
  const rawEmail = formData.get("email");
  const email = typeof rawEmail === "string" ? rawEmail.trim() : "";

  if (!email) {
    redirect("/portal/login?result=invalid");
  }

  const customer = await findPortalCustomerByEmail(email);

  // Same email whether we found a match or not — don't let this form
  // leak which email addresses are in the system.
  if (customer) {
    try {
      const token = await createPortalLoginToken(customer);
      const baseUrl = await getBaseUrl();
      const loginUrl = `${baseUrl}/portal/verify?token=${token}`;

      await sendPortalMagicLinkEmail({
        toEmail: customer.email,
        customerName: customer.name,
        loginUrl,
        jobberClientId: customer.jobberClientId,
      });
    } catch (error) {
      console.error("Portal login request failed:", error);
    }
  }

  redirect("/portal/login?result=sent");
}
