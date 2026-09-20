// One-off (2026-09-20): Ryan wanted to see what a quote looks like from
// the customer's side. The customer-facing view lives at /q/[token]
// (app/q/[token]/page.tsx), keyed by quotes.public_token -- this just
// lists the most recently sent quotes with their live /q/ links so he
// can open a real one instead of me guessing at an id.
//
// Read-only, admin-gated, manual-trigger only.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  const { data: sentData, error: sentError } = await supabaseServer
    .from("quotes")
    .select("id, recipient_name, status, sent_at, public_token, price_total, pricing_mode")
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(5);

  if (sentError) {
    return NextResponse.json(
      { success: false, error: sentError.message },
      { status: 500 }
    );
  }

  const quotes = (sentData ?? []).map((quote) => ({
    recipientName: quote.recipient_name,
    status: quote.status,
    sentAt: quote.sent_at,
    priceTotal: quote.price_total,
    pricingMode: quote.pricing_mode,
    url: `${baseUrl}/q/${quote.public_token}`,
  }));

  // Fallback for when nothing has sent_at set: list the newest quotes
  // regardless of status/timestamp, so we can tell "nothing's actually
  // been sent yet" apart from "sent_at just isn't getting recorded."
  const { data: anyData, error: anyError } = await supabaseServer
    .from("quotes")
    .select("id, recipient_name, status, sent_at, public_token, price_total, pricing_mode, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  const anyQuotes = (anyData ?? []).map((quote) => ({
    recipientName: quote.recipient_name,
    status: quote.status,
    sentAt: quote.sent_at,
    createdAt: quote.created_at,
    priceTotal: quote.price_total,
    pricingMode: quote.pricing_mode,
    url: `${baseUrl}/q/${quote.public_token}`,
  }));

  return NextResponse.json({
    success: true,
    quotes,
    fallbackMostRecentQuotesRegardlessOfSentAt: anyQuotes,
    fallbackError: anyError?.message ?? null,
  });
}
