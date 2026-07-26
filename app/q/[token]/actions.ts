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

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quote.id}`);

  redirect(`/q/${token}?result=${decision}`);
}

export async function acceptQuote(token: string): Promise<void> {
  await respond(token, "accepted", null);
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
