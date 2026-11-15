// Read-only delivery check (2026-11-15). Ryan: Katie Ray said twice she
// couldn't open invoice links, and Chris Brown says he never got any
// emails or texts from us. This app sends texts through Twilio and
// only records that Twilio ACCEPTED the message -- whether the carrier
// actually delivered it (or filtered it, or the number is wrong) was
// never looked at anywhere. This asks Twilio and our own email log
// directly:
//
//   ?q=<name>   -> for each matching customer: the phone/email we have
//                  on file, their opt-out flag, Twilio's real delivery
//                  status + error code for the most recent texts to
//                  each phone, and delivered/opened timestamps for the
//                  most recent emails.
//   (always)    -> a tally of delivery status + error code across the
//                  most recent outbound texts overall, to tell a
//                  one-customer problem from an everybody problem.
//
// Admin-gated. Nothing is sent or changed.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { escapeSearchValue } from "@/lib/searchUtils";

export const dynamic = "force-dynamic";

type TwilioMessage = {
  sid: string;
  date_sent: string | null;
  date_created: string | null;
  to: string | null;
  from: string | null;
  status: string | null;
  error_code: number | null;
  error_message: string | null;
  direction: string | null;
  body: string | null;
};

function toE164(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

async function twilioList(params: Record<string, string>): Promise<
  { ok: true; messages: TwilioMessage[] } | { ok: false; error: string }
> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return { ok: false, error: "Twilio env vars are not set." };
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json?${new URLSearchParams(params)}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return { ok: false, error: `Twilio ${response.status}: ${(await response.text()).slice(0, 300)}` };
    }

    const json = (await response.json()) as { messages?: TwilioMessage[] };
    return { ok: true, messages: json.messages ?? [] };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function summarize(message: TwilioMessage) {
  return {
    sent: message.date_sent ?? message.date_created,
    direction: message.direction,
    status: message.status,
    errorCode: message.error_code,
    errorMessage: message.error_message,
    bodyStart: (message.body ?? "").slice(0, 70),
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const fromNumber = process.env.TWILIO_FROM_NUMBER ?? null;

  // Overall picture first: most recent outbound texts from our number.
  const overall: Record<string, unknown> = { fromNumberConfigured: Boolean(fromNumber) };

  if (fromNumber) {
    const recent = await twilioList({ From: fromNumber, PageSize: "1000" });

    if (recent.ok) {
      const tally = new Map<string, number>();
      for (const message of recent.messages) {
        const key = `${message.status ?? "unknown"}${message.error_code ? ` (error ${message.error_code})` : ""}`;
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }

      const dates = recent.messages
        .map((m) => m.date_sent ?? m.date_created)
        .filter((d): d is string => Boolean(d))
        .map((d) => new Date(d).getTime())
        .filter((t) => Number.isFinite(t));

      overall.messagesChecked = recent.messages.length;
      overall.oldest = dates.length ? new Date(Math.min(...dates)).toISOString() : null;
      overall.newest = dates.length ? new Date(Math.max(...dates)).toISOString() : null;
      overall.byStatus = Object.fromEntries(
        Array.from(tally.entries()).sort((a, b) => b[1] - a[1])
      );
      overall.recentFailures = recent.messages
        .filter((m) => m.error_code || m.status === "undelivered" || m.status === "failed")
        .slice(0, 25)
        .map((m) => ({ toLast4: (m.to ?? "").slice(-4), ...summarize(m) }));
    } else {
      overall.error = recent.error;
    }
  }

  if (query.length < 2) {
    return NextResponse.json({ overall, note: "Add ?q=<customer name> to check one customer." });
  }

  const safeQuery = escapeSearchValue(query);

  const { data: customers, error: customersError } = await supabaseServer
    .from("customers")
    .select("jobber_client_id, full_name, first_name, last_name, email, phone, notifications_opted_out")
    .not("jobber_client_id", "is", null)
    .or(
      [
        `full_name.ilike.%${safeQuery}%`,
        `first_name.ilike.%${safeQuery}%`,
        `last_name.ilike.%${safeQuery}%`,
      ].join(",")
    )
    .limit(5);

  if (customersError) {
    return NextResponse.json({ overall, error: customersError.message }, { status: 500 });
  }

  const results = [];

  for (const customer of customers ?? []) {
    const clientId = customer.jobber_client_id as string;

    const { data: contacts } = await supabaseServer
      .from("customer_contacts")
      .select("name, phone, email, receives_notifications")
      .eq("jobber_client_id", clientId);

    const phones = Array.from(
      new Set(
        [customer.phone as string | null, ...(contacts ?? []).map((c) => c.phone as string | null)]
          .map(toE164)
          .filter((p): p is string => Boolean(p))
      )
    );

    const texts = [];

    for (const phone of phones) {
      const [outbound, inbound] = await Promise.all([
        twilioList({ To: phone, PageSize: "40" }),
        twilioList({ From: phone, PageSize: "10" }),
      ]);

      texts.push({
        phone,
        toCustomer: outbound.ok ? outbound.messages.map(summarize) : { error: outbound.error },
        fromCustomer: inbound.ok ? inbound.messages.map(summarize) : { error: inbound.error },
      });
    }

    const { data: emails } = await supabaseServer
      .from("contact_history")
      .select("subject, direction, created_at, delivered_at, opened_at, resend_email_id")
      .eq("jobber_client_id", clientId)
      .eq("channel", "email")
      .order("created_at", { ascending: false })
      .limit(25);

    const { data: textLog } = await supabaseServer
      .from("contact_history")
      .select("subject, direction, created_at")
      .eq("jobber_client_id", clientId)
      .eq("channel", "sms")
      .order("created_at", { ascending: false })
      .limit(15);

    results.push({
      name:
        (customer.full_name as string | null) ||
        [customer.first_name, customer.last_name].filter(Boolean).join(" "),
      phoneOnFile: customer.phone,
      emailOnFile: customer.email,
      optedOut: customer.notifications_opted_out === true,
      extraContacts: contacts ?? [],
      texts,
      appTextLog: textLog ?? [],
      emails: (emails ?? []).map((row) => ({
        subject: row.subject,
        direction: row.direction,
        sent: row.created_at,
        delivered: row.delivered_at,
        opened: row.opened_at,
        tracked: Boolean(row.resend_email_id),
      })),
    });
  }

  return NextResponse.json({ overall, results });
}
