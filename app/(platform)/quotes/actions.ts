"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import {
  generatePublicToken,
  allowedStatusTransitions,
  isQuoteStatus,
  canEditQuote,
  TIER_KEYS,
  DEFAULT_TIER_NAMES,
  type QuoteStatus,
  type TierKey,
} from "@/lib/quotes";
import { attemptQuoteJobConversion } from "@/lib/quoteJobConversion";
import { sendQuoteEmail, sendQuoteSms } from "@/lib/notifications";
import type { ActionState } from "./actionState";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanNumber(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function cleanDate(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

function cleanFeatures(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

type ParsedTier = {
  tier_key: TierKey;
  name: string;
  price: number;
  features: string[];
  is_featured: boolean;
  display_order: number;
};

// Reads the three tier_{key}_* fields NewQuoteForm renders (one block per
// good/better/best) and keeps only the ones staff actually priced —
// leaving a tier's price blank is how you send a 2-tier ("Good"/"Best",
// skip "Better") quote instead of always forcing all three.
function parseTiers(formData: FormData): ParsedTier[] {
  const featuredTier = formData.get("featured_tier");

  return TIER_KEYS.map((key, index) => {
    const price = cleanNumber(formData.get(`tier_${key}_price`));
    if (!Number.isFinite(price) || price < 0) return null;

    const name =
      cleanText(formData.get(`tier_${key}_name`)) || DEFAULT_TIER_NAMES[key];

    return {
      tier_key: key,
      name,
      price,
      features: cleanFeatures(formData.get(`tier_${key}_features`)),
      is_featured: featuredTier === key,
      display_order: index,
    };
  }).filter((tier): tier is ParsedTier => tier !== null);
}

type ParsedAddon = {
  name: string;
  price: number;
  sort_order: number;
};

// Add-on line items (Turf Size + What's Included restructure, 2026-09).
// NewQuoteForm.tsx serializes its repeatable add-on rows as a single
// JSON-array hidden input (`addons`) rather than indexed field names —
// simpler for a variable-length list than the tier_{key}_* convention
// above, which works because the tier set is always exactly three.
// Rows missing a name or a valid non-negative price are dropped rather
// than rejecting the whole quote — an addon is a nice-to-have
// breakdown, not something worth blocking quote creation over.
function parseAddons(formData: FormData): ParsedAddon[] {
  const raw = formData.get("addons");
  if (typeof raw !== "string" || !raw.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const addons: ParsedAddon[] = [];
  parsed.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const name = typeof (entry as { name?: unknown }).name === "string"
      ? (entry as { name: string }).name.trim()
      : "";
    const price = Number((entry as { price?: unknown }).price);

    if (!name || !Number.isFinite(price) || price < 0) return;

    addons.push({ name, price, sort_order: index });
  });

  return addons;
}

export async function createQuote(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in to create a quote." };
  }

  const recipientName = cleanText(formData.get("recipient_name"));
  const description = cleanText(formData.get("description"));
  const pricingMode = formData.get("pricing_mode") === "tiered" ? "tiered" : "flat";

  if (!recipientName) {
    return { error: "Recipient name is required." };
  }

  if (!description) {
    return { error: "A description of the work is required." };
  }

  let priceTotal: number | null = null;
  let tiers: ParsedTier[] = [];
  let addons: ParsedAddon[] = [];

  if (pricingMode === "tiered") {
    tiers = parseTiers(formData);

    if (tiers.length < 2) {
      return {
        error: "Enter a price for at least two tiers (e.g. Good and Best).",
      };
    }
  } else {
    priceTotal = cleanNumber(formData.get("price_total"));

    if (!Number.isFinite(priceTotal) || priceTotal < 0) {
      return { error: "Enter a valid, non-negative price." };
    }

    addons = parseAddons(formData);
  }

  const row = {
    customer_id: cleanText(formData.get("customer_id")),
    lead_id: cleanText(formData.get("lead_id")),
    recipient_name: recipientName,
    recipient_email: cleanText(formData.get("recipient_email")),
    recipient_phone: cleanText(formData.get("recipient_phone")),
    recipient_address: cleanText(formData.get("recipient_address")),
    service_category: cleanText(formData.get("service_category")),
    turf_size_range: cleanText(formData.get("turf_size_range")),
    description,
    price_total: priceTotal,
    pricing_mode: pricingMode,
    expires_at: cleanDate(formData.get("expires_at")),
    status: "draft" as QuoteStatus,
    public_token: generatePublicToken(),
    created_by: actor.id,
    created_by_name: actor.name,
  };

  const { data, error } = await supabaseServer
    .from("quotes")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    return { error: `Failed to create quote: ${error.message}` };
  }

  if (pricingMode === "tiered") {
    const { error: tiersError } = await supabaseServer.from("quote_tiers").insert(
      tiers.map((tier) => ({ ...tier, quote_id: data.id }))
    );

    if (tiersError) {
      return { error: `Quote created, but tiers failed to save: ${tiersError.message}` };
    }
  }

  if (addons.length > 0) {
    const { error: addonsError } = await supabaseServer.from("quote_addons").insert(
      addons.map((addon) => ({ ...addon, quote_id: data.id }))
    );

    if (addonsError) {
      return { error: `Quote created, but add-ons failed to save: ${addonsError.message}` };
    }
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "quote",
    entityId: data?.id ?? null,
    entityLabel: `Quote for ${recipientName}`,
    after: pricingMode === "tiered" ? { ...row, tiers } : { ...row, addons },
  });

  revalidatePath("/quotes");
  redirect(`/quotes/${data.id}`);
}

export async function deleteDraftQuote(id: string): Promise<void> {
  const actor = await getCurrentUser();

  if (!actor) {
    throw new Error("You must be signed in to delete a quote.");
  }

  const { data: existing } = await supabaseServer
    .from("quotes")
    .select("id, status, recipient_name")
    .eq("id", id)
    .single();

  if (!existing) {
    throw new Error("Quote not found.");
  }

  if (!canEditQuote(existing.status)) {
    throw new Error("Only draft quotes can be deleted.");
  }

  const { error } = await supabaseServer.from("quotes").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete quote: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "delete",
    entityType: "quote",
    entityId: id,
    entityLabel: `Quote for ${existing.recipient_name}`,
    before: existing,
  });

  revalidatePath("/quotes");
  redirect("/quotes");
}

// The actual "Send" action (Sept 2026) — distinct from markQuoteStatus's
// "Mark Sent" button below, which only flips the status for a quote
// staff already handed over some other way (in person, printed). This
// is the real send: emails and/or texts the customer the public
// /q/[token] link (whichever of recipient_email/recipient_phone this
// quote has on file), using the fixed templates in lib/notifications.ts,
// then moves the quote to "sent" -- only once at least one channel
// actually went out, so a total send failure leaves the quote in
// "draft" rather than silently marking it sent with nothing delivered.
//
// quote.customer_id is already customers.jobber_client_id (see
// QuoteRecipientPicker's PickerCustomer type) — passed straight through
// as the jobberClientId param the send functions use for contact-history
// logging, no extra lookup needed. A lead-based quote has no customer_id
// at all, so that logging is just skipped for it, same as every other
// lead-sourced send in this app.
export async function sendQuote(id: string): Promise<void> {
  const actor = await getCurrentUser();

  if (!actor) {
    throw new Error("You must be signed in to send a quote.");
  }

  const { data: quote, error: fetchError } = await supabaseServer
    .from("quotes")
    .select(
      "id, status, recipient_name, recipient_email, recipient_phone, public_token, customer_id"
    )
    .eq("id", id)
    .single();

  if (fetchError || !quote) {
    throw new Error("Quote not found.");
  }

  if (!isQuoteStatus(quote.status) || quote.status !== "draft") {
    throw new Error("Only draft quotes can be sent.");
  }

  if (!quote.recipient_email && !quote.recipient_phone) {
    throw new Error("This quote has no email or phone on file to send to.");
  }

  const quoteUrl = `https://go.valleyturfrevival.com/q/${quote.public_token}`;
  const jobberClientId = quote.customer_id;

  const [emailResult, smsResult] = await Promise.allSettled([
    quote.recipient_email
      ? sendQuoteEmail({
          toEmail: quote.recipient_email,
          recipientName: quote.recipient_name,
          quoteUrl,
          jobberClientId,
        })
      : Promise.resolve(false),
    quote.recipient_phone
      ? sendQuoteSms(quote.recipient_phone, quote.recipient_name, quoteUrl, jobberClientId)
      : Promise.resolve(false),
  ]);

  const emailSent = emailResult.status === "fulfilled" && emailResult.value === true;
  const smsSent = smsResult.status === "fulfilled" && smsResult.value === true;

  if (!emailSent && !smsSent) {
    throw new Error(
      "Couldn't send the quote by email or text. Check that Resend/Twilio are configured correctly, or try again."
    );
  }

  const { error: updateError } = await supabaseServer
    .from("quotes")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    throw new Error(`Sent, but failed to update the quote's status: ${updateError.message}`);
  }

  const channels = [emailSent ? "email" : null, smsSent ? "text" : null]
    .filter(Boolean)
    .join(" + ");

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "quote",
    entityId: id,
    entityLabel: `Quote for ${quote.recipient_name}`,
    before: { status: quote.status },
    after: { status: "sent" },
    note: `Sent via ${channels}`,
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
}

// Internal (logged-in) status changes — separate from the public
// accept/decline actions in app/q/[token]/actions.ts, which have no
// session to check and instead trust only the unguessable token.
// Plain throwing action (like deleteDraftQuote above), bound to
// (id, nextStatus) from each status button — there's no form input
// worth showing inline-validation state for here, just a confirm click.
export async function markQuoteStatus(
  id: string,
  nextStatus: QuoteStatus
): Promise<void> {
  const actor = await getCurrentUser();

  if (!actor) {
    throw new Error("You must be signed in to update a quote.");
  }

  const { data: existing, error: fetchError } = await supabaseServer
    .from("quotes")
    .select("id, status, recipient_name")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    throw new Error("Quote not found.");
  }

  if (!isQuoteStatus(existing.status)) {
    throw new Error("Quote has an unrecognized status.");
  }

  if (!allowedStatusTransitions(existing.status).includes(nextStatus)) {
    throw new Error(
      `Can't move a quote from "${existing.status}" to "${nextStatus}".`
    );
  }

  const update: Record<string, unknown> = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };

  if (nextStatus === "accepted" || nextStatus === "declined") {
    update.responded_at = new Date().toISOString();
  }

  // Anchor for the quote follow-up nudges (lib/quoteFollowups.ts) --
  // set once, the first time a quote moves to "sent", same "lazy,
  // written once" reasoning as visit confirmation tokens.
  if (nextStatus === "sent") {
    update.sent_at = new Date().toISOString();
  }

  const { error } = await supabaseServer
    .from("quotes")
    .update(update)
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update quote: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "quote",
    entityId: id,
    entityLabel: `Quote for ${existing.recipient_name}`,
    before: { status: existing.status },
    after: { status: nextStatus },
  });

  if (nextStatus === "accepted") {
    // Never blocks/fails this status change — see the top of
    // lib/quoteJobConversion.ts.
    await attemptQuoteJobConversion(id);
  }

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
}

// Manually re-attempts creating the Jobber job for an already-accepted
// quote — for when the automatic attempt (in markQuoteStatus/acceptQuote)
// failed, e.g. the Jobber connection was down or hadn't been granted
// write access yet. Safe to click repeatedly: attemptQuoteJobConversion
// is a no-op once jobber_job_id is set.
export async function retryQuoteJobConversion(id: string): Promise<void> {
  const actor = await getCurrentUser();

  if (!actor) {
    throw new Error("You must be signed in to retry job creation.");
  }

  const { data: existing } = await supabaseServer
    .from("quotes")
    .select("id, status")
    .eq("id", id)
    .single();

  if (!existing) {
    throw new Error("Quote not found.");
  }

  if (existing.status !== "accepted") {
    throw new Error("Only accepted quotes can create a Jobber job.");
  }

  await attemptQuoteJobConversion(id);

  revalidatePath(`/quotes/${id}`);
}
