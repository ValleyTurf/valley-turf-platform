"use server";

// Public action for the unauthenticated /autopay/[token] enrollment page
// -- same trust model as app/pay/[token]/actions.ts and
// app/q/[token]/actions.ts: no auth check beyond knowledge of the
// unguessable enrollment_token (migration 047). Deliberately does NOT
// import getCurrentUser/requireAdmin.
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getBaseUrl } from "@/lib/baseUrl";
import { getPaymentMethodByEnrollmentToken, createAutopaySetupSession } from "@/lib/autopay";

export async function startTokenAutopaySetup(token: string): Promise<void> {
  const paymentMethod = await getPaymentMethodByEnrollmentToken(token);

  if (!paymentMethod) {
    redirect(`/autopay/${token}?error=${encodeURIComponent("Link not found.")}`);
  }

  const { data: customerRow } = await supabaseServer
    .from("customers")
    .select("email")
    .eq("jobber_client_id", paymentMethod.jobberClientId)
    .maybeSingle();

  const baseUrl = await getBaseUrl();

  const result = await createAutopaySetupSession({
    jobberClientId: paymentMethod.jobberClientId,
    customerEmail: customerRow?.email ?? null,
    successUrl: `${baseUrl}/autopay/${token}?setup=1`,
    cancelUrl: `${baseUrl}/autopay/${token}`,
  });

  if (!result.ok) {
    redirect(`/autopay/${token}?error=${encodeURIComponent(result.error)}`);
  }

  redirect(result.url);
}
