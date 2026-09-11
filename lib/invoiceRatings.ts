// Post-visit satisfaction rating (ROADMAP.md Fresh Ideas #10, Ryan's
// spec 2026-09-11). Reuses invoices.public_token -- the same
// unguessable link already emailed to customers for /pay/[token] -- as
// the /rate/[token] identifier too, rather than minting a second token
// per invoice. See migration 074_add_invoice_ratings.sql.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { sendLowRatingAlert } from "@/lib/notifications";

export type RatableInvoice = {
  id: string;
  invoiceNumber: string;
  customerName: string | null;
  jobberClientId: string | null;
  // Set when this invoice already has a rating on file -- lets the
  // /rate/[token] page show "thanks, you already told us" instead of
  // the star picker again on a repeat visit to the link.
  existingScore: number | null;
};

export async function getInvoiceForRating(
  token: string
): Promise<RatableInvoice | null> {
  const { data, error } = await supabaseServer
    .from("invoices")
    .select("id, invoice_number, customer_name, jobber_client_id")
    .eq("public_token", token)
    .maybeSingle();

  if (error || !data) return null;

  const { data: existingRating } = await supabaseServer
    .from("invoice_ratings")
    .select("score")
    .eq("invoice_id", data.id as string)
    .maybeSingle();

  return {
    id: data.id as string,
    invoiceNumber: data.invoice_number as string,
    customerName: data.customer_name as string | null,
    jobberClientId: data.jobber_client_id as string | null,
    existingScore: (existingRating?.score as number | undefined) ?? null,
  };
}

export type SubmitRatingResult =
  | { ok: true; routeToGoogleUrl: string | null }
  | { ok: false; error: string };

// Called from app/rate/[token]/actions.ts's submitRating server action,
// only after the customer has confirmed their pick on the /rate landing
// page -- not directly from the email's star links, which only carry the
// customer to that confirm step. That extra click is deliberate: email
// scanners/security proxies sometimes pre-fetch links inside an email
// before a person ever opens it, and a plain GET-records-the-rating link
// would let that silently record a fake rating (worst case, a fake
// low one that pages Ryan for nothing).
export async function submitInvoiceRating(
  token: string,
  score: number
): Promise<SubmitRatingResult> {
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return { ok: false, error: "invalid_score" };
  }

  const invoice = await getInvoiceForRating(token);

  if (!invoice) {
    return { ok: false, error: "not_found" };
  }

  // 5 stars only (Ryan's call) routes on to the real Google review link;
  // 1-4 stays internal. Read fresh at click time, not baked into the
  // email at send time, so a change to the Google review URL later
  // applies to every previously-sent invoice email too.
  let routeToGoogleUrl: string | null = null;

  if (score === 5) {
    const { data: settingsRow } = await supabaseServer
      .from("review_request_settings")
      .select("google_review_url")
      .eq("id", 1)
      .maybeSingle();
    routeToGoogleUrl = settingsRow?.google_review_url ?? null;
  }

  const { data: upserted, error: upsertError } = await supabaseServer
    .from("invoice_ratings")
    .upsert(
      {
        invoice_id: invoice.id,
        jobber_client_id: invoice.jobberClientId,
        customer_name: invoice.customerName,
        invoice_number: invoice.invoiceNumber,
        score,
        routed_to_google: routeToGoogleUrl !== null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "invoice_id" }
    )
    .select("alerted_at")
    .single();

  if (upsertError) {
    return { ok: false, error: upsertError.message };
  }

  // Only alert once per invoice -- a re-submit (corrected on the confirm
  // page, or a double-tapped Confirm button) shouldn't page Ryan twice
  // for the same visit.
  if (score <= 4 && !upserted.alerted_at) {
    await sendLowRatingAlert({
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      score,
      jobberClientId: invoice.jobberClientId,
    });

    await supabaseServer
      .from("invoice_ratings")
      .update({ alerted_at: new Date().toISOString() })
      .eq("invoice_id", invoice.id);
  }

  return { ok: true, routeToGoogleUrl };
}
