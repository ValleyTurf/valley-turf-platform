"use server";

// Public actions for the unauthenticated /q/[token] quote page —
// deliberately does NOT import getCurrentUser/requireAdmin. The only
// thing standing in for auth here is knowledge of the unguessable
// public_token, same trust model as the /r/[slug] campaign links.
//
// Plain server actions with a redirect-back-with-query-param result,
// not useActionState — that would need a "use client" wrapper, and
// this page has no other reason to ship any client JS at all. Classic
// Post/Redirect/Get: the action does the work and redirects to a GET
// URL carrying the outcome, the page reads that on its next render.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAuditLog } from "@/lib/auditLog";
import { computeDisplayStatus, isQuoteStatus } from "@/lib/quotes";
import { attemptQuoteJobConversion } from "@/lib/quoteJobConversion";

async function respond(
  token: string,
  decision: "accepted" | "declined",
  note: string | null
): Promise<void> {
  const { data: quote, error: fetchError } = await supabaseServer
    .from("quotes")
    .select("id, status, expires_at, recipient_name")
    .eq("public_token", token)
    .single();

  if (fetchError || !quote || !isQuoteStatus(quote.status)) {
    redirect(`/q/${token}?result=error`);
  }

  const displayStatus = computeDisplayStatus(quote.status, quote.expires_at);

  if (displayStatus !== "sent") {
    redirect(`/q/${token}?result=error`);
  }

  const { error } = await supabaseServer
    .from("quotes")
    .update({
      status: decision,
      responded_at: new Date().toISOString(),
      response_note: note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", quote.id);

  if (error) {
    redirect(`/q/${token}?result=error`);
  }

  await recordAuditLog({
    actor: null,
    action: "update",
    entityType: "quote",
    entityId: quote.id,
    entityLabel: `Quote for ${quote.recipient_name}`,
    before: { status: quote.status },
    after: { status: decision },
    note: "Responded via public quote link",
  });

  if (decision === "accepted") {
    // Never blocks/fails the customer's acceptance — see the top of
    // lib/quoteJobConversion.ts for why this is safe to just await and
    // move on regardless of outcome.
    await attemptQuoteJobConversion(quote.id);
  }

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quote.id}`);

  redirect(`/q/${token}?result=${decision}`);
}

export async function acceptQuote(token: string): Promise<void> {
  await respond(token, "accepted", null);
}

// Tiered-quote acceptance — the customer picked one of the good/better/
// best options rather than a single flat price, so before doing the same
// status/audit-log work `respond()` does above, this records which tier
// they chose and copies its price onto quotes.price_total. That keeps
// lib/quoteJobConversion.ts (and the quotes list/detail pages) unchanged
// for tiered quotes: everything downstream just reads price_total like
// it always has, it just wasn't populated until now.
export async function acceptQuoteTier(
  token: string,
  tierId: string
): Promise<void> {
  const { data: quote, error: fetchError } = await supabaseServer
    .from("quotes")
    .select("id, status, expires_at, pricing_mode, recipient_name")
    .eq("public_token", token)
    .single();

  if (fetchError || !quote || !isQuoteStatus(quote.status)) {
    redirect(`/q/${token}?result=error`);
  }

  if (quote.pricing_mode !== "tiered") {
    redirect(`/q/${token}?result=error`);
  }

  const displayStatus = computeDisplayStatus(quote.status, quote.expires_at);
  if (displayStatus !== "sent") {
    redirect(`/q/${token}?result=error`);
  }

  const { data: tier, error: tierError } = await supabaseServer
    .from("quote_tiers")
    .select("id, quote_id, price")
    .eq("id", tierId)
    .single();

  if (tierError || !tier || tier.quote_id !== quote.id) {
    redirect(`/q/${token}?result=error`);
  }

  const { error } = await supabaseServer
    .from("quotes")
    .update({
      status: "accepted",
      selected_tier_id: tier.id,
      price_total: tier.price,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", quote.id);

  if (error) {
    redirect(`/q/${token}?result=error`);
  }

  await recordAuditLog({
    actor: null,
    action: "update",
    entityType: "quote",
    entityId: quote.id,
    entityLabel: `Quote for ${quote.recipient_name}`,
    before: { status: quote.status },
    after: { status: "accepted", selected_tier_id: tier.id },
    note: "Accepted a tiered pricing option via public quote link",
  });

  // Never blocks/fails the customer's acceptance — see the top of
  // lib/quoteJobConversion.ts.
  await attemptQuoteJobConversion(quote.id);

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quote.id}`);

  redirect(`/q/${token}?result=accepted`);
}

export async function declineQuote(
  token: string,
  formData: FormData
): Promise<void> {
  const rawNote = formData.get("note");
  const note = typeof rawNote === "string" ? rawNote.trim() || null : null;

  await respond(token, "declined", note);
}

// Best-effort "first viewed" timestamp — never blocks or errors the
// page render if it fails.
export async function markQuoteViewed(quoteId: string): Promise<void> {
  try {
    await supabaseServer
      .from("quotes")
      .update({ viewed_at: new Date().toISOString() })
      .eq("id", quoteId)
      .is("viewed_at", null);
  } catch (error) {
    console.error("Failed to record quote view:", error);
  }
}
