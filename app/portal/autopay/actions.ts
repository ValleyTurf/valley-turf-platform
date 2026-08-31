"use server";

// Server actions for the customer portal's self-serve Autopay page.
// Identifies the customer via the portal session (getCurrentPortalUser),
// same as every other /portal/* action -- never via a token, that's the
// staff-shared-link flow's job (app/autopay/[token]/actions.ts).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePortalUser } from "@/lib/currentPortalUser";
import type { PortalSessionUser } from "@/lib/portalAuth";
import { getBaseUrl } from "@/lib/baseUrl";
import { createAutopaySetupSession, setAutopayEnabled } from "@/lib/autopay";

async function requireCustomer(): Promise<PortalSessionUser> {
  try {
    return await requirePortalUser();
  } catch {
    redirect("/portal/login");
  }
}

export async function startPortalAutopaySetup(): Promise<void> {
  const customer = await requireCustomer();
  const baseUrl = await getBaseUrl();

  const result = await createAutopaySetupSession({
    jobberClientId: customer.jobberClientId,
    customerEmail: customer.email,
    successUrl: `${baseUrl}/portal/autopay?setup=1`,
    cancelUrl: `${baseUrl}/portal/autopay`,
  });

  if (!result.ok) {
    redirect(`/portal/autopay?error=${encodeURIComponent(result.error)}`);
  }

  redirect(result.url);
}

export async function disablePortalAutopay(): Promise<void> {
  const customer = await requireCustomer();
  const result = await setAutopayEnabled(customer.jobberClientId, false);

  if (!result.ok) {
    redirect(`/portal/autopay?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/portal/autopay");
  redirect("/portal/autopay");
}

export async function enablePortalAutopay(): Promise<void> {
  const customer = await requireCustomer();
  const result = await setAutopayEnabled(customer.jobberClientId, true);

  if (!result.ok) {
    redirect(`/portal/autopay?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/portal/autopay");
  redirect("/portal/autopay");
}
