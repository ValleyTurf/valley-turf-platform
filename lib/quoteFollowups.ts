// Quote follow-up nudges (Ryan's request: 2 and 5 days after a quote is
// sent) -- sent by app/api/quotes/send-followups' daily cron, which just
// calls sendDueQuoteFollowups() below. Same "rules table + dedup-sent
// table" shape as lib/visitReminders.ts/lib/invoiceReminders.ts, anchored
// on quotes.sent_at (added in migration
// 063_add_invoice_reminders_and_quote_followups.sql, set by
// markQuoteStatus the first time a quote moves to "sent" -- not
// expires_at, which staff can leave blank and isn't reliably set).
//
// Only ever fires for quotes still sitting in "sent" -- once a customer
// accepts or declines, or staff marks it some other way, there's nothing
// left to nudge.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { toPhoenixDateString } from "@/lib/phoenixDate";
import { sendQuoteFollowupSms, sendQuoteFollowupEmail } from "@/lib/notifications";
import { getBaseUrl } from "@/lib/baseUrl";

type FollowupRule = {
  id: string;
  days_after: number;
};

type FollowupQuote = {
  id: string;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  customer_id: string | null;
  public_token: string;
  sent_at: string | null;
};

export type SendQuoteFollowupsResult = {
  rulesProcessed: number;
  quotesConsidered: number;
  followupsSent: number;
  errors: string[];
};

function addDaysToPhoenixDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export async function sendDueQuoteFollowups(): Promise<SendQuoteFollowupsResult> {
  const result: SendQuoteFollowupsResult = {
    rulesProcessed: 0,
    quotesConsidered: 0,
    followupsSent: 0,
    errors: [],
  };

  const { data: rulesData, error: rulesError } = await supabaseServer
    .from("quote_followup_rules")
    .select("id, days_after")
    .eq("enabled", true);

  if (rulesError) {
    result.errors.push(`Couldn't load quote follow-up rules: ${rulesError.message}`);
    return result;
  }

  const rules = (rulesData ?? []) as FollowupRule[];
  const todayPhoenix = toPhoenixDateString(new Date().toISOString());

  if (!todayPhoenix) {
    result.errors.push("Couldn't determine today's date in Phoenix time.");
    return result;
  }

  const baseUrl = await getBaseUrl();

  for (const rule of rules) {
    result.rulesProcessed += 1;

    const targetDate = addDaysToPhoenixDate(todayPhoenix, -rule.days_after);
    const nextDate = addDaysToPhoenixDate(targetDate, 1);

    const { data: quotesData, error: quotesError } = await supabaseServer
      .from("quotes")
      .select(
        "id, recipient_name, recipient_email, recipient_phone, customer_id, public_token, sent_at"
      )
      .eq("status", "sent")
      .gte("sent_at", `${targetDate}T00:00:00-07:00`)
      .lt("sent_at", `${nextDate}T00:00:00-07:00`);

    if (quotesError) {
      result.errors.push(
        `Couldn't load quotes for the ${rule.days_after}-day follow-up: ${quotesError.message}`
      );
      continue;
    }

    const quotes = (quotesData ?? []) as FollowupQuote[];
    result.quotesConsidered += quotes.length;

    if (quotes.length === 0) continue;

    const quoteIds = quotes.map((quote) => quote.id);
    const { data: alreadySentData, error: alreadySentError } = await supabaseServer
      .from("quote_followups_sent")
      .select("quote_id")
      .eq("days_after", rule.days_after)
      .in("quote_id", quoteIds);

    if (alreadySentError) {
      result.errors.push(
        `Couldn't check already-sent follow-ups for the ${rule.days_after}-day rule: ${alreadySentError.message}`
      );
      continue;
    }

    const alreadySent = new Set(
      (alreadySentData ?? []).map((row) => row.quote_id as string)
    );
    const pendingQuotes = quotes.filter((quote) => !alreadySent.has(quote.id));

    for (const quote of pendingQuotes) {
      const email = quote.recipient_email?.trim() || null;
      const phone = quote.recipient_phone?.trim() || null;

      if (!email && !phone) continue;

      const quoteUrl = `${baseUrl}/q/${quote.public_token}`;
      let delivered = false;

      if (email) {
        const sent = await sendQuoteFollowupEmail({
          toEmail: email,
          recipientName: quote.recipient_name,
          quoteUrl,
          jobberClientId: quote.customer_id,
        });
        delivered = delivered || sent;
      }

      if (phone) {
        const sent = await sendQuoteFollowupSms(
          phone,
          quote.recipient_name,
          quoteUrl,
          quote.customer_id
        );
        delivered = delivered || sent;
      }

      if (!delivered) {
        result.errors.push(
          `Follow-up delivery failed for quote ${quote.id} (${rule.days_after}-day rule).`
        );
        continue;
      }

      const { error: insertError } = await supabaseServer
        .from("quote_followups_sent")
        .insert({ quote_id: quote.id, days_after: rule.days_after });

      if (insertError) {
        result.errors.push(
          `Follow-up sent but failed to record for quote ${quote.id}: ${insertError.message}`
        );
      }

      result.followupsSent += 1;
    }
  }

  return result;
}
