"use server";

import { redirect } from "next/navigation";
import {
  createPortalLoginToken,
  findPortalCustomerByEmail,
  findPortalCustomerByPhone,
} from "@/lib/portalLoginTokens";
import { sendPortalMagicLinkEmail, sendPortalMagicLinkSms } from "@/lib/notifications";
import { getBaseUrl } from "@/lib/baseUrl";

// Handles both sign-in options on app/portal/login's page (PortalLoginForm's
// tab toggle sets the hidden "channel" field) -- email was the only path
// until Ryan asked for a text option too. Same "always redirect to the
// same ?result=sent regardless of match" trick either way, so this form
// never leaks which emails/phones are in the system.
export async function requestPortalLogin(formData: FormData): Promise<void> {
  const channel = formData.get("channel") === "phone" ? "phone" : "email";

  if (channel === "phone") {
    const rawPhone = formData.get("phone");
    const phone = typeof rawPhone === "string" ? rawPhone.trim() : "";

    if (!phone) {
      redirect("/portal/login?result=invalid");
    }

    const customer = await findPortalCustomerByPhone(phone);

    if (customer) {
      try {
        const token = await createPortalLoginToken(customer);
        const baseUrl = await getBaseUrl();
        const loginUrl = `${baseUrl}/portal/verify?token=${token}`;

        await sendPortalMagicLinkSms(phone, customer.name, loginUrl, customer.jobberClientId);
      } catch (error) {
        console.error("Portal login request (SMS) failed:", error);
      }
    }

    redirect("/portal/login?result=sent");
  }

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
        toEmail: customer.email || email,
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
