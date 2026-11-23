// Server side of the Jobber-to-native payment migration (/invoices/migration).
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { getBaseUrl } from "@/lib/baseUrl";
import { getBusiness } from "@/lib/business";
import { getOrCreateEnrollmentToken } from "@/lib/autopay";
import { sendManualEmail, sendManualSms } from "@/lib/notifications";
import { setInvoicingMode } from "@/lib/invoicingMode";
import { recordAuditLog } from "@/lib/auditLog";
import {
  buildInviteEmail,
  buildInviteSms,
  firstNameFor,
  inviteSkipReason,
  migrationStage,
  SKIP_REASON_TEXT,
  type MigrationStage,
} from "@/lib/nativeMigrationLogic";

export type MigrationRow = {
  jobberClientId: string;
  name: string;
  phone: string | null;
  email: string | null;
  optedOut: boolean;
  cardInJobber: boolean;
  cardLast4: string | null;
  stage: MigrationStage;
  lastInvitedAt: string | null;
  lastInviteChannel: string | null;
};

type CustomerRow = {
  jobber_client_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  notifications_opted_out: boolean | null;
  native_invoicing_enabled: boolean | null;
  invoicing_mode_source: string | null;
  permanently_canceled_at: string | null;
};

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

export async function listMigrationRows(): Promise<MigrationRow[]> {
  const [customers, paymentMethods, invites] = await Promise.all([
    fetchAll<CustomerRow>((from, to) =>
      supabaseServer
        .from("customers")
        .select(
          "jobber_client_id, full_name, phone, email, notifications_opted_out, native_invoicing_enabled, invoicing_mode_source, permanently_canceled_at"
        )
        .not("jobber_client_id", "is", null)
        .order("full_name", { ascending: true })
        .range(from, to)
    ),
    fetchAll<{ jobber_client_id: string; stripe_payment_method_id: string | null; card_last4: string | null }>(
      (from, to) =>
        supabaseServer
          .from("customer_payment_methods")
          .select("jobber_client_id, stripe_payment_method_id, card_last4")
          .not("stripe_payment_method_id", "is", null)
          .range(from, to)
    ),
    fetchAll<{ jobber_client_id: string; channel: string; sent_at: string }>((from, to) =>
      supabaseServer
        .from("native_migration_invites")
        .select("jobber_client_id, channel, sent_at")
        .order("sent_at", { ascending: false })
        .range(from, to)
    ),
  ]);

  const cardByClient = new Map(paymentMethods.map((row) => [row.jobber_client_id, row.card_last4]));
  const lastInviteByClient = new Map<string, { channel: string; sent_at: string }>();
  for (const invite of invites) {
    if (!lastInviteByClient.has(invite.jobber_client_id)) {
      lastInviteByClient.set(invite.jobber_client_id, invite);
    }
  }

  return customers
    .filter((customer) => !customer.permanently_canceled_at)
    .map((customer) => {
      const id = customer.jobber_client_id;
      const invite = lastInviteByClient.get(id) ?? null;
      const cardSaved = cardByClient.has(id);
      return {
        jobberClientId: id,
        name: customer.full_name ?? id,
        phone: customer.phone,
        email: customer.email,
        optedOut: customer.notifications_opted_out === true,
        cardInJobber: customer.invoicing_mode_source === "auto_has_card",
        cardLast4: cardByClient.get(id) ?? null,
        stage: migrationStage({
          native: customer.native_invoicing_enabled === true,
          cardSaved,
          lastInvitedAt: invite?.sent_at ?? null,
        }),
        lastInvitedAt: invite?.sent_at ?? null,
        lastInviteChannel: invite?.channel ?? null,
      };
    });
}

export type InviteResult = {
  jobberClientId: string;
  name: string;
  outcome: "sent_sms" | "sent_email" | "skipped" | "failed";
  detail: string;
};

// Sends the "save a card" link to each customer: a text when there is a
// phone number, otherwise (or if the text fails) an email. Skips anyone who
// is already native, already has a card, opted out, or was invited recently.
export async function sendMigrationInvites(params: {
  jobberClientIds: string[];
  actorName: string;
}): Promise<InviteResult[]> {
  const now = new Date();
  const rows = await listMigrationRows();
  const byId = new Map(rows.map((row) => [row.jobberClientId, row]));
  const biz = await getBusiness();
  const baseUrl = await getBaseUrl();
  const results: InviteResult[] = [];

  for (const id of params.jobberClientIds) {
    const row = byId.get(id);

    if (!row) {
      results.push({ jobberClientId: id, name: id, outcome: "failed", detail: "Customer not found" });
      continue;
    }

    const skip = inviteSkipReason({
      native: row.stage === "switched",
      cardSaved: row.stage === "card_saved",
      optedOut: row.optedOut,
      hasPhone: Boolean(row.phone),
      hasEmail: Boolean(row.email),
      lastInvitedAt: row.lastInvitedAt,
      now,
    });

    if (skip) {
      results.push({ jobberClientId: id, name: row.name, outcome: "skipped", detail: SKIP_REASON_TEXT[skip] });
      continue;
    }

    const token = await getOrCreateEnrollmentToken(id);

    if (!token.ok) {
      results.push({ jobberClientId: id, name: row.name, outcome: "failed", detail: token.error });
      continue;
    }

    const link = `${baseUrl}/autopay/${token.token}`;
    const message = {
      firstName: firstNameFor(row.name),
      link,
      businessName: biz.name,
      phoneDisplay: biz.phoneDisplay,
    };

    let channel: "sms" | "email" | null = null;

    if (row.phone) {
      const sent = await sendManualSms({
        toPhone: row.phone,
        body: buildInviteSms(message),
        jobberClientId: id,
        createdByName: params.actorName,
      });
      if (sent) channel = "sms";
    }

    if (!channel && row.email) {
      const email = buildInviteEmail(message);
      const sent = await sendManualEmail({
        toEmail: row.email,
        customerName: row.name,
        subject: email.subject,
        body: email.body,
        jobberClientId: id,
        createdByName: params.actorName,
      });
      if (sent) channel = "email";
    }

    if (!channel) {
      results.push({ jobberClientId: id, name: row.name, outcome: "failed", detail: "The text and email could not be sent" });
      continue;
    }

    const { error } = await supabaseServer.from("native_migration_invites").insert({
      jobber_client_id: id,
      channel,
      sent_by_name: params.actorName,
    });

    if (error) {
      console.error(`Failed to record migration invite for ${id}:`, error.message);
    }

    results.push({
      jobberClientId: id,
      name: row.name,
      outcome: channel === "sms" ? "sent_sms" : "sent_email",
      detail: channel === "sms" ? "Text sent" : "Email sent",
    });
  }

  return results;
}

// Called when a customer saves a card (Stripe setup_intent.succeeded). If
// they were invited through the migration tool and are still on Jobber
// invoicing, switch them to native so their next invoice is created and
// charged here. A customer who just saved a card on their own (never
// invited) is left alone.
export async function completeMigrationAfterCardSaved(jobberClientId: string): Promise<boolean> {
  const { data: invite } = await supabaseServer
    .from("native_migration_invites")
    .select("id")
    .eq("jobber_client_id", jobberClientId)
    .is("switched_at", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!invite) return false;

  const { data: customer } = await supabaseServer
    .from("customers")
    .select("full_name, native_invoicing_enabled")
    .eq("jobber_client_id", jobberClientId)
    .maybeSingle();

  if (!customer) return false;

  if (customer.native_invoicing_enabled !== true) {
    const { error } = await setInvoicingMode(jobberClientId, true, "manual");

    if (error) {
      console.error(`Failed to switch ${jobberClientId} to native after card save: ${error}`);
      return false;
    }

    await recordAuditLog({
      actor: null,
      action: "update",
      entityType: "invoicing_mode",
      entityId: jobberClientId,
      entityLabel: (customer.full_name as string | null) ?? "Customer",
      after: { native_invoicing_enabled: true, invoicing_mode_source: "manual" },
      note: "Switched to native invoicing automatically after saving a card (migration invite)",
    });
  }

  await supabaseServer
    .from("native_migration_invites")
    .update({ switched_at: new Date().toISOString() })
    .eq("jobber_client_id", jobberClientId)
    .is("switched_at", null);

  return true;
}
